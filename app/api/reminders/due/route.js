import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/reminders/due?userId=xxx
// Returns reminders that are due within the last 5 minutes and not yet notified.
// Marks returned reminders as notified. Browser-side only — Telegram delivery
// is handled by /api/cron/reminders.
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

        return NextResponse.json({
            reminders: reminders.map((r) => ({
                id: r.id,
                content: r.content,
                dueAt: r.dueAt,
            })),
        });
    } catch (error) {
        console.error('Due reminders error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
