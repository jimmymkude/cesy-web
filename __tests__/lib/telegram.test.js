/**
 * Tests for lib/telegram.js — Telegram Bot helpers
 */
import { generateLinkCode, createLinkCode, consumeLinkCode } from '@/lib/telegram';

// Mock prisma for sendNotificationToUser tests
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        userProfile: {
            findUnique: jest.fn(),
        },
    },
}));

import prisma from '@/lib/prisma';
import { sendNotificationToUser, sendTelegramMessage } from '@/lib/telegram';

// Mock global fetch
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
});
afterAll(() => { global.fetch = originalFetch; });

describe('generateLinkCode', () => {
    it('generates a code starting with CESY-', () => {
        const code = generateLinkCode();
        expect(code).toMatch(/^CESY-[A-Z0-9]{4}$/);
    });

    it('generates unique codes', () => {
        const codes = new Set(Array.from({ length: 20 }, () => generateLinkCode()));
        expect(codes.size).toBeGreaterThan(1);
    });
});

describe('createLinkCode / consumeLinkCode', () => {
    it('creates and consumes a valid link code', () => {
        const code = createLinkCode('user-1');
        expect(code).toMatch(/^CESY-/);

        const userId = consumeLinkCode(code);
        expect(userId).toBe('user-1');
    });

    it('returns null for consumed code (one-time use)', () => {
        const code = createLinkCode('user-2');
        consumeLinkCode(code); // first use
        const result = consumeLinkCode(code); // second use
        expect(result).toBeNull();
    });

    it('returns null for unknown code', () => {
        expect(consumeLinkCode('CESY-XXXX')).toBeNull();
    });
});

describe('sendTelegramMessage', () => {
    it('sends message via Telegram API', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'test-token';
        global.fetch.mockResolvedValue({
            json: () => Promise.resolve({ ok: true }),
        });

        const result = await sendTelegramMessage('12345', 'Hello!');

        expect(result.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.telegram.org/bottest-token/sendMessage',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"chat_id":"12345"'),
            })
        );
        delete process.env.TELEGRAM_BOT_TOKEN;
    });

    it('returns error when token not configured', async () => {
        delete process.env.TELEGRAM_BOT_TOKEN;

        const result = await sendTelegramMessage('12345', 'Hello!');

        expect(result.ok).toBe(false);
        expect(result.error).toContain('not configured');
    });
});

describe('sendNotificationToUser', () => {
    it('sends notification when user has Telegram linked', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'test-token';
        prisma.userProfile.findUnique.mockResolvedValue({
            telegramChatId: '999',
            fullName: 'Test User',
        });
        global.fetch.mockResolvedValue({
            json: () => Promise.resolve({ ok: true }),
        });

        const result = await sendNotificationToUser('u1', 'Reminder: Dentist');

        expect(result.sent).toBe(true);
        expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
            where: { id: 'u1' },
            select: { telegramChatId: true, fullName: true },
        });
        delete process.env.TELEGRAM_BOT_TOKEN;
    });

    it('returns not sent when user has no Telegram', async () => {
        prisma.userProfile.findUnique.mockResolvedValue({
            telegramChatId: null,
            fullName: 'Test User',
        });

        const result = await sendNotificationToUser('u1', 'Hello');

        expect(result.sent).toBe(false);
        expect(result.reason).toContain('No Telegram');
    });
});
