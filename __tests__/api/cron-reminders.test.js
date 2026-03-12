/**
 * Tests for /api/cron/reminders — Batch cron delivery + workout auto-reminders
 */
import { GET } from '@/app/api/cron/reminders/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        reminder: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
        memory: {
            create: jest.fn(),
            findFirst: jest.fn(),
        },
        workoutSchedule: {
            findMany: jest.fn(),
        },
    },
}));

jest.mock('@/lib/telegram', () => ({
    sendTelegramMessage: jest.fn(),
}));

jest.mock('@/lib/cesyWakeUp', () => ({
    wakeUpCesy: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { wakeUpCesy } from '@/lib/cesyWakeUp';

function makeRequest(url, headers = {}) {
    return {
        url,
        headers: {
            get: (key) => headers[key.toLowerCase()] || null,
        },
    };
}

describe('GET /api/cron/reminders', () => {
    const originalEnv = process.env;
    const todayDow = new Date().getDay();

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
        // Default: no workout schedules (so existing tests pass without changes)
        prisma.workoutSchedule.findMany.mockResolvedValue([]);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // ── Phase 1: Regular Reminders (existing tests) ─────────────

    it('returns 401 when CRON_SECRET is set and auth header is wrong', async () => {
        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer wrong-secret',
        });
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('returns 0 delivered when no reminders are due', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.delivered).toBe(0);
    });

    it('delivers reminders via Telegram with deliveryMessage and saves memories', async () => {
        const mockReminders = [
            {
                id: 'r1',
                userId: 'u1',
                content: 'Go to gym',
                deliveryMessage: 'Hey champ! Time to hit the gym 💪',
                dueAt: new Date(),
                user: { telegramChatId: '12345', fullName: 'Jimmy' },
            },
        ];
        prisma.reminder.findMany.mockResolvedValue(mockReminders);
        prisma.reminder.updateMany.mockResolvedValue({ count: 1 });
        prisma.memory.create.mockResolvedValue({});
        sendTelegramMessage.mockResolvedValue({ ok: true });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.delivered).toBe(1);
        expect(data.total).toBe(1);

        // Should use deliveryMessage not raw content
        expect(sendTelegramMessage).toHaveBeenCalledWith('12345', 'Hey champ! Time to hit the gym 💪');

        // Should save delivery memory
        expect(prisma.memory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'u1',
                tags: ['reminder', 'telegram', 'delivered'],
            }),
        }));

        // Should mark as notified
        expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['r1'] } },
            data: { notified: true },
        });
    });

    it('falls back to content when deliveryMessage is null', async () => {
        const mockReminders = [
            {
                id: 'r2',
                userId: 'u2',
                content: 'Buy groceries',
                deliveryMessage: null,
                dueAt: new Date(),
                user: { telegramChatId: '67890', fullName: 'Test' },
            },
        ];
        prisma.reminder.findMany.mockResolvedValue(mockReminders);
        prisma.reminder.updateMany.mockResolvedValue({ count: 1 });
        prisma.memory.create.mockResolvedValue({});
        sendTelegramMessage.mockResolvedValue({ ok: true });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);

        expect(sendTelegramMessage).toHaveBeenCalledWith('67890', '⏰ Reminder: Buy groceries');
    });

    it('skips users without Telegram linked', async () => {
        const mockReminders = [
            {
                id: 'r3',
                userId: 'u3',
                content: 'No telegram user',
                deliveryMessage: 'Hey!',
                dueAt: new Date(),
                user: { telegramChatId: null, fullName: 'Anon' },
            },
        ];
        prisma.reminder.findMany.mockResolvedValue(mockReminders);
        prisma.reminder.updateMany.mockResolvedValue({ count: 1 });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.delivered).toBe(0);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
        expect(prisma.memory.create).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
        prisma.reminder.findMany.mockRejectedValue(new Error('DB down'));

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('DB down');
    });

    // ── Phase 2: Workout Auto-Reminders (Wake Up Cesy) ──────────

    it('wakes up Cesy and delivers workout reminder via Telegram', async () => {
        prisma.reminder.findMany.mockResolvedValue([]); // no regular reminders

        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u1',
            schedule: {
                schedule: [
                    { dayOfWeek: todayDow, workoutType: 'Basketball', duration: 45, equipment: ['Ball'] },
                ],
            },
            user: { id: 'u1', fullName: 'Jimmy', telegramChatId: '12345', settings: { timezone: 'America/Los_Angeles' } },
        }]);
        prisma.memory.findFirst.mockResolvedValue(null); // no previous delivery
        prisma.memory.create.mockResolvedValue({ id: 'mem-1' });
        wakeUpCesy.mockResolvedValue('Jimmy, those handles won\'t sharpen themselves — basketball day! 🏀');
        sendTelegramMessage.mockResolvedValue({ ok: true });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.workoutDelivered).toBe(1);
        expect(wakeUpCesy).toHaveBeenCalledWith(
            expect.stringContaining('Basketball'),
            'u1',
            expect.objectContaining({ extraContext: expect.stringContaining('Jimmy') }),
        );
        expect(sendTelegramMessage).toHaveBeenCalledWith(
            '12345',
            'Jimmy, those handles won\'t sharpen themselves — basketball day! 🏀',
        );

        // Should save workout delivery memory
        expect(prisma.memory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'u1',
                tags: ['workout-reminder', 'telegram', 'delivered'],
            }),
        }));
    });

    it('uses fallback when Cesy wake-up returns null', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);

        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u2',
            schedule: {
                schedule: [
                    { dayOfWeek: todayDow, workoutType: 'Yoga', duration: 30, equipment: [] },
                ],
            },
            user: { id: 'u2', fullName: 'Test', telegramChatId: '55555', settings: { timezone: 'America/Los_Angeles' } },
        }]);
        prisma.memory.findFirst.mockResolvedValue(null);
        prisma.memory.create.mockResolvedValue({ id: 'mem-2' });
        wakeUpCesy.mockResolvedValue(null);
        sendTelegramMessage.mockResolvedValue({ ok: true });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.workoutDelivered).toBe(1);
        expect(sendTelegramMessage).toHaveBeenCalledWith(
            '55555',
            expect.stringContaining('Yoga'),
        );
    });

    it('skips workout reminder when already sent today (dedup)', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);

        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u3',
            schedule: {
                schedule: [{ dayOfWeek: todayDow, workoutType: 'HIIT', duration: 20 }],
            },
            user: { id: 'u3', fullName: 'Dup', telegramChatId: '77777', settings: { timezone: 'America/Los_Angeles' } },
        }]);
        prisma.memory.findFirst.mockResolvedValue({ id: 'already-sent', content: 'Already sent' });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.workoutDelivered).toBe(0);
        expect(data.workoutSkipped).toBe(1);
        expect(wakeUpCesy).not.toHaveBeenCalled();
    });

    it('skips workout users without Telegram linked', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);

        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u4',
            schedule: {
                schedule: [{ dayOfWeek: todayDow, workoutType: 'Running', duration: 30 }],
            },
            user: { id: 'u4', fullName: 'NoTg', telegramChatId: null, settings: { timezone: 'America/Los_Angeles' } },
        }]);

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.workoutDelivered).toBe(0);
        expect(data.workoutSkipped).toBe(1);
        expect(wakeUpCesy).not.toHaveBeenCalled();
    });

    it('skips when no workout is scheduled for today', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);
        const otherDay = (todayDow + 3) % 7;

        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u5',
            schedule: {
                schedule: [{ dayOfWeek: otherDay, workoutType: 'Swimming', duration: 45 }],
            },
            user: { id: 'u5', fullName: 'WrongDay', telegramChatId: '88888', settings: { timezone: 'America/Los_Angeles' } },
        }]);

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        expect(data.workoutDelivered).toBe(0);
        expect(wakeUpCesy).not.toHaveBeenCalled();
    });

    it('handles both regular reminders and workout reminders in same cron run', async () => {
        // Regular reminder
        prisma.reminder.findMany.mockResolvedValue([{
            id: 'r1',
            userId: 'u1',
            content: 'Meeting',
            deliveryMessage: 'Meeting in 15!',
            dueAt: new Date(),
            user: { telegramChatId: '12345', fullName: 'Jimmy' },
        }]);
        prisma.reminder.updateMany.mockResolvedValue({ count: 1 });

        // Workout for same user
        prisma.workoutSchedule.findMany.mockResolvedValue([{
            userId: 'u1',
            schedule: {
                schedule: [{ dayOfWeek: todayDow, workoutType: 'Basketball', duration: 45 }],
            },
            user: { id: 'u1', fullName: 'Jimmy', telegramChatId: '12345', settings: { timezone: 'America/Los_Angeles' } },
        }]);
        prisma.memory.findFirst.mockResolvedValue(null);
        prisma.memory.create.mockResolvedValue({ id: 'mem' });
        wakeUpCesy.mockResolvedValue('Ball is life today 🏀');
        sendTelegramMessage.mockResolvedValue({ ok: true });

        const req = makeRequest('http://localhost/api/cron/reminders', {
            authorization: 'Bearer test-secret',
        });
        const res = await GET(req);
        const data = await res.json();

        // Both should be delivered
        expect(data.delivered).toBe(1); // regular reminder
        expect(data.workoutDelivered).toBe(1); // workout reminder
        expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
    });
});
