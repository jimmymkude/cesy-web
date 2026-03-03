/**
 * Browser Notification Helpers (client-side)
 *
 * Provides notification permission, timer countdown, and reminder polling.
 * These only work while the browser tab is open.
 */

/**
 * Request browser notification permission.
 * Returns true if granted.
 */
export async function requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    return result === 'granted';
}

/**
 * Show a browser notification.
 */
export function showNotification(title, body, options = {}) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    return new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...options,
    });
}

/**
 * Start a client-side timer that fires a browser notification when done.
 * Returns a cancel function.
 */
export function startTimer(durationSeconds, label) {
    const timeoutId = setTimeout(() => {
        showNotification('⏱️ Timer Done!', label || 'Your timer has finished.');
    }, durationSeconds * 1000);

    return () => clearTimeout(timeoutId);
}

// Active timers tracked for cleanup
const activeTimers = new Map();

/**
 * Register a timer and track it by ID for cleanup.
 */
export function registerTimer(id, durationSeconds, label) {
    // Cancel existing timer with same ID
    if (activeTimers.has(id)) {
        activeTimers.get(id)();
        activeTimers.delete(id);
    }

    const cancel = startTimer(durationSeconds, label);
    activeTimers.set(id, cancel);
    return cancel;
}

/**
 * Start polling for due reminders.
 * Checks every intervalMs for reminders that are due and shows notifications.
 * Returns a cleanup function.
 */
export function startReminderPolling(userId, intervalMs = 60000) {
    if (!userId) return () => { };

    const poll = async () => {
        try {
            const res = await fetch(`/api/reminders/due?userId=${userId}`);
            if (!res.ok) return;
            const data = await res.json();

            for (const reminder of data.reminders || []) {
                showNotification('⏰ Reminder', reminder.content);
            }
        } catch {
            // Silently ignore polling errors
        }
    };

    // Poll immediately, then at interval
    poll();
    const intervalId = setInterval(poll, intervalMs);

    return () => clearInterval(intervalId);
}
