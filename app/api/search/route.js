import { NextResponse } from 'next/server';

const PERPLEXITY_BASE = 'https://api.perplexity.ai';

/**
 * POST /api/search — Proxy for Perplexity web search
 * Body: { query: string }
 * Returns: { answer: string, citations: string[] }
 */
export async function POST(request) {
    try {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'PERPLEXITY_API_KEY not configured' }, { status: 500 });
        }

        const { query } = await request.json();
        if (!query) {
            return NextResponse.json({ error: 'Missing query' }, { status: 400 });
        }

        const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a research assistant. Provide concise, factual answers with dates and sources when possible. Keep responses under 400 words.',
                    },
                    { role: 'user', content: query },
                ],
                temperature: 0.1,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Perplexity API error:', errText);
            return NextResponse.json({ error: 'Search failed' }, { status: res.status });
        }

        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content || 'No results found.';
        const citations = data.citations || [];

        return NextResponse.json({ answer, citations });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
