import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

// POST /api/memories — Add a memory
// GET /api/memories?userId=xxx — Get recent memories
export async function POST(request) {
    try {
        const { userId, content, tags = [], eventDate } = await request.json();
        if (!userId || !content) {
            return NextResponse.json({ error: 'Missing userId or content' }, { status: 400 });
        }

        // Deduplication: check for exact match
        const existing = await prisma.memory.findFirst({
            where: { userId, content },
        });
        if (existing) {
            return NextResponse.json({ message: 'Memory already exists', memory: existing });
        }

        const memory = await prisma.memory.create({
            data: { userId, content, tags, eventDate: eventDate ? new Date(eventDate) : null },
        });

        return NextResponse.json({ message: 'Memory stored', memory });
    } catch (error) {
        console.error('Memory add error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const query = searchParams.get('q');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        let memories;
        if (type === 'events') {
            // Return event memories sorted by eventDate
            memories = await prisma.memory.findMany({
                where: {
                    userId,
                    eventDate: { not: null },
                },
                orderBy: { eventDate: 'asc' },
                take: limit,
            });
        } else if (query) {
            // Keyword search
            memories = await prisma.memory.findMany({
                where: {
                    userId,
                    content: { contains: query, mode: 'insensitive' },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        } else {
            // Recent memories
            memories = await prisma.memory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        }

        return NextResponse.json({ memories });
    } catch (error) {
        console.error('Memory search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing memory id' }, { status: 400 });
        }

        await prisma.memory.delete({ where: { id } });
        return NextResponse.json({ message: 'Memory deleted' });
    } catch (error) {
        console.error('Memory delete error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
