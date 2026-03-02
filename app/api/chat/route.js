import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Tool definitions for Claude
const TOOLS = [
    {
        name: 'save_memory',
        description:
            'Save an important fact or preference about the user for future reference. Use this when the user shares personal information, preferences, goals, habits, or anything worth remembering across conversations. Examples: fitness goals, favorite sports, injuries, dietary preferences, workout history.',
        input_schema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'The fact or preference to remember. Be concise and factual.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to categorize the memory, e.g. ["preference", "fitness"], ["goal", "weight"]',
                },
            },
            required: ['content'],
        },
    },
    {
        name: 'search_memories',
        description:
            'Search your memories about the user to recall previously saved facts, preferences, or context. Use this when you need to personalize a response or when the user references something from a previous conversation.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — a keyword or phrase to find relevant memories.',
                },
            },
            required: ['query'],
        },
    },
];

// Execute a tool call
async function executeTool(toolName, toolInput, userId) {
    switch (toolName) {
        case 'save_memory': {
            const { content, tags = [] } = toolInput;
            // Deduplicate
            const existing = await prisma.memory.findFirst({
                where: { userId, content },
            });
            if (existing) return 'Memory already saved.';

            await prisma.memory.create({
                data: { userId, content, tags },
            });
            return `Saved: "${content}"`;
        }

        case 'search_memories': {
            const { query } = toolInput;
            const memories = await prisma.memory.findMany({
                where: {
                    userId,
                    content: { contains: query, mode: 'insensitive' },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            });

            if (memories.length === 0) {
                return 'No memories found for this query.';
            }

            return memories
                .map((m) => `- ${m.content} (${new Date(m.createdAt).toLocaleDateString()})`)
                .join('\n');
        }

        default:
            return `Unknown tool: ${toolName}`;
    }
}

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
        const MAX_ITERATIONS = 5; // Safety limit

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
                    max_tokens: 1024,
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
                        const result = userId
                            ? await executeTool(block.name, block.input, userId)
                            : 'No user ID available for memory operations.';

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

        return NextResponse.json({
            message: responseText,
            model: finalResponse.model,
            usage: finalResponse.usage,
        });
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
