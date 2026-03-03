import { NextResponse } from 'next/server';
import { createLinkCode } from '@/lib/telegram';

// POST /api/telegram/link — Generate a temporary link code
export async function POST(request) {
    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const code = createLinkCode(userId);

        return NextResponse.json({
            code,
            expiresIn: '10 minutes',
            botUsername: 'CesyAIBot', // Update with your actual bot username
            instructions: `Send "/start ${code}" to @CesyAIBot on Telegram`,
        });
    } catch (error) {
        console.error('Link code error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
