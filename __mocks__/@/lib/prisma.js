// Mock Prisma client for tests
const mockPrisma = {
    userProfile: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    userSettings: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
    },
    memory: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
    },
    workoutSchedule: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
};

module.exports = mockPrisma;
module.exports.default = mockPrisma;
