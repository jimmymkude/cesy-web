import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

// POST /api/elevenlabs/tts — Text to speech
export async function POST(request) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
        }

        const { voiceId, text, model } = await request.json();

        if (!voiceId || !text) {
            return NextResponse.json({ error: 'Missing voiceId or text' }, { status: 400 });
        }

        const res = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text,
                model_id: model || 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('ElevenLabs error:', errText);
            return NextResponse.json({ error: 'TTS generation failed' }, { status: res.status });
        }

        const audioBuffer = await res.arrayBuffer();
        return new NextResponse(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        console.error('TTS error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
