import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { GROUP_COLORS } from '@/app/api/groups/route';

/**
 * POST /api/groups/[groupId]/invite
 * Invite a friend to the group.
 * Body: { inviterId, inviteeId }
 */
export async function POST(request, { params }) {
    try {
        const { groupId } = await params;
        const { inviterId, inviteeId } = await request.json();

        if (!inviterId || !inviteeId) {
            return NextResponse.json({ error: 'Missing inviterId or inviteeId' }, { status: 400 });
        }

        // Verify inviter is a member
        const inviterMember = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: inviterId } },
        });
        if (!inviterMember) {
            return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
        }

        // Check group size
        const memberCount = await prisma.groupMember.count({ where: { groupId } });
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (memberCount >= (group?.maxMembers || 10)) {
            return NextResponse.json({ error: 'Group is full' }, { status: 400 });
        }

        // Check if already a member
        const alreadyMember = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: inviteeId } },
        });
        if (alreadyMember) {
            return NextResponse.json({ error: 'User is already a member' }, { status: 409 });
        }

        // Check if invite already pending
        const existing = await prisma.groupInvite.findUnique({
            where: { groupId_inviteeId: { groupId, inviteeId } },
        });
        if (existing && existing.status === 'pending') {
            return NextResponse.json({ error: 'Invite already pending' }, { status: 409 });
        }

        const invite = await prisma.groupInvite.upsert({
            where: { groupId_inviteeId: { groupId, inviteeId } },
            update: { status: 'pending', inviterId },
            create: { groupId, inviterId, inviteeId, status: 'pending' },
        });

        return NextResponse.json({ invite }, { status: 201 });
    } catch (error) {
        console.error('Group invite error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/groups/invites?userId=xxx
 * List pending group invites for the user.
 * NOTE: This route is at /api/groups/invites (not /api/groups/[groupId]/invite)
 *       because it's user-scoped, not group-scoped. Placed here as [groupId]
 *       won't match "invites" literally.
 */
