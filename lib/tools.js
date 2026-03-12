/**
 * Cesy AI Agent Tools
 *
 * All Claude tool definitions and their execution logic.
 * Extracted from route.js for testability.
 */
import prisma from '@/lib/prisma';
import { sendNotificationToUser } from '@/lib/telegram';

// ─── Embedding / Semantic Search Helpers ─────────────────────────────
const EMBEDDING_MODEL = 'voyage-3-lite'; // 512 dimensions

/**
 * Generate a vector embedding using Voyage AI (Anthropic's recommended embeddings).
 * Returns an array of floats or null if VOYAGE_API_KEY is not set.
 */
export async function generateEmbedding(text) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) return null;

    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
        }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
}

/**
 * Format a float array as a pgvector literal string: '[0.1,0.2,0.3]'
 */
export function toVectorLiteral(arr) {
    return `[${arr.join(',')}]`;
}

// ─── Tool Definitions ────────────────────────────────────────────────
export const TOOLS = [
    {
        name: 'save_memory',
        description:
            'Save a fact, preference, opinion, habit, interest, or upcoming event about the user. Be generous — save anything that helps you know the user better: small details, casual mentions, preferences, goals, moods, routines, relationships. For events, always include an eventDate and tag with "event". The system handles deduplication automatically, so don\'t worry about saving something similar to an existing memory.',
        input_schema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'The fact, preference, or event to remember. Be concise and factual.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to categorize the memory, e.g. ["preference", "fitness"]. Use ["event"] for upcoming events.',
                },
                eventDate: {
                    type: 'string',
                    description: 'Optional ISO 8601 datetime for events/plans. Use this when the user mentions something happening on a specific day or time. IMPORTANT: Always include the exact local time and timezone offset (e.g. "2026-03-04T13:40:00-08:00" for 1:40 PM PST). If no time is specified, default to noon local time (e.g. "2026-03-04T12:00:00-08:00"). Never use UTC (Z) unless the user explicitly specifies UTC.',
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
    {
        name: 'update_memory',
        description:
            'Update an existing memory about the user. Use this when the user corrects or updates a previously saved fact, preference, or event detail (e.g. adding a time to an event).',
        input_schema: {
            type: 'object',
            properties: {
                search: {
                    type: 'string',
                    description: 'A keyword or phrase to find the memory to update.',
                },
                newContent: {
                    type: 'string',
                    description: 'The updated content to replace the old memory with.',
                },
                eventDate: {
                    type: 'string',
                    description: 'Optional ISO 8601 datetime to set or update the event date on this memory. IMPORTANT: Always include the exact local time and timezone offset (e.g. "2026-03-04T13:40:00-08:00" for 1:40 PM PST). Never use UTC (Z) unless the user explicitly specifies UTC.',
                },
            },
            required: ['search', 'newContent'],
        },
    },
    {
        name: 'delete_memory',
        description:
            'Delete a previously saved memory about the user. Use this when the user asks you to forget something or when a memory is no longer relevant.',
        input_schema: {
            type: 'object',
            properties: {
                search: {
                    type: 'string',
                    description: 'A keyword or phrase to find the memory to delete.',
                },
            },
            required: ['search'],
        },
    },
    {
        name: 'web_search',
        description:
            'Search the web for real-time information. Use this when the user asks about current events, news, weather, sports scores, recent developments, or anything that requires up-to-date information.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Web search query — be specific and include context for better results.',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'set_reminder',
        description:
            'Create a reminder for the user. Use this when the user asks to be reminded about something at a specific time or date. Always include a deliveryMessage — a short, personal Telegram message in your voice (Cesy) that will be sent when the reminder fires.',
        input_schema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'What to remind the user about.',
                },
                dueAt: {
                    type: 'string',
                    description: 'When the reminder is due, as an ISO 8601 date/time string or natural description like "2024-03-15T10:00:00" or "tomorrow at 9am".',
                },
                deliveryMessage: {
                    type: 'string',
                    description: 'A short, personalized message in your voice that will be sent via Telegram when the reminder fires. Make it fun, motivational, or witty — it should feel like it is coming from you, Cesy.',
                },
            },
            required: ['content', 'dueAt', 'deliveryMessage'],
        },
    },
    {
        name: 'cancel_reminder',
        description:
            'Cancel an active reminder for the user. Use this when the user asks to cancel, remove, or delete a reminder. Searches by content match.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'A keyword or phrase to match against existing reminder content. Will find the best match.',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'update_reminder',
        description:
            'Update an existing reminder. Use this when the user wants to change the time, content, or delivery message of a reminder. Searches by content match.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'A keyword or phrase to match against existing reminder content.',
                },
                newDueAt: {
                    type: 'string',
                    description: 'New due date/time as ISO 8601 string. Only provide if the time needs to change.',
                },
                newContent: {
                    type: 'string',
                    description: 'New reminder content. Only provide if the description needs to change.',
                },
                newDeliveryMessage: {
                    type: 'string',
                    description: 'New Telegram delivery message in your voice. Only provide if the message needs to change.',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_calendar',
        description:
            'Get the user\'s reminders and workout schedule. If a date is provided, returns the schedule for that day. If no date is given, returns ALL upcoming reminders and the full weekly workout schedule. Use this when the user asks about their schedule, upcoming reminders, or what they have planned.',
        input_schema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Optional ISO date string (YYYY-MM-DD). If omitted, returns all upcoming reminders and the full workout schedule.',
                },
            },
        },
    },
    {
        name: 'get_weather',
        description:
            'Get the current weather for a location. Use this when the user asks about weather conditions, temperature, or if they should bring an umbrella.',
        input_schema: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'City name or "City, Country Code" (e.g. "Dar es Salaam", "London, GB").',
                },
            },
            required: ['location'],
        },
    },
    {
        name: 'get_current_time',
        description:
            'Get the current date and time. Use this to verify the current time before making any time-sensitive statements. Returns local time, timezone, and day of week.',
        input_schema: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'IANA timezone (e.g. "America/Los_Angeles", "Africa/Dar_es_Salaam"). Defaults to UTC if not provided.',
                },
            },
        },
    },
    {
        name: 'is_time_past',
        description:
            'Check if a specific date/time has already happened or is in the future. Returns whether the time is past or future along with the exact time difference. ALWAYS use this to verify event times before telling the user about them.',
        input_schema: {
            type: 'object',
            properties: {
                datetime: {
                    type: 'string',
                    description: 'The date/time to check, as an ISO 8601 string (e.g. "2026-03-06T15:00:00-08:00").',
                },
                timezone: {
                    type: 'string',
                    description: 'IANA timezone for display (e.g. "America/Los_Angeles").',
                },
            },
            required: ['datetime'],
        },
    },
    {
        name: 'send_notification',
        description:
            'Send a notification message to the user via their preferred channel. Use this when the user asks to be notified about something or when you want to proactively alert them.',
        input_schema: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'The notification message to send.',
                },
                channel: {
                    type: 'string',
                    description: 'Notification channel: "push" or "telegram". Defaults to "telegram".',
                },
            },
            required: ['message'],
        },
    },
    {
        name: 'run_calculation',
        description:
            'Evaluate a mathematical expression. Use this for any calculations the user requests — unit conversions, BMI, percentages, compound interest, etc.',
        input_schema: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'A math expression to evaluate, e.g. "(180 / (1.75 * 1.75))" or "Math.sqrt(144)". Supports standard operators and Math functions.',
                },
            },
            required: ['expression'],
        },
    },
    {
        name: 'manage_workout',
        description:
            'Add, remove, or update workout entries in the user\'s workout schedule. Use this when the user wants to modify their workout plan. Always include a personalized motivational "note" — this appears on the user\'s workout card as your personal coaching tip.',
        input_schema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description: 'One of: "add", "remove", "update".',
                },
                dayOfWeek: {
                    type: 'integer',
                    description: 'Day of the week (0=Sunday, 1=Monday, ... 6=Saturday).',
                },
                workoutType: {
                    type: 'string',
                    description: 'Type of workout (e.g. "Running", "Basketball", "Yoga").',
                },
                duration: {
                    type: 'integer',
                    description: 'Duration in minutes. Defaults to 45.',
                },
                equipment: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Equipment needed (e.g. ["Dumbbells", "Yoga Mat"]).',
                },
                note: {
                    type: 'string',
                    description: 'A short, personalized motivational tip for this day (e.g. "Push for a new PR on bench — you\'ve been building up to this"). Required for add/update.',
                },
            },
            required: ['action', 'dayOfWeek'],
        },
    },
    {
        name: 'set_timer',
        description:
            'Start a countdown timer. Use this when the user asks to set a timer for a specific duration — cooking timers, workout intervals, break reminders, etc.',
        input_schema: {
            type: 'object',
            properties: {
                label: {
                    type: 'string',
                    description: 'A label for the timer (e.g. "Cooking pasta", "Rest period").',
                },
                durationSeconds: {
                    type: 'integer',
                    description: 'Timer duration in seconds.',
                },
            },
            required: ['label', 'durationSeconds'],
        },
    },
    {
        name: 'amazon_cart',
        description:
            'Generate Amazon shopping links with affiliate tracking for items the user wants to buy. Just pass the product names — no ASIN needed.',
        input_schema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: 'Array of items the user wants to buy.',
                    items: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Product name / search query.',
                            },
                            quantity: {
                                type: 'integer',
                                description: 'Number of units. Defaults to 1.',
                            },
                        },
                        required: ['name'],
                    },
                },
            },
            required: ['items'],
        },
    },
    {
        name: 'mark_workout_complete',
        description:
            'Mark the user\'s workout as completed for today. Creates a workout log entry. Use this when the user says they finished their workout, e.g. "just finished my run" or "completed chest day".',
        input_schema: {
            type: 'object',
            properties: {
                workoutType: {
                    type: 'string',
                    description: 'The type of workout completed (e.g. "Running", "Chest & Triceps", "Yoga").',
                },
                duration: {
                    type: 'integer',
                    description: 'Duration in minutes (optional).',
                },
                notes: {
                    type: 'string',
                    description: 'Optional notes about the workout.',
                },
            },
            required: ['workoutType'],
        },
    },
];

