import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/groups/[groupId]/members
 * Update a member's group settings (e.g. sharePrivateMemories).
 * Body: { userId, sharePrivateMemories }
 */
export async function PATCH(request, { params }) {
    try {
        const { groupId } = await params;
        const { userId, sharePrivateMemories } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

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
