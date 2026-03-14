'use client';

import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Users, MessageSquare, Dumbbell, UserPlus, Shield, ToggleLeft, ToggleRight, LogOut, Crown, X, Brain, Trash2, Sparkles, SmilePlus } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function GroupDetailPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const { groupId } = useParams();
    const [dbUserId, setDbUserId] = useState(null);
    const [group, setGroup] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [friends, setFriends] = useState([]);
    const [groupMemories, setGroupMemories] = useState([]);
    const [inviting, setInviting] = useState(null);
    const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const [myMembership, setMyMembership] = useState(null);

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

    const loadGroup = useCallback(async () => {
        if (!groupId) return;
        try {
            const res = await fetch(`/api/groups/${groupId}`);
            const data = await res.json();
            if (data.group) {
                setGroup(data.group);
                if (dbUserId) {
                    const me = data.group.members.find((m) => m.userId === dbUserId);
                    setMyMembership(me);
                }
            }
        } catch { /* ignore */ }
    }, [groupId, dbUserId]);

    const loadMessages = useCallback(async () => {
        if (!groupId) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/chat?limit=50`);
            const data = await res.json();
            if (data.messages) setMessages(data.messages);
        } catch { /* ignore */ }
    }, [groupId]);

    const loadFriends = useCallback(async () => {
        if (!dbUserId) return;
        try {
            const res = await fetch(`/api/friends?userId=${dbUserId}`);
            const data = await res.json();
            if (data.friends) setFriends(data.friends);
        } catch { /* ignore */ }
    }, [dbUserId]);

    const loadGroupMemories = useCallback(async () => {
        if (!groupId || !dbUserId) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/memories?userId=${dbUserId}`);
            const data = await res.json();
            if (data.memories) setGroupMemories(data.memories);
        } catch { /* ignore */ }
    }, [groupId, dbUserId]);

    const deleteGroupMemory = async (memoryId) => {
        if (!confirm('Delete this group memory?')) return;
        try {
            await fetch(`/api/groups/${groupId}/memories?userId=${dbUserId}&memoryId=${memoryId}`, { method: 'DELETE' });
            setGroupMemories((prev) => prev.filter((m) => m.id !== memoryId));
        } catch { /* ignore */ }
    };

    useEffect(() => {
        loadGroup();
        loadMessages();
        loadFriends();
        loadGroupMemories();
    }, [loadGroup, loadMessages, loadFriends, loadGroupMemories]);



    // Poll for new messages every 5s when on chat tab
    useEffect(() => {
        if (activeTab !== 'chat') return;
        const interval = setInterval(loadMessages, 5000);
        return () => clearInterval(interval);
    }, [activeTab, loadMessages]);

    const sendMessage = async () => {
        if (!input.trim() || sending) return;
        setSending(true);
        const text = input;
        setInput('');


        // Optimistic update
        const optimisticMsg = {
            id: `temp-${Date.now()}`,
            groupId,
            userId: dbUserId,
            userName: user.displayName || 'You',
            role: 'user',
            content: text,
            createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        try {
            const res = await fetch(`/api/groups/${groupId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: dbUserId,
                    userName: user.displayName,
                    content: text,
                }),
            });
            if (res.ok) {
                // Refresh to get real messages + Cesy's reply
                await loadMessages();
            }
        } catch { /* ignore */ }
        setSending(false);
        inputRef.current?.focus();
    };

    const inviteFriend = async (friendId) => {
        setInviting(friendId);
        try {
            await fetch(`/api/groups/${groupId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviterId: dbUserId, inviteeId: friendId }),
            });
        } catch { /* ignore */ }
        setInviting(null);
    };

    const toggleMemorySharing = async () => {
        if (!myMembership) return;
        try {
            await fetch(`/api/groups/${groupId}/members`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: dbUserId,
                    sharePrivateMemories: !myMembership.sharePrivateMemories,
                }),
            });
            loadGroup();
        } catch { /* ignore */ }
    };

    const toggleCesyMode = async () => {
        if (!group) return;
        const newMode = group.cesyMode === 'smart' ? 'keywords' : 'smart';
        try {
            await fetch(`/api/groups/${groupId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, cesyMode: newMode }),
            });
            loadGroup();
        } catch { /* ignore */ }
    };

    const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

    const reactToMessage = async (messageId, emoji) => {
        setReactionPickerMsgId(null);
        try {
            const res = await fetch(`/api/groups/${groupId}/chat/reactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, messageId, emoji }),
            });
            if (res.ok) loadMessages();
        } catch { /* ignore */ }
    };

    const leaveGroup = async () => {
        if (!confirm('Are you sure you want to leave this group?')) return;
        try {
            const res = await fetch(`/api/groups/${groupId}/members`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || 'Failed to leave group');
                return;
            }
            router.push('/groups');
        } catch { /* ignore */ }
    };

    const kickMember = async (targetUserId, name) => {
        if (!confirm(`Remove ${name} from the group?`)) return;
        try {
            await fetch(`/api/groups/${groupId}/members`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, targetUserId }),
            });
            loadGroup();
        } catch { /* ignore */ }
    };

    const promoteMember = async (targetUserId, name) => {
        if (!confirm(`Promote ${name} to admin?`)) return;
        try {
            await fetch(`/api/groups/${groupId}/members`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId, promoteUserId: targetUserId }),
            });
            loadGroup();
        } catch { /* ignore */ }
    };

    if (loading) return null;
    if (!user) return <LoginPage />;
    if (!group) return (
        <AppShell>
            <div className="groups-page">
                <div className="friends-loading">Loading group...</div>
            </div>
        </AppShell>
    );

    const memberIds = group.members.map((m) => m.userId);
    const availableFriends = friends.filter((f) => !memberIds.includes(f.id));
    const today = DAY_NAMES[new Date().getDay()];
    const isAdmin = myMembership?.role === 'admin';

    return (
        <AppShell>
            <div className="group-detail">
                {/* Header */}
                <div className="group-header">
                    <button className="group-header-back" onClick={() => router.push('/groups')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="group-icon" style={{ width: 36, height: 36, fontSize: 'var(--text-sm)' }}>
                        {group.name[0]}
                    </div>
                    <div>
                        <div className="group-name">{group.name}</div>
                        <div className="group-meta">{group.members.length} members</div>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="friends-tabs" style={{ paddingLeft: 'var(--space-4)' }}>
                    <button
                        className={`friends-tab${activeTab === 'chat' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('chat')}
                    >
                        <MessageSquare size={16} /> Chat
                    </button>
                    <button
                        className={`friends-tab${activeTab === 'members' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('members')}
                    >
                        <Users size={16} /> Members
                    </button>
                    <button
                        className={`friends-tab${activeTab === 'memories' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('memories')}
                    >
                        <Brain size={16} /> Memories
                    </button>
                    <button
                        className={`friends-tab${activeTab === 'workouts' ? ' friends-tab-active' : ''}`}
                        onClick={() => setActiveTab('workouts')}
                    >
                        <Dumbbell size={16} /> Workouts
                    </button>
                </div>

                {/* Chat Tab */}
                {activeTab === 'chat' && (
                    <>
                        <div className="group-chat-messages">
                            {messages.length === 0 && (
                                <div className="friends-empty" style={{ padding: 'var(--space-8) 0' }}>
                                    <MessageSquare size={40} strokeWidth={1.5} />
                                    <p>No messages yet. Start the conversation!</p>
                                    <p style={{ fontSize: 'var(--text-xs)' }}>
                                        Tip: Say &ldquo;Cesy&rdquo; to get her attention
                                    </p>
                                </div>
                            )}
                            {messages.map((msg) => {
                                const isSelf = msg.userId === dbUserId;
                                const isAssistant = msg.role === 'assistant';
                                const memberData = group.members.find((m) => m.userId === msg.userId);
                                const bubbleColor = isAssistant
                                    ? undefined
                                    : (memberData?.chatColor || '#666');

                                return (
                                    <div
                                        key={msg.id}
                                        className={`group-msg ${isSelf ? 'group-msg-self' : isAssistant ? 'group-msg-assistant' : 'group-msg-other'}`}
                                    >
                                        {!isSelf && (
                                            <div className="group-msg-name" style={{ color: isAssistant ? 'var(--color-accent)' : bubbleColor }}>
                                                {msg.userName || 'Unknown'}
                                            </div>
                                        )}
                                        <div
                                            className="group-msg-bubble"
                                            style={
                                                isAssistant
                                                    ? undefined
                                                    : {
                                                        background: bubbleColor + '20',
                                                        border: `1px solid ${bubbleColor}40`,
                                                        color: 'var(--color-text-primary)',
                                                    }
                                            }
                                        >
                                            {msg.content}
                                        </div>
                                        {/* Reaction pills */}
                                        {msg.reactions && msg.reactions.length > 0 && (
                                            <div className="reaction-pills">
                                                {Object.entries(
                                                    msg.reactions.reduce((acc, r) => {
                                                        acc[r.emoji] = acc[r.emoji] || { count: 0, userReacted: false };
                                                        acc[r.emoji].count++;
                                                        if (r.userId === dbUserId) acc[r.emoji].userReacted = true;
                                                        return acc;
                                                    }, {})
                                                ).map(([emoji, { count, userReacted }]) => (
                                                    <button
                                                        key={emoji}
                                                        className={`reaction-pill${userReacted ? ' reaction-pill-active' : ''}`}
                                                        onClick={() => reactToMessage(msg.id, emoji)}
                                                    >
                                                        {emoji} {count}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {/* Reaction trigger + picker */}
                                        <div className="reaction-row">
                                            <div className={`group-msg-time ${isSelf ? 'text-right' : ''}`}>
                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <button
                                                className="reaction-trigger"
                                                onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                                            >
                                                <SmilePlus size={14} />
                                            </button>
                                        </div>
                                        {reactionPickerMsgId === msg.id && (
                                            <div className="reaction-picker">
                                                {REACTION_EMOJIS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        className="reaction-picker-emoji"
                                                        onClick={() => reactToMessage(msg.id, emoji)}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="chat-input-area">
                            <div className="chat-input-wrapper">
                                <textarea
                                    ref={inputRef}
                                    className="chat-input"
                                    placeholder="Message the group..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage();
                                        }
                                    }}
                                    rows={1}
                                    disabled={sending}
                                />
                                <button
                                    className="send-btn"
                                    onClick={sendMessage}
                                    disabled={!input.trim() || sending}
                                >
                                    <Send size={18} strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Members Tab */}
                {activeTab === 'members' && (
                    <div className="group-members-list">
                        {/* Memory Sharing Toggle */}
                        {myMembership && (
                            <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div className="setting-label" style={{ fontSize: 'var(--text-sm)' }}>Share Private Memories</div>
                                        <div className="setting-description" style={{ fontSize: 'var(--text-xs)' }}>
                                            Let Cesy access your personal memories in group chat
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={toggleMemorySharing}
                                        style={{ color: myMembership.sharePrivateMemories ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                                    >
                                        {myMembership.sharePrivateMemories
                                            ? <ToggleRight size={28} />
                                            : <ToggleLeft size={28} />
                                        }
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Cesy Response Mode Toggle (admin only) */}
                        {isAdmin && (
                            <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div className="setting-label" style={{ fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                            <Sparkles size={14} /> Smart Cesy Responses
                                        </div>
                                        <div className="setting-description" style={{ fontSize: 'var(--text-xs)' }}>
                                            {group.cesyMode === 'smart'
                                                ? 'Cesy uses AI to decide when to respond naturally'
                                                : 'Cesy only responds to keywords and her name'
                                            }
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={toggleCesyMode}
                                        style={{ color: group.cesyMode === 'smart' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                                    >
                                        {group.cesyMode === 'smart'
                                            ? <ToggleRight size={28} />
                                            : <ToggleLeft size={28} />
                                        }
                                    </button>
                                </div>
                            </div>
                        )}

                        <h3 className="friends-section-title">Members ({group.members.length}/{group.maxMembers})</h3>
                        {group.members.map((member) => {
                            const isMe = member.userId === dbUserId;
                            const isAdmin = myMembership?.role === 'admin';
                            const memberName = member.user.fullName || member.user.username;
                            return (
                                <div key={member.id} className="group-member-card">
                                    <div className="group-member-color" style={{ background: member.chatColor }} />
                                    <div className="friend-avatar" style={{ width: 32, height: 32, fontSize: '12px' }}>
                                        {member.user.avatarUrl ? (
                                            <img src={member.user.avatarUrl} alt="" className="friend-avatar-img" />
                                        ) : (
                                            <span>{(member.user.fullName || '?')[0]}</span>
                                        )}
                                    </div>
                                    <div className="friend-info">
                                        <div className="friend-name">{memberName}{isMe ? ' (you)' : ''}</div>
                                        <div className="friend-username">@{member.user.username}</div>
                                    </div>
                                    {member.role === 'admin' && (
                                        <span className="group-member-role">
                                            <Shield size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                                            Admin
                                        </span>
                                    )}
                                    {/* Admin actions on non-self members */}
                                    {isAdmin && !isMe && (
                                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                                            {member.role !== 'admin' && (
                                                <button
                                                    className="btn btn-ghost"
                                                    onClick={() => promoteMember(member.userId, memberName)}
                                                    title="Promote to admin"
                                                    style={{ padding: '4px', color: 'var(--color-accent)' }}
                                                >
                                                    <Crown size={14} />
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => kickMember(member.userId, memberName)}
                                                title="Remove from group"
                                                style={{ padding: '4px', color: 'var(--color-error, #ef4444)' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Leave Group */}
                        <button
                            className="btn btn-ghost"
                            onClick={leaveGroup}
                            style={{ marginTop: 'var(--space-4)', color: 'var(--color-error, #ef4444)', width: '100%', justifyContent: 'center' }}
                        >
                            <LogOut size={16} /> Leave Group
                        </button>

                        {/* Invite Friends */}
                        {availableFriends.length > 0 && (
                            <>
                                <h3 className="friends-section-title" style={{ marginTop: 'var(--space-4)' }}>Invite Friends</h3>
                                {availableFriends.map((friend) => (
                                    <div key={friend.id} className="friend-card">
                                        <div className="friend-avatar" style={{ width: 32, height: 32, fontSize: '12px' }}>
                                            {friend.avatarUrl ? (
                                                <img src={friend.avatarUrl} alt="" className="friend-avatar-img" />
                                            ) : (
                                                <span>{(friend.fullName || '?')[0]}</span>
                                            )}
                                        </div>
                                        <div className="friend-info">
                                            <div className="friend-name">{friend.fullName}</div>
                                            <div className="friend-username">@{friend.username}</div>
                                        </div>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => inviteFriend(friend.id)}
                                            disabled={inviting === friend.id}
                                        >
                                            <UserPlus size={14} /> Invite
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* Memories Tab */}
                {activeTab === 'memories' && (
                    <div className="group-members-list">
                        <h3 className="friends-section-title">Group Memories</h3>
                        {groupMemories.length === 0 ? (
                            <div className="friend-username" style={{ textAlign: 'center', padding: 'var(--space-4)', opacity: 0.7 }}>
                                No group memories yet. Cesy saves shared memories during group conversations.
                            </div>
                        ) : (
                            groupMemories.map((memory) => (
                                <div key={memory.id} className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-2)', position: 'relative' }}>
                                    <div style={{ fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>
                                        {memory.content}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                                        <div className="friend-username" style={{ fontSize: 'var(--text-xs)' }}>
                                            {new Date(memory.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                        {isAdmin && (
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => deleteGroupMemory(memory.id)}
                                                title="Delete memory"
                                                style={{ padding: '4px', color: 'var(--color-error, #ef4444)' }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {memory.tags && Array.isArray(memory.tags) && memory.tags.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                                            {memory.tags.map((tag, i) => (
                                                <span key={i} style={{
                                                    fontSize: 'var(--text-xs)',
                                                    padding: '1px 6px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: 'rgba(234, 179, 8, 0.1)',
                                                    color: 'var(--color-accent)',
                                                }}>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Workouts Tab */}
                {activeTab === 'workouts' && (
                    <div className="group-members-list">
                        <h3 className="friends-section-title">Today&apos;s Workouts — {today}</h3>
                        {group.members.map((member) => {
                            const schedule = member.user.workoutSchedule?.schedule;
                            const todayWorkout = Array.isArray(schedule)
                                ? schedule.find((s) => s.dayName === today)
                                : null;

                            return (
                                <div key={member.id} className="friend-card">
                                    <div className="group-member-color" style={{ background: member.chatColor }} />
                                    <div className="friend-info">
                                        <div className="friend-name">{member.user.fullName || member.user.username}</div>
                                        {todayWorkout ? (
                                            <div className="friend-username" style={{ color: 'var(--color-accent)' }}>
                                                {todayWorkout.workoutType}
                                                {todayWorkout.duration && ` · ${todayWorkout.duration} min`}
                                            </div>
                                        ) : (
                                            <div className="friend-username">Rest day</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <h3 className="friends-section-title" style={{ marginTop: 'var(--space-4)' }}>Full Week</h3>
                        {group.members.map((member) => {
                            const schedule = member.user.workoutSchedule?.schedule;
                            return (
                                <div key={member.id} className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                                    <div className="friend-name" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div className="group-member-color" style={{ background: member.chatColor }} />
                                        {member.user.fullName || member.user.username}
                                    </div>
                                    {Array.isArray(schedule) && schedule.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                                            {schedule.map((s, i) => (
                                                <span
                                                    key={i}
                                                    style={{
                                                        fontSize: 'var(--text-xs)',
                                                        padding: '2px 8px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: s.dayName === today ? 'rgba(234, 179, 8, 0.15)' : 'var(--color-surface-elevated)',
                                                        color: s.dayName === today ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                                        border: s.dayName === today ? '1px solid rgba(234, 179, 8, 0.3)' : 'none',
                                                    }}
                                                >
                                                    {s.dayName.slice(0, 3)}: {s.workoutType}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="friend-username">No schedule set</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}
