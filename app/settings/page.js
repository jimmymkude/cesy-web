'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect, useCallback } from 'react';
import { VOICE, STORAGE_KEYS } from '@/lib/constants';
import { Volume2, Smartphone, CheckCircle2, AlertTriangle, Link as LinkIcon, RefreshCw, Copy, Check } from 'lucide-react';

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [voiceId, setVoiceId] = useState(VOICE.defaultVoiceId);
    const [voices, setVoices] = useState([]);
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [linkCode, setLinkCode] = useState(null);
    const [linkLoading, setLinkLoading] = useState(false);
    const [dbUserId, setDbUserId] = useState(null);
    const [telegramLinked, setTelegramLinked] = useState(null); // null = checking, true/false = known
    const [botConfigured, setBotConfigured] = useState(true);
    const [linkCopied, setLinkCopied] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.selectedVoiceId);
        if (saved) setVoiceId(saved);
    }, []);

    const checkTelegramStatus = useCallback(async (userId) => {
        try {
            const res = await fetch(`/api/telegram/status?userId=${userId}`);
            const data = await res.json();
            setTelegramLinked(data.linked);
            setBotConfigured(data.configured);
            if (data.linked) setLinkCode(null); // Clear code view if linked
        } catch { /* ignore */ }
    }, []);

    // Sync user to get DB ID for Telegram linking
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
                if (data.user?.id) {
                    setDbUserId(data.user.id);
                    checkTelegramStatus(data.user.id);
                }
            } catch { /* ignore */ }
        }
        syncUser();
    }, [user, checkTelegramStatus]);

    useEffect(() => {
        async function loadVoices() {
            try {
                const res = await fetch('/api/elevenlabs/voices');
                const data = await res.json();
                if (data.voices) setVoices(data.voices);
            } catch (e) {
                console.error('Failed to load voices:', e);
            }
        }
        if (user) loadVoices();
    }, [user]);

    const handleVoiceChange = (e) => {
        const newId = e.target.value;
        setVoiceId(newId);
        localStorage.setItem(STORAGE_KEYS.selectedVoiceId, newId);
    };

    const testVoice = async () => {
        try {
            const res = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    voiceId,
                    text: 'Hey there! This is Cesy, your AI fitness assistant. Let\'s get moving!',
                }),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.play();
            }
        } catch (e) {
            console.error('Voice test error:', e);
        }
    };

    const generateLinkCode = async () => {
        if (!dbUserId) return;
        setLinkLoading(true);
        try {
            const res = await fetch('/api/telegram/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: dbUserId }),
            });
            const data = await res.json();
            if (data.code) setLinkCode(data.code);
        } catch (e) {
            console.error('Failed to generate link code:', e);
        } finally {
            setLinkLoading(false);
        }
    };

    if (loading) return null;
    if (!user) return <LoginPage />;

    return (
        <AppShell>
            <div className="settings-page">
                <h1 className="settings-title">Settings</h1>

                <div className="settings-section">
                    <h2 className="settings-section-title">Appearance</h2>
                    <div className="card">
                        <div className="setting-row">
                            <div>
                                <div className="setting-label">Dark Mode</div>
                                <div className="setting-description">Switch between dark and light themes</div>
                            </div>
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={theme === 'dark'}
                                    onChange={toggleTheme}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h2 className="settings-section-title">Voice</h2>
                    <div className="card">
                        <div className="setting-row">
                            <div>
                                <div className="setting-label">Text-to-Speech</div>
                                <div className="setting-description">Read assistant responses aloud</div>
                            </div>
                            <label className="toggle">
                                <input
                                    type="checkbox"
                                    checked={ttsEnabled}
                                    onChange={() => setTtsEnabled(!ttsEnabled)}
                                />
                                <span className="toggle-slider" />
                            </label>
                        </div>

                        <div style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)' }}>
                            <div className="setting-label" style={{ marginBottom: 'var(--space-3)' }}>Voice Selection</div>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                                <select
                                    className="input"
                                    value={voiceId}
                                    onChange={handleVoiceChange}
                                    style={{ flex: 1 }}
                                >
                                    {voices.length === 0 && (
                                        <option value={VOICE.defaultVoiceId}>Default Voice</option>
                                    )}
                                    {voices.map((v) => (
                                        <option key={v.voice_id} value={v.voice_id}>
                                            {v.name}
                                        </option>
                                    ))}
                                </select>
                                <button className="btn btn-ghost" onClick={testVoice}>
                                    <Volume2 size={16} /> Test
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h2 className="settings-section-title">Notifications</h2>
                    <div className="card">
                        <div className="setting-row">
                            <div>
                                <div className="setting-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Smartphone size={18} /> Telegram Notifications
                                </div>
                                <div className="setting-description">
                                    Get reminders and alerts via Telegram even when Cesy is closed
                                </div>
                            </div>
                            {telegramLinked === true && (
                                <span style={{
                                    color: '#22c55e',
                                    fontWeight: 600,
                                    fontSize: 'var(--text-sm)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}>
                                    <CheckCircle2 size={16} /> Linked
                                </span>
                            )}
                        </div>

                        <div style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)' }}>
                            {/* Loading state */}
                            {telegramLinked === null && (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-2)' }}>
                                    Checking status...
                                </div>
                            )}

                            {/* Already linked */}
                            {telegramLinked === true && (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        color: '#22c55e',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        justifyContent: 'center',
                                    }}>
                                        <CheckCircle2 size={18} /> Your Telegram account is linked. Notifications will be delivered there.
                                    </div>
                                </div>
                            )}

                            {/* Not linked — show link flow */}
                            {telegramLinked === false && !linkCode && (
                                <div>
                                    {!botConfigured && (
                                        <div style={{
                                            background: 'rgba(234, 179, 8, 0.1)',
                                            border: '1px solid rgba(234, 179, 8, 0.3)',
                                            borderRadius: 'var(--radius-lg)',
                                            padding: 'var(--space-3)',
                                            color: '#eab308',
                                            fontSize: 'var(--text-sm)',
                                            marginBottom: 'var(--space-3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}>
                                            <AlertTriangle size={16} /> Telegram bot is not configured yet. Add TELEGRAM_BOT_TOKEN to environment.
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        onClick={generateLinkCode}
                                        disabled={linkLoading || !dbUserId || !botConfigured}
                                        style={{ width: '100%' }}
                                    >
                                        {linkLoading ? 'Generating...' : <><LinkIcon size={16} /> Link Telegram</>}
                                    </button>
                                </div>
                            )}

                            {/* Link code generated — waiting for user to send /start */}
                            {telegramLinked === false && linkCode && (
                                <div style={{ textAlign: 'center' }}>
                                    <div className="setting-label" style={{ marginBottom: 'var(--space-2)' }}>
                                        Your link code (expires in 10 min):
                                    </div>
                                    <div style={{
                                        fontSize: 'var(--text-xl)',
                                        fontFamily: 'monospace',
                                        fontWeight: 'bold',
                                        color: 'var(--color-primary)',
                                        padding: 'var(--space-3)',
                                        background: 'var(--color-surface-elevated)',
                                        borderRadius: 'var(--radius-lg)',
                                        letterSpacing: '0.1em',
                                    }}>
                                        {linkCode}
                                    </div>
                                    <div className="setting-description" style={{ marginTop: 'var(--space-3)' }}>
                                        Open <strong>@CesyAIBot</strong> on Telegram and send:<br />
                                        <code style={{ color: 'var(--color-primary)' }}>/start {linkCode}</code>
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`/start ${linkCode}`);
                                                setLinkCopied(true);
                                                setTimeout(() => setLinkCopied(false), 2000);
                                            }}
                                            style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                                        >
                                            {linkCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => checkTelegramStatus(dbUserId)}
                                        >
                                            <RefreshCw size={16} /> Check Status
                                        </button>
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => setLinkCode(null)}
                                        >
                                            New Code
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="settings-section">
                    <h2 className="settings-section-title">About</h2>
                    <div className="card">
                        <div className="setting-row">
                            <div className="setting-label">Version</div>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>1.0.0 (Web)</div>
                        </div>
                        <div className="setting-row">
                            <div className="setting-label">Built by</div>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Tanzasoft</div>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
