'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, Check, X, Clock, Users } from 'lucide-react';

export default function FriendsPage() {
    const { user, loading } = useAuth();
    const [dbUserId, setDbUserId] = useState(null);
    const [friends, setFriends] = useState([]);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [activeTab, setActiveTab] = useState('friends'); // friends, requests, search

    // Sync user to get DB ID
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

    const loadFriends = useCallback(async () => {
        if (!dbUserId) return;
        try {
            const res = await fetch(`/api/friends?userId=${dbUserId}`);
            const data = await res.json();
            if (data.friends) setFriends(data.friends);
        } catch { /* ignore */ }
    }, [dbUserId]);

    const loadRequests = useCallback(async () => {
        if (!dbUserId) return;
        try {
            const res = await fetch(`/api/friends/requests?userId=${dbUserId}`);
            const data = await res.json();
            if (data.incoming) setIncoming(data.incoming);
            if (data.outgoing) setOutgoing(data.outgoing);
        } catch { /* ignore */ }
    }, [dbUserId]);

    useEffect(() => {
        loadFriends();
        loadRequests();
    }, [loadFriends, loadRequests]);

    const searchUsers = async (q) => {
        setSearchQuery(q);
        if (q.length < 2) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&userId=${dbUserId}`);
            const data = await res.json();
            if (data.users) setSearchResults(data.users);
        } catch { /* ignore */ }
        setSearching(false);
    };

    const sendFriendRequest = async (friendId) => {
        try {
            const res = await fetch('/api/friends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, friendId }),
            });
            if (res.ok) {
                loadRequests();
                // Remove from search results
                setSearchResults((prev) => prev.filter((u) => u.id !== friendId));
            }
        } catch { /* ignore */ }
    };

    const handleRequest = async (friendshipId, action) => {
        try {
            await fetch('/api/friends/requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friendshipId, action }),
            });
            loadRequests();
            if (action === 'accept') loadFriends();
        } catch { /* ignore */ }
    };

    if (loading) return null;
    if (!user) return <LoginPage />;

    const totalPending = incoming.length;

    return (
        <AppShell>
            <div className="friends-page">
                <h1 className="settings-title">Friends</h1>

                {/* Tab Switcher */}
                <div className="friends-tabs">
                    <button
                        className={`friends-tab${activeTab === 'friends' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('friends')}
                    >
                        <Users size={16} /> Friends ({friends.length})
                    </button>
                    <button
                        className={`friends-tab${activeTab === 'requests' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        <Clock size={16} /> Requests
                        {totalPending > 0 && <span className="friends-badge">{totalPending}</span>}
                    </button>
                    <button
                        className={`friends-tab${activeTab === 'search' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('search')}
                    >
                        <Search size={16} /> Find
                    </button>
                </div>

                {/* Friends List */}
                {activeTab === 'friends' && (
                    <div className="friends-list">
                        {friends.length === 0 ? (
                            <div className="friends-empty">
                                <Users size={40} strokeWidth={1.5} />
                                <p>No friends yet. Search for users to add!</p>
                                <button className="btn btn-primary" onClick={() => setActiveTab('search')}>
                                    <UserPlus size={16} /> Find Friends
                                </button>
                            </div>
                        ) : (
                            friends.map((friend) => (
                                <div key={friend.id} className="friend-card">
                                    <div className="friend-avatar">
                                        {friend.avatarUrl ? (
                                            <img src={friend.avatarUrl} alt="" className="friend-avatar-img" />
                                        ) : (
                                            <span>{(friend.fullName || '?')[0].toUpperCase()}</span>
                                        )}
                                    </div>
                                    <div className="friend-info">
                                        <div className="friend-name">{friend.fullName || 'User'}</div>
                                        <div className="friend-username">@{friend.username}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Requests */}
                {activeTab === 'requests' && (
                    <div className="friends-list">
                        {incoming.length > 0 && (
                            <>
                                <h3 className="friends-section-title">Incoming Requests</h3>
                                {incoming.map((req) => (
                                    <div key={req.id} className="friend-card">
                                        <div className="friend-avatar">
                                            {req.requester.avatarUrl ? (
                                                <img src={req.requester.avatarUrl} alt="" className="friend-avatar-img" />
                                            ) : (
                                                <span>{(req.requester.fullName || '?')[0].toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="friend-info">
                                            <div className="friend-name">{req.requester.fullName}</div>
                                            <div className="friend-username">@{req.requester.username}</div>
                                        </div>
                                        <div className="friend-actions">
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => handleRequest(req.id, 'accept')}
                                            >
                                                <Check size={14} /> Accept
                                            </button>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => handleRequest(req.id, 'reject')}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}

                        {outgoing.length > 0 && (
                            <>
                                <h3 className="friends-section-title">Sent Requests</h3>
                                {outgoing.map((req) => (
                                    <div key={req.id} className="friend-card">
                                        <div className="friend-avatar">
                                            {req.addressee.avatarUrl ? (
                                                <img src={req.addressee.avatarUrl} alt="" className="friend-avatar-img" />
                                            ) : (
                                                <span>{(req.addressee.fullName || '?')[0].toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="friend-info">
                                            <div className="friend-name">{req.addressee.fullName}</div>
                                            <div className="friend-username">@{req.addressee.username}</div>
                                        </div>
                                        <span className="friend-pending-badge">Pending</span>
                                    </div>
                                ))}
                            </>
                        )}

                        {incoming.length === 0 && outgoing.length === 0 && (
                            <div className="friends-empty">
                                <Clock size={40} strokeWidth={1.5} />
                                <p>No pending requests</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Search */}
                {activeTab === 'search' && (
                    <div className="friends-list">
                        <div className="friends-search-wrapper">
                            <Search size={18} className="friends-search-icon" />
                            <input
                                type="text"
                                className="input friends-search-input"
                                placeholder="Search by username..."
                                value={searchQuery}
                                onChange={(e) => searchUsers(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {searching && <div className="friends-loading">Searching...</div>}
                        {searchResults.map((u) => (
                            <div key={u.id} className="friend-card">
                                <div className="friend-avatar">
                                    {u.avatarUrl ? (
                                        <img src={u.avatarUrl} alt="" className="friend-avatar-img" />
                                    ) : (
                                        <span>{(u.fullName || '?')[0].toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="friend-info">
                                    <div className="friend-name">{u.fullName || 'User'}</div>
                                    <div className="friend-username">@{u.username}</div>
                                </div>
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => sendFriendRequest(u.id)}
                                >
                                    <UserPlus size={14} /> Add
                                </button>
                            </div>
                        ))}
                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                            <div className="friends-empty">
                                <p>No users found for &ldquo;{searchQuery}&rdquo;</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
