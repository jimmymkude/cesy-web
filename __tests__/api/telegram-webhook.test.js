/**
 * Tests for /api/telegram/webhook — Telegram bot webhook handler
 */
import { POST } from '@/app/api/telegram/webhook/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        userProfile: {
            update: jest.fn(),
        },
    },
}));

jest.mock('@/lib/telegram', () => ({
    sendTelegramMessage: jest.fn().mockResolvedValue({ ok: true }),
    consumeLinkCode: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { sendTelegramMessage, consumeLinkCode } from '@/lib/telegram';

function makeRequest(body) {
    return {
        json: () => Promise.resolve(body),
    };
}

describe('POST /api/telegram/webhook', () => {
    beforeEach(() => jest.clearAllMocks());

    it('handles /start with valid link code', async () => {
        consumeLinkCode.mockReturnValue('user-123');

        const req = makeRequest({
            message: { chat: { id: 99999 }, text: '/start CESY-ABCD' },
        });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(consumeLinkCode).toHaveBeenCalledWith('CESY-ABCD');
        expect(prisma.userProfile.update).toHaveBeenCalledWith({
            where: { id: 'user-123' },
            data: { telegramChatId: '99999' },
        });
        expect(sendTelegramMessage).toHaveBeenCalledWith('99999', expect.stringContaining('Linked'));
    });

    it('handles /start with invalid code', async () => {
        consumeLinkCode.mockReturnValue(null);

        const req = makeRequest({
            message: { chat: { id: 99999 }, text: '/start CESY-ZZZZ' },
        });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(sendTelegramMessage).toHaveBeenCalledWith('99999', expect.stringContaining('Invalid'));
    });

    it('handles /start without code', async () => {
        const req = makeRequest({
            message: { chat: { id: 99999 }, text: '/start' },
        });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(sendTelegramMessage).toHaveBeenCalledWith('99999', expect.stringContaining('Welcome'));
    });

    it('handles unknown messages', async () => {
        const req = makeRequest({
            message: { chat: { id: 99999 }, text: 'hello' },
        });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(sendTelegramMessage).toHaveBeenCalledWith('99999', expect.stringContaining('notification bot'));
    });

    it('handles updates with no message text', async () => {
        const req = makeRequest({ message: { chat: { id: 99999 } } });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
        const req = makeRequest(null); // Will cause json() to fail if not handled
        // The route should always return 200 to Telegram
        const res = await POST({
            json: () => Promise.reject(new Error('Parse error')),
        });

        expect(res.status).toBe(200);
    });
});
