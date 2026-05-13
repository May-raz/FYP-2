# FYP 2 Functionality Summary

This document summarizes the currently implemented functionality in the project.

## 1) System Overview

The application is an AI-powered English learning platform with:
- `frontend` (React) for user experience and learning flows
- `gamification-server` (Node/Express + TypeScript) for APIs, authentication, tutor endpoints, and gamification
- MongoDB + Supabase-backed persistence (depending on feature domain)

## 2) Core User Features

### 2.1 Authentication
- User signup and login endpoints are available.
- JWT tokens are issued on successful authentication.
- Protected routes require bearer token authentication.
- Session expiration/unauthorized handling is implemented in frontend and backend.

### 2.2 User Profile and Level Management
- Profile data includes name, email, current level, persona, and progress preferences.
- Manual level selection is supported (`beginner`, `intermediate`, `advanced`, `native`).
- Auto-level assessment flow is supported for new users.
- Level change history is tracked.

### 2.3 Chat with Emma
- Real-time partner chat screen is implemented.
- Streaming response endpoint returns progressive SSE chat output.
- End-of-chat wrap-up endpoint returns summary and improvement points.
- Live analysis sidebar is implemented during partner chat.

### 2.4 Conversation Quality Improvements
- User input punctuation normalization is implemented:
  - question-word starts (what/where/why/how/who) are normalized to question format
  - question-like prompts are auto-marked with `?`
- Conversation intent detection exists (question/statement/exclamation behavior support).

## 3) Tutor Intelligence and Analysis

- Chat/tutor API pipeline includes:
  - grammar analysis
  - fluency-related scoring
  - pronunciation-related scoring and cues
  - response generation pipeline with fallback behavior
- Session-level feedback and scoring data structures are tracked.
- Detailed analytics endpoints are available for progress reporting.

## 4) Gamification Features

### 4.1 XP and Progression
- XP tracks exist (fluency, grammar, EQ/composite).
- Composite level/progression is computed.
- Weekly and cumulative performance data are supported.

### 4.2 Streaks and Leaderboard
- Streak endpoints exist (`current`, `longest`, history).
- Leaderboard endpoint supports scoped views and ranking.

### 4.3 Flashcards
- Flashcards are generated from learner mistakes.
- Due cards endpoint returns review queue.
- Review endpoint supports `correct` / `incorrect` behavior.
- Spaced repetition scheduling fields are managed:
  - next review date
  - interval
  - ease factor
  - review count

### 4.4 Quiz and Scenario Support
- Quiz question fetch + submission flow is implemented.
- Emotion/passport scenario-related routes and data support exist.

## 5) Data Storage and Persistence

### 5.1 MongoDB
- Authentication user records are stored in Mongo.
- Tutor profile data is stored in Mongo.
- Legacy JSON user data migration logic is implemented for compatibility.

### 5.2 Supabase
- Gamification domain data (flashcards, scenarios, related progression tables) is integrated with Supabase.

## 6) API and Security Infrastructure

- CORS is configured with explicit allowed origins and credentials support.
- Preflight (`OPTIONS`) handling is implemented for API routes.
- JWT verification and auth error handling are implemented.
- Auth debug diagnostics were added for easier troubleshooting.

## 7) Frontend Experience

- Auth pages (signup/login) and protected route gating are implemented.
- Dashboard includes:
  - profile summary
  - stats and proficiency display
  - gamification snapshot
- Dedicated pages/routes exist for:
  - chat
  - flashcards
  - quiz
  - profile
  - progress/analytics views
- Voice input and transcript normalization support are present.

## 8) Node-Centric Runtime Status

- Frontend API base is configured to use Node backend routes.
- Node backend exposes tutor-compatible `/api/...` endpoints used by frontend.
- Gamification routes are available under `/api/v1/gamification/...`.
- The project is operational with a Node-first backend path.

## 9) Operational Notes

- Environment variables are required for:
  - JWT secret
  - MongoDB URI (and optional DB name)
  - Supabase URL and service role key
  - frontend/backend port alignment
- Running services:
  - frontend on `3000`
  - node backend/gamification on configured Node port (commonly `5001`)

---

If needed, this summary can be expanded into a technical spec with endpoint-by-endpoint request/response contracts.
