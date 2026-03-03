/**
 * Tests for /api/telegram/link — Generate link codes
 */
import { POST } from '@/app/api/telegram/link/route';

jest.mock('@/lib/telegram', () => ({
    createLinkCode: jest.fn().mockReturnValue('CESY-TEST'),
}));

function makeRequest(body) {
    return {
        json: () => Promise.resolve(body),
    };
}

describe('POST /api/telegram/link', () => {
    it('generates a link code for valid userId', async () => {
        const req = makeRequest({ userId: 'u1' });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.code).toBe('CESY-TEST');
        expect(data.expiresIn).toBe('10 minutes');
        expect(data.instructions).toContain('/start CESY-TEST');
    });

    it('returns 400 when userId is missing', async () => {
        const req = makeRequest({});
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toContain('Missing userId');
    });
});
