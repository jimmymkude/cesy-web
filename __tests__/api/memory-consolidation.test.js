/**
 * Tests for /api/cron/memory-consolidation — Memory consolidation endpoint
 * Tests the anchor-based clustering, batched Sonnet merging, and CRON_SECRET auth.
 */
import { GET } from '@/app/api/cron/memory-consolidation/route';
import { anchorCluster, cosineDistance } from '@/app/api/cron/memory-consolidation/route';

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        memory: {
            groupBy: jest.fn(),
            create: jest.fn(),
            deleteMany: jest.fn(),
        },
        $queryRawUnsafe: jest.fn(),
        $executeRawUnsafe: jest.fn(),
    },
}));

jest.mock('@/lib/tools', () => ({
    generateEmbedding: jest.fn(),
    toVectorLiteral: jest.fn((arr) => `[${arr.join(',')}]`),
}));

// Mock global fetch for Anthropic API
const mockFetch = jest.fn();
global.fetch = mockFetch;

import prisma from '@/lib/prisma';
import { generateEmbedding } from '@/lib/tools';

function makeRequest(headers = {}) {
    return {
        headers: {
            get: (key) => headers[key.toLowerCase()] || null,
        },
    };
}

describe('GET /api/cron/memory-consolidation', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            CRON_SECRET: 'test-secret',
            ANTHROPIC_API_KEY: 'test-key',
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns 401 when CRON_SECRET is set and auth header is wrong', async () => {
        const req = makeRequest({ authorization: 'Bearer wrong-secret' });
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('returns 200 with 0 consolidated when no users above threshold', async () => {
        prisma.memory.groupBy.mockResolvedValue([]);

        const req = makeRequest({ authorization: 'Bearer test-secret' });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.consolidated).toBe(0);
    });

    it('consolidates memories for users above threshold', async () => {
        // User has 100+ memories
        prisma.memory.groupBy.mockResolvedValue([{ userId: 'u1', _count: { id: 120 } }]);

        // Return memories with similar embeddings (will form a cluster)
        const vec1 = Array(512).fill(0).map((_, i) => Math.sin(i));
        const vec2 = Array(512).fill(0).map((_, i) => Math.sin(i) + 0.001); // very similar
        const vec3 = Array(512).fill(0).map((_, i) => Math.cos(i)); // different

        prisma.$queryRawUnsafe.mockResolvedValue([
            { id: 'm1', content: 'User likes basketball', tags: ['preference'], eventDate: null, embedding_text: `[${vec1.join(',')}]` },
            { id: 'm2', content: 'User plays basketball on weekends', tags: ['preference', 'fitness'], eventDate: null, embedding_text: `[${vec2.join(',')}]` },
            { id: 'm3', content: 'User has a meeting tomorrow', tags: ['event'], eventDate: '2026-03-05T12:00:00Z', embedding_text: `[${vec3.join(',')}]` },
        ]);

        // Repeat enough to pass threshold
        prisma.$queryRawUnsafe.mockResolvedValueOnce(
            Array.from({ length: 100 }, (_, i) => ({
                id: `m${i}`,
                content: i < 2 ? (i === 0 ? 'User likes basketball' : 'User plays basketball on weekends') : `Random fact ${i}`,
                tags: i < 2 ? ['preference'] : ['general'],
                eventDate: null,
                embedding_text: `[${(i < 2 ? vec1 : vec3).join(',')}]`,
            }))
        );

        // Mock Sonnet merge response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                content: [{ type: 'text', text: 'User plays basketball regularly, especially on weekends.' }],
            }),
        });

        // Mock create and embedding
        prisma.memory.create.mockResolvedValue({ id: 'new-1' });
        generateEmbedding.mockResolvedValue(vec1);
        prisma.$executeRawUnsafe.mockResolvedValue({});
        prisma.memory.deleteMany.mockResolvedValue({ count: 2 });

        const req = makeRequest({ authorization: 'Bearer test-secret' });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.users).toBe(1);
    });

    it('returns 500 when ANTHROPIC_API_KEY is not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;

        const req = makeRequest({ authorization: 'Bearer test-secret' });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('ANTHROPIC_API_KEY not set');
    });

    it('handles errors gracefully', async () => {
        prisma.memory.groupBy.mockRejectedValue(new Error('DB down'));

        const req = makeRequest({ authorization: 'Bearer test-secret' });
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('DB down');
    });
});

describe('anchorCluster', () => {
    // Helper: create a memory with a given vector
    const makeMem = (id, vec) => ({ id, content: `Memory ${id}`, tags: [], vec });

    it('groups similar vectors into clusters', () => {
        const v1 = [1, 0, 0];
        const v2 = [0.99, 0.01, 0]; // very close to v1
        const v3 = [0, 1, 0];       // very different

        const memories = [makeMem('a', v1), makeMem('b', v2), makeMem('c', v3)];
        const clusters = anchorCluster(memories, 0.12);

        // a and b should cluster together, c alone
        expect(clusters.length).toBe(2);
        const bigCluster = clusters.find((c) => c.length === 2);
        const singleCluster = clusters.find((c) => c.length === 1);
        expect(bigCluster.map((m) => m.id).sort()).toEqual(['a', 'b']);
        expect(singleCluster[0].id).toBe('c');
    });

    it('returns all singletons when no vectors are similar', () => {
        const memories = [
            makeMem('a', [1, 0, 0]),
            makeMem('b', [0, 1, 0]),
            makeMem('c', [0, 0, 1]),
        ];
        const clusters = anchorCluster(memories, 0.01); // very tight threshold
        expect(clusters.length).toBe(3);
        clusters.forEach((c) => expect(c.length).toBe(1));
    });

    it('handles empty input', () => {
        const clusters = anchorCluster([], 0.12);
        expect(clusters).toEqual([]);
    });

    it('anchor absorbs all similar, not transitive chains', () => {
        // a is similar to b, b is similar to c, but a is NOT similar to c
        const a = [1, 0, 0];
        const b = [0.9, 0.44, 0]; // distance from a ≈ 0.07 (within threshold)
        const c = [0.5, 0.87, 0]; // distance from a ≈ 0.37 (outside threshold), but distance from b ≈ 0.07

        const memories = [makeMem('a', a), makeMem('b', b), makeMem('c', c)];
        const clusters = anchorCluster(memories, 0.12);

        // a clusters with b (anchor-based), c starts its own cluster
        // c does NOT get pulled in via b's transitivity
        const clusterA = clusters.find((cl) => cl.some((m) => m.id === 'a'));
        expect(clusterA.some((m) => m.id === 'c')).toBe(false);
    });
});

describe('cosineDistance', () => {
    it('returns 0 for identical vectors', () => {
        const v = [1, 2, 3];
        expect(cosineDistance(v, v)).toBeCloseTo(0, 5);
    });

    it('returns ~1 for orthogonal vectors', () => {
        expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 5);
    });

    it('returns ~2 for opposite vectors', () => {
        expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2, 5);
    });

    it('returns small distance for similar vectors', () => {
        const v1 = [1, 0, 0];
        const v2 = [0.99, 0.01, 0];
        expect(cosineDistance(v1, v2)).toBeLessThan(0.01);
    });

    it('returns 1 for empty vectors', () => {
        expect(cosineDistance([], [])).toBe(1);
    });

    it('returns 1 for mismatched lengths', () => {
        expect(cosineDistance([1, 2], [1, 2, 3])).toBe(1);
    });
});
