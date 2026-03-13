/**
 * Tests for LoginPage component
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react';

// Mock AuthContext
const mockSignInWithGoogle = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithEmail = jest.fn();
const mockCreateAccount = jest.fn();
let mockError = null;

jest.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        signInWithGoogle: mockSignInWithGoogle,
        signInWithApple: mockSignInWithApple,
        signInWithEmail: mockSignInWithEmail,
        createAccount: mockCreateAccount,
        error: mockError,
    }),
}));

// Mock ThemeContext
jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: jest.fn() }),
}));

import LoginPage from '@/components/LoginPage';

describe('LoginPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockError = null;
        mockSignInWithGoogle.mockResolvedValue();
        mockSignInWithApple.mockResolvedValue();
        mockSignInWithEmail.mockResolvedValue();
        mockCreateAccount.mockResolvedValue();
    });

    it('renders login page with brand name', () => {
        const { container } = render(<LoginPage />);
        expect(container.textContent).toContain('Cesy');
    });

    it('renders subtitle', () => {
        const { container } = render(<LoginPage />);
        expect(container.textContent).toContain('AI-powered assistant');
    });

    it('renders Google sign-in button', () => {
        const { container } = render(<LoginPage />);
        const buttons = Array.from(container.querySelectorAll('button'));
        const googleBtn = buttons.find(b => b.textContent?.includes('Google'));
        expect(googleBtn).toBeTruthy();
    });

    it('renders Apple sign-in button', () => {
        const { container } = render(<LoginPage />);
        const buttons = Array.from(container.querySelectorAll('button'));
        const appleBtn = buttons.find(b => b.textContent?.includes('Apple'));
        expect(appleBtn).toBeTruthy();
    });

    it('calls signInWithGoogle when Google button clicked', async () => {
        const { container } = render(<LoginPage />);
        const buttons = Array.from(container.querySelectorAll('button'));
        const googleBtn = buttons.find(b => b.textContent?.includes('Google'));
        await act(async () => {
            fireEvent.click(googleBtn);
        });
        expect(mockSignInWithGoogle).toHaveBeenCalled();
    });

    it('calls signInWithApple when Apple button clicked', async () => {
        const { container } = render(<LoginPage />);
        const buttons = Array.from(container.querySelectorAll('button'));
        const appleBtn = buttons.find(b => b.textContent?.includes('Apple'));
        await act(async () => {
            fireEvent.click(appleBtn);
        });
        expect(mockSignInWithApple).toHaveBeenCalled();
    });

    it('renders email and password inputs', () => {
        const { container } = render(<LoginPage />);
        const emailInput = container.querySelector('input[type="email"]');
        const passInput = container.querySelector('input[type="password"]');
        expect(emailInput).toBeTruthy();
        expect(passInput).toBeTruthy();
    });

    it('submits login form with email and password', async () => {
        const { container } = render(<LoginPage />);
        const emailInput = container.querySelector('input[type="email"]');
        const passInput = container.querySelector('input[type="password"]');
        const form = container.querySelector('form');

        fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
        fireEvent.change(passInput, { target: { value: 'password123' } });

        await act(async () => {
            fireEvent.submit(form);
        });

        expect(mockSignInWithEmail).toHaveBeenCalledWith('test@test.com', 'password123');
    });

    it('switches to register mode and shows name field', () => {
        const { container, getByText } = render(<LoginPage />);
        const signUpLink = getByText('Sign up');
        fireEvent.click(signUpLink);

        const nameInput = container.querySelector('input[type="text"]');
        expect(nameInput).toBeTruthy();
    });

    it('submits register form with name, email, and password', async () => {
        const { container, getByText } = render(<LoginPage />);

        // Switch to register mode
        fireEvent.click(getByText('Sign up'));

        const nameInput = container.querySelector('input[type="text"]');
        const emailInput = container.querySelector('input[type="email"]');
        const passInput = container.querySelector('input[type="password"]');
        const form = container.querySelector('form');

        fireEvent.change(nameInput, { target: { value: 'Test User' } });
        fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
        fireEvent.change(passInput, { target: { value: 'password123' } });

        await act(async () => {
            fireEvent.submit(form);
        });

        expect(mockCreateAccount).toHaveBeenCalledWith('Test User', 'test@test.com', 'password123');
    });

    it('switches back to login mode from register', () => {
        const { container, getByText } = render(<LoginPage />);

        // Switch to register
        fireEvent.click(getByText('Sign up'));
        expect(container.textContent).toContain('Create Account');

        // Switch back to login
        fireEvent.click(getByText('Sign in'));
        expect(container.textContent).toContain('Sign In');
    });

    it('handles SSO error gracefully', async () => {
        mockSignInWithGoogle.mockRejectedValue(new Error('Auth failed'));

        const { container } = render(<LoginPage />);
        const buttons = Array.from(container.querySelectorAll('button'));
        const googleBtn = buttons.find(b => b.textContent?.includes('Google'));

        await act(async () => {
            fireEvent.click(googleBtn);
        });

        // Should not crash — error handled by context
        expect(container).toBeTruthy();
    });

    it('handles form submit error gracefully', async () => {
        mockSignInWithEmail.mockRejectedValue(new Error('Bad creds'));

        const { container } = render(<LoginPage />);
        const emailInput = container.querySelector('input[type="email"]');
        const passInput = container.querySelector('input[type="password"]');
        const form = container.querySelector('form');

        fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
        fireEvent.change(passInput, { target: { value: 'wrong' } });

        await act(async () => {
            fireEvent.submit(form);
        });

        // Should not crash
        expect(container).toBeTruthy();
    });

    it('shows Sign In text on submit button in login mode', () => {
        const { container } = render(<LoginPage />);
        const submitBtn = container.querySelector('button[type="submit"]');
        expect(submitBtn.textContent).toContain('Sign In');
    });

    it('shows Create Account text on submit button in register mode', () => {
        const { getByText, container } = render(<LoginPage />);
        fireEvent.click(getByText('Sign up'));
        const submitBtn = container.querySelector('button[type="submit"]');
        expect(submitBtn.textContent).toContain('Create Account');
    });

    it('renders logo', () => {
        const { container } = render(<LoginPage />);
        const logo = container.querySelector('.login-logo-icon');
        expect(logo).toBeTruthy();
    });
});
