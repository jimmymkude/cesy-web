/**
 * Tests for Groups APIs
 */
import { GET as getGroups, POST as createGroup } from '@/app/api/groups/route';
import { GET as getGroupDetail, DELETE as deleteGroup } from '@/app/api/groups/[groupId]/route';
import { GET as getInvites, PATCH as handleInvite } from '@/app/api/groups/invites/route';
import { POST as inviteToGroup } from '@/app/api/groups/[groupId]/invite/route';
import { PATCH as updateMember } from '@/app/api/groups/[groupId]/members/route';
import { GET as getGroupChat, POST as sendGroupChat, shouldCesyRespond } from '@/app/api/groups/[groupId]/chat/route';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        groupMember: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        group: {
            findUnique: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        groupInvite: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        groupMessage: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
        groupMemory: {
            findMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

function makeRequest(url, method = 'GET', body = null) {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

describe('/api/groups', () => {
    beforeEach(() => jest.resetAllMocks());

    it('GET returns 400 without userId', async () => {
        const req = makeRequest('http://localhost/api/groups');
        const res = await getGroups(req);
        expect(res.status).toBe(400);
    });

    it('GET returns user groups', async () => {
        prisma.groupMember.findMany.mockResolvedValue([
            {
                role: 'admin',
                group: { id: 'g1', name: 'Squad', members: [{ user: { id: 'u1' } }] },
            },
        ]);
        const req = makeRequest('http://localhost/api/groups?userId=u1');
        const res = await getGroups(req);
        const data = await res.json();
        expect(data.groups).toHaveLength(1);
        expect(data.groups[0].name).toBe('Squad');
        expect(data.groups[0].myRole).toBe('admin');
    });

    it('POST creates a group', async () => {
        prisma.group.create.mockResolvedValue({
            id: 'g1', name: 'Squad', members: [{ userId: 'u1', role: 'admin' }],
        });
        const req = makeRequest('http://localhost/api/groups', 'POST', { userId: 'u1', name: 'Squad' });
        const res = await createGroup(req);
        expect(res.status).toBe(201);
    });

    it('POST returns 400 without name', async () => {
        const req = makeRequest('http://localhost/api/groups', 'POST', { userId: 'u1' });
        const res = await createGroup(req);
        expect(res.status).toBe(400);
    });
});

describe('/api/groups/[groupId]', () => {
    beforeEach(() => jest.resetAllMocks());

    it('GET returns group details', async () => {
        prisma.group.findUnique.mockResolvedValue({ id: 'g1', name: 'Squad', members: [] });
        const req = makeRequest('http://localhost/api/groups/g1');
        const res = await getGroupDetail(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.group.name).toBe('Squad');
    });

    it('GET returns 404 for missing group', async () => {
        prisma.group.findUnique.mockResolvedValue(null);
        const req = makeRequest('http://localhost/api/groups/g1');
        const res = await getGroupDetail(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(404);
    });

    it('DELETE returns 403 for non-admin', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
        const req = makeRequest('http://localhost/api/groups/g1?userId=u2');
        const res = await deleteGroup(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(403);
    });

    it('DELETE succeeds for admin', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
        prisma.group.delete.mockResolvedValue({});
        const req = makeRequest('http://localhost/api/groups/g1?userId=u1');
        const res = await deleteGroup(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.success).toBe(true);
    });
});

describe('/api/groups/[groupId]/invite', () => {
    beforeEach(() => jest.resetAllMocks());

    it('POST returns 403 if not a member', async () => {
        prisma.groupMember.findUnique.mockResolvedValue(null);
        const req = makeRequest('http://localhost/api/groups/g1/invite', 'POST', { inviterId: 'u1', inviteeId: 'u2' });
        const res = await inviteToGroup(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(403);
    });

    it('POST returns 400 if group is full', async () => {
        prisma.groupMember.findUnique
            .mockResolvedValueOnce({ userId: 'u1' }) // inviter is member
            .mockResolvedValueOnce(null); // invitee not yet member
        prisma.groupMember.count.mockResolvedValue(10);
        prisma.group.findUnique.mockResolvedValue({ maxMembers: 10 });
        const req = makeRequest('http://localhost/api/groups/g1/invite', 'POST', { inviterId: 'u1', inviteeId: 'u2' });
        const res = await inviteToGroup(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(400);
    });

    it('POST creates an invite successfully', async () => {
        // Use implementation mock to handle different calls by argument
        prisma.groupMember.findUnique.mockImplementation(({ where }) => {
            if (where.groupId_userId?.userId === 'u1') return Promise.resolve({ userId: 'u1' }); // inviter exists
            return Promise.resolve(null); // invitee not yet member
        });
        prisma.groupMember.count.mockResolvedValue(3);
        prisma.group.findUnique.mockResolvedValue({ maxMembers: 10 });
        prisma.groupInvite.findUnique.mockResolvedValue(null);
        prisma.groupInvite.upsert.mockResolvedValue({ id: 'inv1', status: 'pending' });
        const req = makeRequest('http://localhost/api/groups/g1/invite', 'POST', { inviterId: 'u1', inviteeId: 'u2' });
        const res = await inviteToGroup(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(201);
    });
});

describe('/api/groups/invites', () => {
    beforeEach(() => jest.resetAllMocks());

    it('GET returns pending invites', async () => {
        prisma.groupInvite.findMany.mockResolvedValue([
            { id: 'inv1', group: { name: 'Squad' }, inviter: { fullName: 'Jimmy' } },
        ]);
        const req = makeRequest('http://localhost/api/groups/invites?userId=u1');
        const res = await getInvites(req);
        const data = await res.json();
        expect(data.invites).toHaveLength(1);
    });

    it('PATCH accepts invite and creates membership', async () => {
        prisma.groupInvite.findUnique.mockResolvedValue({ id: 'inv1', groupId: 'g1', inviteeId: 'u2', status: 'pending' });
        prisma.groupMember.count.mockResolvedValue(3);
        prisma.group.findUnique.mockResolvedValue({ maxMembers: 10 });
        prisma.$transaction.mockResolvedValue([]);
        const req = makeRequest('http://localhost/api/groups/invites', 'PATCH', { inviteId: 'inv1', action: 'accept' });
        const res = await handleInvite(req);
        const data = await res.json();
        expect(data.status).toBe('accepted');
    });

    it('PATCH declines invite', async () => {
        prisma.groupInvite.findUnique.mockResolvedValue({ id: 'inv1', status: 'pending' });
        prisma.groupInvite.update.mockResolvedValue({ status: 'declined' });
        const req = makeRequest('http://localhost/api/groups/invites', 'PATCH', { inviteId: 'inv1', action: 'decline' });
        const res = await handleInvite(req);
        const data = await res.json();
        expect(data.status).toBe('declined');
    });

    it('PATCH returns 400 for invalid action', async () => {
        const req = makeRequest('http://localhost/api/groups/invites', 'PATCH', { inviteId: 'inv1', action: 'invalid' });
        const res = await handleInvite(req);
        expect(res.status).toBe(400);
    });
});

describe('shouldCesyRespond', () => {
    it('responds when Cesy is mentioned', () => {
        expect(shouldCesyRespond('Hey Cesy, what should I do today?')).toBe(true);
        expect(shouldCesyRespond('yo cesy')).toBe(true);
        expect(shouldCesyRespond('@cesy help')).toBe(true);
    });

    it('responds to fitness questions', () => {
        expect(shouldCesyRespond('What workout should I do?')).toBe(true);
        expect(shouldCesyRespond('How many sets for bench?')).toBe(true);
    });

    it('does not respond to casual chat', () => {
        expect(shouldCesyRespond('hey whats up guys')).toBe(false);
        expect(shouldCesyRespond('lol nice one')).toBe(false);
    });
});

describe('/api/groups/[groupId]/chat', () => {
    beforeEach(() => jest.resetAllMocks());

    it('GET returns messages', async () => {
        prisma.groupMessage.findMany.mockResolvedValue([
            { id: 'm1', content: 'Hello', role: 'user', createdAt: new Date() },
        ]);
        const req = makeRequest('http://localhost/api/groups/g1/chat');
        const res = await getGroupChat(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.messages).toHaveLength(1);
    });

    it('POST saves user message', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ userId: 'u1' });
        prisma.groupMessage.create.mockResolvedValue({
            id: 'm1', content: 'hello guys', role: 'user', userName: 'Jimmy',
        });
        const req = makeRequest('http://localhost/api/groups/g1/chat', 'POST', {
            userId: 'u1', userName: 'Jimmy', content: 'hello guys',
        });
        const res = await sendGroupChat(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.message.content).toBe('hello guys');
        // No Cesy response for casual chat
        expect(data.cesyMessage).toBeNull();
    });

    it('POST returns 403 for non-member', async () => {
        prisma.groupMember.findUnique.mockResolvedValue(null);
        const req = makeRequest('http://localhost/api/groups/g1/chat', 'POST', {
            userId: 'u99', userName: 'Hacker', content: 'hi',
        });
        const res = await sendGroupChat(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(403);
    });
});

describe('/api/groups/[groupId]/members', () => {
    beforeEach(() => jest.clearAllMocks());

    it('PATCH updates memory sharing', async () => {
        prisma.groupMember.update.mockResolvedValue({ sharePrivateMemories: true });
        const req = makeRequest('http://localhost/api/groups/g1/members', 'PATCH', {
            userId: 'u1', sharePrivateMemories: true,
        });
        const res = await updateMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.member.sharePrivateMemories).toBe(true);
    });
});
