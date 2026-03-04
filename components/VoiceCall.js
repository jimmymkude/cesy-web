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
    const audioContextRef = useRef(null);   // Web AudioContext — created once in mic tap gesture
    const currentSourceRef = useRef(null);  // current BufferSource node (for interrupt/stop)
    const animFrameRef = useRef(null);
    const canvasRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const voiceHistoryRef = useRef([]); // independent conversation history
    const dbUserIdRef = useRef(null);
    const workoutRef = useRef(null);
    const syncPromiseRef = useRef(null);
    const thinkingAbortRef = useRef(null);     // { cancelled: bool } — shared abort flag
    const silenceTimerRef = useRef(null);       // continuous mode speech silence timer
    const fillerBufferRef = useRef(null);       // pre-baked ArrayBuffer, ready to decode + play
    const fillerResolveRef = useRef(null);      // resolves when fillerBufferRef is populated
    const fillerHistoryRef = useRef([]);        // filler phrases said this session (for context)

    // ── AudioContext playback helpers ─────────────────────────────────────
    // Defined first so that prefetchFiller/playThinkingFiller can reference them.

    const stopCurrentAudio = useCallback(() => {
        if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
            currentSourceRef.current = null;
        }
    }, []);

    const playBuffer = useCallback(async (arrayBuffer) => {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') await ctx.resume();
        try {
            const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
            await new Promise((resolve) => {
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(ctx.destination);
                source.onended = resolve;
                currentSourceRef.current = source;
                source.start(0);
            });
        } catch (e) {
            console.error('AudioContext playback error:', e);
        }
    }, []);

    // Play a thinking filler: first fetches a contextual phrase from Claude Haiku,
    // then speaks it via ElevenLabs. If response still hasn't arrived, chains a short filler.
    const CHAIN_FILLERS = ['Yeah...', 'Hmm...', 'Okay...', 'Uhh...', 'Mhm...', 'Ah...'];
    const lastChainRef = useRef(null);
    const pickChain = () => {
        const available = CHAIN_FILLERS.filter((p) => p !== lastChainRef.current);
        const chosen = available[Math.floor(Math.random() * available.length)];
        lastChainRef.current = chosen;
        return chosen;
    };

    /**
     * prefetchFiller — fires at t=0, parallel with voice-stream.
     * Fetches a contextual phrase from Claude Haiku (with history for continuity),
     * converts to audio via ElevenLabs, stores in fillerBufferRef.
     */
    const prefetchFiller = useCallback(async (transcript, abortController) => {
        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;
        try {
            const fillerRes = await fetch('/api/voice-filler', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript,
                    previousFillers: fillerHistoryRef.current.slice(-4),
                }),
            });
            if (!fillerRes.ok || abortController.cancelled) return;
            const { filler } = await fillerRes.json();
            if (!filler || abortController.cancelled) return;

            fillerHistoryRef.current.push(filler); // keep history for next filler's context

            const ttsRes = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId, text: filler }),
            });
            if (!ttsRes.ok || abortController.cancelled) return;
            const arrayBuffer = await ttsRes.arrayBuffer();
            if (abortController.cancelled) return;

            fillerBufferRef.current = arrayBuffer;
            // Signal the play timer that the buffer is ready
            if (fillerResolveRef.current) {
                fillerResolveRef.current();
                fillerResolveRef.current = null;
            }
        } catch { /* ignore */ }
    }, []);

    /**
     * playThinkingFiller — called at t=700ms by the filler timer.
     * Pops the pre-baked audio from the buffer, then loops: fetches the next contextual
     * filler from Claude Haiku and plays it, until the main response arrives or abort fires.
     */
    const playThinkingFiller = useCallback(async (transcript, mainResolved, abortController) => {
        thinkingAbortRef.current = abortController;
        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;

        const playUrl = async (url) => {
            await new Promise((resolve) => {
                const audio = audioRef.current || new Audio();
                audio.src = url;
                audioRef.current = audio;
                audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
                audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                audio.play().catch(resolve);
            });
        };

        try {
            // ── Phase 1: play the pre-fetched buffer ──────────────────────────
            if (!fillerBufferRef.current) {
                await new Promise((resolve) => {
                    fillerResolveRef.current = resolve;
                    setTimeout(() => { resolve(); fillerResolveRef.current = null; }, 2000);
                });
            }
            const firstBuf = fillerBufferRef.current;
            fillerBufferRef.current = null;
            if (!firstBuf || abortController.cancelled) return;
            await playBuffer(firstBuf);

            // ── Phase 2: loop — keep generating fillers until response arrives ──
            while (!abortController.cancelled && !mainResolved.done) {
                await new Promise((r) => setTimeout(r, 1500)); // natural gap between fillers
                if (abortController.cancelled || mainResolved.done) break;

                const fillerRes = await fetch('/api/voice-filler', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transcript,
                        previousFillers: fillerHistoryRef.current.slice(-6),
                    }),
                });
                if (!fillerRes.ok || abortController.cancelled || mainResolved.done) break;
                const { filler } = await fillerRes.json();
                if (!filler || abortController.cancelled || mainResolved.done) break;

                fillerHistoryRef.current.push(filler);

                const ttsRes = await fetch('/api/elevenlabs/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceId, text: filler }),
                });
                if (!ttsRes.ok || abortController.cancelled || mainResolved.done) break;
                const buf = await ttsRes.arrayBuffer();
                if (abortController.cancelled || mainResolved.done) break;
                await playBuffer(buf);
            }
        } catch { /* ignore filler errors */ }
    }, [playBuffer]);

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
                gradient.addColorStop(0, 'rgba(234, 179, 8, 0.8)');
                gradient.addColorStop(1, 'rgba(250, 204, 21, 0.4)');

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
    const audioQueueRef = useRef([]);    // array of ArrayBuffers to play in order
    const isPlayingRef = useRef(false);  // guard against concurrent playback
    const audioAbortRef = useRef(false); // set true to drain the queue

    const drainQueue = useCallback(async () => {
        if (isPlayingRef.current || audioAbortRef.current) return;
        if (audioQueueRef.current.length === 0) return;

        isPlayingRef.current = true;
        while (audioQueueRef.current.length > 0 && !audioAbortRef.current) {
            const buf = audioQueueRef.current.shift();
            await playBuffer(buf);
        }
        isPlayingRef.current = false;
        if (!audioAbortRef.current && audioQueueRef.current.length === 0) {
            setCallState('idle');
        }
    }, [playBuffer]);

    const enqueueAudio = useCallback(async (text) => {
        const voiceId = localStorage.getItem(STORAGE_KEYS.selectedVoiceId) || VOICE.defaultVoiceId;
        try {
            const res = await fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId, text }),
            });
            if (!res.ok || audioAbortRef.current) return;
            const arrayBuffer = await res.arrayBuffer();
            if (audioAbortRef.current) return;
            audioQueueRef.current.push(arrayBuffer);
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

        // Shared flag + abort controller for the filler system
        const mainResolved = { done: false };
        const fillerAbort = { cancelled: false };

        // Reset per-turn filler buffer
        fillerBufferRef.current = null;
        fillerResolveRef.current = null;

        // t=0: Start fetching filler audio immediately in background
        prefetchFiller(text, fillerAbort).catch(() => { });

        // t=700ms: Play the pre-baked filler (arrives near-instantly since audio is already ready)
        const fillerTimer = setTimeout(() => {
            if (!mainResolved.done) {
                playThinkingFiller(text, mainResolved, fillerAbort).catch(() => { });
            }
        }, 700);

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
                                fillerAbort.cancelled = true;
                                stopCurrentAudio();
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
    }, [user, enqueueAudio, prefetchFiller, playThinkingFiller, stopCurrentAudio]);

    // Start listening
    const startListening = useCallback(() => {
        if (!isSupported) {
            setError('Speech recognition not supported. Try Chrome or Safari.');
            return;
        }

        // Create/resume AudioContext inside the user gesture — this permanently unlocks
        // audio playback for both Chrome Android and iOS Safari.
        if (!audioContextRef.current) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) audioContextRef.current = new AC();
            } catch { /* ignore */ }
        }
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().catch(() => { });
        }

        setError(null);
        setTranscript('');
        setCesyResponse('');
        finalTranscriptRef.current = '';
        setCallState('listening');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
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

            // Reset the silence timer every time new speech arrives
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
                // 1.5s of silence → stop recognition and submit
                if (recognitionRef.current) {
                    recognitionRef.current.stop();
                }
            }, 1500);
        };

        recognition.onend = () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            recognitionRef.current = null;
            processTranscript(finalTranscriptRef.current);
        };

        recognition.onerror = (event) => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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

        // Clear filler buffer (now an ArrayBuffer, just null it for GC)
        fillerBufferRef.current = null;

        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
        }
        stopCurrentAudio();
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
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
            stopCurrentAudio();
            audioAbortRef.current = true;
            audioQueueRef.current = [];
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
