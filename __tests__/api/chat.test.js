/**
 * Tests for POST /api/chat
 * Tests the tool-use loop and route-level logic.
 * Individual tool tests are in __tests__/lib/tools.test.js
 */
import { POST } from '@/app/api/chat/route';

// Mock the tools module
jest.mock('@/lib/tools', () => {
    const actualTools = jest.requireActual('@/lib/tools');
    return {
        __esModule: true,
        TOOLS: actualTools.TOOLS,
        executeTool: jest.fn(),
    };
});

const { executeTool } = require('@/lib/tools');

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

        executeTool.mockResolvedValue('Saved: "likes basketball"');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'I like basketball' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('I remembered that!');
        expect(executeTool).toHaveBeenCalledWith('save_memory', { content: 'likes basketball', tags: ['sport'] }, 'u1');
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

        executeTool.mockResolvedValue('- likes basketball (1/15/2024)');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'what sports do I like' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('You like basketball!');
        expect(executeTool).toHaveBeenCalledWith('search_memories', { query: 'sport' }, 'u1');
    });

    it('returns error message when userId is missing for user-scoped tool', async () => {
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
        expect(executeTool).not.toHaveBeenCalled();
    });

    it('allows non-user-scoped tools without userId', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'run_calculation', input: { expression: '2+2' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'That equals 4.' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        executeTool.mockResolvedValue('2+2 = 4');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'what is 2+2' }],
            // no userId — but run_calculation doesn't need it
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('That equals 4.');
        expect(executeTool).toHaveBeenCalledWith('run_calculation', { expression: '2+2' }, undefined);
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

    it('handles tool use loop with set_reminder', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'set_reminder', input: { content: 'Team meeting', dueAt: '2024-03-15T10:00:00' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'Reminder set!' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        executeTool.mockResolvedValue('Reminder set: "Team meeting"');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'remind me about the team meeting' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('Reminder set!');
        expect(executeTool).toHaveBeenCalledWith('set_reminder', { content: 'Team meeting', dueAt: '2024-03-15T10:00:00' }, 'u1');
    });

    it('handles tool use loop with manage_workout', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'manage_workout', input: { action: 'add', dayOfWeek: 3, workoutType: 'Yoga' } },
                        ],
                        stop_reason: 'tool_use',
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    content: [{ type: 'text', text: 'Added yoga on Wednesday!' }],
                    stop_reason: 'end_turn',
                    model: 'claude-sonnet-4-20250514',
                    usage: {},
                }),
            };
        });

        executeTool.mockResolvedValue('Workout schedule updated: add on Wednesday — Yoga.');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'add yoga on wednesdays' }],
            userId: 'u1',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('Added yoga on Wednesday!');
        expect(executeTool).toHaveBeenCalledWith('manage_workout', { action: 'add', dayOfWeek: 3, workoutType: 'Yoga' }, 'u1');
    });

    it('handles unknown tool name gracefully', async () => {
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

        executeTool.mockResolvedValue('Unknown tool: unknown_tool');

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'test' }],
            userId: 'u1',
        }));

        expect(res.status).toBe(200);
    });

    it('handles response with no text blocks', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                content: [],
                stop_reason: 'end_turn',
                model: 'claude-sonnet-4-20250514',
                usage: {},
            }),
        });

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'hi' }],
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.message).toBe('No response received.');
    });

    it('handles general errors', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Connection failed'));

        const res = await POST(makeRequest({
            messages: [{ role: 'user', content: 'hi' }],
        }));
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toContain('Connection failed');
    });
});
