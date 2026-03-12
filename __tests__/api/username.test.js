/**
 * Tests for PATCH /api/users/username
 */
import { PATCH } from '@/app/api/users/username/route';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        userProfile: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
    },
}));

function makeRequest(body) {
    return new Request('http://localhost/api/users/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PATCH /api/users/username', () => {
    beforeEach(() => jest.resetAllMocks());

    it('returns 400 without userId', async () => {
        const res = await PATCH(makeRequest({ username: 'test' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 without username', async () => {
        const res = await PATCH(makeRequest({ userId: 'u1' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid username format', async () => {
        const res = await PATCH(makeRequest({ userId: 'u1', username: 'ab' })); // too short
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('3-20 characters');
    });

    it('returns 400 for username with special chars', async () => {
        const res = await PATCH(makeRequest({ userId: 'u1', username: 'test@user' }));
        expect(res.status).toBe(400);
    });

    it('returns 409 if username is taken', async () => {
        prisma.userProfile.findFirst.mockResolvedValue({ id: 'u2', username: 'taken_name' });
        const res = await PATCH(makeRequest({ userId: 'u1', username: 'taken_name' }));
        expect(res.status).toBe(409);
        const data = await res.json();
        expect(data.error).toContain('already taken');
    });

    it('updates username successfully', async () => {
        prisma.userProfile.findFirst.mockResolvedValue(null); // not taken
        prisma.userProfile.update.mockResolvedValue({ id: 'u1', username: 'new_name' });
        const res = await PATCH(makeRequest({ userId: 'u1', username: 'new_name' }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user.username).toBe('new_name');
    });

    it('normalizes username to lowercase', async () => {
        prisma.userProfile.findFirst.mockResolvedValue(null);
        prisma.userProfile.update.mockResolvedValue({ id: 'u1', username: 'my_user' });
        const res = await PATCH(makeRequest({ userId: 'u1', username: 'My_User' }));
        expect(res.status).toBe(200);
        expect(prisma.userProfile.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { username: 'my_user' },
            })
        );
    });
});
