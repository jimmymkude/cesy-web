/**
 * Schedule Parser — ported from iOS ScheduleParser.swift
 * Parses workout schedules from chat responses.
 * 
 * Expected format (from assistant): 
 *   - Sunday: Basketball, 45 minutes, using dumbbells
 *   - Monday: Running, 30 minutes
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
    if (!response || !response.includes('schedule')) return null;

    const lines = response.split('\n');
    const workoutDays = [];

    for (const line of lines) {
        if (!line.includes('-')) continue;

        const cleanLine = line.trim().replace(/^-\s*/, '');
        const colonIdx = cleanLine.indexOf(':');
        if (colonIdx === -1) continue;

        const dayPart = cleanLine.substring(0, colonIdx).toLowerCase();
        const dayEntry = Object.entries(DAYS_OF_WEEK).find(([name]) => dayPart.includes(name));
        if (!dayEntry) continue;

        const details = cleanLine.substring(colonIdx + 1).trim();
        const parts = details.split(',').map((p) => p.trim());

        let workoutType = parts[0] || 'Workout';
        let duration = 45; // default
        const equipment = [];

        for (const part of parts.slice(1)) {
            const lower = part.toLowerCase();
            if (lower.includes('minute')) {
                const match = part.match(/(\d+)/);
                if (match) duration = parseInt(match[1], 10);
            } else if (lower.includes('using') || lower.includes('equipment')) {
                const equipStr = lower.replace(/using|equipment:?/g, '').trim();
                equipment.push(...equipStr.split(/\s+and\s+/).map((e) => e.trim()).filter(Boolean));
            }
        }

        // Also check for parenthetical equipment: (Equipment: Dumbbells, Yoga Mat)
        const equipMatch = details.match(/\(Equipment:\s*([^)]+)\)/i);
        if (equipMatch) {
            equipment.push(...equipMatch[1].split(',').map((e) => e.trim()).filter(Boolean));
        }

        // Clean duration from workoutType if embedded: "Basketball 45 minutes"
        const durationInType = workoutType.match(/(\d+)\s*minutes?/i);
        if (durationInType) {
            duration = parseInt(durationInType[1], 10);
            workoutType = workoutType.replace(/\s*\d+\s*minutes?/i, '').trim();
        }

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
