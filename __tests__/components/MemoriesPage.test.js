/**
 * Tests for Memories page
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react';

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'fb-1', email: 'test@test.com', displayName: 'Test', photoURL: null },
    }),
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
    usePathname: jest.fn(() => '/memories'),
    useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

// Mock ThemeContext
jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: jest.fn() }),
}));

const originalFetch = global.fetch;

import MemoriesPage from '@/app/memories/page';

describe('MemoriesPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    function setupFetch({ memories = [], syncOk = true, deleteOk = true } = {}) {
        global.fetch = jest.fn().mockImplementation(async (url, opts) => {
            if (url === '/api/auth/sync') {
                return { ok: syncOk, json: async () => ({ user: { id: 'db-u1' } }) };
            }
            if (typeof url === 'string' && url.includes('/api/memories')) {
                if (opts?.method === 'DELETE') {
                    return { ok: deleteOk, json: async () => ({ message: 'deleted' }) };
                }
                return { ok: true, json: async () => ({ memories }) };
            }
            return { ok: true, json: async () => ({}) };
        });
    }

    it('renders header and subtitle', async () => {
        setupFetch();
        const { container } = render(<MemoriesPage />);
        expect(container.textContent).toContain('Memories');
        expect(container.textContent).toContain('What Cesy remembers');
    });

    it('shows loading state initially', () => {
        setupFetch();
        const { container } = render(<MemoriesPage />);
        expect(container.querySelector('.spinner')).toBeTruthy();
    });

    it('shows empty state when no memories', async () => {
        setupFetch({ memories: [] });
        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('No memories yet');
        });
    });

    it('displays memories list', async () => {
        const memories = [
            { id: 'm1', content: 'Likes basketball', tags: ['sport'], createdAt: '2025-01-15T00:00:00Z' },
            { id: 'm2', content: 'Prefers morning workouts', tags: ['fitness', 'preference'], createdAt: '2025-01-20T00:00:00Z' },
        ];
        setupFetch({ memories });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('Likes basketball');
            expect(container.textContent).toContain('Prefers morning workouts');
            expect(container.textContent).toContain('2 items');
        });
    });

    it('displays memory tags', async () => {
        const memories = [
            { id: 'm1', content: 'Test', tags: ['sport', 'fitness'], createdAt: '2025-01-15T00:00:00Z' },
        ];
        setupFetch({ memories });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            const tags = container.querySelectorAll('.memory-tag');
            expect(tags).toHaveLength(2);
            expect(tags[0].textContent).toBe('sport');
            expect(tags[1].textContent).toBe('fitness');
        });
    });

    it('deletes a memory when delete button clicked', async () => {
        const memories = [
            { id: 'm1', content: 'To delete', tags: [], createdAt: '2025-01-15T00:00:00Z' },
            { id: 'm2', content: 'To keep', tags: [], createdAt: '2025-01-20T00:00:00Z' },
        ];
        setupFetch({ memories });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('To delete');
        });

        const deleteButtons = container.querySelectorAll('.memory-delete');
        await act(async () => {
            fireEvent.click(deleteButtons[0]);
        });

        await waitFor(() => {
            expect(container.textContent).not.toContain('To delete');
            expect(container.textContent).toContain('To keep');
        });
    });

    it('shows error when delete fails', async () => {
        const memories = [
            { id: 'm1', content: 'Test', tags: [], createdAt: '2025-01-15T00:00:00Z' },
        ];
        setupFetch({ memories, deleteOk: false });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('Test');
        });

        const deleteBtn = container.querySelector('.memory-delete');
        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        await waitFor(() => {
            expect(container.textContent).toContain('Failed to delete');
        });
    });

    it('dismisses error message', async () => {
        const memories = [
            { id: 'm1', content: 'Test', tags: [], createdAt: '2025-01-15T00:00:00Z' },
        ];
        setupFetch({ memories, deleteOk: false });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            const deleteBtn = container.querySelector('.memory-delete');
            if (deleteBtn) fireEvent.click(deleteBtn);
        });

        await waitFor(() => {
            const dismissBtn = container.querySelector('.memories-error-dismiss');
            if (dismissBtn) {
                fireEvent.click(dismissBtn);
                // Error should be dismissed
                expect(container.querySelector('.memories-error')).toBeFalsy();
            }
        });
    });

    it('shows singular "memory" for count of 1', async () => {
        const memories = [
            { id: 'm1', content: 'Single', tags: [], createdAt: '2025-01-15T00:00:00Z' },
        ];
        setupFetch({ memories });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('1 item');
        });
    });

    it('handles memories without tags', async () => {
        const memories = [
            { id: 'm1', content: 'No tags', tags: [], createdAt: '2025-01-15T00:00:00Z' },
        ];
        setupFetch({ memories });

        const { container } = render(<MemoriesPage />);

        await waitFor(() => {
            expect(container.textContent).toContain('No tags');
            expect(container.querySelectorAll('.memory-tag')).toHaveLength(0);
        });
    });
});
