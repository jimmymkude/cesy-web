import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * GET /api/friends/requests?userId=xxx
 * List pending incoming friend requests for the given user.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const incoming = await prisma.friendship.findMany({
            where: { addresseeId: userId, status: 'pending' },
            include: {
                requester: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const outgoing = await prisma.friendship.findMany({
            where: { requesterId: userId, status: 'pending' },
            include: {
                addressee: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ incoming, outgoing });
    } catch (error) {
        console.error('Friend requests error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/friends/requests
 * Accept or reject a friend request.
 * Body: { friendshipId, action: 'accept' | 'reject' }
 */
export async function PATCH(request) {
    try {
        const { friendshipId, action } = await request.json();

        if (!friendshipId || !['accept', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Missing friendshipId or invalid action' }, { status: 400 });
        }

        const friendship = await prisma.friendship.update({
            where: { id: friendshipId },
            data: { status: action === 'accept' ? 'accepted' : 'rejected' },
        });

        return NextResponse.json({ friendship });
    } catch (error) {
        console.error('Friend request action error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
