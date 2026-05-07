# FYP 2 - AI English Tutor (Full Stack)

Multi-service application with:
- `frontend` (React + TypeScript + Tailwind)
- `gamification-server` (Node/Express + TypeScript + Supabase + tutor APIs)

## Default Local Ports

- Frontend: `http://127.0.0.1:3000`
- Node API: `http://127.0.0.1:5001`

## Prerequisites

- Node.js 18+
- Supabase project (Postgres) for gamification features

## Environment Setup

### 1) Frontend
Create `frontend/.env`:

```env
REACT_APP_FLASK_URL=http://localhost:5001
REACT_APP_NODE_URL=http://localhost:5001
```

### 2) Node backend
- Copy `gamification-server/.env.example` to `gamification-server/.env`
- Ensure:
  - `PORT=5001`
  - `SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY`
  - `MONGO_URI=your_mongodb_connection_string`

## Install Dependencies

From project root:

```bash
npm install
npm --prefix frontend install
npm --prefix gamification-server install
```

## Run the App

### Option A: One command (recommended)
From root:

```bash
npm run start:all
```

This starts:
- frontend (`npm --prefix frontend start`)
- Node backend (`npm --prefix gamification-server run dev`)

### Option B: Separate terminals

Terminal 1:
```bash
npm --prefix frontend start
```

Terminal 2:
```bash
npm --prefix gamification-server run dev
```

## Quick Health Checks

- Node backend health: `http://127.0.0.1:5001/health`
- Frontend: `http://127.0.0.1:3000`

If all return successfully, the system is up and connected.
