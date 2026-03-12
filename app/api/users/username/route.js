import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * PATCH /api/users/username
 * Update the current user's username.
 * Body: { userId, username }
 */
export async function PATCH(request) {
    try {
        const { userId, username } = await request.json();

        if (!userId || !username?.trim()) {
            return NextResponse.json({ error: 'Missing userId or username' }, { status: 400 });
        }

        const clean = username.trim().toLowerCase();

        // Validate: 3-20 chars, alphanumeric + underscores only
        if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
            return NextResponse.json(
                { error: 'Username must be 3-20 characters, letters, numbers, and underscores only' },
                { status: 400 }
            );
        }

        // Check uniqueness (excluding current user)
        const taken = await prisma.userProfile.findFirst({
            where: { username: clean, id: { not: userId } },
        });
        if (taken) {
            return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
        }

        const user = await prisma.userProfile.update({
            where: { id: userId },
            data: { username: clean },
            select: { id: true, username: true },
        });

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Username update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
