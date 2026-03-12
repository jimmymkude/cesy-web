import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

/**
 * Generate a unique username from a display name.
 * "Jimmy Mkude" -> "jimmy_mkude", deduped with random suffix if taken.
 */
async function generateUsername(fullName) {
    const base = (fullName || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 16) || 'user';

    // Try the base first
    const exists = await prisma.userProfile.findUnique({ where: { username: base } });
    if (!exists) return base;

    // Append random digits until unique
    for (let i = 0; i < 10; i++) {
        const suffix = Math.floor(Math.random() * 9000 + 1000);
        const candidate = `${base.slice(0, 12)}_${suffix}`;
        const taken = await prisma.userProfile.findUnique({ where: { username: candidate } });
        if (!taken) return candidate;
    }
    // Fallback: uuid fragment
    return `${base.slice(0, 10)}_${Date.now().toString(36)}`;
}

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

            // Auto-generate username if not set
            if (!user.username) {
                const username = await generateUsername(fullName);
                user = await prisma.userProfile.update({
                    where: { id: user.id },
                    data: { username },
                    include: { settings: true },
                });
            }
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
