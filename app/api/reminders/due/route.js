import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendNotificationToUser } from '@/lib/telegram';

// GET /api/reminders/due?userId=xxx
// Returns reminders that are due within the last 5 minutes and not yet notified.
// Marks returned reminders as notified and delivers them via Telegram.
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        // Find due reminders not yet notified
        const reminders = await prisma.reminder.findMany({
            where: {
                userId,
                completed: false,
                notified: false,
                dueAt: { gte: fiveMinutesAgo, lte: now },
            },
            orderBy: { dueAt: 'asc' },
        });

        // Mark as notified
        if (reminders.length > 0) {
            await prisma.reminder.updateMany({
                where: { id: { in: reminders.map((r) => r.id) } },
                data: { notified: true },
            });
        }

        // Deliver each reminder via Telegram and log as memory
        const deliveryResults = [];
        for (const reminder of reminders) {
            const telegramMsg = `⏰ Reminder: ${reminder.content}`;
            const result = await sendNotificationToUser(userId, telegramMsg);

            if (result.sent) {
                // Save a memory so Cesy is aware of the delivery
                const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                await prisma.memory.create({
                    data: {
                        userId,
                        content: `Sent reminder via Telegram: "${reminder.content}" on ${dateStr}`,
                        tags: ['reminder', 'telegram', 'delivered'],
                    },
                });
            }

            deliveryResults.push({
                id: reminder.id,
                content: reminder.content,
                dueAt: reminder.dueAt,
                telegramSent: result.sent,
            });
        }

        return NextResponse.json({ reminders: deliveryResults });
    } catch (error) {
        console.error('Due reminders error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
