/**
 * Tests for AuthContext — sign in, sign out, error handling
 */
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';

// Mock Firebase modules
const mockOnAuthStateChanged = jest.fn();
const mockSignInWithPopup = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn();
const mockUpdateProfile = jest.fn();
const mockGetAuth = jest.fn(() => ({}));
const mockGetApps = jest.fn(() => []);
const mockInitializeApp = jest.fn(() => ({}));

jest.mock('firebase/app', () => ({
    initializeApp: (...args) => mockInitializeApp(...args),
    getApps: () => mockGetApps(),
}));

jest.mock('firebase/auth', () => ({
    getAuth: (...args) => mockGetAuth(...args),
    GoogleAuthProvider: jest.fn(),
    OAuthProvider: jest.fn().mockImplementation(() => ({ addScope: jest.fn() })),
    signInWithPopup: (...args) => mockSignInWithPopup(...args),
    signInWithEmailAndPassword: (...args) => mockSignInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args) => mockCreateUserWithEmailAndPassword(...args),
    signOut: (...args) => mockSignOut(...args),
    onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
    updateProfile: (...args) => mockUpdateProfile(...args),
}));

// Mock fetch for /api/auth/sync
global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

// Import after mocks
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function AuthConsumer({ onAuth }) {
    const ctx = useAuth();
    React.useEffect(() => { if (onAuth) onAuth(ctx); });
    return (
        <div>
            <span data-testid="user">{ctx.user ? ctx.user.email : 'none'}</span>
            <span data-testid="loading">{ctx.loading ? 'true' : 'false'}</span>
            <span data-testid="error">{ctx.error || 'none'}</span>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        // Default: no apps, init succeeds
        mockGetApps.mockReturnValue([]);
        mockInitializeApp.mockReturnValue({});
        mockGetAuth.mockReturnValue({});
    });

    it('starts in loading state', () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        const { getByTestId } = render(
            <AuthProvider><AuthConsumer /></AuthProvider>
        );
        expect(getByTestId('loading').textContent).toBe('true');
    });

    it('sets user when Firebase auth state changes to signed in', async () => {
        mockOnAuthStateChanged.mockImplementation((auth, cb) => {
            cb({
                uid: 'fb-1',
                email: 'test@test.com',
                displayName: 'Test',
                photoURL: null,
            });
            return jest.fn();
        });

        const { getByTestId } = render(
            <AuthProvider><AuthConsumer /></AuthProvider>
        );

        await waitFor(() => {
            expect(getByTestId('user').textContent).toBe('test@test.com');
            expect(getByTestId('loading').textContent).toBe('false');
        });
    });

    it('sets user to null when signed out', async () => {
        mockOnAuthStateChanged.mockImplementation((auth, cb) => {
            cb(null);
            return jest.fn();
        });

        const { getByTestId } = render(
            <AuthProvider><AuthConsumer /></AuthProvider>
        );

        await waitFor(() => {
            expect(getByTestId('user').textContent).toBe('none');
            expect(getByTestId('loading').textContent).toBe('false');
        });
    });

    it('calls signInWithGoogle', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignInWithPopup.mockResolvedValue({});

        let authCtx;
        render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.signInWithGoogle();
        });

        expect(mockSignInWithPopup).toHaveBeenCalled();
    });

    it('calls signInWithApple', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignInWithPopup.mockResolvedValue({});

        let authCtx;
        render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.signInWithApple();
        });

        expect(mockSignInWithPopup).toHaveBeenCalled();
    });

    it('calls signInWithEmail', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignInWithEmailAndPassword.mockResolvedValue({});

        let authCtx;
        render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.signInWithEmail('test@test.com', 'password123');
        });

        expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
            expect.anything(), 'test@test.com', 'password123'
        );
    });

    it('calls createAccount and updates profile', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        const mockUser = { uid: 'u1' };
        mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });
        mockUpdateProfile.mockResolvedValue();

        let authCtx;
        render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.createAccount('Test', 'test@test.com', 'pass');
        });

        expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalled();
        expect(mockUpdateProfile).toHaveBeenCalledWith(mockUser, { displayName: 'Test' });
    });

    it('calls signOut', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignOut.mockResolvedValue();

        let authCtx;
        render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.signOut();
        });

        expect(mockSignOut).toHaveBeenCalled();
    });

    it('sets error on sign-in failure', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignInWithPopup.mockRejectedValue(new Error('Auth failed'));

        let authCtx;
        const { getByTestId } = render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            try { await authCtx.signInWithGoogle(); } catch { }
        });

        expect(getByTestId('error').textContent).toBe('Auth failed');
    });

    it('sets error on email sign-in failure', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignInWithEmailAndPassword.mockRejectedValue(new Error('Bad creds'));

        let authCtx;
        const { getByTestId } = render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            try { await authCtx.signInWithEmail('x@x.com', 'wrong'); } catch { }
        });

        expect(getByTestId('error').textContent).toBe('Bad creds');
    });

    it('sets error on createAccount failure', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockCreateUserWithEmailAndPassword.mockRejectedValue(new Error('Exists'));

        let authCtx;
        const { getByTestId } = render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            try { await authCtx.createAccount('A', 'a@a.com', 'p'); } catch { }
        });

        expect(getByTestId('error').textContent).toBe('Exists');
    });

    it('sets error on signOut failure', async () => {
        mockOnAuthStateChanged.mockImplementation(() => jest.fn());
        mockSignOut.mockRejectedValue(new Error('Sign out failed'));

        let authCtx;
        const { getByTestId } = render(
            <AuthProvider>
                <AuthConsumer onAuth={(ctx) => { authCtx = ctx; }} />
            </AuthProvider>
        );

        await act(async () => {
            await authCtx.signOut();
        });

        expect(getByTestId('error').textContent).toBe('Sign out failed');
    });

    it('throws when useAuth is used outside provider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<AuthConsumer />)).toThrow('useAuth must be used within AuthProvider');
        spy.mockRestore();
    });

    it('syncs user profile via fetch on auth state change', async () => {
        mockOnAuthStateChanged.mockImplementation((auth, cb) => {
            cb({ uid: 'fb-1', email: 'test@test.com', displayName: 'Test', photoURL: null });
            return jest.fn();
        });

        render(<AuthProvider><AuthConsumer /></AuthProvider>);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/auth/sync', expect.objectContaining({
                method: 'POST',
            }));
        });
    });

    it('handles existing Firebase app', async () => {
        mockGetApps.mockReturnValue([{}]); // already initialized
        mockOnAuthStateChanged.mockImplementation((auth, cb) => {
            cb(null);
            return jest.fn();
        });

        const { getByTestId } = render(
            <AuthProvider><AuthConsumer /></AuthProvider>
        );

        await waitFor(() => {
            expect(getByTestId('loading').textContent).toBe('false');
        });
    });
});
