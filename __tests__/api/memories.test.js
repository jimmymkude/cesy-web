/**
 * Tests for /api/memories (POST, GET, DELETE)
 */
import { POST, GET, DELETE } from '@/app/api/memories/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        memory: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
    },
}));

const prisma = require('@/lib/prisma').default;

function makePostRequest(body) {
    return { json: async () => body };
}

function makeGetRequest(params) {
    const url = new URL('http://localhost/api/memories');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.toString() };
}

function makeDeleteRequest(params) {
    const url = new URL('http://localhost/api/memories');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.toString() };
}

describe('/api/memories', () => {
    beforeEach(() => jest.clearAllMocks());

    // --- POST ---
    describe('POST', () => {
        it('returns 400 when userId or content missing', async () => {
            const res = await POST(makePostRequest({ userId: 'u1' }));
            expect(res.status).toBe(400);
        });

        it('deduplicates existing memories', async () => {
            prisma.memory.findFirst.mockResolvedValue({ id: 'm1', content: 'test' });

            const res = await POST(makePostRequest({ userId: 'u1', content: 'test' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.message).toContain('already exists');
            expect(prisma.memory.create).not.toHaveBeenCalled();
        });

        it('creates new memory', async () => {
            prisma.memory.findFirst.mockResolvedValue(null);
            const created = { id: 'm2', userId: 'u1', content: 'likes basketball', tags: ['sport'] };
            prisma.memory.create.mockResolvedValue(created);

            const res = await POST(makePostRequest({ userId: 'u1', content: 'likes basketball', tags: ['sport'] }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.memory).toEqual(created);
            expect(prisma.memory.create).toHaveBeenCalledWith({
                data: { userId: 'u1', content: 'likes basketball', tags: ['sport'] },
            });
        });

        it('returns 500 on error', async () => {
            prisma.memory.findFirst.mockRejectedValue(new Error('DB fail'));
            const res = await POST(makePostRequest({ userId: 'u1', content: 'test' }));
            expect(res.status).toBe(500);
        });
    });

    // --- GET ---
    describe('GET', () => {
        it('returns 400 when userId missing', async () => {
            const res = await GET(makeGetRequest({}));
            expect(res.status).toBe(400);
        });

        it('returns recent memories', async () => {
            const mems = [{ id: 'm1', content: 'test' }];
            prisma.memory.findMany.mockResolvedValue(mems);

            const res = await GET(makeGetRequest({ userId: 'u1' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.memories).toEqual(mems);
        });

        it('searches by query', async () => {
            prisma.memory.findMany.mockResolvedValue([]);

            const res = await GET(makeGetRequest({ userId: 'u1', q: 'basketball' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(prisma.memory.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        content: { contains: 'basketball', mode: 'insensitive' },
                    }),
                })
            );
        });

        it('respects limit parameter', async () => {
            prisma.memory.findMany.mockResolvedValue([]);

            await GET(makeGetRequest({ userId: 'u1', limit: '5' }));

            expect(prisma.memory.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 5 })
            );
        });
    });

    // --- DELETE ---
    describe('DELETE', () => {
        it('returns 400 when id missing', async () => {
            const res = await DELETE(makeDeleteRequest({}));
            expect(res.status).toBe(400);
        });

        it('deletes memory by id', async () => {
            prisma.memory.delete.mockResolvedValue({});
            const res = await DELETE(makeDeleteRequest({ id: 'm1' }));
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.message).toContain('deleted');
            expect(prisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
        });

        it('returns 500 on error', async () => {
            prisma.memory.delete.mockRejectedValue(new Error('not found'));
            const res = await DELETE(makeDeleteRequest({ id: 'bad' }));
            expect(res.status).toBe(500);
        });
    });
});
