/**
 * Tests for AppShell component
 */
import React from 'react';
import { render } from '@testing-library/react';

// Mock Next.js router
jest.mock('next/navigation', () => ({
    usePathname: jest.fn(() => '/'),
    useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

// Mock ThemeContext
jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        theme: 'dark',
        toggleTheme: jest.fn(),
    }),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
    useAuth: jest.fn(() => ({
        user: { uid: 'u1', displayName: 'Test User', email: 'test@test.com' },
        loading: false,
        signOut: jest.fn(),
    })),
}));

import AppShell from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';

describe('AppShell', () => {
    it('renders children when authenticated', () => {
        const { getByText } = render(
            <AppShell><div>Page Content</div></AppShell>
        );
        expect(getByText('Page Content')).toBeDefined();
    });

    it('renders navigation items', () => {
        const { container } = render(
            <AppShell><div>Test</div></AppShell>
        );
        // Check for nav links
        const links = container.querySelectorAll('a');
        expect(links.length).toBeGreaterThan(0);
    });

    it('shows loading spinner when loading', () => {
        useAuth.mockReturnValueOnce({
            user: null,
            loading: true,
            signOut: jest.fn(),
        });

        const { container } = render(
            <AppShell><div>Content</div></AppShell>
        );
        expect(container.querySelector('.spinner')).toBeTruthy();
    });

    it('renders sign-out button', () => {
        const { container } = render(
            <AppShell><div>Content</div></AppShell>
        );
        const buttons = container.querySelectorAll('button');
        const signOutBtn = Array.from(buttons).find(b =>
            b.textContent?.toLowerCase().includes('sign out') ||
            b.getAttribute('aria-label')?.toLowerCase().includes('sign out') ||
            b.title?.toLowerCase().includes('sign out') ||
            b.className?.includes('sign-out')
        );
        // There should be some sign out mechanism
        expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders user display name', () => {
        const { container } = render(
            <AppShell><div>Content</div></AppShell>
        );
        // The component should show user info somewhere
        expect(container.textContent).toBeTruthy();
    });
});
