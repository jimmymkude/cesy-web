import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateEmbedding, toVectorLiteral } from '@/lib/tools';

// GET /api/cron/memory-consolidation
// Anchor-based clustering + batched Sonnet merging.
// Triggered when a user accumulates 100+ memories.
// Protected by CRON_SECRET header.

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const COSINE_THRESHOLD = 0.12; // max cosine distance for clustering
const CLUSTER_BATCH_SIZE = 8;  // clusters per Sonnet call (5-10 range)
const MEMORY_THRESHOLD = 100;  // min memories before consolidation runs

export async function GET(request) {
    try {
        // Validate cron secret
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
        }

        // Find users with enough memories to consolidate
        const userCounts = await prisma.memory.groupBy({
            by: ['userId'],
            _count: { id: true },
            having: { id: { _count: { gte: MEMORY_THRESHOLD } } },
        });

        if (userCounts.length === 0) {
            return NextResponse.json({ consolidated: 0, message: 'No users above threshold' });
        }

        let totalConsolidated = 0;
        let totalClusters = 0;

        for (const { userId } of userCounts) {
            const result = await consolidateUser(userId, apiKey);
            totalConsolidated += result.merged;
            totalClusters += result.clusters;
        }

        return NextResponse.json({
            users: userCounts.length,
            clusters: totalClusters,
            consolidated: totalConsolidated,
        });
    } catch (error) {
        console.error('Memory consolidation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── Per-user consolidation ───────────────────────────────────────────

async function consolidateUser(userId, apiKey) {
    // Fetch all memories with embeddings
    const memories = await prisma.$queryRawUnsafe(
        `SELECT id, content, tags, event_date as "eventDate",
                embedding::text as embedding_text
         FROM memories
         WHERE user_id = $1 AND embedding IS NOT NULL
         ORDER BY created_at ASC`,
        userId
    );

    if (memories.length < MEMORY_THRESHOLD) {
        return { clusters: 0, merged: 0 };
    }

    // Parse embeddings from pgvector text format: "[0.1,0.2,...]"
    const parsed = memories.map((m) => ({
        ...m,
        tags: Array.isArray(m.tags) ? m.tags : (typeof m.tags === 'string' ? JSON.parse(m.tags) : []),
        vec: parseVector(m.embedding_text),
    }));

    // ── Anchor-based clustering ──────────────────────────────────────
    const clusters = anchorCluster(parsed, COSINE_THRESHOLD);

    // Only process clusters with 2+ memories (singles don't need merging)
    const mergeable = clusters.filter((c) => c.length >= 2);

    if (mergeable.length === 0) {
        return { clusters: 0, merged: 0 };
    }

    // ── Batched Sonnet merge ─────────────────────────────────────────
    let merged = 0;
    for (let i = 0; i < mergeable.length; i += CLUSTER_BATCH_SIZE) {
        const batch = mergeable.slice(i, i + CLUSTER_BATCH_SIZE);
        const mergedMemories = await batchMerge(batch, apiKey);

        // For each cluster: create consolidated memory, delete originals
        for (let j = 0; j < batch.length; j++) {
            const cluster = batch[j];
            const mergedContent = mergedMemories[j];
            if (!mergedContent) continue;

            // Collect tags from all originals, add "consolidated"
            const allTags = new Set();
            allTags.add('consolidated');
            for (const mem of cluster) {
                if (Array.isArray(mem.tags)) {
                    mem.tags.forEach((t) => allTags.add(t));
                }
            }

            // Preserve the earliest eventDate if any
            const eventDates = cluster
                .filter((m) => m.eventDate)
                .map((m) => new Date(m.eventDate))
                .sort((a, b) => a - b);
            const earliestEvent = eventDates.length > 0 ? eventDates[0] : null;

            // Create consolidated memory
            const newMemory = await prisma.memory.create({
                data: {
                    userId,
                    content: mergedContent,
                    tags: [...allTags],
                    eventDate: earliestEvent,
                },
            });

            // Generate and store embedding for the new memory
            const embedding = await generateEmbedding(mergedContent);
            if (embedding) {
                const vectorStr = toVectorLiteral(embedding);
                await prisma.$executeRawUnsafe(
                    `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
                    vectorStr,
                    newMemory.id
                );
            }

            // Delete originals
            const originalIds = cluster.map((m) => m.id);
            await prisma.memory.deleteMany({
                where: { id: { in: originalIds } },
            });

            merged += originalIds.length;
        }
    }

    return { clusters: mergeable.length, merged };
}

// ── Anchor-based clustering ──────────────────────────────────────────
// Pick oldest unprocessed memory as anchor, find all within threshold.
// Avoids transitivity problem of pairwise clustering.

export function anchorCluster(memories, threshold) {
    const used = new Set();
    const clusters = [];

    for (const anchor of memories) {
        if (used.has(anchor.id)) continue;

        const cluster = [anchor];
        used.add(anchor.id);

        for (const candidate of memories) {
            if (used.has(candidate.id)) continue;
            const dist = cosineDistance(anchor.vec, candidate.vec);
            if (dist <= threshold) {
                cluster.push(candidate);
                used.add(candidate.id);
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

// ── Batched Sonnet merge ─────────────────────────────────────────────
// Sends 5-10 clusters in a single Sonnet call for cost efficiency.

async function batchMerge(clusterBatch, apiKey) {
    const clusterTexts = clusterBatch.map((cluster, idx) => {
        const items = cluster.map((m) => `  - "${m.content}"`).join('\n');
        return `Cluster ${idx + 1}:\n${items}`;
    });

    const prompt = `You are consolidating user memories. For each cluster below, write ONE concise memory that captures ALL details from the individual memories. Drop redundancies but NEVER drop facts. Keep each merged memory to 1-2 sentences.

${clusterTexts.join('\n\n')}

Respond with exactly ${clusterBatch.length} lines, one per cluster. Each line should be the consolidated memory text only, no numbering or prefixes.`;

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
            messages: [{ role: 'user', content: prompt }],
        }),
    });

    if (!res.ok) {
        console.error('Sonnet merge error:', await res.text());
        return [];
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    // Return one merged text per cluster
    return lines.slice(0, clusterBatch.length);
}

// ── Vector math ──────────────────────────────────────────────────────

function parseVector(text) {
    if (!text) return [];
    // pgvector text format: "[0.1,0.2,0.3]"
    return text.replace(/[[\]]/g, '').split(',').map(Number);
}

export function cosineDistance(a, b) {
    if (!a.length || !b.length || a.length !== b.length) return 1;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    if (mag === 0) return 1;
    return 1 - dot / mag; // cosine distance = 1 - cosine similarity
}
