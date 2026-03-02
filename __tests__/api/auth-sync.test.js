/**
 * Tests for POST /api/auth/sync
 */
import { POST } from '@/app/api/auth/sync/route';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        userProfile: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
        },
    },
}));

const prisma = require('@/lib/prisma').default;

function makeRequest(body) {
    return {
        json: async () => body,
    };
}

describe('POST /api/auth/sync', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 400 when firebaseUid is missing', async () => {
        const res = await POST(makeRequest({ email: 'test@test.com' }));
        const data = await res.json();
        expect(res.status).toBe(400);
        expect(data.error).toContain('firebaseUid');
    });

    it('upserts user and returns user data', async () => {
        const mockUser = { id: 'user-1', firebaseUid: 'fb-123', email: 'test@test.com' };
        prisma.userProfile.upsert.mockResolvedValue(mockUser);

        const res = await POST(makeRequest({
            firebaseUid: 'fb-123',
            email: 'test@test.com',
            fullName: 'Test User',
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.user).toEqual(mockUser);
        expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { firebaseUid: 'fb-123' },
            })
        );
    });

    it('handles P2002 race condition by falling back to findUnique', async () => {
        const err = new Error('unique constraint');
        err.code = 'P2002';
        prisma.userProfile.upsert.mockRejectedValue(err);

        const mockUser = { id: 'user-1', firebaseUid: 'fb-123' };
        prisma.userProfile.findUnique.mockResolvedValue(mockUser);

        const res = await POST(makeRequest({ firebaseUid: 'fb-123' }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.user).toEqual(mockUser);
        expect(prisma.userProfile.findUnique).toHaveBeenCalled();
    });

    it('returns 500 when upsert throws non-P2002 error', async () => {
        prisma.userProfile.upsert.mockRejectedValue(new Error('DB connection failed'));

        const res = await POST(makeRequest({ firebaseUid: 'fb-123' }));
        const data = await res.json();

        expect(res.status).toBe(500);
        expect(data.error).toBe('Internal server error');
    });
});
