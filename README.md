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

### Railway
Add a PostgreSQL service and set `DATABASE_URL` in Railway.

## Suppported Use Cases

🧠 Memory Tools
Save: "Remember that my favorite programming language is Python"
Search: "What do you remember about me?"
Update: "Actually, I prefer TypeScript over Python now"
Delete: "Forget that I like TypeScript"
⏰ Reminders & Calendar
Set reminder: "Remind me to buy groceries tomorrow at 5pm"
Calendar: "What's on my schedule for today?"
🌤️ Weather
"What's the weather like in Dar es Salaam?"
🔢 Calculator
"What's my BMI if I'm 75kg and 1.78m tall?"
"Calculate 15% tip on a bill of 48,000 TZS"
🏋️ Workout Management
"Add yoga on Sundays for 60 minutes"
"Remove my Monday workout"
"What's my workout schedule look like?" (triggers get_calendar)
⏱️ Timer
"Set a 10 minute timer for my break"
📢 Notification
"Send me a notification to drink water"
🔍 Web Search
"What happened in the Premier League today?"
🔥 Combo Test (multiple tools in one turn)
"Remember that I have a dentist appointment on Friday, set a reminder for it at 9am, and what's the weather going to be like in Dar?"

---

Built by [Tanzasoft](https://tanzasoft.com)
