import { NextResponse } from 'next/server';
import { TOOLS, executeTool } from '@/lib/tools';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Tools that require a userId to function
const USER_SCOPED_TOOLS = [
    'save_memory', 'search_memories', 'update_memory', 'delete_memory',
    'set_reminder', 'cancel_reminder', 'get_calendar', 'manage_workout', 'set_timer',
    'send_notification',
];

// POST /api/chat — Send message to Claude with tool use support
export async function POST(request) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
        }

        const { messages, systemPrompt, userId } = await request.json();

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
        }

        // Build the initial request
        let currentMessages = messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // Tool use loop — Claude may call tools, we execute and respond
        let finalResponse = null;
        let iterations = 0;
        const MAX_ITERATIONS = 15; // Safety limit — workout creation needs ~8-10
        const timersMeta = []; // Collect timer metadata for frontend
        const amazonCarts = []; // Collect Amazon cart links for frontend

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
                    max_tokens: 4096,
                    system: systemPrompt || '',
                    messages: currentMessages,
                    tools: TOOLS,
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

            // Check if Claude wants to use tools
            if (data.stop_reason === 'tool_use') {
                // Add Claude's response (with tool_use blocks) to messages
                currentMessages.push({ role: 'assistant', content: data.content });

                // Execute each tool call and collect results
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

                        // Extract timer metadata if present
                        if (block.name === 'set_timer' && typeof result === 'string') {
                            try {
                                const parsed = JSON.parse(result);
                                if (parsed.__timer) {
                                    timersMeta.push(parsed.__timer);
                                    result = parsed.message; // Use the clean message for Claude
                                }
                            } catch { /* not JSON, use as-is */ }
                        }

                        // Extract Amazon cart metadata if present
                        if (block.name === 'amazon_cart' && typeof result === 'string') {
                            try {
                                const parsed = JSON.parse(result);
                                if (parsed.__amazon_cart) {
                                    amazonCarts.push(parsed.__amazon_cart);
                                    result = parsed.message;
                                }
                            } catch { /* not JSON, use as-is */ }
                        }

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: result,
                        });
                    }
                }

                // Add tool results and continue the loop
                currentMessages.push({ role: 'user', content: toolResults });
            } else {
                // Claude finished — extract the text response
                finalResponse = data;
                break;
            }
        }

        if (!finalResponse) {
            return NextResponse.json({ error: 'Tool use loop exceeded max iterations' }, { status: 500 });
        }

        const responseText =
            finalResponse.content
                ?.filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('') || 'No response received.';

        const response = {
            message: responseText,
            model: finalResponse.model,
            usage: finalResponse.usage,
        };

        // Include timer metadata if any timers were set
        if (timersMeta.length > 0) {
            response.timers = timersMeta;
        }

        // Include Amazon cart links if any were generated
        if (amazonCarts.length > 0) {
            response.amazonCarts = amazonCarts;
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
