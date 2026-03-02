'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
    const { signInWithGoogle, signInWithApple, signInWithEmail, createAccount, error } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (mode === 'register') {
                await createAccount(name, email, password);
            } else {
                await signInWithEmail(email, password);
            }
        } catch {
            // Error handled by context
        } finally {
            setIsLoading(false);
        }
    };

    const handleSSO = async (provider) => {
        setIsLoading(true);
        try {
            if (provider === 'google') {
                await signInWithGoogle();
            } else {
                await signInWithApple();
            }
        } catch {
            // Error handled by context
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <img src="/cesy-logo.png" alt="Cesy" className="login-logo" style={{ objectFit: 'cover' }} />
                    <h1 className="login-title">Welcome to Cesy</h1>
                    <p className="login-subtitle">Your AI-powered fitness assistant</p>
                </div>

                <div className="sso-buttons">
                    <button
                        className="sso-btn"
                        onClick={() => handleSSO('google')}
                        disabled={isLoading}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    <button
                        className="sso-btn"
                        onClick={() => handleSSO('apple')}
                        disabled={isLoading}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                        Continue with Apple
                    </button>
                </div>

                <div className="login-divider">or</div>

                <form onSubmit={handleSubmit}>
                    {mode === 'register' && (
                        <div style={{ marginBottom: 'var(--space-3)' }}>
                            <input
                                className="input"
                                type="text"
                                placeholder="Full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    )}
                    <div style={{ marginBottom: 'var(--space-3)' }}>
                        <input
                            className="input"
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                        <input
                            className="input"
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    {error && (
                        <p style={{
                            color: 'var(--color-error)',
                            fontSize: 'var(--text-sm)',
                            marginBottom: 'var(--space-4)',
                            textAlign: 'center',
                        }}>
                            {error}
                        </p>
                    )}

                    <button className="btn btn-primary" type="submit" disabled={isLoading} style={{ width: '100%' }}>
                        {isLoading ? (
                            <div className="spinner" />
                        ) : mode === 'register' ? (
                            'Create Account'
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <p style={{
                    textAlign: 'center',
                    marginTop: 'var(--space-6)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                }}>
                    {mode === 'login' ? (
                        <>
                            Don&apos;t have an account?{' '}
                            <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>
                                Sign up
                            </a>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>
                                Sign in
                            </a>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
