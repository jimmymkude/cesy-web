'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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
                    <button onClick={() => setError(null)} className="memories-error-dismiss">✕</button>
                </div>
            )}

            {loading ? (
                <div className="memories-loading">
                    <div className="spinner" style={{ width: 24, height: 24 }} />
                    <span>Loading memories...</span>
                </div>
            ) : memories.length === 0 ? (
                <div className="memories-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                        <path d="M12 8v4M12 16h.01" />
                    </svg>
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
                                <p className="memory-text">{memory.content}</p>
                                <div className="memory-meta">
                                    <span className="memory-date">{formatDate(memory.createdAt)}</span>
                                    {memory.tags && memory.tags.length > 0 && (
                                        <div className="memory-tags">
                                            {memory.tags.map((tag, i) => (
                                                <span key={i} className="memory-tag">{tag}</span>
                                            ))}
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
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
