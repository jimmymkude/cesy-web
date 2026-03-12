/**
 * Tests for lib/tools.js — All 12 Cesy AI agent tools
 * Target: ≥90% statement coverage
 */
import { TOOLS, executeTool, safeEvaluate, generateEmbedding, toVectorLiteral } from '@/lib/tools';

// Mock sendNotificationToUser from telegram module
jest.mock('@/lib/telegram', () => ({
    sendNotificationToUser: jest.fn().mockResolvedValue({ sent: false, reason: 'No Telegram account linked.' }),
}));

import { sendNotificationToUser } from '@/lib/telegram';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        memory: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        reminder: {
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        workoutSchedule: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
        timer: {
            create: jest.fn(),
        },
        $executeRawUnsafe: jest.fn(),
        $queryRawUnsafe: jest.fn(),
    },
}));

const prisma = require('@/lib/prisma').default;
const originalFetch = global.fetch;

describe('TOOLS definitions', () => {
    it('exports 13 tool definitions', () => {
        expect(TOOLS).toHaveLength(18);
    });

    it('all tools have required schema fields', () => {
        for (const tool of TOOLS) {
            expect(tool.name).toBeDefined();
            expect(tool.description).toBeDefined();
            expect(tool.input_schema).toBeDefined();
            expect(tool.input_schema.type).toBe('object');
        }
    });

    it('contains expected tool names', () => {
        const names = TOOLS.map((t) => t.name);
        expect(names).toContain('save_memory');
        expect(names).toContain('search_memories');
        expect(names).toContain('update_memory');
        expect(names).toContain('delete_memory');
        expect(names).toContain('web_search');
        expect(names).toContain('set_reminder');
        expect(names).toContain('get_calendar');
        expect(names).toContain('get_weather');
        expect(names).toContain('send_notification');
        expect(names).toContain('run_calculation');
        expect(names).toContain('manage_workout');
        expect(names).toContain('set_timer');
        expect(names).toContain('cancel_reminder');
    });
});

// ─── safeEvaluate ────────────────────────────────────────────────────
describe('safeEvaluate', () => {
    it('evaluates basic arithmetic', () => {
        expect(safeEvaluate('2 + 3')).toBe(5);
        expect(safeEvaluate('10 * 5')).toBe(50);
        expect(safeEvaluate('100 / 4')).toBe(25);
        expect(safeEvaluate('7 - 3')).toBe(4);
    });

    it('evaluates expressions with parentheses', () => {
        expect(safeEvaluate('(2 + 3) * 4')).toBe(20);
    });

    it('evaluates Math functions', () => {
        expect(safeEvaluate('Math.sqrt(144)')).toBe(12);
        expect(safeEvaluate('Math.pow(2, 8)')).toBe(256);
        expect(safeEvaluate('Math.floor(3.7)')).toBe(3);
        expect(safeEvaluate('Math.PI')).toBeCloseTo(3.14159);
    });

    it('blocks dangerous keywords', () => {
        expect(() => safeEvaluate('process.exit()')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('require("fs")')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('eval("1+1")')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('global.fetch()')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('window.location')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('document.cookie')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('Function("return 1")()')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('setTimeout(() => {}, 0)')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('constructor')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('__proto__')).toThrow('Blocked keyword');
        expect(() => safeEvaluate('import("os")')).toThrow('Blocked keyword');
    });

    it('blocks invalid characters', () => {
        expect(() => safeEvaluate('abc + 1')).toThrow('Invalid characters');
        expect(() => safeEvaluate('"hello"')).toThrow('Invalid characters');
    });
});

