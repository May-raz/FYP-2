# SpeakWise

AI-powered English speaking practice — conversation coaching, flashcards, quizzes, and pronunciation feedback.

**Live demo**
- Frontend: https://frontend-six-flax-s7mkpcuag0.vercel.app
- API: https://gamification-server.vercel.app

---

## Overview

SpeakWise helps learners build English confidence through:

- **Voice & text chat** with Emma (default tutor) or historical character personas
- **AI-inferred feedback** on emotion, intent, and speaking signals
- **Pronunciation Practice** using OpenAI speech recognition + coaching (not clinical scoring)
- **Anki-style flashcards** — fixed 30-card study deck (grammar, vocabulary, tense, correction, pronunciation)
- **Grammar quiz** with seeded question bank (fast load, no blocking LLM)
- **Gamification** — XP, streaks, leaderboard (MongoDB)

---

## Features

| Area | Description |
|------|-------------|
| Chat | Streaming OpenAI replies, ElevenLabs TTS, live Feedback panel |
| Characters | Einstein, Shakespeare, Napoleon, and others with distinct personas |
| Flashcards | Flip → Got it / Review again; pronunciation cards include Hear example |
| Quiz | 10 MCQ questions, vertical options, sticky submit, session cache |
| Profile | Skill breakdown, level selection, change password |
| Dark mode | System-wide theme toggle |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router, CSS custom properties |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB Atlas (Mongoose) |
| AI | OpenAI (chat, STT, emotion, pronunciation coaching) |
| TTS | ElevenLabs |
| Deploy | Vercel (frontend + serverless API) |

---

## Architecture

```
frontend/                 React SPA
  src/
    config/               API base URL, axios setup
    context/              Auth, theme
    components/           Shared UI (toast, modals, routes)
    hooks/                Speech recognition
    utils/                Text, speech, emotion, XP helpers
    constants/            Character library
    pages/                (pages still in App.js — see Future Work)
    services/             TTS client

gamification-server/      Express API
  src/
    routes/               tutorRouter (/api), gamificationMongoRouter (/api/v1/gamification)
    services/             Business logic (chat, flashcards, quiz, emotion, pronunciation)
    models/               Mongoose schemas
    middleware/           JWT auth
    config/               env, DB, voices
    scripts/              demo seed, DB cleanup
```

**API routes**
- `/api/*` — auth, chat stream, speech, pronunciation, user profile
- `/api/v1/gamification/*` — XP, flashcards, quiz, leaderboard, streaks

---

## Installation

**Prerequisites:** Node.js 18+, MongoDB Atlas (or local MongoDB), OpenAI + ElevenLabs API keys

```bash
git clone https://github.com/May-raz/FYP-2.git
cd FYP-2

npm install
npm --prefix frontend install
npm --prefix gamification-server install
```

---

## Environment Variables

### Backend (`gamification-server/.env`)

Copy from `gamification-server/.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET_KEY` | Yes (prod) | Min 32 chars in production |
| `MONGO_URI` | Yes | MongoDB connection string |
| `OPENAI_API_KEY` | Yes | Chat, STT, emotion, pronunciation |
| `ELEVENLABS_API_KEY` | Yes | Text-to-speech |
| `FRONTEND_ORIGIN` | Prod | CORS allowed origins |
| `DEMO_SEED_SECRET` | Optional | Protects admin seed endpoint |

### Frontend (`frontend/.env`)

Copy from `frontend/.env.example`:

```env
REACT_APP_API_URL=http://localhost:5001
REACT_APP_NODE_URL=http://localhost:5001
```

---

## Running Locally

**Terminal 1 — API**
```bash
cd gamification-server
npm run dev
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm start
```

Or from root: `npm run start:all`

- Frontend: http://localhost:3000
- API health: http://localhost:5001/api/health

**Seed demo content**
```bash
cd gamification-server
npm run seed:demo
```

**Clean junk DB data**
```bash
cd gamification-server
npm run cleanup:db
```

---

## Deployment

Both services deploy to **Vercel**:

```bash
cd gamification-server && npx vercel --prod
cd frontend && npx vercel --prod
```

Set environment variables in each Vercel project dashboard. Never commit `.env` files.

---

## Folder Structure

See [Architecture](#architecture) above. Key entry points:

- `frontend/src/App.js` — routes + page components (being split into `pages/`)
- `frontend/src/index.js` — React bootstrap
- `gamification-server/src/server.ts` — HTTP server
- `gamification-server/src/app.ts` — Express app + route mounting

---

## Scripts

| Command | Location | Purpose |
|---------|----------|---------|
| `npm run dev` | gamification-server | Dev server with hot reload |
| `npm run build` | both | Production build |
| `npm run seed:demo` | gamification-server | Seed flashcards, quiz, phrases |
| `npm run cleanup:db` | gamification-server | Remove junk cards, reseed study deck |

---

## Future Work

- Split remaining page components out of `App.js` into `frontend/src/pages/`
- Extract Express controllers from large route files
- Add E2E tests (Playwright) for auth, chat, flashcards
- Rate limiting and request validation on public endpoints
- Progressive Web App offline flashcard cache
- Remove legacy Supabase router (`gamificationRouter.ts`)

---

## License

MIT — see [LICENSE](./LICENSE)
