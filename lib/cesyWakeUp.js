/**
 * Cesy Wake-Up Utility
 *
 * "Wakes up" Cesy for server-side proactive messaging (e.g., workout reminders).
 * Replicates the chat API tool loop: full system prompt, all tools, executeTool.
 * Returns Cesy's final text response.
 */
import { TOOLS, executeTool } from '@/lib/tools';
import { ASSISTANT } from '@/lib/constants';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Tools that require a userId
const USER_SCOPED_TOOLS = [
    'save_memory', 'search_memories', 'update_memory', 'delete_memory',
    'set_reminder', 'cancel_reminder', 'get_calendar', 'manage_workout', 'set_timer',
    'send_notification',
];

/**
 * Build Cesy's full system prompt for server-side use.
 * Same personality + temporal awareness as ChatContext.js, but built server-side.
 */
function buildServerSystemPrompt(extraContext = '') {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    const isoStr = now.toISOString();
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

    let prompt = `Your name is Cesy. ${ASSISTANT.instructions}`;

    prompt += `\n\n⏰ CURRENT TIME (ground truth — ALWAYS use this for any time/date reasoning):\n- Local: ${dateStr}, ${timeStr}\n- Timezone: ${tzName}\n- ISO: ${isoStr}`;

    prompt += `\n\nYou have access to tools for searching user memories (search_memories), managing reminders, and more. Use search_memories to gather relevant context about the user before crafting your message.`;

    prompt += `\n\nSave memories generously. Anything that helps you know the user better is worth saving.`;

    if (extraContext) {
        prompt += `\n\n${extraContext}`;
    }

    return prompt;
}

/**
 * Wake up Cesy with a trigger message and get her response.
 *
 * @param {string} triggerMessage - The context/prompt to wake Cesy with
 * @param {string} userId - The user's DB ID (for tool execution)
 * @param {object} options - Optional overrides
 * @param {string} options.extraContext - Additional system prompt context
 * @param {number} options.maxIterations - Max tool loop iterations (default: 5)
 * @returns {Promise<string|null>} Cesy's text response, or null on failure
 */
export async function wakeUpCesy(triggerMessage, userId, options = {}) {
    const { extraContext = '', maxIterations = 5 } = options;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        console.error('[CesyWakeUp] ANTHROPIC_API_KEY not configured');
        return null;
    }

    const systemPrompt = buildServerSystemPrompt(extraContext);

    let currentMessages = [{ role: 'user', content: triggerMessage }];
    let iterations = 0;

    while (iterations < maxIterations) {
        iterations++;

        let res;
        try {
            res = await fetch(`${ANTHROPIC_BASE}/messages`, {
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
                    tools: TOOLS,
                }),
            });
        } catch (error) {
            console.error('[CesyWakeUp] Fetch error:', error);
            return null;
        }

        const data = await res.json();

        if (!res.ok) {
            console.error('[CesyWakeUp] Anthropic API error:', data);
            return null;
        }

        const toolNames = data.content?.filter(b => b.type === 'tool_use').map(b => b.name).join(',') || 'none';
        console.log(`[CesyWakeUp] iteration=${iterations} stop_reason=${data.stop_reason} tools=${toolNames}`);

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

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: typeof result === 'string' ? result : JSON.stringify(result),
                    });
                }
            }

            currentMessages.push({ role: 'user', content: toolResults });
        } else {
            // Claude finished — extract text
            const text = data.content
                ?.filter(b => b.type === 'text')
                .map(b => b.text)
                .join('');

            return text || null;
        }
    }

    // Exceeded max iterations — try to extract any text from the last response
    console.warn('[CesyWakeUp] Exceeded max iterations');
    return null;
}

// Export for testing
export { buildServerSystemPrompt };
