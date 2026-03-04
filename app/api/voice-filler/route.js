import { NextResponse } from 'next/server';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

/**
 * POST /api/voice-filler
 *
 * Generates a short, contextually appropriate thinking filler
 * (like "Hmm, let me think..." or "Ah, got it...") from the user's transcript.
 * Uses claude-haiku for speed (~300-500ms response time).
 */
export async function POST(request) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
        }

        const { transcript } = await request.json();
        if (!transcript) {
            return NextResponse.json({ error: 'Missing transcript' }, { status: 400 });
        }

        const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-20250514',
                max_tokens: 30,
                system: `You are an AI assistant thinking out loud while processing a user's message.
Generate a single, natural-sounding thinking filler phrase appropriate for the user's input.
Rules:
- 3 to 7 words maximum
- Sound human and natural, like a real person thinking
- Match the tone: casual for greetings, thoughtful for questions, acknowledging for statements
- Use natural filler words: "Hmm", "Uhh", "Oh", "Ah", "Let me see", "Mhm", etc.
- Include a trailing "..." to signal thinking
- Reply with ONLY the filler phrase, nothing else`,
                messages: [{ role: 'user', content: transcript }],
            }),
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Filler generation failed' }, { status: res.status });
        }

        const data = await res.json();
        const filler = data.content?.[0]?.text?.trim() || 'Hmm...';

        return NextResponse.json({ filler });
    } catch (error) {
        console.error('Voice filler error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
