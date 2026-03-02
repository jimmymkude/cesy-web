# Cesy Web

AI-powered fitness assistant — web version of the [Cesy iOS app](https://github.com/jimmymkude/Cesy-iOS).

Built with **Next.js 14**, **Firebase Auth**, **Anthropic Claude**, **ElevenLabs TTS**, and **Railway PostgreSQL**.

## Features

- 💬 **AI Chat** — Conversational AI powered by Claude 3.5 Sonnet
- 🎙️ **Voice** — Text-to-speech via ElevenLabs with custom voice selection
- 🔐 **Auth** — Google, Apple, and email sign-in via Firebase
- 🏋️ **Workouts** — Schedule management through natural conversation
- 🌗 **Themes** — Dark/light mode with premium glassmorphism design
- 📱 **Responsive** — Mobile-first design with collapsible sidebar

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Fill in your credentials in .env.local

# Push database schema to Railway
npx prisma db push

# Start dev server
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL connection string |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config (from Firebase Console) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for TTS |

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **AI**: Anthropic Claude via API routes (server-side)
- **Auth**: Firebase (Google, Apple, Email)
- **Database**: Railway PostgreSQL + Prisma ORM
- **TTS**: ElevenLabs API
- **Styling**: Vanilla CSS with custom properties
- **Deploy**: Vercel / Railway

## Project Structure

```
app/
├── page.js              # Chat page
├── settings/page.js     # Settings (theme, voice)
├── workout/page.js      # Workout schedule
├── account/page.js      # User profile
└── api/
    ├── chat/route.js    # Anthropic Claude proxy
    ├── auth/sync/       # Firebase → Postgres sync
    └── elevenlabs/      # TTS + voice listing

components/              # Sidebar, AppShell, LoginPage
contexts/                # Auth, Chat, Theme providers
lib/                     # Firebase, Prisma, constants
prisma/                  # Database schema
```

## Deployment

### Vercel
Connect this repo to Vercel and set env vars in the dashboard.

### Railway
Add a PostgreSQL service and set `DATABASE_URL` in both Railway and Vercel.

---

Built by [Tanzasoft](https://tanzasoft.com)
