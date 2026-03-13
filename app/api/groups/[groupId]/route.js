import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * GET /api/groups/[groupId]
 * Get group details with members and their workout schedules.
 */
export async function GET(request, { params }) {
    try {
        const { groupId } = await params;

        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                fullName: true,
                                avatarUrl: true,
                                workoutSchedule: true,
                            },
                        },
                    },
                    orderBy: { joinedAt: 'asc' },
                },
            },
        });

        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        return NextResponse.json({ group });
    } catch (error) {
        console.error('Group detail error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/groups/[groupId]
 * Delete a group (admin only).
 * Query: ?userId=xxx
 */
export async function DELETE(request, { params }) {
    try {
        const { groupId } = await params;
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // Check admin status
        const membership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });

        if (!membership || membership.role !== 'admin') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        await prisma.group.delete({ where: { id: groupId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete group error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/groups/[groupId]
 * Update group settings (admin only).
 * Body: { userId, cesyMode }
 */
export async function PATCH(request, { params }) {
    try {
        const { groupId } = await params;
        const body = await request.json();
        const { userId, cesyMode } = body;

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const membership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });

        if (!membership || membership.role !== 'admin') {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        const updates = {};
        if (cesyMode && ['keywords', 'smart'].includes(cesyMode)) {
            updates.cesyMode = cesyMode;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const updated = await prisma.group.update({
            where: { id: groupId },
            data: updates,
        });

        return NextResponse.json({ group: updated });
    } catch (error) {
        console.error('Update group error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
