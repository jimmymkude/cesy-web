import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { TOOLS, executeTool } from '@/lib/tools';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// ─── Group Tool Access Control ──────────────────────────────────────

// Tools that are NOT user-scoped (safe for anyone)
const GLOBAL_TOOLS = ['web_search', 'get_weather', 'get_current_time', 'is_time_past', 'run_calculation'];

// Tools allowed for OTHER users (cross-user)
const CROSS_USER_ALLOWED = ['search_memories', 'set_reminder', 'get_calendar'];

// Tools that require sharePrivateMemories to be enabled on the target
const REQUIRES_MEMORY_SHARING = ['search_memories'];

// Tools ONLY allowed for the speaker (self-only in group)
const SELF_ONLY_TOOLS = [
    'save_memory', 'update_memory', 'delete_memory',
    'cancel_reminder', 'update_reminder',
    'manage_workout', 'set_timer', 'send_notification',
    'mark_workout_complete', 'amazon_cart',
];

// All tools available in group chat (global + cross-user + self-only)
const GROUP_TOOL_NAMES = [...GLOBAL_TOOLS, ...CROSS_USER_ALLOWED, ...SELF_ONLY_TOOLS];

/**
 * Build group-specific tool definitions.
 * Adds targetUserId to cross-user tools so Cesy can specify which member to act on.
 */
function buildGroupToolDefinitions() {
    const baseDefs = TOOLS.filter((t) => GROUP_TOOL_NAMES.includes(t.name));

    return baseDefs.map((tool) => {
        if (CROSS_USER_ALLOWED.includes(tool.name)) {
            // Clone and add targetUserId property
            return {
                ...tool,
                input_schema: {
                    ...tool.input_schema,
                    properties: {
                        ...tool.input_schema.properties,
                        targetUserId: {
                            type: 'string',
                            description:
                                'The userId of the group member to perform this action for. If omitted, defaults to the person who sent the message. Use this when another member asks for help.',
                        },
                    },
                },
            };
        }
        return tool;
    });
}

/**
 * Execute a tool in group context with permission checks.
 *
 * @param {string} toolName - The tool to execute
 * @param {object} toolInput - Tool input from Claude
 * @param {string} senderId - The userId of the person who sent the message
 * @param {object} groupContext - { members: [{ userId, sharePrivateMemories, user: { fullName } }] }
 * @returns {string} Tool result or a friendly denial message
 */
async function executeGroupTool(toolName, toolInput, senderId, groupContext) {
    // Extract target — Claude may specify targetUserId, otherwise it's the sender
    const targetUserId = toolInput.targetUserId || senderId;
    const isCrossUser = targetUserId !== senderId;

    // Find the target member in the group
    const targetMember = groupContext.members.find((m) => m.userId === targetUserId);
    const targetName = targetMember?.user?.fullName?.split(' ')[0] || 'that user';

    // ── Global tools: always allowed, no userId needed ──
    if (GLOBAL_TOOLS.includes(toolName)) {
        return executeTool(toolName, toolInput, senderId);
    }

    // ── Self-only tools: block cross-user usage ──
    if (SELF_ONLY_TOOLS.includes(toolName) && isCrossUser) {
        return `I can't ${toolName.replace(/_/g, ' ')} for ${targetName} — that's a personal action only they can do in their own chat with me. Maybe give them a nudge to do it themselves! 😉`;
    }

    // ── Cross-user tools: check permissions ──
    if (isCrossUser && CROSS_USER_ALLOWED.includes(toolName)) {
        // Check if target is actually in the group
        if (!targetMember) {
            return `I don't see a member with that ID in this group. Double-check the userId!`;
        }
    }

    // ── Memory sharing check: applies to ALL users (including sender) ──
    // In group chat, tool results are visible to everyone, so even the sender's
    // own memories should only be searchable if they've opted in to sharing.
    if (REQUIRES_MEMORY_SHARING.includes(toolName)) {
        const memberToCheck = groupContext.members.find((m) => m.userId === targetUserId);
        const name = memberToCheck?.user?.fullName?.split(' ')[0] || 'that user';
        if (!memberToCheck?.sharePrivateMemories) {
            if (targetUserId === senderId) {
                return `Your memory sharing is turned off for this group, so I can't search your memories here. Turn it on in the Members tab if you'd like me to access them in group chat! 🔒`;
            }
            return `${name} hasn't enabled memory sharing for this group, so I can't access their memories. They can turn it on in the Members tab if they want to share! 🔒`;
        }
    }

    // Strip targetUserId before passing to executeTool (it doesn't know about it)
    const { targetUserId: _removed, ...cleanInput } = toolInput;
    return executeTool(toolName, cleanInput, targetUserId);
}

// ─── Cesy Response Logic ────────────────────────────────────────────

