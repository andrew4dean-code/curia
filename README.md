# Curia (v2)

Manual trade tracker PWA. You enter trades; Curia shows open positions and an
honest ledger — plus weekly sold-options tracking (premium, expire/buyback/assign with auto-booked shares) a letterpress trade ceremony on every submit, a gamified month-board for selling weekly options (tap a week line), wheel-campaign tracking (hero cards with an engraved cycle dial, true basis, close-today total, crest ceremonies), and a Settings tab with force-update + backups. Frontend: React/Vite PWA (all money math client-side, tested).
Backend: dumb FastAPI store + passcode, Railway Postgres. Spec + plan in
`docs/superpowers/`.

Live: https://curia-production-5f0c.up.railway.app (Railway project `curia`, service `curia` + Postgres; deployed via `railway up`).

Dev: `cd frontend && npm run dev` (Node 20!) · `cd backend && uvicorn app.main:app --reload`
Tests: `cd frontend && npx vitest run` · `cd backend && python -m pytest -q`
