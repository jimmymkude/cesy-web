import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/groups/activity?userId=X — today's workout activity across user's groups
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all groups the user is in, with members
        const memberships = await prisma.groupMember.findMany({
            where: { userId },
            include: {
                group: {
                    include: {
                        members: {
                            include: {
                                user: {
                                    select: { id: true, fullName: true, username: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        const groups = [];

        for (const membership of memberships) {
            const group = membership.group;
            const memberIds = group.members.map((m) => m.userId);

            // Get today's workout logs for all members
            const logs = await prisma.workoutLog.findMany({
                where: {
                    userId: { in: memberIds },
                    date: today,
                },
            });

            // Map logs to member names
            const logDetails = logs.map((log) => {
                const member = group.members.find((m) => m.userId === log.userId);
                return {
                    userName: member?.user?.fullName || member?.user?.username || 'Unknown',
                    workoutType: log.workoutType,
                    duration: log.duration,
                };
            });

            groups.push({
                name: group.name,
                groupId: group.id,
                totalMembers: group.members.length,
                completedToday: new Set(logs.map((l) => l.userId)).size,
                logs: logDetails,
            });
        }

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Group activity error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
