'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ASSISTANT } from '@/lib/constants';
import { requestNotificationPermission, registerTimer, startReminderPolling } from '@/lib/notifications';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const workoutRef = useRef(null);
    const dbUserIdRef = useRef(null);
    const pollingCleanupRef = useRef(null);
    const notifPermissionRef = useRef(false);

    // Fetch the DB user ID and memories
    const ensureUserData = useCallback(async () => {
        if (!user || dbUserIdRef.current) return;
        try {
            // Sync user to get DB ID
            const syncRes = await fetch('/api/auth/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUid: user.uid,
                    email: user.email,
                    fullName: user.displayName,
                    avatarUrl: user.photoURL,
                }),
            });
            const syncData = await syncRes.json();
            console.log('[ChatContext] sync response:', syncData?.user?.id ? 'got userId' : 'NO userId', syncRes.status);
            if (syncData.user?.id) {
                dbUserIdRef.current = syncData.user.id;
            }

            // Fetch workout schedule
            if (dbUserIdRef.current) {
                const workoutRes = await fetch(`/api/workout?userId=${dbUserIdRef.current}`);
                const workoutData = await workoutRes.json();
                if (workoutData.schedule) {
                    workoutRef.current = workoutData.schedule;
                }
            }

            // Start reminder polling once we have the userId
            if (dbUserIdRef.current && !pollingCleanupRef.current) {
                pollingCleanupRef.current = startReminderPolling(dbUserIdRef.current);
            }
        } catch (e) {
            console.error('Failed to load user data:', e);
        }
    }, [user]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingCleanupRef.current) {
                pollingCleanupRef.current();
            }
        };
    }, []);

    // Build system prompt — memories are now handled by LLM tools
    const buildSystemPrompt = useCallback(() => {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        const isoStr = now.toISOString();
        const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let prompt = `Your name is Cesy. ${ASSISTANT.instructions}\n\n⏰ CURRENT TIME (ground truth — ALWAYS use this for any time/date reasoning):\n- Local: ${dateStr}, ${timeStr}\n- Timezone: ${tzName}\n- ISO: ${isoStr}\nNEVER guess the current date or time. ALWAYS use the timestamp above. When the user says "today", "tomorrow", "tonight", "this Friday", etc., calculate based on the date above. When reporting event times (matches, shows, etc.), ALWAYS convert to the user's timezone (${tzName}). If an event has already happened based on the current time, say so explicitly — never present a past event as upcoming.`;

        // Tool instructions
        prompt += `\n\nYou have access to tools for managing the user's workout schedule (manage_workout), setting reminders (set_reminder), cancelling reminders (cancel_reminder), updating reminders (update_reminder), checking their calendar (get_calendar), sending notifications via Telegram (send_notification), and more. Use the appropriate tool for each request. When setting reminders, always craft a short, personalized deliveryMessage in your voice that will be sent via Telegram when the reminder fires — make it feel like YOU are personally nudging the user. Notifications and reminders are delivered via Telegram. You can search memories to check past reminder deliveries. When creating or updating workout schedule entries, always include a short motivational "note" field per day (e.g. "Upper body focus today — push for a new PR on bench") — this appears on the user's workout card as your personal tip.`;

        // MANDATORY web search for real-time facts
        prompt += `\n\n🔍 MANDATORY: You MUST use web_search for ANY question about real-time or current facts. This includes: sports schedules/scores/results, news, prices, release dates, event times, or anything that changes over time. Your training data is STALE. Memories about events are NOT a replacement for web search — memories tell you what the user cares about, NOT current schedules. Even if you find a memory about a team or event, you MUST STILL web_search for current information. After finding event times from web search, use the is_time_past tool to verify whether the event is still upcoming before telling the user.`;

        // Memory saving — be generous
        prompt += `\n\nSave memories generously. Anything that helps you know the user better is worth saving: preferences, habits, opinions, small personal details, goals, moods, routines, relationships, interests. You don't need to search before saving — the system handles deduplication automatically. The more you remember, the more useful and personal you become. Think of yourself as a personal assistant who never forgets what someone told you.`;

        // Amazon cart preparation
        prompt += `\n\nWhen the user wants to buy items on Amazon, call amazon_cart with the product names. No need to search for ASINs — just pass clear, specific product names and the tool generates affiliate-tracked Amazon links.`;

        // Event awareness instructions
        prompt += `\n\nPay attention to any upcoming plans or events the user mentions, even casually (e.g. "I have a basketball game Friday", "dentist appointment next week"). Save these as memories tagged "event" with an eventDate. You can ask for the time or details but don't push — fill in details naturally over conversations. At the start of conversations, search memories for events that just happened recently and ask about them naturally (e.g. "How was the basketball game yesterday?").`;

        // Inject saved workout schedule
        if (workoutRef.current?.schedule?.length > 0) {
            const scheduleLines = workoutRef.current.schedule
                .map((w) => `- ${w.dayName}: ${w.workoutType}, ${w.duration} minutes${w.equipment?.length ? ` (Equipment: ${w.equipment.join(', ')})` : ''}`)
                .join('\n');
            prompt += `\n\nThe user's current workout schedule is:\n${scheduleLines}\n\nReference this schedule when the user asks about their workouts. If they ask to modify it, output the full updated schedule in the required format.`;
        }

        if (user?.displayName) {
            prompt += `\n\nThe user's name is ${user.displayName}.`;
        }

        return prompt;
    }, [user]);

    const sendMessage = useCallback(async (text, { hidden = false } = {}) => {
        if (!text.trim() || isLoading || !user) return;

        setError(null);
        await ensureUserData();

        // Request notification permission on first message
        if (!notifPermissionRef.current) {
            notifPermissionRef.current = true;
            requestNotificationPermission();
        }

        // Add user message to UI (unless hidden)
        const userMsg = { id: Date.now().toString(), role: 'user', content: text, createdAt: Date.now() };
        const updatedMessages = hidden ? [...messages] : [...messages, userMsg];
        if (!hidden) setMessages(updatedMessages);
        setIsLoading(true);

        try {
            // Always include the message in API call even if hidden from UI
            const allMessages = hidden
                ? [...updatedMessages, userMsg]
                : updatedMessages;
            const apiMessages = allMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    systemPrompt: buildSystemPrompt(),
                    userId: dbUserIdRef.current,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to get response');
            }

            // Start client-side timers if any were set
            if (data.timers?.length > 0) {
                for (const timer of data.timers) {
                    registerTimer(timer.id, timer.durationSeconds, timer.label);
                }
            }

            const assistantMsg = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.message,
                createdAt: Date.now(),
                usage: data.usage,
                amazonCarts: data.amazonCarts || [],
            };
            setMessages((prev) => [...prev, assistantMsg]);

            return data;
        } catch (e) {
            setError(e.message);
            console.error('Send message error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, user, ensureUserData, buildSystemPrompt]);

    const retryMessage = useCallback((messageId) => {
        // Find the user message to retry
        const idx = messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return;

        const userMsg = messages[idx];
        // Remove this message and everything after it (including the failed assistant response)
        setMessages(messages.slice(0, idx));
        // Re-send after state update
        setTimeout(() => sendMessage(userMsg.content), 50);
    }, [messages, sendMessage]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return (
        <ChatContext.Provider
            value={{
                messages,
                isLoading,
                error,
                sendMessage,
                retryMessage,
                clearChat,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error('useChat must be used within ChatProvider');
    return ctx;
}
