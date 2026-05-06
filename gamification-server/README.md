# Fluency Engine — Gamification data layer

MongoDB **Mongoose** models for the Fluency Engine (Part 1 — schema). This package is **standalone** from the Python Flask tutor API so you can run a future **Express** service against the same `MONGODB_URI`.

## Setup

```bash
cd gamification-server
npm install
npm run typecheck
```

Copy `.env.example` to `.env` and set `MONGODB_URI`.

## Collections

| Collection          | Model                 | File                 |
|---------------------|-----------------------|----------------------|
| `users`             | `UserModel`           | `models/User.ts`     |
| `sessions`          | `GamificationSessionModel` | `models/Session.ts` |
| `mistakes`          | `MistakeModel`        | `models/Mistake.ts`  |
| `emotionScenarios`  | `EmotionScenarioModel` | `models/EmotionScenario.ts` |
| `quizResults`       | `QuizResultModel`     | `models/QuizResult.ts` |
| `achievements`      | `AchievementModel`   | `models/Achievement.ts` |
| `questionBank`      | `QuestionBankModel`   | `models/QuestionBank.ts` |

## Frontend types

Shared JSON-oriented types live in `frontend/src/types/gamification.ts` (string dates / ids for API responses).

## Part 2 — XP system

- Constants: `src/constants/xp.ts` (`XP_THRESHOLDS`, `XP_REWARDS`).
- Service: `src/services/xpService.ts` — `getLevelFromXP`, `getCompositeLevel`, `computeBaseTrackXp`, `applySessionXpModifiers`, `calculateSessionXpAward`, `awardSessionXP`.
- Tests: `npm test` (Vitest).

Frontend mirror of constants only: `frontend/src/constants/xp.ts`.

## Note on `weeklySnapshot.xpEarned`

Part 1 user schema lists deltas only; Part 3 leaderboard references `xpEarned` for weekly sort. The Mongoose schema includes **`xpEarned`** (default `0`) so weekly ranking can be implemented without a second collection.
