/**
 * Tests for POST /api/search (Perplexity proxy)
 */
import { POST } from '@/app/api/search/route';

const originalFetch = global.fetch;

function makeRequest(body) {
    return { json: async () => body };
}

describe('POST /api/search', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.PERPLEXITY_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('returns 500 when PERPLEXITY_API_KEY is missing', async () => {
        delete process.env.PERPLEXITY_API_KEY;
        const res = await POST(makeRequest({ query: 'test' }));
        const data = await res.json();
        expect(res.status).toBe(500);
        expect(data.error).toContain('PERPLEXITY_API_KEY');
    });

    it('returns 400 when query is missing', async () => {
        const res = await POST(makeRequest({}));
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.error).toContain('query');
    });

    it('returns search results with citations', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'The answer is 42.' } }],
                citations: ['https://example.com/1', 'https://example.com/2'],
            }),
        });

        const res = await POST(makeRequest({ query: 'meaning of life' }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.answer).toBe('The answer is 42.');
        expect(data.citations).toHaveLength(2);
    });

    it('returns results without citations', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'No sources here.' } }],
            }),
        });

        const res = await POST(makeRequest({ query: 'test query' }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.answer).toBe('No sources here.');
        expect(data.citations).toEqual([]);
    });

    it('handles Perplexity API error', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => 'Rate limited',
        });

        const res = await POST(makeRequest({ query: 'test' }));
        const data = await res.json();

        expect(res.status).toBe(429);
        expect(data.error).toContain('Search failed');
    });

    it('handles network error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const res = await POST(makeRequest({ query: 'test' }));
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toContain('Network error');
    });
});
