/**
 * Tests for /api/workout (GET, POST)
 */
import { GET, POST } from '@/app/api/workout/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        workoutSchedule: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
    },
}));

const prisma = require('@/lib/prisma').default;

function makeGetRequest(params) {
    const url = new URL('http://localhost/api/workout');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.toString() };
}

function makePostRequest(body) {
    return { json: async () => body };
}

describe('/api/workout', () => {
    beforeEach(() => jest.clearAllMocks());

    // --- GET ---
    describe('GET', () => {
        it('returns 400 when userId missing', async () => {
            const res = await GET(makeGetRequest({}));
            expect(res.status).toBe(400);
        });

        it('returns schedule for user', async () => {
            const schedule = { id: 'ws1', userId: 'u1', schedule: { schedule: [] } };
            prisma.workoutSchedule.findUnique.mockResolvedValue(schedule);

            const res = await GET(makeGetRequest({ userId: 'u1' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.schedule).toEqual(schedule);
        });

        it('returns null schedule when none exists', async () => {
            prisma.workoutSchedule.findUnique.mockResolvedValue(null);

            const res = await GET(makeGetRequest({ userId: 'u1' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.schedule).toBeNull();
        });

        it('returns 500 on DB error', async () => {
            prisma.workoutSchedule.findUnique.mockRejectedValue(new Error('fail'));
            const res = await GET(makeGetRequest({ userId: 'u1' }));
            expect(res.status).toBe(500);
        });
    });

    // --- POST ---
    describe('POST', () => {
        it('returns 400 when userId or schedule missing', async () => {
            const res = await POST(makePostRequest({ userId: 'u1' }));
            expect(res.status).toBe(400);
        });

        it('upserts workout schedule', async () => {
            const schedule = [{ dayOfWeek: 1, workoutType: 'Running', duration: 30 }];
            const result = { id: 'ws1', userId: 'u1', schedule };
            prisma.workoutSchedule.upsert.mockResolvedValue(result);

            const res = await POST(makePostRequest({
                userId: 'u1',
                schedule,
                rawResponse: 'test response',
            }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.schedule).toEqual(result);
            expect(prisma.workoutSchedule.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'u1' },
                })
            );
        });

        it('returns 500 on error', async () => {
            prisma.workoutSchedule.upsert.mockRejectedValue(new Error('fail'));
            const res = await POST(makePostRequest({ userId: 'u1', schedule: [] }));
            expect(res.status).toBe(500);
        });
    });
});
