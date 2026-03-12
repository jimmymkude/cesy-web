import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * GET /api/friends?userId=xxx
 * List accepted friends for the given user.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const friendships = await prisma.friendship.findMany({
            where: {
                status: 'accepted',
                OR: [{ requesterId: userId }, { addresseeId: userId }],
            },
            include: {
                requester: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                addressee: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Return the *other* user in each friendship
        const friends = friendships.map((f) => {
            const friend = f.requesterId === userId ? f.addressee : f.requester;
            return { ...friend, friendshipId: f.id };
        });

        return NextResponse.json({ friends });
    } catch (error) {
        console.error('Friends list error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/friends
 * Send a friend request.
 * Body: { userId, friendId }
 */
export async function POST(request) {
    try {
        const { userId, friendId } = await request.json();
        if (!userId || !friendId) {
            return NextResponse.json({ error: 'Missing userId or friendId' }, { status: 400 });
        }
        if (userId === friendId) {
            return NextResponse.json({ error: 'Cannot friend yourself' }, { status: 400 });
        }

        // Check if friendship already exists (in either direction)
        const existing = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: userId, addresseeId: friendId },
                    { requesterId: friendId, addresseeId: userId },
                ],
            },
        });

        if (existing) {
            if (existing.status === 'accepted') {
                return NextResponse.json({ error: 'Already friends' }, { status: 409 });
            }
            if (existing.status === 'pending') {
                return NextResponse.json({ error: 'Friend request already pending' }, { status: 409 });
            }
            // If rejected, allow re-sending by updating to pending
            if (existing.status === 'rejected' && existing.requesterId === userId) {
                const updated = await prisma.friendship.update({
                    where: { id: existing.id },
                    data: { status: 'pending' },
                });
                return NextResponse.json({ friendship: updated }, { status: 200 });
            }
        }

        const friendship = await prisma.friendship.create({
            data: {
                requesterId: userId,
                addresseeId: friendId,
                status: 'pending',
            },
        });

        return NextResponse.json({ friendship }, { status: 201 });
    } catch (error) {
        console.error('Send friend request error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
