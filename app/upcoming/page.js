'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Trash2, X, Clock, Dumbbell } from 'lucide-react';
import AppShell from '@/components/AppShell';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatEventDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const dateFormatted = date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });
    const timeFormatted = date.getHours() !== 0 || date.getMinutes() !== 0
        ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : null;

    let relative;
    if (diffDays === 0) relative = 'Today';
    else if (diffDays === 1) relative = 'Tomorrow';
    else if (diffDays === -1) relative = 'Yesterday';
    else if (diffDays < -1) relative = `${Math.abs(diffDays)} days ago`;
    else if (diffDays <= 7) relative = `In ${diffDays} days`;
    else relative = null;

    return { dateFormatted, timeFormatted, relative, isPast: diffDays < 0, isToday: diffDays === 0 };
};

const getNextWorkout = (schedule) => {
    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) return null;

    const todayIdx = new Date().getDay();

    // Look through the next 7 days to find the nearest workout
    for (let offset = 0; offset < 7; offset++) {
        const checkIdx = (todayIdx + offset) % 7;
        const dayName = DAYS[checkIdx];
        const workout = schedule.find((w) =>
            w.dayOfWeek && w.dayOfWeek.toLowerCase() === dayName.toLowerCase()
        );
        if (workout) {
            let relative;
            if (offset === 0) relative = 'Today';
            else if (offset === 1) relative = 'Tomorrow';
            else relative = DAYS[checkIdx];
            return { ...workout, relative, daysAway: offset };
        }
    }
    return null;
};

const getTagColor = (tag) => {
    const colors = ['#facc15', '#00d2b4', '#ff4757', '#a855f7', '#3b82f6', '#f97316', '#fbbf24'];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export default function UpcomingPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState([]);
    const [nextWorkout, setNextWorkout] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [dbUserId, setDbUserId] = useState(null);

    useEffect(() => {
        if (!user) return;
        fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firebaseUid: user.uid,
                email: user.email,
                fullName: user.displayName,
            }),
        })
            .then((r) => r.json())
            .then((data) => setDbUserId(data.userId))
            .catch(console.error);
    }, [user]);

    const fetchData = useCallback(async () => {
        if (!dbUserId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [eventsRes, workoutRes] = await Promise.all([
                fetch(`/api/memories?userId=${dbUserId}&type=events`),
                fetch(`/api/workout?userId=${dbUserId}`),
            ]);
            const eventsData = await eventsRes.json();
            const workoutData = await workoutRes.json();

            setEvents(eventsData.memories || []);
            setNextWorkout(getNextWorkout(workoutData.schedule?.schedule));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [dbUserId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDelete = async (id) => {
        setDeletingId(id);
        try {
            await fetch(`/api/memories?id=${id}`, { method: 'DELETE' });
            setEvents((prev) => prev.filter((e) => e.id !== id));
        } catch (err) {
            setError(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    // Separate into upcoming and past events
    const now = new Date();
    const upcoming = events.filter((e) => new Date(e.eventDate) >= new Date(now.toDateString()));
    const past = events.filter((e) => new Date(e.eventDate) < new Date(now.toDateString()));
    const hasContent = upcoming.length > 0 || past.length > 0 || nextWorkout;

    return (
        <AppShell>
            <div className="memories-page">
                <div className="memories-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={24} color="var(--color-accent)" strokeWidth={2} />
                    <h2 className="memories-title" style={{ margin: 0 }}>Upcoming</h2>
                    <span className="memories-count">{upcoming.length} event{upcoming.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="memories-loading">
                        <div className="spinner" style={{ width: 24, height: 24 }} />
                        <span>Loading events...</span>
                    </div>
                ) : error ? (
                    <div className="memories-error">
                        <X size={16} />
                        <span>{error}</span>
                    </div>
                ) : (
                    <>
                        {!hasContent ? (
                            <div className="memories-empty">
                                <Calendar size={48} color="var(--color-accent)" strokeWidth={1} style={{ opacity: 0.3 }} />
                                <p>No events yet</p>
                                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                                    Mention plans to Cesy and they&apos;ll appear here
                                </p>
                            </div>
                        ) : (
                            <>
                                {nextWorkout && (
                                    <div className="memory-grid" style={{ marginBottom: '1rem' }}>
                                        <div
                                            className="memory-card"
                                            style={nextWorkout.daysAway === 0 ? { borderColor: 'var(--color-accent)', borderWidth: '1px', borderStyle: 'solid' } : {}}
                                        >
                                            <div className="memory-card-header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                                                    <Dumbbell size={14} />
                                                    <span>{nextWorkout.relative}</span>
                                                </div>
                                                <span className="memory-tag" style={{ '--tag-color': '#00d2b4', fontSize: '0.7rem' }}>workout</span>
                                            </div>
                                            <p className="memory-content">{nextWorkout.workoutType}</p>
                                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
                                                {nextWorkout.duration && <span>{nextWorkout.duration}</span>}
                                                {nextWorkout.equipment && <span>• {nextWorkout.equipment}</span>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {upcoming.length > 0 && (
                                    <div className="memory-grid">
                                        {upcoming.map((event) => {
                                            const { dateFormatted, timeFormatted, relative, isToday } = formatEventDate(event.eventDate);
                                            const tags = Array.isArray(event.tags) ? event.tags.filter((t) => t !== 'event') : [];
                                            return (
                                                <div
                                                    key={event.id}
                                                    className="memory-card"
                                                    style={isToday ? { borderColor: 'var(--color-accent)', borderWidth: '1px', borderStyle: 'solid' } : {}}
                                                >
                                                    <div className="memory-card-header">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                                                            <Clock size={14} />
                                                            <span>{relative || dateFormatted}</span>
                                                            {timeFormatted && <span style={{ opacity: 0.7 }}>• {timeFormatted}</span>}
                                                        </div>
                                                        <button
                                                            className="memory-delete-btn"
                                                            onClick={() => handleDelete(event.id)}
                                                            disabled={deletingId === event.id}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    <p className="memory-content">{event.content}</p>
                                                    {!relative && (
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '4px' }}>
                                                            {dateFormatted}
                                                        </div>
                                                    )}
                                                    {tags.length > 0 && (
                                                        <div className="memory-tags">
                                                            {tags.map((tag) => (
                                                                <span key={tag} className="memory-tag" style={{ '--tag-color': getTagColor(tag) }}>
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {past.length > 0 && (
                                    <>
                                        <div className="memories-header" style={{ marginTop: '2rem' }}>
                                            <h3 style={{ fontSize: '0.9rem', opacity: 0.5, fontWeight: 500 }}>Past Events</h3>
                                        </div>
                                        <div className="memory-grid">
                                            {past.map((event) => {
                                                const { dateFormatted, relative } = formatEventDate(event.eventDate);
                                                const tags = Array.isArray(event.tags) ? event.tags.filter((t) => t !== 'event') : [];
                                                return (
                                                    <div key={event.id} className="memory-card" style={{ opacity: 0.5 }}>
                                                        <div className="memory-card-header">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', opacity: 0.7 }}>
                                                                <Clock size={14} />
                                                                <span>{relative || dateFormatted}</span>
                                                            </div>
                                                            <button
                                                                className="memory-delete-btn"
                                                                onClick={() => handleDelete(event.id)}
                                                                disabled={deletingId === event.id}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        <p className="memory-content">{event.content}</p>
                                                        {tags.length > 0 && (
                                                            <div className="memory-tags">
                                                                {tags.map((tag) => (
                                                                    <span key={tag} className="memory-tag" style={{ '--tag-color': getTagColor(tag) }}>
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}
