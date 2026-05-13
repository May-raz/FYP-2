# FYP 2 Improvement Plan

This document outlines what to add next to make the project stronger, more scalable, and production-ready.

## 1) Current System Snapshot

The project already has a solid base:
- `frontend`: React app for tutor interactions.
- `backend`: Flask AI service for language tutoring features.
- `gamification-server`: Node/Express service with Supabase for XP, streaks, and progression.

Main gap now is not "core features", but product depth, reliability, and launch readiness.

## 2) Product Goals (Next Stage)

Focus on these outcomes:
- Improve learning outcomes (users actually get better English).
- Improve retention (users return daily and complete sessions).
- Improve trust (privacy, safety, stability).
- Improve operational quality (testable, monitorable, deployable).

## 3) Feature Roadmap (What to Add)

## Phase A: High-Impact Learning Features (2-4 weeks)

### A1. Personalized Learning Path
- Add learner level detection (A1-C2 style bands).
- Create adaptive lesson paths based on weak grammar/vocabulary areas.
- Track per-skill progress (speaking, grammar, vocabulary, writing).

**Deliverables**
- New user profile fields for level and target goals.
- Adaptive question/difficulty logic.
- "My Progress" dashboard in frontend.

### A2. Session Review + Mistake Intelligence
- Save session mistakes in structured categories (tense, articles, prepositions, pronunciation).
- Show correction + short explanation + example sentence.
- Add "practice again" button that generates targeted follow-up drills.

**Deliverables**
- Mistake tagging model in backend/gamification DB.
- Review screen with filters (today, this week, category).
- Regeneration endpoint for targeted practice sets.

### A3. Vocabulary Builder (Spaced Repetition)
- Add flashcards with spaced repetition intervals.
- Separate passive recognition and active recall modes.
- Track retention score per word.

**Deliverables**
- Card scheduling logic (`next_due_at`, ease factor, interval).
- Daily review queue endpoint.
- Frontend flashcard/review flow with progress metrics.

## Phase B: Engagement and Motivation (2-3 weeks)

### B1. Deeper Gamification Loops
- Weekly quests (e.g., "complete 5 speaking sessions").
- Milestone badges with visible progress bars.
- Leaderboard by class/friends/global (optional toggle).

**Deliverables**
- Quest engine with auto-evaluation jobs.
- Badge metadata + unlock conditions.
- Leaderboard endpoints with pagination and anti-cheat constraints.

### B2. Coach Personas and Learning Modes
- Add selectable coach style: supportive, strict, exam-focused, conversational.
- Add session mode presets: "daily speaking", "IELTS prep", "grammar repair", "business English".

**Deliverables**
- Persona/mode configuration in backend prompt logic.
- Frontend selector and saved user preference.

### B3. Streak Protection and Re-engagement
- 1-2 streak freeze tokens per month.
- Smart nudges: reminders when user misses schedule.
- "Comeback mission" after inactivity.

**Deliverables**
- Streak freeze policy and redemption endpoints.
- Notification triggers (email/in-app placeholder first).

## Phase C: Quality and Trust (2-3 weeks)

### C1. Safety + Content Guardrails
- Add moderation layer for harmful/offensive content in user input/output.
- Add policy responses for disallowed prompts.
- Add age-appropriate response mode (if applicable to your audience).

**Deliverables**
- Input/output moderation middleware.
- Safety test cases.
- Configurable safety policy file.

### C2. Authentication and Account Security
- Unify auth strategy across services (single source of truth).
- Add refresh token flow and secure session handling.
- Add role-based access for admin/teacher analytics.

**Deliverables**
- Consistent JWT validation middleware for all APIs.
- Token expiration and refresh endpoints.
- Protected routes for admin-only dashboards.

### C3. Privacy, Consent, and Data Retention
- Add clear consent flow for storing voice/audio and performance data.
- Provide "download my data" and "delete my data" actions.
- Define retention windows for audio/session logs.

**Deliverables**
- Consent flags in user model.
- Data export/delete endpoints and UI actions.
- Retention cleanup job.

## 4) Engineering and Architecture Improvements

