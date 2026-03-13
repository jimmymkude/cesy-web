/**
 * Tests for Groups APIs
 */
import { GET as getGroups, POST as createGroup } from '@/app/api/groups/route';
import { GET as getGroupDetail, DELETE as deleteGroup } from '@/app/api/groups/[groupId]/route';
import { GET as getInvites, PATCH as handleInvite } from '@/app/api/groups/invites/route';
import { POST as inviteToGroup } from '@/app/api/groups/[groupId]/invite/route';
import { PATCH as updateMember, DELETE as removeMember } from '@/app/api/groups/[groupId]/members/route';
import { GET as getGroupActivity } from '@/app/api/groups/activity/route';
import {
    GET as getGroupChat, POST as sendGroupChat, shouldCesyRespond,
    executeGroupTool, buildGroupToolDefinitions,
    GLOBAL_TOOLS, CROSS_USER_ALLOWED, SELF_ONLY_TOOLS,
} from '@/app/api/groups/[groupId]/chat/route';
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
            delete: jest.fn(),
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
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        groupMemory: {
            findMany: jest.fn(),
        },
        workoutLog: {
            findMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

// Mock executeTool from tools.js
jest.mock('@/lib/tools', () => ({
    TOOLS: [
        { name: 'web_search', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'search_memories', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'set_reminder', input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } },
        { name: 'get_calendar', input_schema: { type: 'object', properties: {}, required: [] } },
        { name: 'save_memory', input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] } },
        { name: 'get_current_time', input_schema: { type: 'object', properties: {}, required: [] } },
        { name: 'run_calculation', input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
    ],
    executeTool: jest.fn().mockResolvedValue('tool result'),
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

    it('PATCH promotes member to admin (by admin)', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
        prisma.groupMember.update.mockResolvedValue({ role: 'admin', userId: 'u2' });
        const req = makeRequest('http://localhost/api/groups/g1/members', 'PATCH', {
            userId: 'u1', promoteUserId: 'u2',
        });
        const res = await updateMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.message).toContain('promoted');
    });

    it('PATCH rejects promote from non-admin', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
        const req = makeRequest('http://localhost/api/groups/g1/members', 'PATCH', {
            userId: 'u1', promoteUserId: 'u2',
        });
        const res = await updateMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(403);
    });

    it('DELETE allows user to leave group', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'member', userId: 'u1' });
        prisma.groupMember.delete.mockResolvedValue({});
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', { userId: 'u1' });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.message).toContain('Left group');
    });

    it('DELETE blocks last admin from leaving when others exist', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin', userId: 'u1' });
        prisma.groupMember.count
            .mockResolvedValueOnce(0)  // no other admins
            .mockResolvedValueOnce(2); // other members exist
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', { userId: 'u1' });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Promote');
    });

    it('DELETE allows solo admin to leave (deletes group)', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin', userId: 'u1' });
        prisma.groupMember.count
            .mockResolvedValueOnce(0)  // no other admins
            .mockResolvedValueOnce(0); // no other members
        prisma.groupMember.delete.mockResolvedValue({});
        prisma.group.delete.mockResolvedValue({});
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', { userId: 'u1' });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.message).toContain('deleted');
    });

    it('DELETE allows admin to kick another member', async () => {
        prisma.groupMember.findUnique
            .mockResolvedValueOnce({ role: 'admin', userId: 'u1' })  // requester is admin
            .mockResolvedValueOnce({ role: 'member', userId: 'u2' }); // target exists
        prisma.groupMember.delete.mockResolvedValue({});
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', {
            userId: 'u1', targetUserId: 'u2',
        });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        const data = await res.json();
        expect(data.message).toContain('removed');
    });

    it('DELETE rejects kick from non-admin', async () => {
        prisma.groupMember.findUnique.mockResolvedValue({ role: 'member', userId: 'u1' });
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', {
            userId: 'u1', targetUserId: 'u2',
        });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(403);
    });

    it('DELETE returns 404 for non-member target', async () => {
        prisma.groupMember.findUnique
            .mockResolvedValueOnce({ role: 'admin', userId: 'u1' })  // requester is admin
            .mockResolvedValueOnce(null); // target not a member
        const req = makeRequest('http://localhost/api/groups/g1/members', 'DELETE', {
            userId: 'u1', targetUserId: 'u99',
        });
        const res = await removeMember(req, { params: Promise.resolve({ groupId: 'g1' }) });
        expect(res.status).toBe(404);
    });
});

// ─── executeGroupTool Permission Tests ──────────────────────────────

const { executeTool } = require('@/lib/tools');

const mockGroupContext = {
    members: [
        { userId: 'u1', sharePrivateMemories: false, user: { fullName: 'Jimmy Mkude' } },
        { userId: 'u2', sharePrivateMemories: true, user: { fullName: 'Marcus Carter' } },
        { userId: 'u3', sharePrivateMemories: false, user: { fullName: 'Sarah Lee' } },
    ],
};

