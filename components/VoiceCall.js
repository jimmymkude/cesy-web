'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { VOICE, STORAGE_KEYS, ASSISTANT } from '@/lib/constants';
import { Mic, Square, PhoneOff } from 'lucide-react';

/**
 * VoiceCall — A call-like voice interface for Cesy.
 * Calls /api/chat directly (bypasses ChatContext to avoid isLoading guards).
 */
export default function VoiceCall({ onClose }) {
    const { user } = useAuth();
    const [callState, setCallState] = useState('idle');
    const [transcript, setTranscript] = useState('');
    const [cesyResponse, setCesyResponse] = useState('');
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(false);

    const recognitionRef = useRef(null);
    const audioRef = useRef(null);
    const audioUnlockedRef = useRef(false); // iOS Safari unlock flag
    const animFrameRef = useRef(null);
    const canvasRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const voiceHistoryRef = useRef([]); // independent conversation history
    const dbUserIdRef = useRef(null);
    const workoutRef = useRef(null);
    const syncPromiseRef = useRef(null);

    useEffect(() => {
        setIsSupported(
            'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
        );
    }, []);

    // Sync user to get DB user ID and fetch workout schedule
    useEffect(() => {
        if (!user) return;
        syncPromiseRef.current = (async () => {
            try {
                const syncRes = await fetch('/api/auth/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        firebaseUid: user.uid,
                        email: user.email,
                        fullName: user.displayName,
                        avatarUrl: user.photoURL,
                    }),
                });
                const d = await syncRes.json();
                if (d.user?.id) {
                    dbUserIdRef.current = d.user.id;
                    try {
                        const wRes = await fetch(`/api/workout?userId=${d.user.id}`);
                        const wData = await wRes.json();
                        if (wData.schedule) workoutRef.current = wData.schedule;
                    } catch { /* ignore */ }
                }
            } catch { /* ignore */ }
        })();
    }, [user]);

    // Draw visualizer
    const drawVisualizer = useCallback((active) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        const draw = () => {
            ctx.clearRect(0, 0, W, H);
            const bars = 32;
            const barW = W / bars - 2;
            const cy = H / 2;

            for (let i = 0; i < bars; i++) {
                const x = (W / bars) * i + 1;
                const maxH = active ? H * 0.7 : H * 0.1;
                const h = active
                    ? Math.random() * maxH + H * 0.05
                    : Math.sin(Date.now() / 500 + i * 0.3) * (H * 0.05) + H * 0.05;

                const gradient = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
                gradient.addColorStop(0, 'rgba(37, 99, 235, 0.8)');
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0.4)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundRect(x, cy - h / 2, barW, h, 3);
                ctx.fill();
            }
            animFrameRef.current = requestAnimationFrame(draw);
        };
        draw();
    }, []);

    useEffect(() => {
        const active = callState === 'listening' || callState === 'speaking';
        drawVisualizer(active);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [callState, drawVisualizer]);

    // Play TTS via ElevenLabs
    const speakResponse = useCallback(async (text) => {
        setCallState('speaking');
        setCesyResponse(text);

        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;

        try {
            const res = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId, text }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `TTS failed (${res.status})`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }

            // Reuse existing Audio element on iOS (already unlocked), or create a new one
            const audio = audioRef.current || new Audio();
            audio.src = url;
            audioRef.current = audio;

            audio.onended = () => {
                setCallState('idle');
                URL.revokeObjectURL(url);
            };

            audio.onerror = () => {
                setCallState('idle');
                setError('Audio playback failed');
            };

            await audio.play();
        } catch (e) {
            console.error('TTS error:', e);
            setCallState('idle');
            setError('Voice synthesis failed: ' + e.message);
        }
    }, []);

    // Send to Claude directly (no ChatContext dependency)
    const processTranscript = useCallback(async (text) => {
        if (!text.trim()) {
            setCallState('idle');
            return;
        }

        setCallState('thinking');

        // Ensure sync is complete before proceeding
        if (syncPromiseRef.current) {
            await syncPromiseRef.current;
        }

        // Build voice-optimized system prompt
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        let systemPrompt = `Your name is Cesy. ${ASSISTANT.instructions}

Current date and time: ${dateStr}, ${timeStr}.

IMPORTANT: You are in a VOICE CALL. Keep responses SHORT and conversational — 1-3 sentences max. No markdown, no bullet points, no formatting. Speak naturally as if on a phone call.${user?.displayName ? `\n\nThe user's name is ${user.displayName}.` : ''}

You have access to tools for managing workouts (manage_workout), setting reminders (set_reminder), and more. Use the appropriate tool for each request.`;

        // Inject saved workout schedule
        if (workoutRef.current?.schedule?.length > 0) {
            const scheduleLines = workoutRef.current.schedule
                .map((w) => `- ${w.dayName}: ${w.workoutType}, ${w.duration} minutes${w.equipment?.length ? ` (Equipment: ${w.equipment.join(', ')})` : ''}`)
                .join('\n');
            systemPrompt += `\n\nThe user's current workout schedule is:\n${scheduleLines}\n\nReference this schedule when asked about workouts.`;
        }

        // Add user message to voice history
        voiceHistoryRef.current.push({ role: 'user', content: text });

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: voiceHistoryRef.current,
                    systemPrompt,
                    userId: dbUserIdRef.current,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Chat failed');
            }

            if (data.message) {
                // Add assistant response to voice history
                voiceHistoryRef.current.push({ role: 'assistant', content: data.message });


                speakResponse(data.message);
            } else {
                setCallState('idle');
                setError('No response from Cesy');
            }
        } catch (e) {
            console.error('Voice chat error:', e);
            setCallState('idle');
            setError('Failed to get response: ' + e.message);
        }
    }, [user, speakResponse]);

    // Start listening
    const startListening = useCallback(() => {
        if (!isSupported) {
            setError('Speech recognition not supported. Try Chrome or Safari.');
            return;
        }

        // iOS Safari requires audio to be started INSIDE a user gesture.
        // Pre-unlock the audio sandbox by playing a silent blob immediately on tap.
        if (!audioUnlockedRef.current) {
            try {
                const silentBlob = new Blob(
                    [new Uint8Array([255, 227, 24, 196, 0, 0, 0, 3, 72, 1, 64, 0, 0, 4, 132, 16, 31, 227, 192, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer],
                    { type: 'audio/mpeg' }
                );
                const silentUrl = URL.createObjectURL(silentBlob);
                const unlockAudio = new Audio(silentUrl);
                unlockAudio.volume = 0;
                unlockAudio.play().then(() => {
                    URL.revokeObjectURL(silentUrl);
                    audioRef.current = unlockAudio; // Reuse this element for TTS
                    audioUnlockedRef.current = true;
                }).catch(() => URL.revokeObjectURL(silentUrl));
            } catch { /* ignore unlock errors */ }
        }

        setError(null);
        setTranscript('');
        setCesyResponse('');
        finalTranscriptRef.current = '';
        setCallState('listening');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = 0; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            const display = final || interim;
            setTranscript(display);
            finalTranscriptRef.current = final || interim;
        };

        recognition.onend = () => {
            recognitionRef.current = null;
            processTranscript(finalTranscriptRef.current);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            recognitionRef.current = null;

            if (event.error === 'not-allowed') {
                setError('Microphone access denied. Please allow microphone in browser settings.');
            } else if (event.error === 'no-speech') {
                setError('No speech detected. Tap the mic and try again.');
            } else if (event.error !== 'aborted') {
                setError(`Microphone error: ${event.error}`);
            }
            setCallState('idle');
        };

        recognitionRef.current = recognition;

        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            setError('Failed to start microphone. Is another app using it?');
            setCallState('idle');
        }
    }, [isSupported, processTranscript]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    }, []);

    const endCall = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }
        voiceHistoryRef.current = [];
        setCallState('idle');
        setTranscript('');
        setCesyResponse('');
        onClose?.();
    }, [onClose]);

    const handleMicClick = () => {
        if (callState === 'listening') {
            stopListening();
        } else if (callState === 'speaking') {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            startListening();
        } else if (callState === 'idle') {
            startListening();
        }
    };

    const statusText = {
        idle: 'Tap to speak',
        listening: 'Listening...',
        thinking: 'Thinking...',
        speaking: 'Cesy is speaking...',
    };

    return (
        <div className="voice-call-overlay">
            <div className="voice-call-container">
                <div className="voice-call-header">
                    <div className="voice-call-avatar">C</div>
                    <div className="voice-call-name">Cesy</div>
                    <div className="voice-call-status">{statusText[callState]}</div>
                </div>

                <div className="voice-call-visualizer">
                    <canvas ref={canvasRef} width={300} height={80} />
                </div>

                <div className="voice-call-text">
                    {transcript && (
                        <div className="voice-call-transcript">
                            <span className="voice-call-label">You</span>
                            {transcript}
                        </div>
                    )}
                    {cesyResponse && (
                        <div className="voice-call-response">
                            <span className="voice-call-label">Cesy</span>
                            {cesyResponse}
                        </div>
                    )}
                </div>

                {!isSupported && (
                    <div style={{
                        color: 'var(--color-warning)',
                        fontSize: 'var(--text-sm)',
                        textAlign: 'center',
                        padding: 'var(--space-2)',
                    }}>
                        Voice recognition requires Chrome or Safari
                    </div>
                )}

                {error && (
                    <div style={{
                        color: 'var(--color-error)',
                        fontSize: 'var(--text-sm)',
                        textAlign: 'center',
                        padding: 'var(--space-2)',
                    }}>
                        {error}
                    </div>
                )}

                <div className="voice-call-controls">
                    <button
                        className={`voice-call-mic ${callState === 'listening' ? 'voice-call-mic-active' : ''} ${callState === 'speaking' ? 'voice-call-mic-active' : ''} ${callState === 'thinking' ? 'voice-call-mic-disabled' : ''}`}
                        onClick={handleMicClick}
                        disabled={callState === 'thinking' || !isSupported}
                    >
                        {callState === 'listening' ? (
                            <Square fill="currentColor" stroke="none" size={22} />
                        ) : callState === 'thinking' ? (
                            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
                        ) : (
                            <Mic size={28} strokeWidth={2} />
                        )}
                    </button>

                    <button className="voice-call-end" onClick={endCall}>
                        <PhoneOff size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
}
