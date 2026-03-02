/**
 * Tests for ElevenLabs voices route
 */
import { GET } from '@/app/api/elevenlabs/voices/route';

const originalFetch = global.fetch;

describe('GET /api/elevenlabs/voices', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ELEVENLABS_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns 500 when API key is missing', async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const res = await GET();
        const data = await res.json();
        expect(res.status).toBe(500);
        expect(data.error).toContain('ELEVENLABS_API_KEY');
    });

    it('returns voices list', async () => {
        const voices = [{ voice_id: 'v1', name: 'Voice 1' }];
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ voices }),
        });

        const res = await GET();
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.voices).toEqual(voices);
    });

    it('handles ElevenLabs API failure', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
        });

        const res = await GET();
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toContain('Failed to fetch voices');
    });

    it('handles network error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const res = await GET();
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toContain('Network error');
    });
});
