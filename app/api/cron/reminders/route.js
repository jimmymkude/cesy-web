import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { generateEmbedding, toVectorLiteral } from '@/lib/tools';

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
        const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

        // Find reminders due within the next 30 minutes or already past due
        // With a 15-min cron interval, this gives users a 15-30 min heads-up
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
