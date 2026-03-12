/**
 * Tests for POST /api/cron/group-nudges
 */
import { POST } from '@/app/api/cron/group-nudges/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        group: {
            findMany: jest.fn(),
        },
        workoutLog: {
            findMany: jest.fn(),
        },
    },
}));

jest.mock('@/lib/telegram', () => ({
    sendNotificationToUser: jest.fn().mockResolvedValue({ sent: true }),
}));

const prisma = require('@/lib/prisma').default;
const { sendNotificationToUser } = require('@/lib/telegram');

function makeRequest(headers = {}) {
    return new Request('http://localhost/api/cron/group-nudges', {
        method: 'POST',
        headers,
    });
}

describe('POST /api/cron/group-nudges', () => {
    beforeEach(() => jest.resetAllMocks());

    it('returns 401 when cron secret is set but not provided', async () => {
        process.env.CRON_SECRET = 'test-secret';
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
        delete process.env.CRON_SECRET;
    });

    it('returns 401 when cron secret is wrong', async () => {
        process.env.CRON_SECRET = 'test-secret';
        const res = await POST(makeRequest({ authorization: 'Bearer wrong-secret' }));
        expect(res.status).toBe(401);
        delete process.env.CRON_SECRET;
    });

    it('succeeds with correct cron secret', async () => {
        process.env.CRON_SECRET = 'test-secret';
        prisma.group.findMany.mockResolvedValue([]);
        const res = await POST(makeRequest({ authorization: 'Bearer test-secret' }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        delete process.env.CRON_SECRET;
    });

    it('succeeds when no cron secret is configured', async () => {
        delete process.env.CRON_SECRET;
        prisma.group.findMany.mockResolvedValue([]);
        const res = await POST(makeRequest());
        expect(res.status).toBe(200);
    });

    it('skips members without telegramChatId', async () => {
        delete process.env.CRON_SECRET;
        prisma.group.findMany.mockResolvedValue([
            {
                name: 'Squad',
                members: [
                    {
                        userId: 'u1',
                        user: {
                            id: 'u1',
                            fullName: 'Jimmy',
                            username: 'jimmy',
                            telegramChatId: null, // no Telegram
                            settings: { timezone: 'America/Los_Angeles' },
                            workoutSchedule: { schedule: [{ dayOfWeek: 'Monday', workoutType: 'Running' }] },
                        },
                    },
                ],
            },
        ]);

        const res = await POST(makeRequest());
        const data = await res.json();
        expect(data.nudgesSent).toBe(0);
        expect(sendNotificationToUser).not.toHaveBeenCalled();
    });

    it('returns success with nudgesSent count for empty groups', async () => {
        delete process.env.CRON_SECRET;
        prisma.group.findMany.mockResolvedValue([]);
        const res = await POST(makeRequest());
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.nudgesSent).toBe(0);
    });

    it('handles database errors gracefully', async () => {
        delete process.env.CRON_SECRET;
        prisma.group.findMany.mockRejectedValue(new Error('DB connection failed'));
        const spy = jest.spyOn(console, 'error').mockImplementation();
        const res = await POST(makeRequest());
        expect(res.status).toBe(500);
        spy.mockRestore();
    });

    it('handles invalid timezone gracefully (falls back to LA)', async () => {
        delete process.env.CRON_SECRET;
        prisma.group.findMany.mockResolvedValue([
            {
                name: 'Squad',
                members: [
                    {
                        userId: 'u1',
                        user: {
                            id: 'u1',
                            fullName: 'Jimmy',
                            telegramChatId: '12345',
                            settings: { timezone: 'Invalid/Timezone' },
                            workoutSchedule: null,
                        },
                    },
                ],
            },
        ]);

        // Should not throw — falls back to LA timezone
        const res = await POST(makeRequest());
        expect(res.status).toBe(200);
    });
});
