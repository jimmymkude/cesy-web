# Voice Filler Architecture

A low-latency, natural-sounding "thinking filler" system for the Cesy voice call experience.

## The Problem

The voice pipeline has two main latency sources:
1. **LLM latency** — Claude needs time to generate a response (~1-4s depending on complexity + tool calls)
2. **TTS latency** — ElevenLabs needs time to render audio (~300-500ms per chunk)

Without fillers, the user hears silence after speaking, which feels unnatural for a voice assistant.

---

## The Solution: Prefetch Buffer

Instead of waiting for the timer to fire and *then* fetching the filler audio, we **fire the filler request at t=0** (same moment the LLM call starts) and **store the resulting audio blob in a buffer**. The timer then just *plays* an already-ready blob.

### Timeline

```
t=0ms    User finishes speaking → processTranscript() called
          ├── /api/voice-stream called (LLM + tool loop + sentence streaming)
          └── prefetchFiller() called in parallel
               └── /api/voice-filler → Claude Haiku generates contextual phrase (~350ms)
                    └── /api/elevenlabs/tts → audio blob (~300ms)
                         └── fillerBufferRef = blob URL (~650ms total)

t=700ms  (or 2700ms in production) fillerTimer fires
          └── playThinkingFiller() pops blob from fillerBufferRef → plays INSTANTLY
               (no network wait — audio was ready at ~650ms)

t=Nms    LLM response first sentence arrives
          └── fillerAbort.cancelled = true → filler stops
              audioRef.current.pause()
              fillerBufferRef revoked (no URL leak)
              → audio queue starts playing LLM response sentences
```

### Key Properties

| Property | Behaviour |
|---|---|
| **Fast responses** | If LLM responds before the timer (e.g. simple greetings < 700ms), filler never fires |
| **Slow responses** | Filler blob plays near-instantly at the timer mark (no latency added) |
| **Cancellation** | `fillerAbort` flag shared between prefetch + play; cancelled atomically when response arrives |
| **Context continuity** | Last 4 filler phrases passed to Claude Haiku as conversation history so fillers don't repeat or feel disconnected |
| **No URL leaks** | Blob revoked in `audio.onended`, in `endCall()`, and in the early-return cancel path |

---

## Components

### `app/api/voice-filler/route.js`
- Accepts `{ transcript, previousFillers[] }`
- Builds a message history of previous fillers so Claude Haiku sees what was already said
- Returns `{ filler: "Hmm, let me think..." }`
- Model: `claude-haiku-4-5-20251001` (fast/cheap)
- `max_tokens: 30` (3-7 words only)

### `app/api/voice-stream/route.js`
- Runs the full tool-use loop (non-streaming, since tools + streaming don't work cleanly together)
- Once tool loop is done, streams final text **sentence by sentence** as newline-delimited JSON:
  ```json
  {"sentence": "Hey, doing great!"}
  {"sentence": "How about you?"}
  {"done": true, "fullText": "Hey, doing great! How about you?"}
  ```
- Client reads the stream incrementally, piping each sentence to ElevenLabs immediately

### `components/VoiceCall.js` — Key Refs

| Ref | Purpose |
|---|---|
| `fillerBufferRef` | Stores the pre-baked blob URL (set by `prefetchFiller`, cleared by `playThinkingFiller`) |
| `fillerResolveRef` | Promise resolver — signals `playThinkingFiller` that the buffer is ready |
| `fillerHistoryRef` | Array of filler phrases said this session, passed to `/api/voice-filler` for context |
| `audioQueueRef` | Queue of blob URLs for sequential LLM sentence playback |
| `audioAbortRef` | Drains the audio queue (set on `endCall` or new turn start) |

---

## Tuning the Timer

The filler timer duration controls the trade-off:

| Timer | Effect |
|---|---|
| `700ms` | Aggressive — filler fires for almost every response except the very fastest |
| `2700ms` | Conservative — only fires for long tool-call responses (saves ElevenLabs chars) |
| `1000-1500ms` | Sweet spot for most conversations |

> **Current test value:** `700ms` (locally only, not pushed)  
> **Production value:** `2700ms`

---

## Speech Recognition: Continuous Mode + Silence Timer

Speech recognition uses `continuous: true` to avoid cutting off the user mid-thought.

A `silenceTimerRef` resets every time a new `onresult` fires. After **1.5s of silence**, recognition is manually stopped and the transcript submitted. This gives the user natural thinking pauses without requiring them to tap a button.
