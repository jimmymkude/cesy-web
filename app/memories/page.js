'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, Trash2, X, Terminal, MessageSquare } from 'lucide-react';
import AppShell from '@/components/AppShell';

const getTagColor = (tag) => {
    const colors = ['#facc15', '#00d2b4', '#ff4757', '#a855f7', '#3b82f6', '#f97316', '#fbbf24'];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export default function MemoriesPage() {
    const { user } = useAuth();
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [dbUserId, setDbUserId] = useState(null);
    const [flipState, setFlipState] = useState({});
    const [relatedCache, setRelatedCache] = useState({});

    useEffect(() => {
        if (!user) return;
        fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firebaseUid: user.uid,
                email: user.email,
                fullName: user.displayName,
                avatarUrl: user.photoURL,
            }),
        })
            .then((r) => r.json())
            .then((d) => { if (d.user?.id) setDbUserId(d.user.id); })
            .catch(() => { });
    }, [user]);

    const fetchMemories = useCallback(async () => {
        if (!dbUserId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/memories?userId=${dbUserId}&limit=100`);
            const data = await res.json();
            setMemories(data.memories || []);
        } catch {
            setError('Failed to load memories');
        } finally {
            setLoading(false);
        }
    }, [dbUserId]);

    useEffect(() => { fetchMemories(); }, [fetchMemories]);

    const handleDelete = async (memoryId) => {
        setDeletingId(memoryId);
        try {
            const res = await fetch(`/api/memories?id=${memoryId}`, { method: 'DELETE' });
            if (res.ok) {
                setMemories((prev) => prev.filter((m) => m.id !== memoryId));
            } else {
                setError('Failed to delete memory');
            }
        } catch {
            setError('Failed to delete memory');
        } finally {
            setDeletingId(null);
        }
    };

    const handleFlip = async (memory) => {
        const id = memory.id;
        const isFlipped = flipState[id] === 'loading' || flipState[id] === 'done';
        if (isFlipped) {
            setFlipState((prev) => ({ ...prev, [id]: undefined }));
            return;
        }
        if (!relatedCache[id]) {
            setFlipState((prev) => ({ ...prev, [id]: 'loading' }));
            try {
                const res = await fetch(`/api/memories?userId=${dbUserId}&q=${encodeURIComponent(memory.content)}&limit=4`);
                const data = await res.json();
                const related = (data.memories || []).filter((m) => m.id !== id).slice(0, 3);
                setRelatedCache((prev) => ({ ...prev, [id]: related }));
            } catch {
                setRelatedCache((prev) => ({ ...prev, [id]: [] }));
            }
        }
        setFlipState((prev) => ({ ...prev, [id]: 'done' }));
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <AppShell>
            <div className="memories-page">
                <div className="memories-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Brain size={24} color="var(--color-accent)" strokeWidth={2} />
                    <h2 className="memories-title" style={{ margin: 0 }}>Memories</h2>
                    <span className="memories-count" style={{ margin: 0, marginTop: '2px' }}>
                        {memories.length} item{memories.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <p className="memories-subtitle" style={{ marginBottom: 'var(--space-6)' }}>
                    What Cesy remembers about you · tap cards to explore
                </p>

                {error && (
                    <div className="memories-error">
                        {error}
                        <button onClick={() => setError(null)} className="memories-error-dismiss">
                            <X size={16} strokeWidth={2} />
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="memories-loading">
                        <div className="spinner" style={{ width: 24, height: 24 }} />
                        <span>Loading memories...</span>
                    </div>
                ) : memories.length === 0 ? (
                    <div className="memories-empty">
                        <Brain size={48} color="var(--color-accent)" strokeWidth={1} style={{ opacity: 0.3 }} />
                        <p>No memories yet</p>
                        <p style={{ opacity: 0.6, fontSize: '0.8rem', textAlign: 'center', maxWidth: '300px' }}>
                            Chat with Cesy and she&apos;ll remember important things about you.
                        </p>
                    </div>
                ) : (
                    <div className="memory-grid">
                        {memories.map((memory) => {
                            const state = flipState[memory.id];
                            const isFlipped = state === 'loading' || state === 'done';
                            const related = relatedCache[memory.id];
                            const chatUrl = `/?context=${encodeURIComponent(`Tell me more about: ${memory.content}`)}`;
                            const isEvent = memory.tags?.includes('event');

                            return (
                                <div
                                    key={memory.id}
                                    className={`flip-card${isFlipped ? ' flipped' : ''}`}
                                    onClick={() => handleFlip(memory)}
                                    style={{ minHeight: '100px' }}
                                >
                                    <div className="flip-card-inner">
                                        {/* FRONT */}
                                        <div className="flip-card-front">
                                            <div className="memory-card" style={{ height: '100%', boxSizing: 'border-box' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: isEvent ? 'var(--color-accent)' : undefined, marginBottom: '6px' }}>
                                                        <Terminal size={14} />
                                                        <span>Observation</span>
                                                        <span style={{ opacity: 0.5 }}>• {formatDate(memory.createdAt)}</span>
                                                    </div>
                                                    <p className="memory-content">{memory.content}</p>
                                                    {memory.tags && memory.tags.length > 0 && (
                                                        <div className="memory-tags" style={{ marginTop: '8px' }}>
                                                            {memory.tags.map((tag, i) => {
                                                                const tagColor = getTagColor(tag);
                                                                return (
                                                                    <span
                                                                        key={i}
                                                                        className="memory-tag"
                                                                        style={{ color: tagColor, borderColor: tagColor, boxShadow: `inset 0 0 10px ${tagColor}30` }}
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    className="memory-delete"
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(memory.id); }}
                                                    disabled={deletingId === memory.id}
                                                    title="Delete memory"
                                                >
                                                    {deletingId === memory.id ? (
                                                        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                                    ) : (
                                                        <Trash2 size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* BACK */}
                                        <div className="flip-card-back">
                                            <span className="flip-card-back-label">Related Context</span>
                                            {state === 'loading' ? (
                                                <div className="flip-card-empty">
                                                    <div className="spinner" style={{ width: 16, height: 16 }} />
                                                </div>
                                            ) : related && related.length > 0 ? (
                                                <div className="flip-card-back-related">
                                                    {related.map((r) => (
                                                        <div key={r.id} className="flip-card-related-item">{r.content}</div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flip-card-empty">Nothing connected yet.</div>
                                            )}
                                            <div className="flip-card-back-row" style={{ marginTop: 'auto', paddingTop: '8px' }}>
                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                    {formatDate(memory.createdAt)}
                                                </span>
                                                <a href={chatUrl} className="flip-chat-btn" onClick={(e) => e.stopPropagation()} aria-label="Chat about this">
                                                    <MessageSquare size={16} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
