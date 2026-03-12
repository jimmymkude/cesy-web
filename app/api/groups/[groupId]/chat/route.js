import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { TOOLS, executeTool } from '@/lib/tools';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Tools that Cesy can use in group chat
const GROUP_TOOLS = ['search_memories', 'web_search', 'get_current_time', 'calculate'];

/**
 * Check if Cesy should respond to a group message.
 * She responds when directly addressed or when asked a fitness/workout question.
 */
function shouldCesyRespond(content) {
    const lower = content.toLowerCase();
    // Direct address
    if (/\b(cesy|@cesy|hey cesy|yo cesy)\b/i.test(lower)) return true;
    // Fitness questions (workout, exercise, etc.)
    if (/\b(workout|exercise|training|stretch|warm.?up|protein|calories|sets|reps|routine)\b/.test(lower)) return true;
    return false;
}

/**
 * Build Cesy's system prompt for group chat context.
 */
async function buildGroupSystemPrompt(group, senderId) {
    const memberList = group.members.map((m) => {
        const name = m.user.fullName || m.user.username || 'Unknown';
        const schedule = m.user.workoutSchedule?.schedule;
        let scheduleStr = 'No workout schedule set';
        if (schedule && Array.isArray(schedule)) {
            scheduleStr = schedule.map((s) => `${s.dayOfWeek}: ${s.workoutType}`).join(', ');
        }
        return `- ${name} (@${m.user.username}): Schedule: ${scheduleStr}`;
    }).join('\n');

    // Check if sender has sharePrivateMemories enabled
    const senderMember = group.members.find((m) => m.userId === senderId);
    const canAccessPrivateMemories = senderMember?.sharePrivateMemories === true;

    let memoriesNote = '';
    if (canAccessPrivateMemories && senderId) {
        memoriesNote = `\nThe user speaking (${senderMember.user.fullName}) has shared their private memories with this group. You can use search_memories with their userId to access them when relevant.`;
    } else if (senderId) {
        memoriesNote = `\nThe user speaking has NOT shared their private memories with this group. If they ask you to recall personal memories, let them know they can enable memory sharing in group settings.`;
    }

    // Fetch group memories
    const groupMemories = await prisma.groupMemory.findMany({
        where: { groupId: group.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    const memoriesStr = groupMemories.length > 0
        ? groupMemories.map((m) => `- ${m.content}`).join('\n')
        : 'No group memories yet.';

    return `You are Cesy, an AI fitness assistant in a group chat called "${group.name}".
You have the same warm, witty personality as always, but you're in a group setting.
You can see everyone's workout schedules and help keep the group accountable.

Group Members:
${memberList}

Group Memories:
${memoriesStr}
${memoriesNote}

Guidelines:
- Be yourself — warm, witty, concise. No corporate speak.
- You don't need to respond to every message. Only respond when addressed or when fitness advice is relevant.
- Reference specific members by name when relevant.
- Encourage friendly competition and accountability.
- Keep responses short — this is group chat, not an essay.
- If someone asks about their personal memories and sharing is off, politely tell them to enable it in group settings.

IMPORTANT — Tool limitations:
- You can ONLY use tools on behalf of the person who sent the message (the last [Name]: message).
- You CANNOT set reminders, save memories, or perform actions for other group members.
- If someone asks you to do something for another member (e.g. "remind Marcus to stretch"), suggest that Marcus ask you directly in their own chat.
- In group chat, focus on advice, motivation, and accountability — save tool-heavy actions for 1:1 chats.`;
}

/**
 * GET /api/groups/[groupId]/chat?limit=50&before=cursorId
 * Fetch group chat messages (paginated).
 */
export async function GET(request, { params }) {
    try {
        const { groupId } = await params;
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const before = searchParams.get('before');

        const messages = await prisma.groupMessage.findMany({
            where: {
                groupId,
                ...(before ? { id: { lt: before } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return NextResponse.json({ messages: messages.reverse() });
    } catch (error) {
        console.error('Group chat fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/groups/[groupId]/chat
 * Send a message to group chat. Optionally triggers Cesy response.
 * Body: { userId, userName, content }
 */
export async function POST(request, { params }) {
    try {
        const { groupId } = await params;
        const { userId, userName, content } = await request.json();

        if (!userId || !content?.trim()) {
            return NextResponse.json({ error: 'Missing userId or content' }, { status: 400 });
        }

        // Verify membership
        const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });
        if (!member) {
            return NextResponse.json({ error: 'Not a member' }, { status: 403 });
        }

        // Save the user message
        const userMsg = await prisma.groupMessage.create({
            data: {
                groupId,
                userId,
                userName: userName || 'User',
                role: 'user',
                content: content.trim(),
            },
        });

        // Check if Cesy should respond
        let cesyMessage = null;
        if (shouldCesyRespond(content)) {
            try {
                const apiKey = process.env.ANTHROPIC_API_KEY;
                if (apiKey) {
                    // Fetch group with members for context
                    const group = await prisma.group.findUnique({
                        where: { id: groupId },
                        include: {
                            members: {
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            username: true,
                                            fullName: true,
                                            workoutSchedule: true,
                                        },
                                    },
                                },
                            },
                        },
                    });

                    const systemPrompt = await buildGroupSystemPrompt(group, userId);

                    // Smart context: fetch messages since Cesy's last response + 5 before for continuity
                    const lastCesyMsg = await prisma.groupMessage.findFirst({
                        where: { groupId, role: 'assistant' },
                        orderBy: { createdAt: 'desc' },
                    });

                    let recentMessages;
                    if (lastCesyMsg) {
                        // Msgs since Cesy last spoke
                        const msgsSince = await prisma.groupMessage.findMany({
                            where: { groupId, createdAt: { gte: lastCesyMsg.createdAt } },
                            orderBy: { createdAt: 'asc' },
                            take: 30,
                        });
                        // + 5 msgs before for conversational continuity
                        const msgsBefore = await prisma.groupMessage.findMany({
                            where: { groupId, createdAt: { lt: lastCesyMsg.createdAt } },
                            orderBy: { createdAt: 'desc' },
                            take: 5,
                        });
                        recentMessages = [...msgsBefore.reverse(), ...msgsSince];
                    } else {
                        // First Cesy interaction — just use last 20
                        recentMessages = await prisma.groupMessage.findMany({
                            where: { groupId },
                            orderBy: { createdAt: 'desc' },
                            take: 20,
                        });
                        recentMessages = recentMessages.reverse();
                    }

                    const chatMessages = recentMessages.map((m) => ({
                        role: m.role,
                        content: m.role === 'user' ? `[${m.userName}]: ${m.content}` : m.content,
                    }));

                    // Filter tools to group-safe subset
                    const groupTools = TOOLS.filter((t) => GROUP_TOOLS.includes(t.name));

                    // Call Claude
                    let currentMessages = chatMessages;
                    let finalResponse = null;
                    let iterations = 0;

                    while (iterations < 5) {
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
                                system: systemPrompt,
                                messages: currentMessages,
                                tools: groupTools.length > 0 ? groupTools : undefined,
                            }),
                        });

                        const data = await res.json();
                        if (!res.ok) break;

                        if (data.stop_reason === 'tool_use') {
                            currentMessages.push({ role: 'assistant', content: data.content });
                            const toolResults = [];
                            for (const block of data.content) {
                                if (block.type === 'tool_use') {
                                    const result = await executeTool(block.name, block.input, userId);
                                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
                                }
                            }
                            currentMessages.push({ role: 'user', content: toolResults });
                        } else {
                            finalResponse = data;
                            break;
                        }
                    }

                    if (finalResponse) {
                        const responseText = finalResponse.content
                            ?.filter((b) => b.type === 'text')
                            .map((b) => b.text)
                            .join('') || '';

                        if (responseText.trim()) {
                            cesyMessage = await prisma.groupMessage.create({
                                data: {
                                    groupId,
                                    userId: null,
                                    userName: 'Cesy',
                                    role: 'assistant',
                                    content: responseText.trim(),
                                },
                            });
                        }
                    }
                }
            } catch (cesyErr) {
                console.error('Cesy group response error:', cesyErr);
                // Don't fail the whole request if Cesy can't respond
            }
        }

        return NextResponse.json({
            message: userMsg,
            cesyMessage,
        }, { status: 201 });
    } catch (error) {
        console.error('Group chat send error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export { shouldCesyRespond, buildGroupSystemPrompt };
