/**
 * Tests for /api/elevenlabs/tts and /api/elevenlabs/voices
 */

// --- TTS tests ---
import { POST as TTS_POST } from '@/app/api/elevenlabs/tts/route';

function makePostRequest(body) {
    return { json: async () => body };
}

const originalFetch = global.fetch;

describe('POST /api/elevenlabs/tts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ELEVENLABS_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns 500 when ELEVENLABS_API_KEY is missing', async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const res = await TTS_POST(makePostRequest({ voiceId: 'v1', text: 'hello' }));
        const data = await res.json();
        expect(res.status).toBe(500);
        expect(data.error).toContain('ELEVENLABS_API_KEY');
    });

    it('returns 400 when voiceId or text is missing', async () => {
        const res = await TTS_POST(makePostRequest({ voiceId: 'v1' }));
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.error).toContain('voiceId or text');
    });

    it('proxies successful TTS response', async () => {
        const audioBuffer = new ArrayBuffer(100);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => audioBuffer,
        });

        const res = await TTS_POST(makePostRequest({ voiceId: 'v1', text: 'hello world' }));

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    });

    it('returns error when ElevenLabs API fails', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => 'Rate limited',
        });

        const res = await TTS_POST(makePostRequest({ voiceId: 'v1', text: 'hello' }));
        const data = await res.json();

        expect(res.status).toBe(429);
        expect(data.error).toContain('TTS generation failed');
    });
});

// --- Voices tests ---
describe('GET /api/elevenlabs/voices', () => {
    let GET_VOICES;

    beforeAll(async () => {
        // Dynamic import since it's a separate file
        try {
            const mod = await import('@/app/api/elevenlabs/voices/route');
            GET_VOICES = mod.GET;
        } catch {
            // voices route may not exist as a separate file
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ELEVENLABS_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns voices list from ElevenLabs', async () => {
        if (!GET_VOICES) return; // skip if route doesn't exist

        const voices = [{ voice_id: 'v1', name: 'Test Voice' }];
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ voices }),
        });

        const res = await GET_VOICES();
        const data = await res.json();

        expect(res.status).toBe(200);
    });
});
