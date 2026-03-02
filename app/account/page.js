'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';

export default function AccountPage() {
    const { user, loading, signOut } = useAuth();

    if (loading) return null;
    if (!user) return <LoginPage />;

    const initials = user.displayName
        ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase()
        : user.email?.[0]?.toUpperCase() || '?';

    return (
        <AppShell>
            <div style={{ padding: 'var(--space-8)', maxWidth: '700px', margin: '0 auto' }}>
                <h1 style={{
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 'var(--weight-bold)',
                    marginBottom: 'var(--space-6)',
                }}>
                    Account
                </h1>

                <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                        <div style={{
                            width: 64,
                            height: 64,
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--gradient-accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: 'var(--text-xl)',
                            fontWeight: 'var(--weight-bold)',
                            flexShrink: 0,
                        }}>
                            {user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt=""
                                    style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}
                                />
                            ) : (
                                initials
                            )}
                        </div>
                        <div>
                            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>
                                {user.displayName || 'User'}
                            </div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                {user.email}
                            </div>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-4)' }}>
                        <div className="setting-row">
                            <div className="setting-label">Subscription</div>
                            <div style={{
                                fontSize: 'var(--text-sm)',
                                padding: 'var(--space-1) var(--space-3)',
                                background: 'var(--color-success-soft)',
                                color: 'var(--color-success)',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: 'var(--weight-medium)',
                            }}>
                                Free
                            </div>
                        </div>
                        <div className="setting-row">
                            <div className="setting-label">Member since</div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-danger"
                    onClick={signOut}
                    style={{ width: '100%' }}
                >
                    🚪 Sign Out
                </button>
            </div>
        </AppShell>
    );
}
