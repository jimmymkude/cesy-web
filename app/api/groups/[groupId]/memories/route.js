import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * GET /api/groups/[groupId]/memories?userId=X
 * Returns all group memories for a group (verifies membership).
 */
export async function GET(request, { params }) {
    try {
        const { groupId } = await params;
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        // Verify membership
        const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });
        if (!member) {
            return NextResponse.json({ error: 'Not a member' }, { status: 403 });
        }

        const memories = await prisma.groupMemory.findMany({
            where: { groupId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                content: true,
                tags: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ memories });
    } catch (error) {
        console.error('Group memories fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/groups/[groupId]/memories?userId=X&memoryId=Y
 * Delete a group memory (admin only).
 */
export async function DELETE(request, { params }) {
    try {
        const { groupId } = await params;
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const memoryId = searchParams.get('memoryId');

        if (!userId || !memoryId) {
            return NextResponse.json({ error: 'userId and memoryId required' }, { status: 400 });
        }

        // Verify admin status
        const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });
        if (!member || member.role !== 'admin') {
            return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        }

        await prisma.groupMemory.delete({ where: { id: memoryId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Group memory delete error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