// ─── generateEmbedding ───────────────────────────────────────────────
describe('generateEmbedding', () => {
    const originalFetchGe = global.fetch;
    afterEach(() => { global.fetch = originalFetchGe; });

    it('returns embedding vector when API key is set', async () => {
        process.env.VOYAGE_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        });

        const result = await generateEmbedding('test text');

        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(global.fetch).toHaveBeenCalledWith('https://api.voyageai.com/v1/embeddings', expect.objectContaining({
            method: 'POST',
        }));
    });

    it('returns null when API key is missing', async () => {
        delete process.env.VOYAGE_API_KEY;

        const result = await generateEmbedding('test text');

        expect(result).toBeNull();
    });

    it('returns null when API call fails', async () => {
        process.env.VOYAGE_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({ ok: false });

        const result = await generateEmbedding('test text');

        expect(result).toBeNull();
    });

    it('returns null when response has no embedding data', async () => {
        process.env.VOYAGE_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        });

        const result = await generateEmbedding('test text');

        expect(result).toBeNull();
    });
});

// ─── toVectorLiteral ────────────────────────────────────────────────
describe('toVectorLiteral', () => {
    it('formats float array as pgvector string', () => {
        expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
    });

    it('handles empty array', () => {
        expect(toVectorLiteral([])).toBe('[]');
    });

    it('handles single element', () => {
        expect(toVectorLiteral([1.5])).toBe('[1.5]');
    });
});

