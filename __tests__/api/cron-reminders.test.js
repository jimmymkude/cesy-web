/**
 * Tests for /api/cron/reminders — Batch cron delivery endpoint
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
        },
    },
}));

jest.mock('@/lib/telegram', () => ({
    sendTelegramMessage: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

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

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

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
});
