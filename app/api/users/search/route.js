import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * GET /api/users/search?q=username&userId=currentUserId
 * Search for users by username for adding friends.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim();
        const userId = searchParams.get('userId');

        if (!q || q.length < 2) {
            return NextResponse.json({ users: [] });
        }

        const users = await prisma.userProfile.findMany({
            where: {
                username: { contains: q, mode: 'insensitive' },
                ...(userId ? { id: { not: userId } } : {}),
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
            },
            take: 10,
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error('User search error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
