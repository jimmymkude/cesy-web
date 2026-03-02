import { ASSISTANT, VOICE, CONFIG, STORAGE_KEYS } from '@/lib/constants';

describe('constants', () => {
    describe('ASSISTANT', () => {
        it('has instructions string', () => {
            expect(typeof ASSISTANT.instructions).toBe('string');
            expect(ASSISTANT.instructions.length).toBeGreaterThan(0);
        });

        it('has default name', () => {
            expect(ASSISTANT.defaultName).toBe('Cesy');
        });

        it('instructions include schedule format guidance', () => {
            expect(ASSISTANT.instructions).toContain('schedule');
        });
    });

    describe('VOICE', () => {
        it('has default voice ID', () => {
            expect(typeof VOICE.defaultVoiceId).toBe('string');
            expect(VOICE.defaultVoiceId.length).toBeGreaterThan(0);
        });
    });

    describe('CONFIG', () => {
        it('has query processing deadline', () => {
            expect(typeof CONFIG.queryProcessingDeadline).toBe('number');
            expect(CONFIG.queryProcessingDeadline).toBeGreaterThan(0);
        });

        it('has backend URL', () => {
            expect(CONFIG.cesyBackendUrl).toContain('tanzasoft.com');
        });
    });

    describe('STORAGE_KEYS', () => {
        it('has all required keys', () => {
            expect(STORAGE_KEYS.threadId).toBeDefined();
            expect(STORAGE_KEYS.isDarkMode).toBeDefined();
            expect(STORAGE_KEYS.selectedVoiceId).toBeDefined();
            expect(STORAGE_KEYS.userData).toBeDefined();
        });

        it('all keys are strings', () => {
            Object.values(STORAGE_KEYS).forEach((key) => {
                expect(typeof key).toBe('string');
            });
        });
    });
});
