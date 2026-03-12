'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Mail, Check, X } from 'lucide-react';

export default function GroupsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [dbUserId, setDbUserId] = useState(null);
    const [groups, setGroups] = useState([]);
    const [invites, setInvites] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!user) return;
        async function syncUser() {
            try {
                const res = await fetch('/api/auth/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        firebaseUid: user.uid,
                        email: user.email,
                        fullName: user.displayName,
                        avatarUrl: user.photoURL,
                    }),
                });
                const data = await res.json();
                if (data.user?.id) setDbUserId(data.user.id);
            } catch { /* ignore */ }
        }
        syncUser();
    }, [user]);

    const loadGroups = useCallback(async () => {
        if (!dbUserId) return;
        try {
            const res = await fetch(`/api/groups?userId=${dbUserId}`);
            const data = await res.json();
            if (data.groups) setGroups(data.groups);
        } catch { /* ignore */ }
    }, [dbUserId]);

    const loadInvites = useCallback(async () => {
        if (!dbUserId) return;
        try {
            const res = await fetch(`/api/groups/invites?userId=${dbUserId}`);
            const data = await res.json();
            if (data.invites) setInvites(data.invites);
        } catch { /* ignore */ }
    }, [dbUserId]);

    useEffect(() => {
        loadGroups();
        loadInvites();
    }, [loadGroups, loadInvites]);

    const createGroup = async () => {
        if (!newGroupName.trim() || creating) return;
        setCreating(true);
        try {
            const res = await fetch('/api/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, name: newGroupName.trim() }),
            });
            if (res.ok) {
                setNewGroupName('');
                setShowCreate(false);
                loadGroups();
            }
        } catch { /* ignore */ }
        setCreating(false);
    };

    const handleInvite = async (inviteId, action) => {
        try {
            await fetch('/api/groups/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId, action }),
            });
            loadInvites();
            if (action === 'accept') loadGroups();
        } catch { /* ignore */ }
    };

    if (loading) return null;
    if (!user) return <LoginPage />;

    return (
        <AppShell>
            <div className="groups-page">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                    <h1 className="settings-title" style={{ margin: 0 }}>Groups</h1>
                    <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                        <Plus size={16} /> New Group
                    </button>
                </div>

                {/* Create Group Form */}
                {showCreate && (
                    <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="Group name..."
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                            autoFocus
                            maxLength={50}
                        />
                        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={createGroup} disabled={!newGroupName.trim() || creating}>
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Pending Invites */}
                {invites.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                        <h3 className="friends-section-title">
                            <Mail size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            Group Invites
                        </h3>
                        <div className="friends-list">
                            {invites.map((inv) => (
                                <div key={inv.id} className="friend-card">
                                    <div className="group-icon" style={{ width: 36, height: 36, fontSize: 'var(--text-sm)' }}>
                                        {inv.group.name[0]}
                                    </div>
                                    <div className="friend-info">
                                        <div className="friend-name">{inv.group.name}</div>
                                        <div className="friend-username">Invited by {inv.inviter.fullName || inv.inviter.username}</div>
                                    </div>
                                    <div className="friend-actions">
                                        <button className="btn btn-sm btn-primary" onClick={() => handleInvite(inv.id, 'accept')}>
                                            <Check size={14} /> Join
                                        </button>
                                        <button className="btn btn-sm btn-ghost" onClick={() => handleInvite(inv.id, 'decline')}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Groups List */}
                <div className="friends-list">
                    {groups.length === 0 ? (
                        <div className="friends-empty">
                            <Users size={40} strokeWidth={1.5} />
                            <p>No groups yet. Create one and invite your friends!</p>
                        </div>
                    ) : (
                        groups.map((group) => (
                            <div
                                key={group.id}
                                className="group-card"
                                onClick={() => router.push(`/groups/${group.id}`)}
                            >
                                <div className="group-icon">{group.name[0]}</div>
                                <div className="group-info">
                                    <div className="group-name">{group.name}</div>
                                    <div className="group-meta">
                                        {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                                        {group.myRole === 'admin' && ' · Admin'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </AppShell>
    );
}
