import { parseScheduleFromResponse } from '@/lib/scheduleParser';

describe('parseScheduleFromResponse', () => {
    // --- Null / early-exit cases ---
    it('returns null for null/undefined input', () => {
        expect(parseScheduleFromResponse(null)).toBeNull();
        expect(parseScheduleFromResponse(undefined)).toBeNull();
        expect(parseScheduleFromResponse('')).toBeNull();
    });

    it('returns null when no schedule keyword is present', () => {
        expect(parseScheduleFromResponse('Hello, how are you?')).toBeNull();
    });

    it('returns null for schedule keyword but no parseable days', () => {
        expect(parseScheduleFromResponse('Here is your schedule: nothing much')).toBeNull();
    });

    // --- Inline bullets (single-line) ---
    it('parses inline bullet list (LLM typical format)', () => {
        const input =
            "Here's your weekly schedule: - Monday: Basketball drills, 45 minutes (Equipment: Basketball, Court) - Tuesday: Strength training, 40 minutes (Equipment: Dumbbells, Bench) - Sunday: Rest day";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(2); // Sunday rest day skipped
        expect(result[0]).toMatchObject({
            dayOfWeek: 1,
            dayName: 'Monday',
            workoutType: 'Basketball drills',
            duration: 45,
            equipment: ['Basketball', 'Court'],
        });
        expect(result[1]).toMatchObject({
            dayOfWeek: 2,
            dayName: 'Tuesday',
            workoutType: 'Strength training',
            duration: 40,
            equipment: ['Dumbbells', 'Bench'],
        });
    });

    // --- Newline-separated bullets ---
    it('parses newline-separated bullet list', () => {
        const input = `Here is your schedule:
- Monday: Running, 30 minutes (Equipment: Running shoes)
- Wednesday: Yoga, 45 minutes (Equipment: Yoga mat)`;
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(2);
        expect(result[0].dayName).toBe('Monday');
        expect(result[0].workoutType).toBe('Running');
        expect(result[0].duration).toBe(30);
        expect(result[1].dayName).toBe('Wednesday');
    });

    // --- Rest day skipping ---
    it('skips rest days', () => {
        const input = "Schedule: - Monday: Workout, 30 minutes - Wednesday: Rest day - Friday: Cardio, 20 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(2);
        expect(result.find(d => d.dayName === 'Wednesday')).toBeUndefined();
    });

    // --- Markdown bold stripping ---
    it('strips markdown bold markers from workout type', () => {
        const input = "Schedule: - **Monday**: **Basketball drills**, 30 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].workoutType).toBe('Basketball drills');
    });

    // --- Equipment extraction ---
    it('extracts equipment from parenthetical format', () => {
        const input = "Schedule: - Monday: Workout, 30 minutes (Equipment: Dumbbells, Bench Press, Yoga Mat)";
        const result = parseScheduleFromResponse(input);
        expect(result[0].equipment).toEqual(['Dumbbells', 'Bench Press', 'Yoga Mat']);
    });

    // --- Duration parsing ---
    it('parses duration from comma-separated parts', () => {
        const input = "Schedule: - Monday: Running, 25 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result[0].duration).toBe(25);
    });

    it('defaults duration to 45 when not specified', () => {
        const input = "Schedule: - Monday: Running";
        const result = parseScheduleFromResponse(input);
        expect(result[0].duration).toBe(45);
    });

    // --- Case-insensitive schedule keyword ---
    it('matches "workout plan" keyword', () => {
        const input = "Here is your workout plan: - Monday: Running, 30 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(1);
    });

    it('matches "weekly plan" keyword', () => {
        const input = "Your weekly plan: - Friday: Yoga, 20 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].dayName).toBe('Friday');
    });

    // --- Full realistic response ---
    it('handles full realistic LLM response with 6 day schedule', () => {
        const input =
            "Perfect - light load with basketball and dumbbells! Here is your weekly schedule: - Monday: Basketball shooting practice, 30 minutes (Equipment: Basketball, Hoop) - Tuesday: Light dumbbell workout, 25 minutes (Equipment: Dumbbells) - Wednesday: Rest day - Thursday: Basketball drills, 30 minutes (Equipment: Basketball, Hoop) - Friday: Upper body strength, 20 minutes (Equipment: Dumbbells) - Saturday: Free throws and stretching, 25 minutes (Equipment: Basketball, Hoop) - Sunday: Rest day This schedule keeps things light but consistent";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(5); // 2 rest days skipped
        expect(result.map(d => d.dayName)).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday']);
    });

    // --- All 7 days ---
    it('parses all 7 days of the week', () => {
        const input = "Schedule: - Sunday: A, 10 minutes - Monday: B, 20 minutes - Tuesday: C, 30 minutes - Wednesday: D, 40 minutes - Thursday: E, 50 minutes - Friday: F, 60 minutes - Saturday: G, 70 minutes";
        const result = parseScheduleFromResponse(input);
        expect(result).toHaveLength(7);
        expect(result[0].dayOfWeek).toBe(0); // Sunday
        expect(result[6].dayOfWeek).toBe(6); // Saturday
    });
});
