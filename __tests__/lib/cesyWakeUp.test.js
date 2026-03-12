/**
 * Tests for cesyWakeUp — Server-side Cesy wake-up utility
 */
import { wakeUpCesy, buildServerSystemPrompt } from '@/lib/cesyWakeUp';

// Mock tools
jest.mock('@/lib/tools', () => ({
    TOOLS: [{ name: 'search_memories', description: 'test', input_schema: { type: 'object', properties: {} } }],
    executeTool: jest.fn().mockResolvedValue('- User enjoys basketball (Mar 10)\n- User had a good mood yesterday'),
}));

jest.mock('@/lib/constants', () => ({
    ASSISTANT: {
        instructions: 'You are a helpful assistant. You are funny.',
    },
}));

import { executeTool } from '@/lib/tools';

// Mock global fetch for Anthropic API
const originalFetch = global.fetch;

describe('buildServerSystemPrompt', () => {
    it('includes Cesy personality from ASSISTANT.instructions', () => {
        const prompt = buildServerSystemPrompt();
        expect(prompt).toContain('You are a helpful assistant');
        expect(prompt).toContain('Your name is Cesy');
    });

    it('includes temporal awareness', () => {
        const prompt = buildServerSystemPrompt();
        expect(prompt).toContain('CURRENT TIME');
        expect(prompt).toContain('ISO:');
    });

    it('includes extra context when provided', () => {
        const prompt = buildServerSystemPrompt("The user's name is Jimmy.");
        expect(prompt).toContain("The user's name is Jimmy.");
    });

    it('includes tool usage instructions', () => {
        const prompt = buildServerSystemPrompt();
        expect(prompt).toContain('search_memories');
    });
});

describe('wakeUpCesy', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    });

    afterAll(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    it('returns null when ANTHROPIC_API_KEY is not set', async () => {
        process.env = { ...originalEnv };
        delete process.env.ANTHROPIC_API_KEY;

        const result = await wakeUpCesy('Hello', 'user-1');
        expect(result).toBeNull();
    });

    it('returns text response when Claude responds directly (no tools)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                stop_reason: 'end_turn',
                content: [{ type: 'text', text: 'Hey Jimmy, basketball day! 🏀' }],
            }),
        });

        const result = await wakeUpCesy('Wake up for workout', 'user-1');
        expect(result).toBe('Hey Jimmy, basketball day! 🏀');
    });

    it('handles tool loop — calls executeTool and gets final response', async () => {
        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                // First call: Claude wants to use search_memories
                return {
                    ok: true,
                    json: async () => ({
                        stop_reason: 'tool_use',
                        content: [
                            { type: 'tool_use', id: 'tool-1', name: 'search_memories', input: { query: 'recent activity' } },
                        ],
                    }),
                };
            }
            // Second call: Claude responds with text after seeing tool results
            return {
                ok: true,
                json: async () => ({
                    stop_reason: 'end_turn',
                    content: [{ type: 'text', text: 'Time to hit those handles on the court today! 🏀' }],
                }),
            };
        });

        const result = await wakeUpCesy('Workout reminder for basketball', 'user-1');

        expect(result).toBe('Time to hit those handles on the court today! 🏀');
        expect(executeTool).toHaveBeenCalledWith('search_memories', { query: 'recent activity' }, 'user-1');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns null on Anthropic API error', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: { message: 'Rate limited' } }),
        });

        const result = await wakeUpCesy('Test', 'user-1');
        expect(result).toBeNull();
    });

    it('returns null on fetch error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const result = await wakeUpCesy('Test', 'user-1');
        expect(result).toBeNull();
    });

    it('returns null when max iterations exceeded', async () => {
        // Always returns tool_use — will exceed max iterations
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                stop_reason: 'tool_use',
                content: [
                    { type: 'tool_use', id: 'tool-loop', name: 'search_memories', input: { query: 'test' } },
                ],
            }),
        });

        const result = await wakeUpCesy('Test', 'user-1', { maxIterations: 2 });
        expect(result).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('passes extraContext to system prompt', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                stop_reason: 'end_turn',
                content: [{ type: 'text', text: 'Response' }],
            }),
        });

        await wakeUpCesy('Test', 'user-1', { extraContext: 'User is Jimmy.' });

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.system).toContain('User is Jimmy.');
    });

    it('sends system prompt with full Cesy personality', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                stop_reason: 'end_turn',
                content: [{ type: 'text', text: 'Response' }],
            }),
        });

        await wakeUpCesy('Test', 'user-1');

        const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(callBody.system).toContain('Your name is Cesy');
        expect(callBody.system).toContain('CURRENT TIME');
        expect(callBody.messages[0].content).toBe('Test');
    });
});
