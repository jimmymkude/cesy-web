/**
 * Tests for ChatContext — sendMessage flow, buildSystemPrompt, ensureUserData
 */
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { ChatProvider, useChat } from '@/contexts/ChatContext';

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'fb-123', email: 'test@test.com', displayName: 'Test User', photoURL: null },
    }),
}));

// Mock fetch globally
const originalFetch = global.fetch;

function ChatConsumer({ onChat }) {
    const ctx = useChat();
    React.useEffect(() => {
        if (onChat) onChat(ctx);
    }, [ctx, onChat]);
    return (
        <div>
            <span data-testid="loading">{ctx.isLoading ? 'true' : 'false'}</span>
            <span data-testid="error">{ctx.error || 'none'}</span>
            <span data-testid="count">{ctx.messages.length}</span>
        </div>
    );
}

describe('ChatContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockImplementation(async (url) => {
            if (url === '/api/auth/sync') {
                return {
                    ok: true,
                    json: async () => ({ user: { id: 'db-user-1' } }),
                };
            }
            if (url?.includes('/api/workout')) {
                return {
                    ok: true,
                    json: async () => ({ schedule: null }),
                };
            }
            if (url === '/api/chat') {
                return {
                    ok: true,
                    json: async () => ({
                        message: 'Hello from Cesy!',
                        model: 'claude-sonnet-4-20250514',
                        usage: { input_tokens: 10, output_tokens: 5 },
                    }),
                };
            }
            return { ok: true, json: async () => ({}) };
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('starts with empty messages and no error', () => {
        const { getByTestId } = render(
            <ChatProvider><ChatConsumer /></ChatProvider>
        );
        expect(getByTestId('count').textContent).toBe('0');
        expect(getByTestId('error').textContent).toBe('none');
        expect(getByTestId('loading').textContent).toBe('false');
    });

    it('sends message and gets response', async () => {
        let chatCtx;
        const { getByTestId } = render(
            <ChatProvider>
                <ChatConsumer onChat={(ctx) => { chatCtx = ctx; }} />
            </ChatProvider>
        );

        await act(async () => {
            await chatCtx.sendMessage('Hello');
        });

        await waitFor(() => {
            expect(getByTestId('count').textContent).toBe('2'); // user + assistant
        });
    });

    it('does not send empty messages', async () => {
        let chatCtx;
        render(
            <ChatProvider>
                <ChatConsumer onChat={(ctx) => { chatCtx = ctx; }} />
            </ChatProvider>
        );

        await act(async () => {
            await chatCtx.sendMessage('   ');
        });

        expect(global.fetch).not.toHaveBeenCalledWith(
            '/api/chat',
            expect.anything()
        );
    });

    it('handles API error gracefully', async () => {
        global.fetch = jest.fn().mockImplementation(async (url) => {
            if (url === '/api/auth/sync') {
                return { ok: true, json: async () => ({ user: { id: 'db-user-1' } }) };
            }
            if (url?.includes('/api/workout')) {
                return { ok: true, json: async () => ({ schedule: null }) };
            }
            if (url === '/api/chat') {
                return {
                    ok: false,
                    json: async () => ({ error: 'Server overloaded' }),
                };
            }
            return { ok: true, json: async () => ({}) };
        });

        let chatCtx;
        const { getByTestId } = render(
            <ChatProvider>
                <ChatConsumer onChat={(ctx) => { chatCtx = ctx; }} />
            </ChatProvider>
        );

        await act(async () => {
            await chatCtx.sendMessage('Hello');
        });

        await waitFor(() => {
            expect(getByTestId('error').textContent).toContain('Server overloaded');
        });
    });

    it('clears chat', async () => {
        let chatCtx;
        const { getByTestId } = render(
            <ChatProvider>
                <ChatConsumer onChat={(ctx) => { chatCtx = ctx; }} />
            </ChatProvider>
        );

        await act(async () => {
            await chatCtx.sendMessage('Hello');
        });

        await waitFor(() => {
            expect(getByTestId('count').textContent).toBe('2');
        });

        act(() => chatCtx.clearChat());

        expect(getByTestId('count').textContent).toBe('0');
        expect(getByTestId('error').textContent).toBe('none');
    });

    it('throws when useChat is used outside provider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<ChatConsumer />)).toThrow('useChat must be used within ChatProvider');
        spy.mockRestore();
    });

    it('includes date/time in system prompt via chat API call', async () => {
        let chatCtx;
        render(
            <ChatProvider>
                <ChatConsumer onChat={(ctx) => { chatCtx = ctx; }} />
            </ChatProvider>
        );

        await act(async () => {
            await chatCtx.sendMessage('Test');
        });

        const chatCall = global.fetch.mock.calls.find(([url]) => url === '/api/chat');
        expect(chatCall).toBeDefined();
        const body = JSON.parse(chatCall[1].body);
        expect(body.systemPrompt).toContain('CURRENT TIME');
    });
});
