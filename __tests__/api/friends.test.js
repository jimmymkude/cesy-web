/**
 * Tests for /api/friends and /api/friends/requests routes
 */
import { GET as getFriends, POST as postFriend } from '@/app/api/friends/route';
import { GET as getRequests, PATCH as patchRequest } from '@/app/api/friends/requests/route';
import { GET as searchUsers } from '@/app/api/users/search/route';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        userProfile: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        friendship: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

function makeRequest(url, method = 'GET', body = null) {
    const req = new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return req;
}

describe('/api/users/search', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns empty for short queries', async () => {
        const req = makeRequest('http://localhost/api/users/search?q=a');
        const res = await searchUsers(req);
        const data = await res.json();
        expect(data.users).toEqual([]);
    });

    it('searches users by username', async () => {
        prisma.userProfile.findMany.mockResolvedValue([
            { id: 'u1', username: 'jimmy', fullName: 'Jimmy', avatarUrl: null },
        ]);
        const req = makeRequest('http://localhost/api/users/search?q=jim&userId=u2');
        const res = await searchUsers(req);
        const data = await res.json();
        expect(data.users).toHaveLength(1);
        expect(data.users[0].username).toBe('jimmy');
        expect(prisma.userProfile.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    username: { contains: 'jim', mode: 'insensitive' },
                    id: { not: 'u2' },
                }),
            })
        );
    });
});

describe('/api/friends', () => {
    beforeEach(() => jest.clearAllMocks());

    it('GET returns 400 without userId', async () => {
        const req = makeRequest('http://localhost/api/friends');
        const res = await getFriends(req);
        expect(res.status).toBe(400);
    });

    it('GET returns accepted friends', async () => {
        prisma.friendship.findMany.mockResolvedValue([
            {
                id: 'f1',
                requesterId: 'u1',
                addresseeId: 'u2',
                status: 'accepted',
                requester: { id: 'u1', username: 'jimmy', fullName: 'Jimmy', avatarUrl: null },
                addressee: { id: 'u2', username: 'marcus', fullName: 'Marcus', avatarUrl: null },
            },
        ]);
        const req = makeRequest('http://localhost/api/friends?userId=u1');
        const res = await getFriends(req);
        const data = await res.json();
        expect(data.friends).toHaveLength(1);
        expect(data.friends[0].username).toBe('marcus'); // The OTHER user
    });

    it('POST returns 400 without friendId', async () => {
        const req = makeRequest('http://localhost/api/friends', 'POST', { userId: 'u1' });
        const res = await postFriend(req);
        expect(res.status).toBe(400);
    });

    it('POST returns 400 when friending yourself', async () => {
        const req = makeRequest('http://localhost/api/friends', 'POST', { userId: 'u1', friendId: 'u1' });
        const res = await postFriend(req);
        expect(res.status).toBe(400);
    });

    it('POST returns 409 if already friends', async () => {
        prisma.friendship.findFirst.mockResolvedValue({ id: 'f1', status: 'accepted' });
        const req = makeRequest('http://localhost/api/friends', 'POST', { userId: 'u1', friendId: 'u2' });
        const res = await postFriend(req);
        expect(res.status).toBe(409);
    });

    it('POST creates a pending friendship', async () => {
        prisma.friendship.findFirst.mockResolvedValue(null);
        prisma.friendship.create.mockResolvedValue({ id: 'f1', status: 'pending' });
        const req = makeRequest('http://localhost/api/friends', 'POST', { userId: 'u1', friendId: 'u2' });
        const res = await postFriend(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.friendship.status).toBe('pending');
    });

    it('POST re-sends previously rejected request', async () => {
        prisma.friendship.findFirst.mockResolvedValue({ id: 'f1', status: 'rejected', requesterId: 'u1' });
        prisma.friendship.update.mockResolvedValue({ id: 'f1', status: 'pending' });
        const req = makeRequest('http://localhost/api/friends', 'POST', { userId: 'u1', friendId: 'u2' });
        const res = await postFriend(req);
        expect(res.status).toBe(200);
    });
});

describe('/api/friends/requests', () => {
    beforeEach(() => jest.clearAllMocks());

    it('GET returns 400 without userId', async () => {
        const req = makeRequest('http://localhost/api/friends/requests');
        const res = await getRequests(req);
        expect(res.status).toBe(400);
    });

    it('GET returns incoming and outgoing requests', async () => {
        prisma.friendship.findMany
            .mockResolvedValueOnce([{ id: 'f1', requester: { id: 'u2', username: 'marcus' } }]) // incoming
            .mockResolvedValueOnce([{ id: 'f2', addressee: { id: 'u3', username: 'sarah' } }]); // outgoing
        const req = makeRequest('http://localhost/api/friends/requests?userId=u1');
        const res = await getRequests(req);
        const data = await res.json();
        expect(data.incoming).toHaveLength(1);
        expect(data.outgoing).toHaveLength(1);
    });

    it('PATCH returns 400 with invalid action', async () => {
        const req = makeRequest('http://localhost/api/friends/requests', 'PATCH', { friendshipId: 'f1', action: 'invalid' });
        const res = await patchRequest(req);
        expect(res.status).toBe(400);
    });

    it('PATCH accepts a friend request', async () => {
        prisma.friendship.update.mockResolvedValue({ id: 'f1', status: 'accepted' });
        const req = makeRequest('http://localhost/api/friends/requests', 'PATCH', { friendshipId: 'f1', action: 'accept' });
        const res = await patchRequest(req);
        const data = await res.json();
        expect(data.friendship.status).toBe('accepted');
    });

    it('PATCH rejects a friend request', async () => {
        prisma.friendship.update.mockResolvedValue({ id: 'f1', status: 'rejected' });
        const req = makeRequest('http://localhost/api/friends/requests', 'PATCH', { friendshipId: 'f1', action: 'reject' });
        const res = await patchRequest(req);
        const data = await res.json();
        expect(data.friendship.status).toBe('rejected');
    });
});
