'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import { useState, useEffect } from 'react';
import { VOICE, STORAGE_KEYS } from '@/lib/constants';

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [voiceId, setVoiceId] = useState(VOICE.defaultVoiceId);
    const [voices, setVoices] = useState([]);
    const [ttsEnabled, setTtsEnabled] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.selectedVoiceId);
        if (saved) setVoiceId(saved);
    }, []);

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
                                    🔊 Test
                                </button>
                            </div>
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
