/**
 * Telegram Bot Helpers (server-side)
 *
 * Provides message sending and account linking via Telegram Bot API.
 */
import prisma from '@/lib/prisma';
import crypto from 'crypto';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Send a message to a Telegram user by chat ID.
 */
export async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };

    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
        }),
    });

    return res.json();
}

/**
 * Send a notification to a user via Telegram.
 * Looks up the user's telegramChatId from their profile.
 * Returns success/failure message.
 */
export async function sendNotificationToUser(userId, message) {
    const user = await prisma.userProfile.findUnique({
        where: { id: userId },
        select: { telegramChatId: true, fullName: true },
    });

    if (!user?.telegramChatId) {
        return { sent: false, reason: 'No Telegram account linked.' };
    }

    const result = await sendTelegramMessage(user.telegramChatId, message);
    return { sent: result.ok === true, result };
}

/**
 * Generate a short-lived link code for connecting Telegram to a Cesy account.
 * Code format: CESY-XXXX (8 chars)
 */
export function generateLinkCode() {
    return 'CESY-' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
}

// In-memory link code store (expires after 10 minutes)
// In production, this should use Redis or DB
const linkCodes = new Map();

/**
 * Create a link code associated with a userId.
 */
export function createLinkCode(userId) {
    const code = generateLinkCode();
    linkCodes.set(code, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

    // Clean up expired codes
    for (const [key, val] of linkCodes) {
        if (val.expiresAt < Date.now()) linkCodes.delete(key);
    }

    return code;
}

/**
 * Verify and consume a link code.
 * Returns the userId or null if invalid/expired.
 */
export function consumeLinkCode(code) {
    const entry = linkCodes.get(code);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        linkCodes.delete(code);
        return null;
    }
    linkCodes.delete(code);
    return entry.userId;
}
