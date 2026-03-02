import { NextResponse } from 'next/server';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// POST /api/chat — Send message to Claude and get response
export async function POST(request) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
        }

        const { messages, systemPrompt } = await request.json();

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
        }

        const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 512,
                system: systemPrompt || '',
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Anthropic API error:', data);
            return NextResponse.json(
                { error: data.error?.message || 'Anthropic API error' },
                { status: res.status }
            );
        }

        const responseText = data.content?.[0]?.text || 'No response received.';

        return NextResponse.json({
            message: responseText,
            model: data.model,
            usage: data.usage,
        });
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