/**
 * Check if Cesy should respond to a group message.
 */
function shouldCesyRespond(content) {
    const lower = content.toLowerCase();
    if (/\b(cesy|@cesy|hey cesy|yo cesy)\b/i.test(lower)) return true;
    if (/\b(workout|exercise|training|stretch|warm.?up|protein|calories|sets|reps|routine)\b/.test(lower)) return true;
    return false;
}

/**
 * Build Cesy's system prompt for group chat context.
 * Includes userId mappings so Cesy can target specific members with tools.
 */
async function buildGroupSystemPrompt(group, senderId) {
    const senderMember = group.members.find((m) => m.userId === senderId);

    const memberList = group.members.map((m) => {
        const name = m.user.fullName || m.user.username || 'Unknown';
        const schedule = m.user.workoutSchedule?.schedule;
        let scheduleStr = 'No workout schedule set';
        if (schedule && Array.isArray(schedule)) {
            scheduleStr = schedule.map((s) => `${s.dayOfWeek}: ${s.workoutType}`).join(', ');
        }
        const sharingStatus = m.sharePrivateMemories ? '(memories shared ✓)' : '(memories private)';
        const isSpeaker = m.userId === senderId ? ' ← SPEAKING NOW' : '';
        return `- ${name} (@${m.user.username}) [userId: ${m.userId}] ${sharingStatus}${isSpeaker}\n  Schedule: ${scheduleStr}`;
    }).join('\n');

    let memoriesNote = '';
    if (senderMember?.sharePrivateMemories) {
        memoriesNote = `\nThe speaker (${senderMember.user.fullName}) has shared their private memories with this group.`;
    } else if (senderId) {
        memoriesNote = `\nThe speaker has NOT shared their private memories. If they ask about personal memories, suggest enabling sharing in the Members tab.`;
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

    return `You are Cesy, an AI assistant in a group chat called "${group.name}".
You have the same warm, witty personality as always, but you're in a group setting.
You can see everyone's workout schedules and help keep the group accountable.

Group Members (with userIds for tool targeting):
${memberList}

Group Memories:
${memoriesStr}
${memoriesNote}

How to use tools for specific members:
- To act on behalf of a specific member, set "targetUserId" in the tool input to their userId.
- You can search_memories for any member who has "(memories shared ✓)" next to their name.
- You can set_reminder and get_calendar for any member.
- You CANNOT save/update/delete memories, cancel/update reminders, manage workouts, or mark workouts complete for other members — those are personal actions.
- If a disallowed action is requested for another member, your tool will return a helpful message — just relay it with your usual charm.

Guidelines:
- Be yourself — warm, witty, concise. No corporate speak.
- Only respond when addressed or when fitness advice is relevant.
- Reference specific members by name when relevant.
- Encourage friendly competition and accountability.
- Keep responses short — this is group chat, not an essay.
- IMPORTANT: Do NOT share personal memories, private conversations, or personal details from individual chats in the group. If you retrieve personal memories via tools, use them only to personalize your response — never quote or reveal them. The group chat context is ONLY the messages in this conversation.`;
}

// ─── Route Handlers ────────────────────────────────────────────────

/**
 * GET /api/groups/[groupId]/chat?limit=50&before=cursorId
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

                    // Smart context: messages since Cesy's last response + 5 before
                    const lastCesyMsg = await prisma.groupMessage.findFirst({
                        where: { groupId, role: 'assistant' },
                        orderBy: { createdAt: 'desc' },
                    });

                    let recentMessages;
                    if (lastCesyMsg) {
                        const msgsSince = await prisma.groupMessage.findMany({
                            where: { groupId, createdAt: { gte: lastCesyMsg.createdAt } },
                            orderBy: { createdAt: 'asc' },
                            take: 30,
                        });
                        const msgsBefore = await prisma.groupMessage.findMany({
                            where: { groupId, createdAt: { lt: lastCesyMsg.createdAt } },
                            orderBy: { createdAt: 'desc' },
                            take: 5,
                        });
                        recentMessages = [...msgsBefore.reverse(), ...msgsSince];
                    } else {
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

                    // Build group-aware tool definitions
                    const groupTools = buildGroupToolDefinitions();

                    // Call Claude with tool loop
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
                                    // Use executeGroupTool with permission checks
                                    const result = await executeGroupTool(
                                        block.name,
                                        block.input,
                                        userId,
                                        group
                                    );
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

export {
    shouldCesyRespond,
    buildGroupSystemPrompt,
    executeGroupTool,
    buildGroupToolDefinitions,
    GLOBAL_TOOLS,
    CROSS_USER_ALLOWED,
    SELF_ONLY_TOOLS,
    REQUIRES_MEMORY_SHARING,
};
