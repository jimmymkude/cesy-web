import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// Predefined palette of 10 colors (no white or black)
const GROUP_COLORS = [
    '#e6a817', // gold
    '#3b82f6', // blue
    '#ef4444', // red
    '#22c55e', // green
    '#a855f7', // purple
    '#f97316', // orange
    '#ec4899', // pink
    '#14b8a6', // teal
    '#8b5cf6', // indigo
    '#06b6d4', // cyan
];

/**
 * GET /api/groups?userId=xxx
 * List groups the user belongs to.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const memberships = await prisma.groupMember.findMany({
            where: { userId },
            include: {
                group: {
                    include: {
                        members: {
                            include: {
                                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { joinedAt: 'desc' },
        });

        const groups = memberships.map((m) => ({
            ...m.group,
            memberCount: m.group.members.length,
            myRole: m.role,
        }));

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Groups list error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/groups
 * Create a new group. Creator becomes admin.
 * Body: { userId, name }
 */
export async function POST(request) {
    try {
        const { userId, name } = await request.json();
        if (!userId || !name?.trim()) {
            return NextResponse.json({ error: 'Missing userId or name' }, { status: 400 });
        }

        const group = await prisma.group.create({
            data: {
                name: name.trim(),
                creatorId: userId,
                members: {
                    create: {
                        userId,
                        role: 'admin',
                        chatColor: GROUP_COLORS[0],
                    },
                },
            },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                    },
                },
            },
        });

        return NextResponse.json({ group }, { status: 201 });
    } catch (error) {
        console.error('Create group error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export { GROUP_COLORS };
