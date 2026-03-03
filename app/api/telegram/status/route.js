import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/telegram/status?userId=xxx — Check if Telegram is linked
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const user = await prisma.userProfile.findUnique({
            where: { id: userId },
            select: { telegramChatId: true },
        });

        return NextResponse.json({
            linked: !!user?.telegramChatId,
            configured: !!process.env.TELEGRAM_BOT_TOKEN,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
