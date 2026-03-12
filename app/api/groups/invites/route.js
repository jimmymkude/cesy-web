import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// Same color palette from groups route
const GROUP_COLORS = [
    '#e6a817', '#3b82f6', '#ef4444', '#22c55e', '#a855f7',
    '#f97316', '#ec4899', '#14b8a6', '#8b5cf6', '#06b6d4',
];

/**
 * GET /api/groups/invites?userId=xxx
 * List pending group invites for the user.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const invites = await prisma.groupInvite.findMany({
            where: { inviteeId: userId, status: 'pending' },
            include: {
                group: { select: { id: true, name: true } },
                inviter: { select: { id: true, username: true, fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ invites });
    } catch (error) {
        console.error('Group invites list error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/groups/invites
 * Accept or decline a group invite.
 * Body: { inviteId, action: 'accept' | 'decline' }
 */
export async function PATCH(request) {
    try {
        const { inviteId, action } = await request.json();

        if (!inviteId || !['accept', 'decline'].includes(action)) {
            return NextResponse.json({ error: 'Missing inviteId or invalid action' }, { status: 400 });
        }

        const invite = await prisma.groupInvite.findUnique({
            where: { id: inviteId },
        });

        if (!invite || invite.status !== 'pending') {
            return NextResponse.json({ error: 'Invite not found or already processed' }, { status: 404 });
        }

        if (action === 'accept') {
            // Check group size
            const memberCount = await prisma.groupMember.count({ where: { groupId: invite.groupId } });
            const group = await prisma.group.findUnique({ where: { id: invite.groupId } });
            if (memberCount >= (group?.maxMembers || 10)) {
                return NextResponse.json({ error: 'Group is full' }, { status: 400 });
            }

            // Assign next available color
            const chatColor = GROUP_COLORS[memberCount % GROUP_COLORS.length];

            // Create membership and update invite in a transaction
            await prisma.$transaction([
                prisma.groupMember.create({
                    data: {
                        groupId: invite.groupId,
                        userId: invite.inviteeId,
                        role: 'member',
                        chatColor,
                    },
                }),
                prisma.groupInvite.update({
                    where: { id: inviteId },
                    data: { status: 'accepted' },
                }),
            ]);

            return NextResponse.json({ status: 'accepted' });
        } else {
            await prisma.groupInvite.update({
                where: { id: inviteId },
                data: { status: 'declined' },
            });
            return NextResponse.json({ status: 'declined' });
        }
    } catch (error) {
        console.error('Group invite action error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
