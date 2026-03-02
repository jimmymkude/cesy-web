/**
 * Schedule Parser — ported from iOS ScheduleParser.swift
 * Parses workout schedules from chat responses.
 * 
 * Expected format (from assistant): 
 *   - Monday: Basketball drills, 45 minutes (Equipment: Basketball, Court)
 *   - Tuesday: Running, 30 minutes
 * 
 * Handles both newline-separated and inline (single-line) bullet lists.
 */

const DAYS_OF_WEEK = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parse a schedule from an assistant's response text.
 * Returns an array of workout entries or null if no schedule found.
 */
export function parseScheduleFromResponse(response) {
    if (!response) return null;

    // Case-insensitive check for schedule-related words
    const lower = response.toLowerCase();
    if (!lower.includes('schedule') && !lower.includes('workout plan') && !lower.includes('weekly plan')) {
        return null;
    }

    // Normalize: split on "- " preceded by whitespace or start-of-string
    // This handles both newline-separated and inline bullet lists
    const parts = response.split(/(?:^|\s)-\s+/);
    const workoutDays = [];

    for (const part of parts) {
        const cleanLine = part.trim();
        if (!cleanLine) continue;

        const colonIdx = cleanLine.indexOf(':');
        if (colonIdx === -1) continue;

        const dayPart = cleanLine.substring(0, colonIdx).toLowerCase().replace(/\*+/g, '').trim();
        const dayEntry = Object.entries(DAYS_OF_WEEK).find(([name]) => dayPart.includes(name));
        if (!dayEntry) continue;

        const details = cleanLine.substring(colonIdx + 1).trim();

        // Skip rest days
        if (details.toLowerCase().includes('rest day') || details.toLowerCase().includes('rest')) {
            continue;
        }

        // Extract equipment from parenthetical (before splitting by comma)
        const equipment = [];
        const equipMatch = details.match(/\(Equipment:\s*([^)]+)\)/i);
        if (equipMatch) {
            equipment.push(...equipMatch[1].split(',').map((e) => e.trim()).filter(Boolean));
        }

        // Remove the equipment parenthetical for cleaner parsing
        const detailsClean = details.replace(/\(Equipment:\s*[^)]+\)/i, '').trim();
        const commaParts = detailsClean.split(',').map((p) => p.trim()).filter(Boolean);

        let workoutType = commaParts[0] || 'Workout';
        let duration = 45; // default

        for (const cp of commaParts.slice(1)) {
            const cpLower = cp.toLowerCase();
            if (cpLower.includes('minute')) {
                const match = cp.match(/(\d+)/);
                if (match) duration = parseInt(match[1], 10);
            } else if (cpLower.includes('using')) {
                const equipStr = cpLower.replace(/using/g, '').trim();
                equipment.push(...equipStr.split(/\s+and\s+/).map((e) => e.trim()).filter(Boolean));
            }
        }

        // Clean duration from workoutType if embedded: "Basketball 45 minutes"
        const durationInType = workoutType.match(/(\d+)\s*minutes?/i);
        if (durationInType) {
            duration = parseInt(durationInType[1], 10);
            workoutType = workoutType.replace(/\s*\d+\s*minutes?/i, '').trim();
        }

        // Remove any remaining markdown bold markers
        workoutType = workoutType.replace(/\*+/g, '').trim();

        workoutDays.push({
            dayOfWeek: dayEntry[1],
            dayName: DAY_NAMES[dayEntry[1]],
            workoutType,
            duration,
            equipment,
        });
    }

    return workoutDays.length > 0 ? workoutDays : null;
}
