import { TOOLS, executeTool } from '@/lib/tools';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Tools that require a userId to function
const USER_SCOPED_TOOLS = [
    'save_memory', 'search_memories', 'update_memory', 'delete_memory',
    'set_reminder', 'cancel_reminder', 'get_calendar', 'manage_workout', 'set_timer',
    'send_notification',
];

/**
 * POST /api/voice-stream
 * 
 * Runs the full tool-use loop first (tools don't support streaming well),
 * then streams the final text response sentence-by-sentence as newline-delimited JSON.
 * 
 * Client reads chunks like: {"sentence": "Hey, I'm doing great!"}
 * Special sentinel at end:  {"done": true, "fullText": "..."}
 */
export async function POST(request) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
    }

    const { messages, systemPrompt, userId } = await request.json();

    if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing messages' }), { status: 400 });
    }

    let currentMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    // ── Step 1: Run tool loop (non-streaming) ─────────────────────────────
    let finalResponse = null;
    let iterations = 0;
    const MAX_ITERATIONS = 15; // Safety limit — workout creation needs ~8-10
    const timersMeta = [];

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024, // Voice replies should be short
                system: systemPrompt || '',
                messages: currentMessages,
                tools: TOOLS,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error' }), { status: res.status });
        }

        if (data.stop_reason === 'tool_use') {
            currentMessages.push({ role: 'assistant', content: data.content });
            const toolResults = [];
            for (const block of data.content) {
                if (block.type === 'tool_use') {
                    let result;
                    const needsUserId = USER_SCOPED_TOOLS.includes(block.name);
                    if (needsUserId && !userId) {
                        result = 'No user ID available for this operation.';
                    } else {
                        result = await executeTool(block.name, block.input, userId);
                    }

                    if (block.name === 'set_timer' && typeof result === 'string') {
                        try {
                            const parsed = JSON.parse(result);
                            if (parsed.__timer) {
                                timersMeta.push(parsed.__timer);
                                result = parsed.message;
                            }
                        } catch { /* not JSON */ }
                    }

                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
                }
            }
            currentMessages.push({ role: 'user', content: toolResults });
        } else {
            finalResponse = data;
            break;
        }
    }

    if (!finalResponse) {
        return new Response(JSON.stringify({ error: 'Tool use loop exceeded max iterations' }), { status: 500 });
    }

    const fullText =
        finalResponse.content
            ?.filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('') || '';

    // ── Step 2: Stream the final text sentence-by-sentence ────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Split into sentences on .  !  ?  followed by space or end
            const sentenceRegex = /[^.!?]+[.!?]+[\s]*/g;
            const sentences = [];
            let match;
            while ((match = sentenceRegex.exec(fullText)) !== null) {
                const s = match[0].trim();
                if (s) sentences.push(s);
            }
            // If no sentence boundaries found (e.g. short reply with no punctuation), emit as single chunk
            if (sentences.length === 0 && fullText.trim()) {
                sentences.push(fullText.trim());
            }

            for (const sentence of sentences) {
                controller.enqueue(encoder.encode(JSON.stringify({ sentence }) + '\n'));
            }

            // Send done sentinel with full text + any timer metadata
            const done = { done: true, fullText };
            if (timersMeta.length > 0) done.timers = timersMeta;
            controller.enqueue(encoder.encode(JSON.stringify(done) + '\n'));
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        },
    });
}
