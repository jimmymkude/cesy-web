import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { sendNotificationToUser } from '@/lib/telegram';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

/**
 * POST /api/cron/group-nudges
 * 
 * Group accountability nudges.
 * Called periodically to send morning motivation (~8 AM) and evening recaps (~8 PM)
 * in each user's timezone.
 * 
 * Morning: "3 of you have workouts today — let's see who finishes first"
 * Evening: "Jimmy and Marcus crushed it today. Sarah, still time!"
 */
export async function POST(request) {
    try {
        // Verify cron secret
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch all groups with members and their settings
        const groups = await prisma.group.findMany({
            include: {
                members: {
                    include: {
                        user: {
                            include: {
                                settings: true,
                                workoutSchedule: true,
                            },
                        },
                    },
                },
            },
        });

        const now = new Date();
        let nudgesSent = 0;

        for (const group of groups) {
            for (const member of group.members) {
                const tz = member.user.settings?.timezone || 'America/Los_Angeles';
                const telegramChatId = member.user.telegramChatId;
                if (!telegramChatId) continue;

                // Get local hour for this user
                let localHour;
                try {
                    localHour = parseInt(new Intl.DateTimeFormat('en-US', {
                        timeZone: tz, hour: 'numeric', hour12: false,
                    }).format(now));
                } catch {
                    localHour = parseInt(new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false,
                    }).format(now));
                }

                // Morning motivation (8 AM local)
                if (localHour === 8) {
                    const today = DAY_NAMES[new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay ? now.getDay() : 0];
                    // Check who has workouts today
                    const membersWithWorkouts = group.members.filter((m) => {
                        const schedule = m.user.workoutSchedule?.schedule;
                        if (!Array.isArray(schedule)) return false;
                        return schedule.some((s) => s.dayOfWeek === today);
                    });

                    if (membersWithWorkouts.length > 0) {
                        const names = membersWithWorkouts
                            .map((m) => m.user.fullName?.split(' ')[0] || m.user.username)
                            .join(', ');
                        const msg = `☀️ Good morning! ${membersWithWorkouts.length} member${membersWithWorkouts.length > 1 ? 's' : ''} in "${group.name}" have workouts today: ${names}. Let's see who finishes first! 💪`;

                        await sendNotificationToUser(member.user.id, msg);
                        nudgesSent++;
                    }
                }

                // Evening recap (8 PM local)
                if (localHour === 20) {
                    const todayDate = new Date();
                    todayDate.setHours(0, 0, 0, 0);

                    // Get today's workout logs for all group members
                    const memberIds = group.members.map((m) => m.userId);
                    const completedLogs = await prisma.workoutLog.findMany({
                        where: {
                            userId: { in: memberIds },
                            date: todayDate,
                        },
                        include: {
                            user: { select: { fullName: true, username: true } },
                        },
                    });

                    if (completedLogs.length > 0) {
                        const completedNames = completedLogs
                            .map((l) => l.user.fullName?.split(' ')[0] || l.user.username)
                            .join(', ');
                        const remaining = group.members.length - completedLogs.length;
                        let msg = `🌙 "${group.name}" evening recap: ${completedNames} crushed it today! 🔥`;
                        if (remaining > 0) {
                            msg += ` ${remaining} member${remaining > 1 ? 's' : ''} still have time!`;
                        } else {
                            msg += ' Everyone worked out — amazing team effort! 🏆';
                        }

                        await sendNotificationToUser(member.user.id, msg);
                        nudgesSent++;
                    }
                }
            }
        }

        return NextResponse.json({ success: true, nudgesSent });
    } catch (error) {
        console.error('Group nudges error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
