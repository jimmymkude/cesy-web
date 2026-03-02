/**
 * Tests for POST /api/chat
 */
import { POST } from '@/app/api/chat/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        memory: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
        },
    },
}));

const prisma = require('@/lib/prisma').default;

// Mock global fetch for Anthropic API
const originalFetch = global.fetch;

function makeRequest(body) {
    return { json: async () => body };
}

describe('POST /api/chat', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
        delete process.env.ANTHROPIC_API_KEY;

        const res = await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }));
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toContain('ANTHROPIC_API_KEY');
    });

    it('returns 400 when messages are missing', async () => {
        const res = await POST(makeRequest({}));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toContain('messages');
    });

    it('returns 400 when messages array is empty', async () => {
        const res = await POST(makeRequest({ messages: [] }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toContain('messages');
    });

    it('returns successful response without tool use', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                content: [{ type: 'text', text: 'Hello there!' }],
                stop_reason: 'end_turn',
                model: 'claude-sonnet-4-20250514',
                usage: { input_tokens: 10, output_tokens: 5 },
            }),
        });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'hi' }],
            systemPrompt: 'You are Cesy',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('Hello there!');
        expect(data.model).toBe('claude-sonnet-4-20250514');
        expect(data.usage).toBeDefined();
    });

    it('handles tool use loop with save_memory', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'save_memory', input: { content: 'likes basketball', tags: ['sport'] } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'I remembered that!' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        prisma.memory.findFirst.mockResolvedValue(null);
        prisma.memory.create.mockResolvedValue({ id: 'm1' });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'I like basketball' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('I remembered that!');
        expect(prisma.memory.create).toHaveBeenCalled();
    });

    it('handles search_memories tool', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'search_memories', input: { query: 'sport' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'You like basketball!' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        prisma.memory.findMany.mockResolvedValue([
            { content: 'likes basketball', createdAt: new Date('2024-01-01') },
        ]);

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'what sports do I like' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('You like basketball!');
        expect(prisma.memory.findMany).toHaveBeenCalled();
    });

    it('returns error message when userId is missing for tool use', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'save_memory', input: { content: 'test' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'Could not save.' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'remember this' }],
            // no userId
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(prisma.memory.create).not.toHaveBeenCalled();
    });

    it('handles Anthropic API error', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({
                error: { message: 'Rate limited' },
            }),
        });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'hi' }],
        }));
        const data = await res.json();

        expect(res.status).toBe(429);
        expect(data.error).toContain('Rate limited');
    });

    it('handles unknown tool name', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'unknown_tool', input: {} },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'ok' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'test' }],
            userId: 'u1',
        }));

        expect(res.status).toBe(200);
    });

    it('handles memory deduplication in save_memory tool', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'save_memory', input: { content: 'existing fact' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'Already knew that.' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'existing fact' });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'test' }],
            userId: 'u1',
        }));

        expect(res.status).toBe(200);
        expect(prisma.memory.create).not.toHaveBeenCalled();
    });

    it('returns empty memories message for search with no results', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'search_memories', input: { query: 'nonexistent' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'No info on that.' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        prisma.memory.findMany.mockResolvedValue([]);

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'test' }],
            userId: 'u1',
        }));

        expect(res.status).toBe(200);
    });
});
