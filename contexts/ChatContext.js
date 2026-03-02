'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ASSISTANT } from '@/lib/constants';
import { parseScheduleFromResponse } from '@/lib/scheduleParser';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const workoutRef = useRef(null);
    const dbUserIdRef = useRef(null);

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
        } catch (e) {
            console.error('Failed to load user data:', e);
        }
    }, [user]);

    // Build system prompt — memories are now handled by LLM tools
    const buildSystemPrompt = useCallback(() => {
        let prompt = `Your name is Cesy. ${ASSISTANT.instructions}`;

        // Schedule formatting instructions
        prompt += `\n\nIMPORTANT: When creating or showing a workout schedule, ALWAYS format each day exactly like this:\n- Day: Workout Type, Duration minutes (Equipment: item1, item2)\nFor example:\n- Monday: Basketball drills, 30 minutes (Equipment: Basketball, Court)\n- Tuesday: Strength training, 45 minutes (Equipment: Dumbbells, Bench)\nThis exact format is required so the app can parse and save the schedule automatically.`;

        // Memory tool instructions
        prompt += `\n\nYou have access to memory tools. Use save_memory to remember important facts about the user (preferences, goals, habits, personal info). Use search_memories to recall previously saved information when it would help personalize your response. Be proactive about saving new facts and searching for context.`;

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

    // Check if response contains a workout schedule and save it
    const checkForSchedule = useCallback(async (response) => {
        if (!dbUserIdRef.current) return;

        const schedule = parseScheduleFromResponse(response);
        if (schedule) {
            try {
                await fetch('/api/workout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: dbUserIdRef.current,
                        schedule,
                        rawResponse: response,
                    }),
                });
            } catch (e) {
                console.error('Failed to save workout schedule:', e);
            }
        }
    }, []);

    const sendMessage = useCallback(async (text) => {
        if (!text.trim() || isLoading || !user) return;

        setError(null);
        await ensureUserData();

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

            const assistantMsg = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.message,
                createdAt: Date.now(),
                usage: data.usage,
            };
            setMessages((prev) => [...prev, assistantMsg]);

            // Check for workout schedule in response
            checkForSchedule(data.message);

            return data;
        } catch (e) {
            setError(e.message);
            console.error('Send message error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, user, ensureUserData, buildSystemPrompt, checkForSchedule]);

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
