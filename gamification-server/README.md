# Fluency Engine — Node backend

Tutor + gamification API powered by Node/Express. This service is the primary backend for the frontend app.

## Setup

```bash
cd gamification-server
npm install
npm run typecheck
```

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET_KEY` (shared across auth/token verification in this service)

## Supabase tables

Expected core tables:

- `gamer_users`
- `gamer_sessions`
- `gamer_mistakes`
- `gamer_questions`
- `gamer_quiz_results`
- `gamer_emotion_scenarios`
- `gamer_achievements`

## Frontend types

Shared JSON-oriented types live in `frontend/src/types/gamification.ts` (string dates / ids for API responses).

## Part 2 — XP system

- Constants: `src/constants/xp.ts` (`XP_THRESHOLDS`, `XP_REWARDS`).
- Service: `src/services/xpService.ts` — `getLevelFromXP`, `getCompositeLevel`, `computeBaseTrackXp`, `applySessionXpModifiers`, `calculateSessionXpAward`, `awardSessionXP`.
- Tests: `npm test` (Vitest).

Frontend mirror of constants only: `frontend/src/constants/xp.ts`.

## Note on weekly leaderboard

Leaderboard sorting uses `gamer_users.weekly_xp_earned` for weekly scope and `gamer_users.level_composite` for all-time scope.
