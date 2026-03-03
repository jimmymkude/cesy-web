import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTelegramMessage, consumeLinkCode } from '@/lib/telegram';

// POST /api/telegram/webhook — Receives updates from Telegram Bot API
export async function POST(request) {
    try {
        const update = await request.json();
        const message = update.message;

        if (!message?.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();

        // Handle /start command with optional link code
        if (text.startsWith('/start')) {
            const parts = text.split(' ');
            const linkCode = parts[1]?.toUpperCase();

            if (linkCode) {
                // Try to consume the link code
                const userId = consumeLinkCode(linkCode);

                if (userId) {
                    // Link the Telegram chat to the Cesy user
                    await prisma.userProfile.update({
                        where: { id: userId },
                        data: { telegramChatId: chatId },
                    });

                    await sendTelegramMessage(
                        chatId,
                        '✅ <b>Linked!</b> You\'ll receive Cesy notifications here.\n\nI\'ll send reminders, timer alerts, and anything Cesy needs to tell you.'
                    );
                } else {
                    await sendTelegramMessage(
                        chatId,
                        '❌ Invalid or expired link code. Please generate a new one from Cesy Settings.'
                    );
                }
            } else {
                // Just /start with no code
                await sendTelegramMessage(
                    chatId,
                    '👋 <b>Welcome to Cesy!</b>\n\nTo link your account:\n1. Go to Cesy Settings → "Link Telegram"\n2. Copy your link code\n3. Send it here: <code>/start CESY-XXXX</code>'
                );
            }

            return NextResponse.json({ ok: true });
        }

        // For now, reply to any other message with instructions
        await sendTelegramMessage(
            chatId,
            'I\'m Cesy\'s notification bot. 📬\n\nI\'ll send you reminders and alerts from Cesy. To link your account, go to Cesy Settings.'
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Telegram webhook error:', error);
        return NextResponse.json({ ok: true }); // Always return 200 to Telegram
    }
}