### 4.1 API Contract Standardization
- Use consistent response envelope shape:
  - `success`, `data`, `error`, `requestId`.
- Standardize error codes and HTTP status usage across Flask + Node services.

### 4.2 Event-Driven Integrations
- Use event hooks for key actions:
  - `session.completed`
  - `mistake.recorded`
  - `quest.completed`
- This decouples tutoring logic from gamification logic.

### 4.3 Background Jobs
- Move heavy tasks to background workers:
  - spaced repetition recalculation
  - leaderboard aggregation
  - retention cleanup
  - summary generation

### 4.4 Configuration Hygiene
- Keep `.env.example` complete and synced.
- Add startup validation for required env vars in each service.
- Split configs by environment (`dev`, `staging`, `prod`).

## 5) Testing Strategy (Must Add)

### 5.1 Backend Tests
- Unit tests:
  - XP/streak logic
  - mistake classification
  - session scoring
- Integration tests:
  - auth-protected endpoints
  - full session completion flow

### 5.2 Frontend Tests
- Component tests for key screens:
  - session UI
  - progress dashboard
  - flashcard flow
- E2E tests for critical path:
  - login -> session -> review -> XP update

### 5.3 Non-Functional Tests
- Load test core APIs (session submit, leaderboard, progress).
- Resilience tests for partial service downtime.

## 6) DevOps and Release Readiness

### 6.1 CI/CD
- Add pipeline stages:
  - lint
  - test
  - build
  - security scan
- Block merge on failed tests.

### 6.2 Monitoring and Alerting
- Add structured logging with correlation IDs.
- Add API metrics dashboards:
  - latency
  - error rate
  - throughput
- Add alerts for high error rates and downtime.

### 6.3 Deployment Strategy
- Add staging environment mirroring production.
- Use rolling or blue/green deployment.
- Add rollback playbook and smoke tests.

## 7) Analytics and Learning KPIs

Track these weekly:
- DAU/WAU and session completion rate.
- 7-day and 30-day retention.
- Average mistakes per session (should trend down).
- Vocabulary retention percentage.
- Time-to-first-successful-session for new users.

Use KPIs to prioritize roadmap updates every 2 weeks.

## 8) Suggested 12-Week Execution Plan

### Weeks 1-2: Foundation
- API contract standardization.
- Env validation and config cleanup.
- Baseline tests for critical endpoints.

### Weeks 3-5: Learning Core
- Personalized path + mistake intelligence.
- Progress dashboard.

### Weeks 6-7: Vocabulary System
- Spaced repetition engine + flashcard UI.

### Weeks 8-9: Engagement
- Quests, badges, leaderboard, streak freeze.

### Weeks 10-11: Trust and Security
- Safety moderation.
- auth hardening + privacy controls.

### Week 12: Release Hardening
- Load tests, monitoring dashboards, staging sign-off, production launch checklist.

## 9) Prioritization Matrix (Build First)

Top priority (highest impact + manageable effort):
1. Personalized path + mistake review
2. Spaced repetition vocabulary
3. Core test coverage + CI gates
4. Monitoring + alerting
5. Auth/security/privacy hardening

## 10) Team Task Breakdown

### Frontend
- Progress dashboard, flashcards UI, quests/badges screens, consent controls.

### Flask Backend
- Tutor personalization logic, mistake explanation generation, safety filters.

### Gamification Server
- Quest engine, streak policies, leaderboard, analytics aggregation.

### Shared/Platform
- Auth consistency, API standards, CI/CD, observability, staging rollout.

## 11) Definition of Done (Per Feature)

A feature is done only if:
- Functional requirements are met.
- Unit/integration tests are added and passing.
- Metrics/logging are in place.
- Error states are handled in UI and API.
- Documentation is updated.

## 12) Immediate Next Actions (This Week)

1. Finalize top 3 features from Phase A.
2. Create implementation tickets with acceptance criteria.
3. Add baseline CI checks (lint + tests).
4. Define KPI dashboard schema.
5. Start with personalized path MVP.

---

If needed, this can be converted into issue-by-issue backlog format (epics, stories, and estimated points) for direct sprint planning.
