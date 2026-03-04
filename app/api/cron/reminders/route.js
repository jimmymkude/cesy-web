import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

// GET /api/cron/reminders
// Batch endpoint for Railway cron: finds ALL users' due reminders,
// delivers via Telegram, saves delivery memories, marks as notified.
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
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        // Find ALL due reminders across all users
        const reminders = await prisma.reminder.findMany({
            where: {
                completed: false,
                notified: false,
                dueAt: { gte: fiveMinutesAgo, lte: now },
            },
            include: {
                user: { select: { telegramChatId: true, fullName: true } },
            },
            orderBy: { dueAt: 'asc' },
        });

        if (reminders.length === 0) {
            return NextResponse.json({ delivered: 0 });
        }

        let delivered = 0;

        for (const reminder of reminders) {
            const chatId = reminder.user?.telegramChatId;
            if (!chatId) continue;

            // Use personalized deliveryMessage if available, fallback to content
            const message = reminder.deliveryMessage || `⏰ Reminder: ${reminder.content}`;
            const result = await sendTelegramMessage(chatId, message);

            if (result.ok) {
                delivered++;

                // Save a delivery memory so Cesy is aware
                const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                await prisma.memory.create({
                    data: {
                        userId: reminder.userId,
                        content: `Sent reminder via Telegram: "${reminder.content}" on ${dateStr}`,
                        tags: ['reminder', 'telegram', 'delivered'],
                    },
                });
            }
        }

        // Mark all as notified regardless of Telegram success
        await prisma.reminder.updateMany({
            where: { id: { in: reminders.map((r) => r.id) } },
            data: { notified: true },
        });

        return NextResponse.json({ delivered, total: reminders.length });
    } catch (error) {
        console.error('Cron reminders error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
