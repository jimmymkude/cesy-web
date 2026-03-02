'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';

export default function WorkoutPage() {
    const { user, loading } = useAuth();

    if (loading) return null;
    if (!user) return <LoginPage />;

    return (
        <AppShell>
            <div style={{ padding: 'var(--space-8)', maxWidth: '700px', margin: '0 auto' }}>
                <h1 style={{
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 'var(--weight-bold)',
                    marginBottom: 'var(--space-6)',
                }}>
                    Workout Schedule
                </h1>

                <div className="empty-state">
                    <div className="empty-state-icon">🏋️</div>
                    <h2 className="empty-state-title">No Schedule Yet</h2>
                    <p className="empty-state-description">
                        Ask Cesy to create a workout schedule for you in the chat. Just say something like &ldquo;Create a weekly workout plan for me&rdquo;!
                    </p>
                    <a href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
                        💬 Go to Chat
                    </a>
                </div>
            </div>
        </AppShell>
    );
}