// ─── executeTool ─────────────────────────────────────────────────────
describe('executeTool', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    // ── save_memory ──────────────────────────────────────────
    describe('save_memory', () => {
        beforeEach(() => {
            delete process.env.VOYAGE_API_KEY;
        });

        it('saves a new memory and stores embedding via raw SQL when API key available', async () => {
            process.env.VOYAGE_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
            });
            prisma.memory.findFirst.mockResolvedValue(null);
            prisma.memory.create.mockResolvedValue({ id: 'm1' });
            prisma.$executeRawUnsafe.mockResolvedValue(1);

            const result = await executeTool('save_memory', { content: 'likes coffee', tags: ['preference'] }, 'u1');

            expect(result).toContain('Saved');
            expect(prisma.memory.create).toHaveBeenCalledWith({
                data: { userId: 'u1', content: 'likes coffee', tags: ['preference'], eventDate: null },
            });
            expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE memories SET embedding'),
                '[0.1,0.2]',
                'm1'
            );
        });

        it('saves memory without embedding when API key missing', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);
            prisma.memory.create.mockResolvedValue({ id: 'm1' });

            const result = await executeTool('save_memory', { content: 'likes coffee', tags: ['preference'] }, 'u1');

            expect(result).toContain('Saved');
            expect(prisma.memory.create).toHaveBeenCalledWith({
                data: { userId: 'u1', content: 'likes coffee', tags: ['preference'], eventDate: null },
            });
        });

        it('saves a memory with eventDate for events', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);
            prisma.memory.create.mockResolvedValue({ id: 'm2' });

            const result = await executeTool('save_memory', {
                content: 'Basketball game this Friday',
                tags: ['event', 'basketball'],
                eventDate: '2026-03-07T00:00:00',
            }, 'u1');

            expect(result).toContain('Saved');
            expect(prisma.memory.create).toHaveBeenCalledWith({
                data: {
                    userId: 'u1',
                    content: 'Basketball game this Friday',
                    tags: ['event', 'basketball'],
                    eventDate: expect.any(Date),
                },
            });
            expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
        });

        it('deduplicates existing memory', async () => {
            prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'likes coffee' });

            const result = await executeTool('save_memory', { content: 'likes coffee' }, 'u1');

            expect(result).toBe('Memory already saved.');
            expect(prisma.memory.create).not.toHaveBeenCalled();
        });

        it('defaults tags to empty array', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);
            prisma.memory.create.mockResolvedValue({ id: 'm1' });

            await executeTool('save_memory', { content: 'test' }, 'u1');

            expect(prisma.memory.create).toHaveBeenCalledWith({
                data: { userId: 'u1', content: 'test', tags: [], eventDate: null },
            });
        });
    });

    // ── search_memories ──────────────────────────────────────
    describe('search_memories', () => {
        it('uses pgvector semantic search when embeddings available', async () => {
            process.env.VOYAGE_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
            });
            // Mock pgvector raw query results (pre-sorted by DB)
            prisma.$queryRawUnsafe.mockResolvedValue([
                { id: 'm1', content: 'loves basketball', createdAt: new Date('2024-01-15') },
                { id: 'm2', content: 'plays hoops on Tuesdays', createdAt: new Date('2024-03-01') },
            ]);

            const result = await executeTool('search_memories', { query: 'basketball' }, 'u1');

            expect(result).toContain('loves basketball');
            expect(result).toContain('plays hoops');
            expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY embedding <=>'),
                'u1',
                '[1,0,0]'
            );
        });

        it('returns no results when pgvector search finds nothing', async () => {
            process.env.VOYAGE_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
            });
            prisma.$queryRawUnsafe.mockResolvedValue([]);

            const result = await executeTool('search_memories', { query: 'sport' }, 'u1');

            expect(result).toBe('No memories found for this query.');
        });

        it('falls back to keyword search when embedding API unavailable', async () => {
            delete process.env.VOYAGE_API_KEY;
            prisma.memory.findMany.mockResolvedValue([
                { content: 'likes basketball', createdAt: new Date('2024-01-15') },
                { content: 'plays on Tuesdays', createdAt: new Date('2024-02-01') },
            ]);

            const result = await executeTool('search_memories', { query: 'basketball' }, 'u1');

            expect(result).toContain('likes basketball');
            expect(result).toContain('plays on Tuesdays');
            expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
        });

        it('returns message when keyword fallback finds nothing', async () => {
            delete process.env.VOYAGE_API_KEY;
            prisma.memory.findMany.mockResolvedValue([]);

            const result = await executeTool('search_memories', { query: 'xyz' }, 'u1');

            expect(result).toBe('No memories found for this query.');
        });
    });

    // ── update_memory ────────────────────────────────────────
    describe('update_memory', () => {
        it('updates an existing memory', async () => {
            prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'likes running' });
            prisma.memory.update.mockResolvedValue({ id: 'm1', content: 'likes swimming' });

            const result = await executeTool('update_memory', { search: 'running', newContent: 'likes swimming' }, 'u1');

            expect(result).toContain('Updated memory');
            expect(result).toContain('likes running');
            expect(result).toContain('likes swimming');
            expect(prisma.memory.update).toHaveBeenCalledWith({
                where: { id: 'm1' },
                data: { content: 'likes swimming' },
            });
        });

        it('updates memory with eventDate', async () => {
            prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'basketball game' });
            prisma.memory.update.mockResolvedValue({});

            const result = await executeTool('update_memory', {
                search: 'basketball',
                newContent: 'basketball game at 4pm',
                eventDate: '2026-03-07T16:00:00',
            }, 'u1');

            expect(result).toContain('Updated memory');
            expect(prisma.memory.update).toHaveBeenCalledWith({
                where: { id: 'm1' },
                data: { content: 'basketball game at 4pm', eventDate: expect.any(Date) },
            });
        });

        it('returns not found when no match', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);

            const result = await executeTool('update_memory', { search: 'xyz', newContent: 'abc' }, 'u1');

            expect(result).toContain('No memory found');
        });
    });

    // ── delete_memory ────────────────────────────────────────
    describe('delete_memory', () => {
        it('deletes a matching memory', async () => {
            prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'old fact' });
            prisma.memory.delete.mockResolvedValue({});

            const result = await executeTool('delete_memory', { search: 'old fact' }, 'u1');

            expect(result).toContain('Deleted memory');
            expect(result).toContain('old fact');
            expect(prisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
        });

        it('returns not found when no match', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);

            const result = await executeTool('delete_memory', { search: 'nothing' }, 'u1');

            expect(result).toContain('No memory found');
        });
    });

    // ── web_search ───────────────────────────────────────────
    describe('web_search', () => {
        it('returns search results with citations', async () => {
            process.env.PERPLEXITY_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Liverpool won 3-1' } }],
                    citations: ['https://bbc.com/sport/1', 'https://espn.com/2'],
                }),
            });

            const result = await executeTool('web_search', { query: 'Liverpool score' }, 'u1');

            expect(result).toContain('Liverpool won 3-1');
            expect(result).toContain('Sources:');
            expect(result).toContain('bbc.com');
        });

        it('returns message when API key is missing', async () => {
            delete process.env.PERPLEXITY_API_KEY;

            const result = await executeTool('web_search', { query: 'test' }, 'u1');

            expect(result).toBe('Web search is not configured.');
        });

        it('handles API failure', async () => {
            process.env.PERPLEXITY_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({ ok: false });

            const result = await executeTool('web_search', { query: 'test' }, 'u1');

            expect(result).toBe('Web search failed.');
        });

        it('handles fetch error', async () => {
            process.env.PERPLEXITY_API_KEY = 'test-key';
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

            const result = await executeTool('web_search', { query: 'test' }, 'u1');

            expect(result).toContain('Web search error');
        });

        it('handles response without citations', async () => {
            process.env.PERPLEXITY_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Answer here' } }],
                }),
            });

            const result = await executeTool('web_search', { query: 'test' }, 'u1');

            expect(result).toBe('Answer here');
            expect(result).not.toContain('Sources:');
        });
    });

    // ── set_reminder ─────────────────────────────────────────
    describe('set_reminder', () => {
        it('creates a reminder with valid date', async () => {
            prisma.reminder.create.mockResolvedValue({ id: 'r1' });

            const result = await executeTool('set_reminder', {
                content: 'Team meeting',
                dueAt: '2024-03-15T10:00:00',
                deliveryMessage: 'Heads up! Team meeting time.',
            }, 'u1');

            expect(result).toContain('Reminder set');
            expect(result).toContain('Team meeting');
            expect(prisma.reminder.create).toHaveBeenCalledWith({
                data: {
                    userId: 'u1',
                    content: 'Team meeting',
                    dueAt: expect.any(Date),
                    deliveryMessage: 'Heads up! Team meeting time.',
                },
            });
        });

        it('returns error for invalid date', async () => {
            const result = await executeTool('set_reminder', {
                content: 'test',
                dueAt: 'not-a-date',
            }, 'u1');

            expect(result).toContain('Could not parse date');
            expect(prisma.reminder.create).not.toHaveBeenCalled();
        });
    });

    // ── cancel_reminder ──────────────────────────────────────
    describe('cancel_reminder', () => {
        it('cancels a matching active reminder', async () => {
            prisma.reminder.findMany.mockResolvedValue([
                { id: 'r1', content: 'Go to gym', dueAt: new Date('2024-03-15T18:00:00') },
            ]);
            prisma.reminder.update.mockResolvedValue({});

            const result = await executeTool('cancel_reminder', { query: 'gym' }, 'u1');

            expect(result).toContain('Cancelled reminder');
            expect(result).toContain('Go to gym');
            expect(prisma.reminder.update).toHaveBeenCalledWith({
                where: { id: 'r1' },
                data: { completed: true },
            });
        });

        it('returns message when no matching reminder found', async () => {
            prisma.reminder.findMany.mockResolvedValue([]);

            const result = await executeTool('cancel_reminder', { query: 'nonexistent' }, 'u1');

            expect(result).toContain('No active reminders found');
            expect(prisma.reminder.update).not.toHaveBeenCalled();
        });
    });

    // ── get_calendar ─────────────────────────────────────────
    describe('get_calendar', () => {
        it('returns combined calendar with workouts and reminders', async () => {
            // Use a fixed local date to avoid timezone issues
            const testDate = new Date(2024, 2, 15, 12, 0, 0); // March 15 2024 noon local
            const dayOfWeek = testDate.getDay(); // will be correct in any TZ
            const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

            prisma.reminder.findMany.mockResolvedValue([
                { content: 'Team standup', dueAt: new Date(2024, 2, 15, 9, 0, 0) },
            ]);
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [
                    { dayOfWeek, workoutType: 'Running', duration: 30, equipment: ['Shoes'] },
                ],
            });

            const result = await executeTool('get_calendar', { date: testDate.toISOString() }, 'u1');

            expect(result).toContain(dayName);
            expect(result).toContain('Workouts:');
            expect(result).toContain('Running');
            expect(result).toContain('30 min');
            expect(result).toContain('Shoes');
            expect(result).toContain('Reminders:');
            expect(result).toContain('Team standup');
        });

        it('returns empty schedule message when nothing planned', async () => {
            prisma.reminder.findMany.mockResolvedValue([]);
            prisma.workoutSchedule.findUnique.mockResolvedValue(null);

            const result = await executeTool('get_calendar', { date: '2024-03-15' }, 'u1');

            expect(result).toContain('Nothing scheduled');
        });

        it('returns all upcoming reminders and full schedule when no date given', async () => {
            prisma.reminder.findMany.mockResolvedValue([
                { content: 'Dentist appointment', dueAt: new Date(2024, 2, 20, 9, 0, 0) },
                { content: 'Submit report', dueAt: new Date(2024, 2, 22, 17, 0, 0) },
            ]);
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [
                    { dayOfWeek: 1, dayName: 'Monday', workoutType: 'Running', duration: 30, equipment: [] },
                    { dayOfWeek: 3, dayName: 'Wednesday', workoutType: 'Yoga', duration: 60, equipment: ['Mat'] },
                ],
            });

            const result = await executeTool('get_calendar', {}, 'u1');

            expect(result).toContain('Upcoming Schedule');
            expect(result).toContain('Dentist appointment');
            expect(result).toContain('Submit report');
            expect(result).toContain('Weekly Workouts');
            expect(result).toContain('Monday');
            expect(result).toContain('Running');
            expect(result).toContain('Wednesday');
            expect(result).toContain('Yoga');
        });

        it('shows no upcoming reminders message when none exist', async () => {
            prisma.reminder.findMany.mockResolvedValue([]);
            prisma.workoutSchedule.findUnique.mockResolvedValue(null);

            const result = await executeTool('get_calendar', {}, 'u1');

            expect(result).toContain('Upcoming Schedule');
            expect(result).toContain('No upcoming reminders');
        });

        it('handles workout with no equipment', async () => {
            const testDate = new Date(2024, 2, 15, 12, 0, 0);
            const dayOfWeek = testDate.getDay();

            prisma.reminder.findMany.mockResolvedValue([]);
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [
                    { dayOfWeek, workoutType: 'Yoga', duration: 60, equipment: [] },
                ],
            });

            const result = await executeTool('get_calendar', { date: testDate.toISOString() }, 'u1');

            expect(result).toContain('Yoga');
            expect(result).toContain('60 min');
        });

        it('handles non-array schedule gracefully', async () => {
            prisma.reminder.findMany.mockResolvedValue([]);
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: 'not-an-array',
            });

            const result = await executeTool('get_calendar', { date: '2024-03-15' }, 'u1');

            expect(result).toContain('Nothing scheduled');
        });
    });

    // ── get_weather ──────────────────────────────────────────
    describe('get_weather', () => {
        it('returns weather data', async () => {
            process.env.OPENWEATHER_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    name: 'Dar es Salaam',
                    main: { temp: 30, feels_like: 33, humidity: 80 },
                    weather: [{ description: 'partly cloudy' }],
                    wind: { speed: 3.5 },
                }),
            });

            const result = await executeTool('get_weather', { location: 'Dar es Salaam' }, 'u1');

            expect(result).toContain('Dar es Salaam');
            expect(result).toContain('partly cloudy');
            expect(result).toContain('30°C');
            expect(result).toContain('80%');
        });

        it('returns message when API key is missing', async () => {
            delete process.env.OPENWEATHER_API_KEY;

            const result = await executeTool('get_weather', { location: 'London' }, 'u1');

            expect(result).toContain('not configured');
        });

        it('handles API failure', async () => {
            process.env.OPENWEATHER_API_KEY = 'test-key';
            global.fetch = jest.fn().mockResolvedValue({ ok: false });

            const result = await executeTool('get_weather', { location: 'Nowhere' }, 'u1');

            expect(result).toContain('Could not get weather');
        });

        it('handles fetch error', async () => {
            process.env.OPENWEATHER_API_KEY = 'test-key';
            global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

            const result = await executeTool('get_weather', { location: 'London' }, 'u1');

            expect(result).toContain('Weather error');
        });
    });

    // ── send_notification ────────────────────────────────────
    describe('send_notification', () => {
        it('sends via Telegram when linked', async () => {
            sendNotificationToUser.mockResolvedValueOnce({ sent: true, result: { ok: true } });
            const spy = jest.spyOn(console, 'log').mockImplementation();

            const result = await executeTool('send_notification', { message: 'Hello!' }, 'u1');

            expect(result).toContain('sent via Telegram');
            expect(result).toContain('Hello!');
            expect(sendNotificationToUser).toHaveBeenCalledWith('u1', 'Hello!');
            spy.mockRestore();
        });

        it('falls back when Telegram not linked', async () => {
            sendNotificationToUser.mockResolvedValueOnce({ sent: false, reason: 'No Telegram account linked.' });
            const spy = jest.spyOn(console, 'log').mockImplementation();

            const result = await executeTool('send_notification', { message: 'Hi', channel: 'push' }, 'u1');

            expect(result).toContain('Link Telegram');
            expect(result).toContain('Hi');
            spy.mockRestore();
        });
    });

    // ── run_calculation ──────────────────────────────────────
    describe('run_calculation', () => {
        it('evaluates a valid expression', async () => {
            const result = await executeTool('run_calculation', { expression: '2 + 3 * 4' }, 'u1');

            expect(result).toContain('= 14');
        });

        it('evaluates Math.sqrt', async () => {
            const result = await executeTool('run_calculation', { expression: 'Math.sqrt(144)' }, 'u1');

            expect(result).toContain('= 12');
        });

        it('returns error for blocked expression', async () => {
            const result = await executeTool('run_calculation', { expression: 'process.exit()' }, 'u1');

            expect(result).toContain('Calculation error');
        });

        it('returns error for non-finite result', async () => {
            const result = await executeTool('run_calculation', { expression: '1 / 0' }, 'u1');

            expect(result).toContain('did not produce a valid number');
        });

        it('returns error for NaN result', async () => {
            const result = await executeTool('run_calculation', { expression: '0 / 0' }, 'u1');

            expect(result).toContain('did not produce a valid number');
        });
    });

    // ── manage_workout ───────────────────────────────────────
    describe('manage_workout', () => {
        it('adds a workout to empty schedule', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue(null);
            prisma.workoutSchedule.upsert.mockResolvedValue({});

            const result = await executeTool('manage_workout', {
                action: 'add',
                dayOfWeek: 1,
                workoutType: 'Running',
                duration: 30,
                equipment: ['Shoes'],
            }, 'u1');

            expect(result).toContain('updated');
            expect(result).toContain('add');
            expect(result).toContain('Monday');
            expect(result).toContain('Running');
            expect(prisma.workoutSchedule.upsert).toHaveBeenCalled();
        });

        it('adds a workout to existing schedule', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [{ dayOfWeek: 0, workoutType: 'Yoga', duration: 60, equipment: [] }],
            });
            prisma.workoutSchedule.upsert.mockResolvedValue({});

            const result = await executeTool('manage_workout', {
                action: 'add',
                dayOfWeek: 3,
                workoutType: 'Basketball',
            }, 'u1');

            expect(result).toContain('Wednesday');
            expect(result).toContain('Basketball');
        });

        it('removes a workout', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [
                    { dayOfWeek: 1, workoutType: 'Running' },
                    { dayOfWeek: 3, workoutType: 'Basketball' },
                ],
            });
            prisma.workoutSchedule.upsert.mockResolvedValue({});

            const result = await executeTool('manage_workout', {
                action: 'remove',
                dayOfWeek: 1,
            }, 'u1');

            expect(result).toContain('remove');
            expect(result).toContain('Monday');
        });

        it('returns error when removing non-existent workout', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [{ dayOfWeek: 1, workoutType: 'Running' }],
            });

            const result = await executeTool('manage_workout', {
                action: 'remove',
                dayOfWeek: 5,
            }, 'u1');

            expect(result).toContain('No workout found on Friday');
        });

        it('updates a workout', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [{ dayOfWeek: 1, workoutType: 'Running', duration: 30, equipment: [] }],
            });
            prisma.workoutSchedule.upsert.mockResolvedValue({});

            const result = await executeTool('manage_workout', {
                action: 'update',
                dayOfWeek: 1,
                workoutType: 'Sprints',
                duration: 45,
                equipment: ['Track'],
            }, 'u1');

            expect(result).toContain('update');
            expect(result).toContain('Monday');
            expect(result).toContain('Sprints');
        });

        it('returns error when updating non-existent workout', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: [],
            });

            const result = await executeTool('manage_workout', {
                action: 'update',
                dayOfWeek: 4,
            }, 'u1');

            expect(result).toContain('No workout found on Thursday');
        });

        it('returns error for unknown action', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({ schedule: [] });

            const result = await executeTool('manage_workout', {
                action: 'reset',
                dayOfWeek: 1,
            }, 'u1');

            expect(result).toContain('Unknown action');
        });

        it('returns error for invalid dayOfWeek', async () => {
            const result = await executeTool('manage_workout', {
                action: 'add',
                dayOfWeek: 9,
            }, 'u1');

            expect(result).toContain('Invalid day of week');
        });

        it('returns error when adding without workoutType', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue(null);

            const result = await executeTool('manage_workout', {
                action: 'add',
                dayOfWeek: 1,
            }, 'u1');

            expect(result).toContain('workoutType is required');
        });

        it('handles non-array schedule gracefully', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue({
                schedule: 'corrupted',
            });
            prisma.workoutSchedule.upsert.mockResolvedValue({});

            const result = await executeTool('manage_workout', {
                action: 'add',
                dayOfWeek: 1,
                workoutType: 'Yoga',
            }, 'u1');

            expect(result).toContain('add');
            expect(result).toContain('Monday');
        });
    });

    // ── set_timer ────────────────────────────────────────────
    describe('set_timer', () => {
        it('creates a timer and returns JSON with metadata', async () => {
            prisma.timer.create.mockResolvedValue({ id: 't1' });

            const result = await executeTool('set_timer', {
                label: 'Pasta cooking',
                durationSeconds: 600,
            }, 'u1');

            const parsed = JSON.parse(result);
            expect(parsed.message).toContain('Timer started');
            expect(parsed.message).toContain('Pasta cooking');
            expect(parsed.message).toContain('10m 0s');
            expect(parsed.__timer).toEqual({ id: 't1', durationSeconds: 600, label: 'Pasta cooking' });
            expect(prisma.timer.create).toHaveBeenCalledWith({
                data: { userId: 'u1', label: 'Pasta cooking', durationSeconds: 600 },
            });
        });

        it('displays seconds-only for short timers', async () => {
            prisma.timer.create.mockResolvedValue({ id: 't2' });

            const result = await executeTool('set_timer', {
                label: 'Quick break',
                durationSeconds: 30,
            }, 'u1');

            const parsed = JSON.parse(result);
            expect(parsed.message).toContain('30s');
            expect(parsed.message).not.toContain('0m');
        });

        it('returns error for zero duration', async () => {
            const result = await executeTool('set_timer', {
                label: 'Bad timer',
                durationSeconds: 0,
            }, 'u1');

            expect(result).toContain('positive number');
            expect(prisma.timer.create).not.toHaveBeenCalled();
        });

        it('returns error for negative duration', async () => {
            const result = await executeTool('set_timer', {
                label: 'Bad timer',
                durationSeconds: -5,
            }, 'u1');

            expect(result).toContain('positive number');
        });
    });

    // ── Unknown tool ─────────────────────────────────────────
    describe('unknown tool', () => {
        it('returns unknown tool message', async () => {
            const result = await executeTool('nonexistent_tool', {}, 'u1');

            expect(result).toBe('Unknown tool: nonexistent_tool');
        });
    });
});
