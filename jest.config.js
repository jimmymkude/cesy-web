const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
    setupFilesAfterSetup: ['<rootDir>/jest.setup.js'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
    collectCoverageFrom: [
        'lib/**/*.js',
        'app/api/**/*.js',
        'app/memories/**/*.js',
        'contexts/**/*.js',
        'components/**/*.js',
        '!lib/prisma.js',
        '!lib/firebase.js',
        '!components/VoiceCall.js',
        '!components/Sidebar.js',
        '!**/*.config.*',
    ],
    projects: [
        {
            displayName: 'api',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/__tests__/api/**/*.test.js'],
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/$1',
            },
            transform: {
                '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['next/babel'] }],
            },
        },
        {
            displayName: 'lib',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/__tests__/lib/**/*.test.js'],
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/$1',
            },
            transform: {
                '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['next/babel'] }],
            },
        },
        {
            displayName: 'ui',
            testEnvironment: 'jest-environment-jsdom',
            testMatch: [
                '<rootDir>/__tests__/contexts/**/*.test.js',
                '<rootDir>/__tests__/components/**/*.test.js',
            ],
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/$1',
            },
            transform: {
                '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['next/babel'] }],
            },
        },
    ],
};

module.exports = createJestConfig(customJestConfig);
