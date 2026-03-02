import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/workout?userId=xxx — Get user's workout schedule
// POST /api/workout — Save/update workout schedule
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const schedule = await prisma.workoutSchedule.findUnique({
            where: { userId },
        });

        return NextResponse.json({ schedule });
    } catch (error) {
        console.error('Workout fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { userId, schedule, rawResponse } = await request.json();

        if (!userId || !schedule) {
            return NextResponse.json({ error: 'Missing userId or schedule' }, { status: 400 });
        }

        const result = await prisma.workoutSchedule.upsert({
            where: { userId },
            update: {
                schedule,
                rawResponse,
                lastUpdated: new Date(),
            },
            create: {
                userId,
                schedule,
                rawResponse,
            },
        });

        return NextResponse.json({ schedule: result });
    } catch (error) {
        console.error('Workout save error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