describe('executeGroupTool', () => {
    beforeEach(() => jest.resetAllMocks());

    it('allows global tools for any user', async () => {
        executeTool.mockResolvedValue('time result');
        const result = await executeGroupTool('get_current_time', {}, 'u1', mockGroupContext);
        expect(result).toBe('time result');
        expect(executeTool).toHaveBeenCalledWith('get_current_time', {}, 'u1');
    });

    it('blocks self-only tools for cross-user usage with friendly message', async () => {
        const result = await executeGroupTool(
            'save_memory',
            { content: 'likes protein shakes', targetUserId: 'u2' },
            'u1',
            mockGroupContext
        );
        expect(result).toContain('Marcus');
        expect(result).toContain('personal action');
        expect(executeTool).not.toHaveBeenCalled();
    });

    it('blocks search_memories when target has sharing disabled', async () => {
        const result = await executeGroupTool(
            'search_memories',
            { query: 'diet', targetUserId: 'u3' },
            'u1',
            mockGroupContext
        );
        expect(result).toContain('Sarah');
        expect(result).toContain('memory sharing');
        expect(executeTool).not.toHaveBeenCalled();
    });

    it('blocks search_memories for sender when their own sharing is disabled', async () => {
        // u1 has sharePrivateMemories: false
        const result = await executeGroupTool(
            'search_memories',
            { query: 'my diet' },
            'u1',
            mockGroupContext
        );
        expect(result).toContain('memory sharing');
        expect(result).toContain('turned off');
        expect(executeTool).not.toHaveBeenCalled();
    });

    it('allows search_memories when target has sharing enabled', async () => {
        executeTool.mockResolvedValue('- likes pre-workout smoothies');
        const result = await executeGroupTool(
            'search_memories',
            { query: 'diet', targetUserId: 'u2' },
            'u1',
            mockGroupContext
        );
        expect(result).toBe('- likes pre-workout smoothies');
        // Should call executeTool with Marcus's userId, not Jimmy's
        expect(executeTool).toHaveBeenCalledWith('search_memories', { query: 'diet' }, 'u2');
    });

    it('allows set_reminder for other members', async () => {
        executeTool.mockResolvedValue('Reminder set');
        const result = await executeGroupTool(
            'set_reminder',
            { content: 'stretch at 6 PM', targetUserId: 'u2' },
            'u1',
            mockGroupContext
        );
        expect(result).toBe('Reminder set');
        expect(executeTool).toHaveBeenCalledWith('set_reminder', { content: 'stretch at 6 PM' }, 'u2');
    });

    it('allows self-only tools for self-use', async () => {
        executeTool.mockResolvedValue('Memory saved');
        const result = await executeGroupTool(
            'save_memory',
            { content: 'I like running' },
            'u1',
            mockGroupContext
        );
        expect(result).toBe('Memory saved');
        expect(executeTool).toHaveBeenCalledWith('save_memory', { content: 'I like running' }, 'u1');
    });

    it('strips targetUserId before passing to executeTool', async () => {
        executeTool.mockResolvedValue('calendar data');
        await executeGroupTool(
            'get_calendar',
            { date: '2026-03-12', targetUserId: 'u2' },
            'u1',
            mockGroupContext
        );
        // targetUserId should NOT be in the input passed to executeTool
        expect(executeTool).toHaveBeenCalledWith('get_calendar', { date: '2026-03-12' }, 'u2');
    });
});

// ─── buildGroupToolDefinitions Tests ────────────────────────────────

describe('buildGroupToolDefinitions', () => {
    it('adds targetUserId to cross-user tools', () => {
        const defs = buildGroupToolDefinitions();
        for (const toolName of CROSS_USER_ALLOWED) {
            const def = defs.find((d) => d.name === toolName);
            if (def) {
                expect(def.input_schema.properties.targetUserId).toBeDefined();
                expect(def.input_schema.properties.targetUserId.type).toBe('string');
            }
        }
    });

    it('does NOT add targetUserId to non-cross-user tools', () => {
        const defs = buildGroupToolDefinitions();
        const nonCrossUser = defs.filter((d) => !CROSS_USER_ALLOWED.includes(d.name));
        for (const def of nonCrossUser) {
            expect(def.input_schema.properties.targetUserId).toBeUndefined();
        }
    });

    it('only includes tools in GROUP_TOOL_NAMES', () => {
        const defs = buildGroupToolDefinitions();
        const allGroupToolNames = [...GLOBAL_TOOLS, ...CROSS_USER_ALLOWED, ...SELF_ONLY_TOOLS];
        for (const def of defs) {
            expect(allGroupToolNames).toContain(def.name);
        }
    });
});

// ─── Group Activity API Tests ───────────────────────────────────────

describe('/api/groups/activity', () => {
    beforeEach(() => jest.resetAllMocks());

    it('GET returns 400 without userId', async () => {
        const req = makeRequest('http://localhost/api/groups/activity');
        const res = await getGroupActivity(req);
        expect(res.status).toBe(400);
    });

    it('GET returns today\'s activity across groups', async () => {
        prisma.groupMember.findMany.mockResolvedValue([
            {
                userId: 'u1',
                group: {
                    id: 'g1', name: 'Squad',
                    members: [
                        { userId: 'u1', user: { id: 'u1', fullName: 'Jimmy', username: 'jimmy' } },
                        { userId: 'u2', user: { id: 'u2', fullName: 'Marcus', username: 'marcus' } },
                    ],
                },
            },
        ]);
        prisma.workoutLog.findMany.mockResolvedValue([
            { userId: 'u2', workoutType: 'Running', duration: 45 },
        ]);

        const req = makeRequest('http://localhost/api/groups/activity?userId=u1');
        const res = await getGroupActivity(req);
        const data = await res.json();
        expect(data.groups).toHaveLength(1);
        expect(data.groups[0].name).toBe('Squad');
        expect(data.groups[0].completedToday).toBe(1);
        expect(data.groups[0].totalMembers).toBe(2);
        expect(data.groups[0].logs[0].userName).toBe('Marcus');
    });

    it('GET returns empty when user has no groups', async () => {
        prisma.groupMember.findMany.mockResolvedValue([]);
        const req = makeRequest('http://localhost/api/groups/activity?userId=u1');
        const res = await getGroupActivity(req);
        const data = await res.json();
        expect(data.groups).toEqual([]);
    });
});
