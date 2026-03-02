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
    const memoriesRef = useRef([]);
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

            // Fetch memories
            if (dbUserIdRef.current) {
                const memRes = await fetch(`/api/memories?userId=${dbUserIdRef.current}&limit=20`);
                const memData = await memRes.json();
                if (memData.memories) {
                    memoriesRef.current = memData.memories;
                }
            }
        } catch (e) {
            console.error('Failed to load user data:', e);
        }
    }, [user]);

    // Build system prompt with memories injected
    const buildSystemPrompt = useCallback(() => {
        let prompt = `Your name is Cesy. ${ASSISTANT.instructions}`;

        if (memoriesRef.current.length > 0) {
            const memoryLines = memoriesRef.current
                .map((m) => `- ${m.content}`)
                .join('\n');
            prompt += `\n\nHere are things you remember about this user:\n${memoryLines}\n\nUse these memories to personalize your responses. If the user tells you something new about themselves, mention it naturally.`;
        }

        if (user?.displayName) {
            prompt += `\n\nThe user's name is ${user.displayName}.`;
        }

        return prompt;
    }, [user]);

    // Extract and save memories from conversation
    const extractMemories = useCallback(async (userMessage, assistantResponse) => {
        if (!dbUserIdRef.current) return;

        // Simple heuristic: save user preferences, facts, and schedule info
        const patterns = [
            /(?:i (?:like|love|prefer|enjoy|hate|dislike))\s+(.+)/i,
            /(?:my (?:name|goal|weight|height|age) is)\s+(.+)/i,
            /(?:i (?:am|was|have|want|need))\s+(.+)/i,
            /(?:i (?:work out|exercise|train|run|lift))\s+(.+)/i,
        ];

        for (const pattern of patterns) {
            const match = userMessage.match(pattern);
            if (match) {
                try {
                    await fetch('/api/memories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: dbUserIdRef.current,
                            content: userMessage,
                            tags: ['auto-extracted', 'preference'],
                        }),
                    });
                } catch (e) {
                    console.error('Failed to save memory:', e);
                }
                break; // One memory per message
            }
        }
    }, []);

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

            // Background tasks: extract memories + check for workout schedule
            extractMemories(text, data.message);
            checkForSchedule(data.message);

            return data;
        } catch (e) {
            setError(e.message);
            console.error('Send message error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, user, ensureUserData, buildSystemPrompt, extractMemories, checkForSchedule]);

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
