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
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        let prompt = `Your name is Cesy. ${ASSISTANT.instructions}\n\nCurrent date and time: ${dateStr}, ${timeStr}.\nWhen the user says "today", "tomorrow", "this Friday", etc., resolve these to actual calendar dates using the current date above.`;

        // Tool instructions
        prompt += `\n\nYou have access to tools for managing the user's workout schedule (manage_workout), setting reminders (set_reminder), cancelling reminders (cancel_reminder), checking their calendar (get_calendar), sending notifications via Telegram (send_notification), and more. Use the appropriate tool for each request. When setting reminders, always craft a short, personalized deliveryMessage in your voice that will be sent via Telegram when the reminder fires — make it feel like YOU are personally nudging the user. Notifications and reminders are delivered via Telegram. You can search memories to check past reminder deliveries. When creating or updating workout schedule entries, always include a short motivational "note" field per day (e.g. "Upper body focus today — push for a new PR on bench") — this appears on the user's workout card as your personal tip.`;

        // Memory saving — be generous
        prompt += `\n\nSave memories generously. Anything that helps you know the user better is worth saving: preferences, habits, opinions, small personal details, goals, moods, routines, relationships, interests. You don't need to search before saving — the system handles deduplication automatically. The more you remember, the more useful and personal you become. Think of yourself as a personal assistant who never forgets what someone told you.`;

        // Amazon cart preparation
        prompt += `\n\nWhen the user wants to buy something on Amazon, you can prepare a pre-loaded Amazon cart for them. First use web_search to find the product on Amazon and extract the ASIN (10-character product ID). Then call amazon_cart with the ASINs to generate a direct "Add to Cart" link. The user clicks the link and completes checkout on Amazon.`;

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

    const sendMessage = useCallback(async (text) => {
        if (!text.trim() || isLoading || !user) return;

        setError(null);
        await ensureUserData();

        // Request notification permission on first message
        if (!notifPermissionRef.current) {
            notifPermissionRef.current = true;
            requestNotificationPermission();
        }

        // Add user message to UI immediately
        const userMsg = { id: Date.now().toString(), role: 'user', content: text, createdAt: Date.now() };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setIsLoading(true);

        try {
            const apiMessages = updatedMessages.map((m) => ({
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
