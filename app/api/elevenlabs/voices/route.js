import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

// GET /api/elevenlabs/voices — List available voices
export async function GET() {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
        }

        const res = await fetch(`${ELEVENLABS_BASE}/v1/voices`, {
            headers: { 'xi-api-key': apiKey },
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch voices' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