// ─── Safe Math Evaluator ─────────────────────────────────────────────
const SAFE_MATH_PATTERN = /^[\d\s+\-*/().,%eE]+$|Math\.\w+/;
const BLOCKED_KEYWORDS = ['import', 'require', 'process', 'global', 'window', 'document', 'fetch', 'eval', 'Function', 'setTimeout', 'setInterval', 'constructor', 'prototype', '__proto__'];

export function safeEvaluate(expression) {
    // Block dangerous keywords
    for (const keyword of BLOCKED_KEYWORDS) {
        if (expression.includes(keyword)) {
            throw new Error(`Blocked keyword: ${keyword}`);
        }
    }

    // Allow only numbers, operators, parentheses, and Math.* calls
    const stripped = expression.replace(/Math\.\w+/g, '').replace(/[\d\s+\-*/().,%eE]/g, '');
    if (stripped.length > 0) {
        throw new Error(`Invalid characters in expression: ${stripped}`);
    }

    // Create a sandboxed scope with only Math
    const mathScope = {};
    for (const key of Object.getOwnPropertyNames(Math)) {
        mathScope[key] = Math[key];
    }

    const fn = new Function('Math', `"use strict"; return (${expression});`);
    return fn(mathScope);
}

// Day name lookup
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Tool Executor ───────────────────────────────────────────────────
export async function executeTool(toolName, toolInput, userId) {
    switch (toolName) {
        // ── Memory Tools ─────────────────────────────────────────
        case 'save_memory': {
            const { content, tags = [], eventDate } = toolInput;
            const existing = await prisma.memory.findFirst({
                where: { userId, content },
            });
            if (existing) return 'Memory already saved.';

            const parsedEventDate = eventDate ? new Date(eventDate) : null;

            // Create memory (without embedding — Prisma can't write Unsupported columns)
            const memory = await prisma.memory.create({
                data: { userId, content, tags, eventDate: parsedEventDate },
            });

            // Generate and store embedding via raw SQL
            const embedding = await generateEmbedding(content);
            if (embedding) {
                const vectorStr = toVectorLiteral(embedding);
                await prisma.$executeRawUnsafe(
                    `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
                    vectorStr,
                    memory.id
                );
            }

            return `Saved: "${content}"`;
        }

        case 'search_memories': {
            const { query } = toolInput;

            // Try semantic search via pgvector first
            const queryEmbedding = await generateEmbedding(query);

            if (queryEmbedding) {
                const vectorStr = toVectorLiteral(queryEmbedding);
                // Use pgvector cosine distance operator <=>
                const results = await prisma.$queryRawUnsafe(
                    `SELECT id, content, created_at as "createdAt"
                     FROM memories
                     WHERE user_id = $1 AND embedding IS NOT NULL
                     ORDER BY embedding <=> $2::vector
                     LIMIT 10`,
                    userId,
                    vectorStr
                );

                if (results.length === 0) {
                    return 'No memories found for this query.';
                }

                return results
                    .map((m) => `- ${m.content} (${new Date(m.createdAt).toLocaleDateString()})`)
                    .join('\n');
            }

            // Fallback: keyword search when embeddings unavailable
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

        case 'update_memory': {
            const { search, newContent, eventDate } = toolInput;
            const memory = await prisma.memory.findFirst({
                where: {
                    userId,
                    content: { contains: search, mode: 'insensitive' },
                },
            });

            if (!memory) return `No memory found matching "${search}".`;

            const updateData = { content: newContent };
            if (eventDate) {
                updateData.eventDate = new Date(eventDate);
            }

            await prisma.memory.update({
                where: { id: memory.id },
                data: updateData,
            });
            return `Updated memory: "${memory.content}" → "${newContent}"`;
        }

        case 'delete_memory': {
            const { search } = toolInput;
            const memory = await prisma.memory.findFirst({
                where: {
                    userId,
                    content: { contains: search, mode: 'insensitive' },
                },
            });

            if (!memory) return `No memory found matching "${search}".`;

            await prisma.memory.delete({ where: { id: memory.id } });
            return `Deleted memory: "${memory.content}"`;
        }

        // ── Web Search ───────────────────────────────────────────
        case 'web_search': {
            const { query } = toolInput;
            const apiKey = process.env.PERPLEXITY_API_KEY;
            if (!apiKey) return 'Web search is not configured.';

            try {
                const res = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'sonar',
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a research assistant. Provide concise, factual answers with dates and sources. Keep responses under 400 words.',
                            },
                            { role: 'user', content: query },
                        ],
                        temperature: 0.1,
                    }),
                });

                if (!res.ok) return 'Web search failed.';
                const data = await res.json();
                const answer = data.choices?.[0]?.message?.content || 'No results.';
                const citations = data.citations || [];
                let result = answer;
                if (citations.length > 0) {
                    result += '\n\nSources:\n' + citations.slice(0, 5).map((c, i) => `[${i + 1}] ${c}`).join('\n');
                }
                return result;
            } catch (e) {
                return `Web search error: ${e.message}`;
            }
        }

        // ── Reminders ────────────────────────────────────────────
        case 'set_reminder': {
            const { content, dueAt, deliveryMessage } = toolInput;
            const parsedDate = new Date(dueAt);
            if (isNaN(parsedDate.getTime())) {
                return `Could not parse date: "${dueAt}". Please use ISO 8601 format like "2024-03-15T10:00:00".`;
            }

            const reminder = await prisma.reminder.create({
                data: { userId, content, dueAt: parsedDate, deliveryMessage: deliveryMessage || null },
            });
            return `Reminder set: "${content}" — due ${parsedDate.toLocaleString()}`;
        }

        case 'cancel_reminder': {
            const { query } = toolInput;
            // Fetch ALL active reminders and let best match win
            const allReminders = await prisma.reminder.findMany({
                where: { userId, completed: false },
                orderBy: { dueAt: 'asc' },
            });

            if (allReminders.length === 0) return 'No active reminders found.';

            // Try keyword match first
            const match = allReminders.find(r =>
                r.content.toLowerCase().includes(query.toLowerCase())
            );

            if (!match) {
                const list = allReminders.map(r => `- "${r.content}" (due ${new Date(r.dueAt).toLocaleString()})`).join('\n');
                return `No reminders matching "${query}". Active reminders:\n${list}\nRetry with a keyword from the list.`;
            }

            await prisma.reminder.update({
                where: { id: match.id },
                data: { completed: true },
            });

            return `Cancelled reminder: "${match.content}" (was due ${new Date(match.dueAt).toLocaleString()}).`;
        }

        case 'update_reminder': {
            const { query, newDueAt, newContent, newDeliveryMessage } = toolInput;
            // Fetch ALL active reminders and let best match win
            const allReminders = await prisma.reminder.findMany({
                where: { userId, completed: false },
                orderBy: { dueAt: 'asc' },
            });

            if (allReminders.length === 0) return 'No active reminders found.';

            const match = allReminders.find(r =>
                r.content.toLowerCase().includes(query.toLowerCase())
            );

            if (!match) {
                const list = allReminders.map(r => `- "${r.content}" (due ${new Date(r.dueAt).toLocaleString()})`).join('\n');
                return `No reminders matching "${query}". Active reminders:\n${list}\nRetry with a keyword from the list.`;
            }

            const updateData = {};

            if (newDueAt) {
                const parsedDate = new Date(newDueAt);
                if (isNaN(parsedDate.getTime())) {
                    return `Could not parse date: "${newDueAt}". Please use ISO 8601 format.`;
                }
                updateData.dueAt = parsedDate;
            }
            if (newContent) updateData.content = newContent;
            if (newDeliveryMessage) updateData.deliveryMessage = newDeliveryMessage;

            if (Object.keys(updateData).length === 0) {
                return `No changes provided for reminder: "${match.content}".`;
            }

            await prisma.reminder.update({
                where: { id: match.id },
                data: updateData,
            });

            const changes = [];
            if (updateData.dueAt) changes.push(`time → ${updateData.dueAt.toLocaleString()}`);
            if (updateData.content) changes.push(`content → "${updateData.content}"`);
            if (updateData.deliveryMessage) changes.push('delivery message updated');

            return `Updated reminder "${match.content}": ${changes.join(', ')}.`;
        }

        case 'get_calendar': {
            const { date } = toolInput || {};

            // If no date provided, return ALL upcoming reminders + full workout schedule
            if (!date) {
                const allReminders = await prisma.reminder.findMany({
                    where: {
                        userId,
                        completed: false,
                        dueAt: { gte: new Date() },
                    },
                    orderBy: { dueAt: 'asc' },
                });

                const workoutSchedule = await prisma.workoutSchedule.findUnique({
                    where: { userId },
                });

                const parts = ['📋 Upcoming Schedule'];

                if (allReminders.length > 0) {
                    parts.push('\n⏰ Reminders:');
                    for (const r of allReminders) {
                        parts.push(`- ${new Date(r.dueAt).toLocaleString()}: ${r.content}`);
                    }
                } else {
                    parts.push('\n⏰ No upcoming reminders.');
                }

                if (workoutSchedule?.schedule) {
                    const schedule = Array.isArray(workoutSchedule.schedule) ? workoutSchedule.schedule : [];
                    if (schedule.length > 0) {
                        parts.push('\n🏋️ Weekly Workouts:');
                        const sorted = [...schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
                        for (const w of sorted) {
                            const equip = w.equipment?.length > 0 ? ` (${w.equipment.join(', ')})` : '';
                            parts.push(`- ${w.dayName}: ${w.workoutType}, ${w.duration} min${equip}`);
                        }
                    }
                }

                return parts.join('\n');
            }

            // Date-specific view
            const targetDate = new Date(date);
            const dayOfWeek = targetDate.getDay();
            const dayStart = new Date(targetDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(targetDate);
            dayEnd.setHours(23, 59, 59, 999);

            // Fetch reminders for the target date
            const reminders = await prisma.reminder.findMany({
                where: {
                    userId,
                    dueAt: { gte: dayStart, lte: dayEnd },
                    completed: false,
                },
                orderBy: { dueAt: 'asc' },
            });

            // Fetch workout schedule
            const workoutSchedule = await prisma.workoutSchedule.findUnique({
                where: { userId },
            });

            const parts = [];
            parts.push(`📅 ${DAY_NAMES[dayOfWeek]}, ${targetDate.toLocaleDateString()}`);

            // Workouts for this day
            if (workoutSchedule?.schedule) {
                const schedule = Array.isArray(workoutSchedule.schedule) ? workoutSchedule.schedule : [];
                const todayWorkouts = schedule.filter((w) => w.dayOfWeek === dayOfWeek);
                if (todayWorkouts.length > 0) {
                    parts.push('\n🏋️ Workouts:');
                    for (const w of todayWorkouts) {
                        const equip = w.equipment?.length > 0 ? ` (${w.equipment.join(', ')})` : '';
                        parts.push(`- ${w.workoutType}, ${w.duration} min${equip}`);
                    }
                }
            }

            // Reminders
            if (reminders.length > 0) {
                parts.push('\n⏰ Reminders:');
                for (const r of reminders) {
                    parts.push(`- ${new Date(r.dueAt).toLocaleTimeString()}: ${r.content}`);
                }
            }

            if (parts.length === 1) {
                parts.push('\nNothing scheduled for this day.');
            }

            return parts.join('\n');
        }

        // ── Weather ──────────────────────────────────────────────
        case 'get_weather': {
            const { location } = toolInput;
            const apiKey = process.env.OPENWEATHER_API_KEY;
            if (!apiKey) return 'Weather service is not configured. Set OPENWEATHER_API_KEY.';

            try {
                const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
                const res = await fetch(url);

                if (!res.ok) return `Could not get weather for "${location}".`;
                const data = await res.json();

                const temp = data.main?.temp;
                const feelsLike = data.main?.feels_like;
                const desc = data.weather?.[0]?.description || 'unknown';
                const humidity = data.main?.humidity;
                const wind = data.wind?.speed;

                return `Weather in ${data.name}: ${desc}, ${temp}°C (feels like ${feelsLike}°C). Humidity: ${humidity}%. Wind: ${wind} m/s.`;
            } catch (e) {
                return `Weather error: ${e.message}`;
            }
        }

        // ── Time utilities ────────────────────────────────────────
        case 'get_current_time': {
            const { timezone } = toolInput || {};
            const now = new Date();
            const tz = timezone || 'UTC';
            try {
                const local = now.toLocaleString('en-US', {
                    timeZone: tz,
                    weekday: 'long', year: 'numeric', month: 'long',
                    day: 'numeric', hour: '2-digit', minute: '2-digit',
                    second: '2-digit', timeZoneName: 'short',
                });
                return `Current time: ${local}\nTimezone: ${tz}\nISO: ${now.toISOString()}`;
            } catch {
                const utc = now.toLocaleString('en-US', {
                    timeZone: 'UTC', weekday: 'long', year: 'numeric',
                    month: 'long', day: 'numeric', hour: '2-digit',
                    minute: '2-digit', timeZoneName: 'short',
                });
                return `Current time (UTC, invalid timezone "${tz}"): ${utc}\nISO: ${now.toISOString()}`;
            }
        }

        case 'is_time_past': {
            const { datetime, timezone } = toolInput;
            const target = new Date(datetime);
            if (isNaN(target.getTime())) {
                return `Could not parse datetime: "${datetime}". Use ISO 8601 format.`;
            }
            const now = new Date();
            const diffMs = target.getTime() - now.getTime();
            const isPast = diffMs < 0;
            const absDiff = Math.abs(diffMs);
            const mins = Math.floor(absDiff / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);

            let humanDiff;
            if (days > 0) humanDiff = `${days} day(s) and ${hours % 24} hour(s)`;
            else if (hours > 0) humanDiff = `${hours} hour(s) and ${mins % 60} minute(s)`;
            else humanDiff = `${mins} minute(s)`;

            const tz = timezone || 'UTC';
            let targetLocal;
            try {
                targetLocal = target.toLocaleString('en-US', {
                    timeZone: tz, weekday: 'long', year: 'numeric',
                    month: 'long', day: 'numeric', hour: '2-digit',
                    minute: '2-digit', timeZoneName: 'short',
                });
            } catch {
                targetLocal = target.toISOString();
            }

            return `${isPast ? '⏰ ALREADY PASSED' : '🔜 UPCOMING'}: ${targetLocal}\n${isPast ? `This was ${humanDiff} ago.` : `This is in ${humanDiff} from now.`}\nCurrent time: ${now.toISOString()}`;
        }

        // ── Notifications ────────────────────────────────────────
        case 'send_notification': {
            const { message, channel = 'push' } = toolInput;

            // Try Telegram delivery
            const telegramResult = await sendNotificationToUser(userId, message);
            if (telegramResult.sent) {
                return `Notification sent via Telegram: "${message}"`;
            }

            // Fallback: log and inform
            console.log(`[Notification] Channel: ${channel} | Message: ${message} | User: ${userId}`);
            return `Notification queued: "${message}" (Link Telegram in Settings for delivery).`;
        }

        // ── Calculator ───────────────────────────────────────────
        case 'run_calculation': {
            const { expression } = toolInput;
            try {
                const result = safeEvaluate(expression);
                if (typeof result !== 'number' || !isFinite(result)) {
                    return `Expression "${expression}" did not produce a valid number.`;
                }
                return `${expression} = ${result}`;
            } catch (e) {
                return `Calculation error: ${e.message}`;
            }
        }

        // ── Workout Management ───────────────────────────────────
        case 'manage_workout': {
            const { action, dayOfWeek, workoutType, duration = 45, equipment = [], note = '' } = toolInput;
            const dayName = DAY_NAMES[dayOfWeek];
            if (!dayName) return `Invalid day of week: ${dayOfWeek}. Use 0 (Sunday) to 6 (Saturday).`;

            // Get or create schedule
            let existing = await prisma.workoutSchedule.findUnique({
                where: { userId },
            });

            let schedule = existing?.schedule || [];
            if (!Array.isArray(schedule)) schedule = [];

            switch (action) {
                case 'add': {
                    if (!workoutType) return 'workoutType is required to add a workout.';
                    // Remove any existing entry for the same day (replace, not duplicate)
                    schedule = schedule.filter((w) => w.dayOfWeek !== dayOfWeek);
                    schedule.push({ dayOfWeek, dayName, workoutType, duration, equipment, note });
                    break;
                }
                case 'remove': {
                    const before = schedule.length;
                    schedule = schedule.filter((w) => w.dayOfWeek !== dayOfWeek);
                    if (schedule.length === before) return `No workout found on ${dayName} to remove.`;
                    break;
                }
                case 'update': {
                    const idx = schedule.findIndex((w) => w.dayOfWeek === dayOfWeek);
                    if (idx === -1) return `No workout found on ${dayName} to update.`;
                    if (workoutType) schedule[idx].workoutType = workoutType;
                    if (duration) schedule[idx].duration = duration;
                    if (equipment.length > 0) schedule[idx].equipment = equipment;
                    if (note) schedule[idx].note = note;
                    schedule[idx].dayName = dayName;
                    break;
                }
                default:
                    return `Unknown action: "${action}". Use "add", "remove", or "update".`;
            }

            await prisma.workoutSchedule.upsert({
                where: { userId },
                update: { schedule, lastUpdated: new Date() },
                create: { userId, schedule },
            });

            return `Workout schedule updated: ${action} on ${dayName}${workoutType ? ` — ${workoutType}` : ''}.`;
        }

        // ── Timer ────────────────────────────────────────────────
        case 'set_timer': {
            const { label, durationSeconds } = toolInput;
            if (!durationSeconds || durationSeconds <= 0) {
                return 'Duration must be a positive number of seconds.';
            }

            const timer = await prisma.timer.create({
                data: { userId, label, durationSeconds },
            });

            const mins = Math.floor(durationSeconds / 60);
            const secs = durationSeconds % 60;
            const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            // Include structured timer data for frontend to start countdown
            return JSON.stringify({
                message: `Timer started: "${label}" — ${display}`,
                __timer: { id: timer.id, durationSeconds, label },
            });
        }

        // ── Amazon Cart ─────────────────────────────────────────
        case 'amazon_cart': {
            const { items } = toolInput;
            if (!items || items.length === 0) {
                return 'At least one item is required.';
            }

            const tag = process.env.AMAZON_ASSOCIATE_TAG;
            const tagParam = tag ? `&tag=${tag}` : '';

            // Generate affiliate-tagged search links (reliable until PA-API is available)
            const processedItems = items.map(item => ({
                name: item.name,
                quantity: item.quantity || 1,
                url: `https://www.amazon.com/s?k=${encodeURIComponent(item.name)}${tagParam}`,
            }));

            const summary = processedItems.map(i => `${i.name} (x${i.quantity})`).join(', ');

            return JSON.stringify({
                message: `🛒 Amazon links ready: ${summary}`,
                __amazon_cart: { items: processedItems },
            });
        }

        // ── Workout Completion ───────────────────────────────────
        case 'mark_workout_complete': {
            const { workoutType, duration, notes } = toolInput;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            try {
                // Upsert to handle duplicate completions
                await prisma.workoutLog.upsert({
                    where: {
                        userId_date_workoutType: {
                            userId,
                            date: today,
                            workoutType,
                        },
                    },
                    update: { duration, notes, completedAt: new Date() },
                    create: { userId, date: today, workoutType, duration, notes },
                });

                // Check group context for accountability
                let groupContext = '';
                try {
                    const memberships = await prisma.groupMember.findMany({
                        where: { userId },
                        include: {
                            group: {
                                include: {
                                    members: { select: { userId: true } },
                                },
                            },
                        },
                    });

                    for (const membership of memberships) {
                        const groupMemberIds = membership.group.members.map(m => m.userId);
                        const completedToday = await prisma.workoutLog.count({
                            where: {
                                userId: { in: groupMemberIds },
                                date: today,
                            },
                        });
                        const total = membership.group.members.length;
                        groupContext += `\nIn "${membership.group.name}": ${completedToday}/${total} members have worked out today.`;
                    }
                } catch { /* groups query failed — not critical */ }

                return `✅ Workout logged: ${workoutType}${duration ? ` (${duration} min)` : ''}.${groupContext}`;
            } catch (e) {
                return `Error logging workout: ${e.message}`;
            }
        }

        default:
            return `Unknown tool: ${toolName}`;
    }
}
