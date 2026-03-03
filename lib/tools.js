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
            'Save an important fact or preference about the user for future reference. Use this when the user shares personal information, preferences, goals, habits, or anything worth remembering across conversations.',
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
                    description: 'Tags to categorize the memory, e.g. ["preference", "fitness"]',
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
            'Update an existing memory about the user. Use this when the user corrects or updates a previously saved fact or preference.',
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
            'Create a reminder for the user. Use this when the user asks to be reminded about something at a specific time or date.',
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
            },
            required: ['content', 'dueAt'],
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
                    description: 'Notification channel: "push" or "whatsapp". Defaults to "push".',
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
            'Add, remove, or update workout entries in the user\'s workout schedule. Use this when the user wants to modify their workout plan conversationally.',
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
            const { content, tags = [] } = toolInput;
            const existing = await prisma.memory.findFirst({
                where: { userId, content },
            });
            if (existing) return 'Memory already saved.';

            // Create memory (without embedding — Prisma can't write Unsupported columns)
            const memory = await prisma.memory.create({
                data: { userId, content, tags },
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
            const { search, newContent } = toolInput;
            const memory = await prisma.memory.findFirst({
                where: {
                    userId,
                    content: { contains: search, mode: 'insensitive' },
                },
            });

            if (!memory) return `No memory found matching "${search}".`;

            await prisma.memory.update({
                where: { id: memory.id },
                data: { content: newContent },
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
            const { content, dueAt } = toolInput;
            const parsedDate = new Date(dueAt);
            if (isNaN(parsedDate.getTime())) {
                return `Could not parse date: "${dueAt}". Please use ISO 8601 format like "2024-03-15T10:00:00".`;
            }

            const reminder = await prisma.reminder.create({
                data: { userId, content, dueAt: parsedDate },
            });
            return `Reminder set: "${content}" — due ${parsedDate.toLocaleString()}`;
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
            const { action, dayOfWeek, workoutType, duration = 45, equipment = [] } = toolInput;
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
                    schedule.push({ dayOfWeek, dayName, workoutType, duration, equipment });
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

        default:
            return `Unknown tool: ${toolName}`;
    }
}
