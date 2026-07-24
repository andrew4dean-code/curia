# Curia (v2)

Manual trade tracker PWA. You enter trades; Curia shows open positions and an
honest ledger. Frontend: React/Vite PWA (all money math client-side, tested).
Backend: dumb FastAPI store + passcode, Railway Postgres. Spec + plan in
`docs/superpowers/`.

Dev: `cd frontend && npm run dev` (Node 20!) · `cd backend && uvicorn app.main:app --reload`
Tests: `cd frontend && npx vitest run` · `cd backend && python -m pytest -q`
