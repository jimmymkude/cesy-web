'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect, useCallback } from 'react';
import { Dumbbell, MessageSquare } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WorkoutPage() {
    const { user, loading } = useAuth();
    const [schedule, setSchedule] = useState(null);
    const [loadingSchedule, setLoadingSchedule] = useState(true);

    const fetchSchedule = useCallback(async () => {
        if (!user) return;
        try {
            // Get user's DB ID
            const syncRes = await fetch('/api/auth/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUid: user.uid,
                    email: user.email,
                    fullName: user.displayName,
                }),
            });
            const syncData = await syncRes.json();
            if (!syncData.user?.id) return;

            const res = await fetch(`/api/workout?userId=${syncData.user.id}`);
            const data = await res.json();
            if (data.schedule) {
                setSchedule(data.schedule);
            }
        } catch (e) {
            console.error('Failed to load schedule:', e);
        } finally {
            setLoadingSchedule(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) fetchSchedule();
    }, [user, fetchSchedule]);

    if (loading) return null;
    if (!user) return <LoginPage />;

    const workouts = schedule?.schedule || [];
    const sortedWorkouts = [...workouts].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    return (
        <AppShell>
            <div style={{ padding: 'var(--space-8)', maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)' }}>
                        Workout Schedule
                    </h1>
                    {schedule && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Updated {new Date(schedule.lastUpdated).toLocaleDateString()}
                        </span>
                    )}
                </div>

                {loadingSchedule ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : sortedWorkouts.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {sortedWorkouts.map((workout, i) => {
                            const isToday = new Date().getDay() === workout.dayOfWeek;
                            return (
                                <div
                                    key={i}
                                    className="card"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-4)',
                                        padding: 'var(--space-4) var(--space-5)',
                                        borderColor: isToday ? 'var(--color-accent)' : undefined,
                                        boxShadow: isToday ? 'var(--shadow-glow)' : undefined,
                                    }}
                                >
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 'var(--radius-md)',
                                        background: isToday ? 'var(--gradient-accent)' : 'var(--color-bg-tertiary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 'var(--text-lg)',
                                        flexShrink: 0,
                                    }}>
                                        <Dumbbell size={24} color="var(--color-text-primary)" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-1)',
                                        }}>
                                            <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
                                                {workout.dayName || DAY_NAMES[workout.dayOfWeek]}
                                            </span>
                                            {isToday && (
                                                <span style={{
                                                    fontSize: 'var(--text-xs)',
                                                    padding: '1px 8px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: 'var(--color-accent-soft)',
                                                    color: 'var(--color-accent)',
                                                    fontWeight: 'var(--weight-medium)',
                                                }}>
                                                    Today
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                            {workout.workoutType}
                                            <span style={{ color: 'var(--color-text-muted)', marginLeft: 'var(--space-2)' }}>
                                                · {workout.duration} min
                                            </span>
                                        </div>
                                        {workout.equipment?.length > 0 && (
                                            <div style={{
                                                fontSize: 'var(--text-xs)',
                                                color: 'var(--color-text-muted)',
                                                marginTop: 'var(--space-1)',
                                            }}>
                                                Equipment: {workout.equipment.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center' }}>
                            <Dumbbell size={48} strokeWidth={1.5} />
                        </div>
                        <h2 className="empty-state-title">No Schedule Yet</h2>
                        <p className="empty-state-description">
                            Ask Cesy to create a workout schedule for you in the chat. Try: &ldquo;Create a weekly workout plan for me&rdquo;
                        </p>
                        <a href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-6)', display: 'inline-flex', gap: '8px' }}>
                            <MessageSquare size={18} /> Go to Chat
                        </a>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
