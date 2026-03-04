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
    const lastFillerRef = useRef(null);    // track last used filler for no-repeat
    const thinkingAbortRef = useRef(null); // cancel chained fillers when response arrives

    // ── Thinking filler phrases ────────────────────────────────────────
    // Split by context: questions lean to 'question', statements to 'statement'
    const FILLERS = {
        question: [
            'Hmm, let me think...',
            'Oh, good question...',
            'Uhh, let me see...',
            'Hmm... yeah...',
            'Ah, interesting...',
            'Let me think about that...',
        ],
        statement: [
            'Ah, got it...',
            'Hmm, okay...',
            'Uhh, sure...',
            'Mmm, got it...',
            'Right, okay...',
            'Ah... yeah...',
        ],
        chain: [
            'Yeah...',
            'Hmm...',
            'Okay...',
            'Uhh...',
            'Mhm...',
            'Ah...',
        ],
    };

    const pickFiller = (pool) => {
        const available = pool.filter((p) => p !== lastFillerRef.current);
        const chosen = available[Math.floor(Math.random() * available.length)];
        lastFillerRef.current = chosen;
        return chosen;
    };

    const getFillerPool = (text) => {
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'could', 'would', 'can', 'is', 'are', 'do', 'does'];
        const lower = text.toLowerCase();
        const isQuestion = text.includes('?') || questionWords.some((w) => lower.startsWith(w));
        return isQuestion ? FILLERS.question : FILLERS.statement;
    };

    // Play a thinking filler via ElevenLabs, then optionally chain another
    const playThinkingFiller = useCallback(async (transcript, mainResolved) => {
        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;
        const phrase = pickFiller(getFillerPool(transcript));
        const abortController = { cancelled: false };
        thinkingAbortRef.current = abortController;

        try {
            const res = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId, text: phrase }),
            });
            if (!res.ok || abortController.cancelled) return;

            const blob = await res.blob();
            if (abortController.cancelled) return;

            const url = URL.createObjectURL(blob);
            const audio = audioRef.current || new Audio();
            audio.src = url;
            audioRef.current = audio;

            await new Promise((resolve) => {
                audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
                audio.onerror = () => { resolve(); };
                audio.play().catch(resolve);
            });

            // If response hasn't arrived yet, chain another shorter filler
            if (!abortController.cancelled && !mainResolved.done) {
                await new Promise((r) => setTimeout(r, 250)); // brief natural pause
                if (!abortController.cancelled && !mainResolved.done) {
                    const chainPhrase = pickFiller(FILLERS.chain);
                    const chainRes = await fetch('/api/elevenlabs/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ voiceId, text: chainPhrase }),
                    });
                    if (!chainRes.ok || abortController.cancelled) return;
                    const chainBlob = await chainRes.blob();
                    if (abortController.cancelled) return;
                    const chainUrl = URL.createObjectURL(chainBlob);
                    const chainAudio = audioRef.current || new Audio();
                    chainAudio.src = chainUrl;
                    audioRef.current = chainAudio;
                    await new Promise((resolve) => {
                        chainAudio.onended = () => { URL.revokeObjectURL(chainUrl); resolve(); };
                        chainAudio.onerror = () => { resolve(); };
                        chainAudio.play().catch(resolve);
                    });
                }
            }
        } catch { /* ignore filler errors */ }
    }, []);

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

    // ── Audio queue for sequential sentence playback ──────────────────────
    const audioQueueRef = useRef([]);    // array of blob URLs to play in order
    const isPlayingRef = useRef(false);  // guard against concurrent playback
    const audioAbortRef = useRef(false); // set true to drain the queue

    const drainQueue = useCallback(async () => {
        if (isPlayingRef.current || audioAbortRef.current) return;
        if (audioQueueRef.current.length === 0) return;

        isPlayingRef.current = true;
        while (audioQueueRef.current.length > 0 && !audioAbortRef.current) {
            const url = audioQueueRef.current.shift();
            await new Promise((resolve) => {
                const audio = audioRef.current || new Audio();
                audio.src = url;
                audioRef.current = audio;
                audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
                audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                audio.play().catch(resolve);
            });
        }
        isPlayingRef.current = false;
        if (!audioAbortRef.current && audioQueueRef.current.length === 0) {
            setCallState('idle');
        }
    }, []);

    const enqueueAudio = useCallback(async (text) => {
        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;
        try {
            const res = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId, text }),
            });
            if (!res.ok || audioAbortRef.current) return;
            const blob = await res.blob();
            if (audioAbortRef.current) { return; }
            const url = URL.createObjectURL(blob);
            audioQueueRef.current.push(url);
            drainQueue();
        } catch { /* ignore individual sentence errors */ }
    }, [drainQueue]);

    // Send to Claude via streaming route — pipes each sentence to ElevenLabs immediately
    const processTranscript = useCallback(async (text) => {
        if (!text.trim()) {
            setCallState('idle');
            return;
        }

        setCallState('thinking');
        audioAbortRef.current = false;
        audioQueueRef.current = [];
        isPlayingRef.current = false;

        // Shared flag so the filler can know when the main response has resolved
        const mainResolved = { done: false };

        // ── 3-second delayed filler: won't fire if response arrives fast enough ──
        const fillerTimer = setTimeout(() => {
            if (!mainResolved.done) {
                playThinkingFiller(text, mainResolved).catch(() => { });
            }
        }, 3000);

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

        voiceHistoryRef.current.push({ role: 'user', content: text });

        try {
            const res = await fetch('/api/voice-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: voiceHistoryRef.current,
                    systemPrompt,
                    userId: dbUserIdRef.current,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Voice stream failed');
            }

            // ── Read sentence chunks from the stream ──────────────────────────
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            let firstSentenceReceived = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Hold last incomplete line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);

                        if (chunk.sentence) {
                            if (!firstSentenceReceived) {
                                firstSentenceReceived = true;
                                // Cancel filler — response arrived
                                mainResolved.done = true;
                                clearTimeout(fillerTimer);
                                if (thinkingAbortRef.current) thinkingAbortRef.current.cancelled = true;
                                if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
                                setCallState('speaking');
                            }
                            enqueueAudio(chunk.sentence);
                        }

                        if (chunk.done) {
                            fullText = chunk.fullText || fullText;
                            setCesyResponse(fullText);
                            voiceHistoryRef.current.push({ role: 'assistant', content: fullText });
                        }
                    } catch { /* malformed chunk, skip */ }
                }
            }

            // Edge case: if no sentences were streamed, fallback gracefully
            if (!firstSentenceReceived) {
                mainResolved.done = true;
                clearTimeout(fillerTimer);
                setCallState('idle');
            }

        } catch (e) {
            clearTimeout(fillerTimer);
            console.error('Voice chat error:', e);
            setCallState('idle');
            setError('Failed to get response: ' + e.message);
        }
    }, [user, enqueueAudio, playThinkingFiller]);

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
        // Abort audio queue
        audioAbortRef.current = true;
        audioQueueRef.current = [];
        isPlayingRef.current = false;

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
