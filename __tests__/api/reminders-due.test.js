/**
 * Tests for /api/reminders/due — Due reminder polling + Telegram delivery
 */
import { GET } from '@/app/api/reminders/due/route';

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
    sendNotificationToUser: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { sendNotificationToUser } from '@/lib/telegram';

function makeRequest(url) {
    return { url };
}

describe('GET /api/reminders/due', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 400 when userId is missing', async () => {
        const req = makeRequest('http://localhost/api/reminders/due');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toContain('Missing userId');
    });

    it('returns due reminders, marks notified, and delivers via Telegram', async () => {
        const mockReminders = [
            { id: 'r1', content: 'Buy groceries', dueAt: new Date() },
            { id: 'r2', content: 'Call mom', dueAt: new Date() },
        ];
        prisma.reminder.findMany.mockResolvedValue(mockReminders);
        prisma.reminder.updateMany.mockResolvedValue({ count: 2 });
        prisma.memory.create.mockResolvedValue({});
        sendNotificationToUser.mockResolvedValue({ sent: true });

        const req = makeRequest('http://localhost/api/reminders/due?userId=u1');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.reminders).toHaveLength(2);
        expect(data.reminders[0].content).toBe('Buy groceries');
        expect(data.reminders[0].telegramSent).toBe(true);
        expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['r1', 'r2'] } },
            data: { notified: true },
        });
        // Should have sent 2 Telegram messages
        expect(sendNotificationToUser).toHaveBeenCalledTimes(2);
        // Should have saved 2 delivery memories
        expect(prisma.memory.create).toHaveBeenCalledTimes(2);
        expect(prisma.memory.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'u1',
                tags: ['reminder', 'telegram', 'delivered'],
            }),
        }));
    });

    it('does not save memory when Telegram delivery fails', async () => {
        const mockReminders = [
            { id: 'r1', content: 'Buy groceries', dueAt: new Date() },
        ];
        prisma.reminder.findMany.mockResolvedValue(mockReminders);
        prisma.reminder.updateMany.mockResolvedValue({ count: 1 });
        sendNotificationToUser.mockResolvedValue({ sent: false, reason: 'No Telegram linked' });

        const req = makeRequest('http://localhost/api/reminders/due?userId=u1');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.reminders[0].telegramSent).toBe(false);
        expect(prisma.memory.create).not.toHaveBeenCalled();
    });

    it('returns empty array when no reminders due', async () => {
        prisma.reminder.findMany.mockResolvedValue([]);

        const req = makeRequest('http://localhost/api/reminders/due?userId=u1');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.reminders).toHaveLength(0);
        expect(prisma.reminder.updateMany).not.toHaveBeenCalled();
        expect(sendNotificationToUser).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
        prisma.reminder.findMany.mockRejectedValue(new Error('DB error'));

        const req = makeRequest('http://localhost/api/reminders/due?userId=u1');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('DB error');
    });
});
