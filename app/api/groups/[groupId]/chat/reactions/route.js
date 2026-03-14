import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

/**
 * POST /api/groups/[groupId]/chat/reactions
 * Add a reaction to a message. Toggles off if already exists.
 * Body: { userId, messageId, emoji }
 */
export async function POST(request, { params }) {
    try {
        const { groupId } = await params;
        const { userId, messageId, emoji } = await request.json();

        if (!userId || !messageId || !emoji) {
            return NextResponse.json({ error: 'Missing userId, messageId, or emoji' }, { status: 400 });
        }

        if (!ALLOWED_EMOJIS.includes(emoji)) {
            return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
        }

        // Verify membership
        const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
        });
        if (!member) {
            return NextResponse.json({ error: 'Not a member' }, { status: 403 });
        }

        // Verify message belongs to this group
        const message = await prisma.groupMessage.findFirst({
            where: { id: messageId, groupId },
        });
        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Toggle: if reaction exists, remove it; otherwise add it
        const existing = await prisma.messageReaction.findUnique({
            where: { messageId_userId_emoji: { messageId, userId, emoji } },
        });

        if (existing) {
            await prisma.messageReaction.delete({ where: { id: existing.id } });
            return NextResponse.json({ action: 'removed', emoji });
        }

        const reaction = await prisma.messageReaction.create({
            data: { messageId, userId, emoji },
        });

        return NextResponse.json({ action: 'added', reaction }, { status: 201 });
    } catch (error) {
        console.error('Reaction error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export { ALLOWED_EMOJIS };
