'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, Trash2, X, Terminal } from 'lucide-react';
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

    // Sync user to get DB ID
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
            .then((d) => {
                if (d.user?.id) setDbUserId(d.user.id);
            })
            .catch(() => { });
    }, [user]);

    // Fetch memories when dbUserId is available
    const fetchMemories = useCallback(async () => {
        if (!dbUserId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/memories?userId=${dbUserId}&limit=100`);
            const data = await res.json();
            setMemories(data.memories || []);
        } catch (e) {
            setError('Failed to load memories');
        } finally {
            setLoading(false);
        }
    }, [dbUserId]);

    useEffect(() => {
        fetchMemories();
    }, [fetchMemories]);

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

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <AppShell>
            <div className="memories-page">
                <div className="memories-header">
                    <h1 className="memories-title">Memories</h1>
                    <p className="memories-subtitle">
                        What Cesy remembers about you
                    </p>
                </div>

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
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                            <Brain size={48} strokeWidth={1.5} style={{ opacity: 0.4 }} />
                        </div>
                        <p className="memories-empty-title">No memories yet</p>
                        <p className="memories-empty-desc">
                            Chat with Cesy and she&apos;ll remember important things about you — your preferences, goals, and more.
                        </p>
                    </div>
                ) : (
                    <div className="memories-list">
                        <div className="memories-count">
                            {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
                        </div>
                        {memories.map((memory) => (
                            <div key={memory.id} className="memory-card">
                                <div className="memory-content">
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                                        <Terminal size={18} color="var(--color-accent)" style={{ marginTop: '4px', flexShrink: 0, opacity: 0.8 }} />
                                        <p className="memory-text" style={{ margin: 0 }}>{memory.content}</p>
                                    </div>
                                    <div className="memory-meta">
                                        <span className="memory-date">{formatDate(memory.createdAt)}</span>
                                        {memory.tags && memory.tags.length > 0 && (
                                            <div className="memory-tags">
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
                                </div>
                                <button
                                    className="memory-delete"
                                    onClick={() => handleDelete(memory.id)}
                                    disabled={deletingId === memory.id}
                                    title="Delete memory"
                                >
                                    {deletingId === memory.id ? (
                                        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                    ) : (
                                        <Trash2 size={16} strokeWidth={2} />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
