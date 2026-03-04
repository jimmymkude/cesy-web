import { NextResponse } from 'next/server';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

/**
 * POST /api/voice-filler
 *
 * Generates a short thinking sound ("Hmm...", "Ah...") using claude-sonnet for quality.
 * Accepts previousFillers for context continuity in the loop.
 */
export async function POST(request) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
        }

        const { transcript, previousFillers = [] } = await request.json();
        if (!transcript) {
            return NextResponse.json({ error: 'Missing transcript' }, { status: 400 });
        }

        // Build conversation history: alternate filler turns so Claude knows what was already said
        const messages = [];
        for (const f of previousFillers) {
            messages.push({ role: 'user', content: transcript });
            messages.push({ role: 'assistant', content: f });
        }
        // Current turn
        messages.push({ role: 'user', content: transcript });

        const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 20,
                system: `You generate single thinking sounds for a voice AI while it processes a request.
Output ONLY the sound — no explanation, no punctuation except "...", nothing else.

Good examples: "Hmm...", "Uh...", "Ah...", "Mmm...", "Uhh, yeah...", "Oh..."
Bad examples: "Let me think about that", "Okay let me see", "Sure, one moment" — too long and robotic.

Rules:
- Prefer very short sounds (1-4 words max)
- Do NOT repeat or paraphrase anything from the previous fillers
- Do NOT start with the same word as the last filler
- Sound like a real person thinking, not a chatbot stalling
- Always end with "..."`,
                messages,
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
