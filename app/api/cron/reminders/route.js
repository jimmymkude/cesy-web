import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { generateEmbedding, toVectorLiteral } from '@/lib/tools';
import { wakeUpCesy } from '@/lib/cesyWakeUp';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GET /api/cron/reminders
// Batch endpoint for Railway cron: delivers due reminders AND
// sends context-aware workout nudges by waking up Cesy.
// Protected by CRON_SECRET header.
export async function GET(request) {
    try {
        // Validate cron secret
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const now = new Date();
        const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
        let delivered = 0;

        // ── Phase 1: Regular Reminders ─────────────────────────────
        const reminders = await prisma.reminder.findMany({
            where: {
                completed: false,
                notified: false,
                dueAt: { lte: thirtyMinutesFromNow },
            },
            include: {
                user: { select: { telegramChatId: true, fullName: true } },
            },
            orderBy: { dueAt: 'asc' },
        });

        for (const reminder of reminders) {
            const chatId = reminder.user?.telegramChatId;
            if (!chatId) continue;

            // Use personalized deliveryMessage if available, fallback to content
            const message = reminder.deliveryMessage || `⏰ Reminder: ${reminder.content}`;
            const result = await sendTelegramMessage(chatId, message);

            if (result.ok) {
                delivered++;

                // Save a delivery memory so Cesy is aware (with embedding for searchability)
                const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const memContent = `Sent reminder via Telegram: "${reminder.content}" on ${dateStr}`;
                const memory = await prisma.memory.create({
                    data: {
                        userId: reminder.userId,
                        content: memContent,
                        tags: ['reminder', 'telegram', 'delivered'],
                    },
                });

                // Embed the delivery memory so search_memories can find it
                const embedding = await generateEmbedding(memContent);
                if (embedding) {
                    const vectorStr = toVectorLiteral(embedding);
                    await prisma.$executeRawUnsafe(
                        `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
                        vectorStr,
                        memory.id
                    );
                }
            }
        }

        // Mark all as notified regardless of Telegram success
        if (reminders.length > 0) {
            await prisma.reminder.updateMany({
                where: { id: { in: reminders.map((r) => r.id) } },
                data: { notified: true },
            });
        }

        // ── Phase 2: Workout Auto-Reminders (Wake Up Cesy) ────────
        let workoutDelivered = 0;
        let workoutSkipped = 0;

        const allSchedules = await prisma.workoutSchedule.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        telegramChatId: true,
                        settings: { select: { timezone: true } },
                    },
                },
            },
        });

        for (const ws of allSchedules) {
            const chatId = ws.user?.telegramChatId;
            if (!chatId) {
                workoutSkipped++;
                continue;
            }

            // Compute day-of-week in the user's local timezone (not server UTC)
            const userTz = ws.user?.settings?.timezone || 'America/Los_Angeles';
            const localNow = new Date(now.toLocaleString('en-US', { timeZone: userTz }));
            const todayDow = localNow.getDay();
            // Use sv-SE locale for YYYY-MM-DD format (toISOString always returns UTC)
            const todayDateStr = now.toLocaleDateString('sv-SE', { timeZone: userTz });

            // Parse schedule JSON — handle nested or flat format
            const schedule = ws.schedule?.schedule || ws.schedule;
            if (!Array.isArray(schedule)) continue;

            const todayWorkout = schedule.find((entry) => entry.dayOfWeek === todayDow);
            if (!todayWorkout) continue;

            // Dedup: check if workout reminder was already sent today
            const existingDelivery = await prisma.memory.findFirst({
                where: {
                    userId: ws.userId,
                    tags: { equals: ['workout-reminder', 'telegram', 'delivered'] },
                    content: { contains: todayDateStr },
                },
            });

            if (existingDelivery) {
                workoutSkipped++;
                continue;
            }

            // Wake up Cesy with full context — she'll use search_memories and craft something personal
            const dayName = DAY_NAMES[todayDow];
            const workoutDetails = `${todayWorkout.workoutType}, ${todayWorkout.duration} minutes${todayWorkout.equipment?.length ? ` (Equipment: ${todayWorkout.equipment.join(', ')})` : ''}`;
            const triggerMessage = `You're being woken up to send a workout reminder. ${ws.user.fullName || 'The user'} has a ${workoutDetails} session scheduled for today (${dayName}). Use search_memories to check their recent activity, mood, or anything relevant — then craft a short, personalized Telegram nudge. Keep it under 2 sentences. Make it feel like YOU genuinely know them. Do NOT just say "time to work out" — be specific.${todayWorkout.note ? ` Your coaching tip for today: ${todayWorkout.note}` : ''}`;

            const nudge = await wakeUpCesy(triggerMessage, ws.userId, {
                extraContext: `The user's name is ${ws.user.fullName || 'friend'}.`,
            });

            // Fallback if Cesy wake-up fails
            const finalMessage = nudge || `🏋️ ${todayWorkout.workoutType} day! ${todayWorkout.duration} minutes on the schedule. Let's go!`;

            const result = await sendTelegramMessage(chatId, finalMessage);

            if (result.ok) {
                workoutDelivered++;

                const memContent = `Sent workout reminder via Telegram on ${todayDateStr}: "${todayWorkout.workoutType}" session for ${dayName}`;
                const memory = await prisma.memory.create({
                    data: {
                        userId: ws.userId,
                        content: memContent,
                        tags: ['workout-reminder', 'telegram', 'delivered'],
                    },
                });

                const embedding = await generateEmbedding(memContent);
                if (embedding) {
                    const vectorStr = toVectorLiteral(embedding);
                    await prisma.$executeRawUnsafe(
                        `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
                        vectorStr,
                        memory.id
                    );
                }
            }
        }

        return NextResponse.json({
            delivered,
            total: reminders.length,
            workoutDelivered,
            workoutSkipped,
        });
    } catch (error) {
        console.error('Cron reminders error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

