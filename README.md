# ApplyTrack

One-click job application tracker: **Chrome extension** + **Next.js dashboard** (Vercel).

## What it does

- Mark **Applied** on LinkedIn / Greenhouse / Lever / Workday with one click
- **Revisit** a job → chip shows you already applied (and status)
- Pipeline board: Saved → Applied → OA → Interview → Offer → Rejected
- Daily Cron stub for 7-day follow-up nudges
- Extension auth via **API token** (dashboard settings)

## Repo layout

```text
src/app          Next.js App Router (UI + API)
src/db           Drizzle schema (Neon Postgres)
extension/       Chrome MV3 extension
```

## Setup

### 1. Web app

```bash
cd applytrack
cp .env.example .env.local
# fill DATABASE_URL (Neon) + AUTH_SECRET
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → sign up → **Dashboard → Extension token**.

### 2. Chrome extension

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
2. Open the extension popup → paste **API base URL** (`http://localhost:3000` or your Vercel URL) + token
3. Open a job page → use the teal chip (**Mark Applied** / **Already applied**)

### 3. Deploy on Vercel

1. Import this GitHub repo in Vercel
2. Add env vars: `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`
3. Deploy
4. Point the extension API base at `https://your-app.vercel.app`

Cron hits `GET /api/cron/follow-ups` daily (see `vercel.ts`).

## API (Bearer token or session cookie)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/applications` | List |
| POST | `/api/applications` | Create or update by `jobKey` |
| GET | `/api/applications/lookup?url=` | Revisit check |
| PATCH/DELETE | `/api/applications/:id` | Update / delete |
| POST | `/api/tokens` | Mint extension token |

## Scripts

- `npm run dev` — local Next.js
- `npm run db:push` — push Drizzle schema to Neon
- `npm run build` — production build
