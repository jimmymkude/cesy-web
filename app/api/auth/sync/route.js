import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/sync
 * Called after Firebase auth to ensure user profile exists in our PostgreSQL database.
 */
export async function POST(request) {
    try {
        const { firebaseUid, email, fullName, avatarUrl, timezone } = await request.json();

        if (!firebaseUid) {
            return NextResponse.json({ error: 'Missing firebaseUid' }, { status: 400 });
        }

        let user;
        try {
            user = await prisma.userProfile.upsert({
                where: { firebaseUid },
                update: {
                    email: email || undefined,
                    fullName: fullName || undefined,
                    avatarUrl: avatarUrl || undefined,
                    // Backfill timezone on every sync if the browser sends it
                    ...(timezone ? {
                        settings: {
                            update: { timezone },
                        },
                    } : {}),
                },
                create: {
                    firebaseUid,
                    email,
                    fullName,
                    avatarUrl,
                    settings: {
                        create: {
                            assistantName: 'Cesy',
                            darkMode: true,
                            timezone: timezone || 'America/Los_Angeles',
                        },
                    },
                },
                include: { settings: true },
            });
        } catch (upsertError) {
            // Handle race condition: if two requests hit simultaneously,
            // the second one may fail with P2002. Just fetch the existing user.
            if (upsertError.code === 'P2002') {
                user = await prisma.userProfile.findUnique({
                    where: { firebaseUid },
                    include: { settings: true },
                });
            } else {
                throw upsertError;
            }
        }

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Auth sync error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
