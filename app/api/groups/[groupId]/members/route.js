import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/groups/[groupId]/members
 * Update a member's group settings (e.g. sharePrivateMemories, role).
 * Body: { userId, sharePrivateMemories?, promoteUserId? }
 *   - promoteUserId: admin-only action to promote another member to admin
 */
export async function PATCH(request, { params }) {
    try {
        const { groupId } = await params;
        const { userId, sharePrivateMemories, promoteUserId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // Promote another member to admin
        if (promoteUserId) {
            const requester = await prisma.groupMember.findUnique({
                where: { groupId_userId: { groupId, userId } },
            });
            if (!requester || requester.role !== 'admin') {
                return NextResponse.json({ error: 'Only admins can promote members' }, { status: 403 });
            }

            const promoted = await prisma.groupMember.update({
                where: { groupId_userId: { groupId, userId: promoteUserId } },
                data: { role: 'admin' },
            });
            return NextResponse.json({ member: promoted, message: 'Member promoted to admin.' });
        }

        // Update own settings
        const member = await prisma.groupMember.update({
            where: { groupId_userId: { groupId, userId } },
            data: {
                ...(typeof sharePrivateMemories === 'boolean' ? { sharePrivateMemories } : {}),
            },
        });

        return NextResponse.json({ member });
    } catch (error) {
        console.error('Update group member error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/groups/[groupId]/members
 * Leave a group (self) or kick a member (admin only).
 * Body: { userId, targetUserId? }
 *   - If targetUserId is provided, the userId user (must be admin) kicks targetUserId.
 *   - If only userId, the user leaves the group themselves.
 *   - Admins CANNOT leave if they are the only admin — they must promote someone first.
 */
export async function DELETE(request, { params }) {
    try {
        const { groupId } = await params;
        const { userId, targetUserId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const removeUserId = targetUserId || userId;
        const isSelf = removeUserId === userId;

        // If kicking someone else, verify the requester is admin
        if (!isSelf) {
            const requester = await prisma.groupMember.findUnique({
                where: { groupId_userId: { groupId, userId } },
            });
            if (!requester || requester.role !== 'admin') {
                return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 });
            }
        }

        // Verify the target is actually a member
        const target = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: removeUserId } },
        });
        if (!target) {
            return NextResponse.json({ error: 'User is not a member of this group' }, { status: 404 });
        }

        // If the leaving user is an admin, check they're not the only one
        if (isSelf && target.role === 'admin') {
            const otherAdmins = await prisma.groupMember.count({
                where: { groupId, role: 'admin', userId: { not: userId } },
            });
            if (otherAdmins === 0) {
                // Check if there are other members at all
                const otherMembers = await prisma.groupMember.count({
                    where: { groupId, userId: { not: userId } },
                });
                if (otherMembers > 0) {
                    return NextResponse.json(
                        { error: 'You are the only admin. Promote another member to admin before leaving.' },
                        { status: 400 }
                    );
                }
                // Solo member — delete the group
                await prisma.groupMember.delete({
                    where: { groupId_userId: { groupId, userId } },
                });
                await prisma.group.delete({ where: { id: groupId } });
                return NextResponse.json({ message: 'Left group. Group was deleted (no members remaining).' });
            }
        }

        // Remove the member
        await prisma.groupMember.delete({
            where: { groupId_userId: { groupId, userId: removeUserId } },
        });

        return NextResponse.json({ message: isSelf ? 'Left group successfully.' : 'Member removed.' });
    } catch (error) {
        console.error('Remove group member error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
