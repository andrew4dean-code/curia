# Curia (v2) — Manual Trade Tracker PWA — Design

**Date:** 2026-07-24
**Status:** Approved in brainstorming; this document is the written spec.

## What this is

A rebuild of Curia as a simple, beautiful, manual trade tracker. Andrew types in his
trades; the app shows his open positions and an honest ledger of closed trades. No
broker connection, no OpenD, no Tailscale, no `claude` CLI — nothing that can rot.

The previous app (the Moomoo-connected dashboard at `~/curia`) is **shelved, not
deleted**: renamed to "Stock Control Center," its auto-start services turned off.
The Curia name, look, and feel move to this new app.

## Goals

- Add a trade in under 15 seconds from an iPhone home-screen app.
- Portfolio and ledger always available from any device, from anywhere, over plain HTTPS.
- Data stored safely off-device (Railway Postgres), survives a lost phone.
- Keep the Curia aesthetic: parchment letterpress, serif headers, odometer numbers,
  flash-on-change, the maroon wax-seal icon.
- Zero recurring maintenance. No logins that expire, no gateway daemons.

## Non-goals

- No broker integration of any kind. No automatic price feeds.
- No AI committee, doctrine engine, register, or push notifications.
- No multi-user support, no accounts. One person, one passcode.
- No offline *writes* (adding trades requires internet; viewing does not).

## Architecture

```
PHONE / MAC (PWA in browser)
   │  HTTPS (public internet, passcode header)
   ▼
RAILWAY (Andrew's existing account, one new service)
   ├─ FastAPI app: dumb trade store (CRUD + export/import) + serves the built PWA
   └─ Railway Postgres: trades + marks
```

- **All intelligence lives in the frontend.** FIFO matching, position building, and
  stats are TypeScript modules in the app, unit-tested. The backend only stores and
  returns rows. Small backend = nothing to break.
- **One URL serves everything.** The FastAPI service serves the built frontend at `/`
  and the API under `/api/*`. Install once via Add to Home Screen.

## Frontend

React + Vite + TypeScript PWA (`vite-plugin-pwa`), fresh scaffold. Carried over from
the old repo (files copied, not forked): `curia-tokens.css` (parchment theme),
`Odometer`, `TickerTape`, `useFlash`, wax-seal PWA icons.

### Tab 1 — Portfolio (the main page)

Open positions, derived from entered trades:

- Header: total book value as the hero odometer (sum of shares × mark price),
  with total unrealized P/L beneath it.
- One row per open position: symbol, shares held, average cost, mark price,
  unrealized P/L in dollars and percent. Values flash on change.
- **Marks are manual.** Tapping a position opens "update price" — enter today's
  price, done. Each row shows staleness plainly (e.g. "marked 3d ago") so a stale
  mark never quietly lies.
- Floating **+** button → Add Trade sheet.

### Tab 2 — Ledger

The full record of completed trades:

- One row per closed trade (FIFO-matched round trip, fees included): symbol, entry
  date/price, exit date/price, held-for duration, realized P/L in dollars and percent.
- Stats block below: win rate, average win, average loss, expectancy — same math as
  the old ledger.
- An **All Entries** view (secondary, reached by a link at the bottom of the
  Ledger tab) lists every raw
  buy/sell as entered, for editing or deleting typos. Editing an entry recomputes
  everything downstream automatically (positions and closed trades are always
  derived, never stored).

### Add Trade sheet

Fields: side (buy/sell), symbol, shares, price, fees (default 0), date (default
today), optional note. Available from both tabs.

### Offline behavior

The app caches the last-fetched trades and marks locally. With no signal it renders
everything read-only from cache with an "offline — showing last synced" banner.
Adding/editing requires connectivity and goes straight to the server (no sync queue,
no conflicts).

## Backend

FastAPI (Python), deliberately dumb. Postgres via Railway's `DATABASE_URL`.

### Data model

- `trades`: `id`, `symbol`, `side` (buy|sell), `qty`, `price`, `fees`,
  `executed_at` (date), `note`, `created_at`, `updated_at`.
- `marks`: `symbol` (pk), `price`, `marked_at`.

### API

All under `/api`, all requiring the passcode header:

- `GET /trades` · `POST /trades` · `PUT /trades/{id}` · `DELETE /trades/{id}`
- `GET /marks` · `PUT /marks/{symbol}`
- `GET /export` — the full dataset as one JSON file (the backup button)
- `POST /import` — restore from a backup JSON (replaces all rows, guarded by a
  confirmation flag in the request)
- `GET /health` — unauthenticated liveness check

### Auth — the lock on the door

Single passcode, set once as a Railway environment variable (stored hashed:
`CURIA_PASSCODE_SHA256`). The app asks for the passcode on first launch per device,
verifies it by issuing a `GET /api/trades`, and stores it locally thereafter. Every API request
carries `X-Curia-Key`; the server compares constant-time. Wrong-key responses are
delayed (~1s) to blunt guessing. HTTPS is provided by Railway.

This is deliberately not "real" auth (no users, no sessions, no reset flow) — it is
a lock on a one-person notebook, and that is enough.

## Deployment

- New GitHub repo `curia` (public is fine — the repo holds only code; trades live
  solely in Railway Postgres).
- Railway service on Andrew's existing account, deploying from the GitHub repo.
  Build: install frontend deps → `vite build` → FastAPI serves `dist/`. The build
  runs on Railway's builders, which sidesteps the Mac mini's local Node 24
  build-hang entirely; local dev pins Node 20/22 via nvm for tests.
- Local project folder: `~/curia-app` on the Mac mini.

## Shelving the old app (Stock Control Center)

Order matters — do this before creating the new GitHub repo so the `curia` name is free:

1. `~/curia/ops/install.sh uninstall` — unloads `com.curia.app`,
   `com.curia.morning`, `com.curia.caffeinate`.
2. Rename folder `~/curia` → `~/stock-control-center`.
3. Rename GitHub repo `andrew4dean-code/curia` → `stock-control-center`
   (GitHub redirects the old URL automatically).
4. Update the local git remote in the renamed folder.
5. Update Claude's memory notes (curia-deployment.md) to reflect the shelving.

Nothing is deleted. The old app can be revived by re-running its installer.

## Testing

- **Frontend (Vitest):** the money math is the critical surface — FIFO matcher,
  position builder, stats (win rate, avg win/loss, expectancy) — written test-first,
  ported against the old Python implementation's test cases. Component smoke tests
  for both tabs and the Add Trade sheet.
- **Backend (pytest):** auth middleware (right key, wrong key, missing key, timing
  delay), CRUD round-trips, export/import round-trip.
- **Manual:** install on iPhone via Add to Home Screen; add a trade; kill signal and
  confirm offline read-only mode; restore a backup.

## Build order (implementation plan will detail)

1. Shelve the old app (steps above).
2. Scaffold frontend + backend, port the theme/motion components and icons.
3. TS money math, test-first.
4. Backend store + auth, test-first.
5. Tabs + Add Trade sheet wired to the API.
6. PWA polish (manifest, icons, offline cache) and Railway deploy.
7. Phone install + end-to-end manual verification.
