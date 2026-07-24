# Curia v2 — Manual Trade Tracker PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Moomoo-connected Curia with a manual trade tracker PWA: React frontend with the Curia parchment look, dumb FastAPI trade store on Railway Postgres, passcode auth.

**Architecture:** All intelligence (FIFO matching, positions, stats) lives in tested TypeScript modules in the frontend. The backend is a CRUD store with a passcode header check that also serves the built frontend. One Railway service + one Postgres database.

**Tech Stack:** React 19, Vite 7 (NOT 8 — the old repo's Vite 8/rolldown build hangs on this Mac), vite-plugin-pwa, Vitest 4, TypeScript; FastAPI, SQLAlchemy 2, psycopg 3, pytest; Railway (Dockerfile deploy).

## Global Constraints

- Old app is SHELVED, never deleted. It becomes `~/stock-control-center`.
- New app lives at `~/curia-app`. Spec: `docs/superpowers/specs/2026-07-24-curia-tracker-design.md`.
- Frontend Node: use Node 20 via `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` before ANY npm/npx/node command (Node 24 is the default and breaks the build toolchain).
- Backend Python: `python3 -m venv .venv` inside `backend/`, activate before pip/pytest.
- App display name is exactly `Curia`. Theme color `#16130d`, background `#E7DDC4`.
- Trade sides are exactly `BUY` and `SELL` (uppercase) everywhere — DB, API, TS types.
- Dates: `executed_at` is a plain `YYYY-MM-DD` string. Timestamps (`created_at`, `updated_at`, `marked_at`) are ISO-8601 UTC strings.
- Fees are excluded from average cost, included in realized P/L.
- FIFO ordering key: (`executed_at`, `id`) ascending. Sells with no open lots (shorts) are silently skipped.
- Auth: every `/api/*` route except `/api/health` requires header `X-Curia-Key`; server compares sha256 constant-time against env `CURIA_PASSCODE_SHA256`; wrong key → sleep `CURIA_AUTH_DELAY` seconds (default `1.0`) then 401.
- Quotes: auto-prices come from Yahoo Finance's unofficial chart endpoint (free, NO account, NO API key; requires a browser User-Agent header — Stooq was the original pick but now blocks non-browser clients). Marks carry `source`: exactly `auto` (from Yahoo) or `manual` (user-set). Quote failures always degrade silently — existing marks stand, nothing errors to the user.
- Commit after every task (messages given per task). Never commit `node_modules`, `.venv`, `dist`, `*.db`.

---

### Task 1: Shelve the old app (→ Stock Control Center)

**Files:**
- Modify: `~/curia/README.md` (prepend shelved banner)
- Rename: `~/curia` → `~/stock-control-center`
- Modify: `/Users/andrewmacmini/.claude/projects/-Users-andrewmacmini/memory/curia-deployment.md` and `MEMORY.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the freed folder name `~/curia` stays UNUSED (new app is `~/curia-app`); theme files for Task 2 are afterwards found under `~/stock-control-center/frontend/`.

- [ ] **Step 1: Turn off the three launchd services**

```bash
~/curia/ops/install.sh uninstall
launchctl list | grep curia || echo "OK: no curia agents"
```
Expected: three `removed com.curia.*` lines, then `OK: no curia agents`.

- [ ] **Step 2: Verify the servers are actually gone**

```bash
sleep 2; curl -s -m 3 http://127.0.0.1:8000/api/health || echo "OK: backend down"
curl -s -m 3 -o /dev/null http://127.0.0.1:5173/ || echo "OK: frontend down"
pkill -f "uvicorn app.main:app" 2>/dev/null; pkill -f "vite" 2>/dev/null; true
```
Expected: both `OK:` lines (run the pkill line regardless; it mops up strays).

- [ ] **Step 3: Add a shelved banner to the old README, commit**

Prepend to `~/curia/README.md` (above the `# Curia` line):

```markdown
> **SHELVED (2026-07-24).** This app is retired and renamed **Stock Control Center**.
> The Curia name moved to a new manual trade tracker (repo: `andrew4dean-code/curia`,
> local: `~/curia-app`). To revive this app: `./ops/install.sh` reinstalls its
> launchd agents. Nothing here was deleted.

```

```bash
cd ~/curia && git add README.md && git commit -m "docs: shelve app as Stock Control Center; Curia name moves to the new tracker"
```

- [ ] **Step 4: Rename the folder**

```bash
cd ~ && mv ~/curia ~/stock-control-center && ls -d ~/stock-control-center
```
Expected: `/Users/andrewmacmini/stock-control-center`.

- [ ] **Step 5: USER STEP — rename the GitHub repo**

Ask Andrew to open https://github.com/andrew4dean-code/curia → Settings → Repository name → rename to `stock-control-center`. (GitHub redirects the old URL automatically.) Wait for his confirmation.

- [ ] **Step 6: Point the local remote at the new name and push the banner**

```bash
cd ~/stock-control-center
git remote set-url origin https://github.com/andrew4dean-code/stock-control-center.git
git push origin main
```
Expected: push succeeds.

- [ ] **Step 7: Update Claude memory**

Rewrite `/Users/andrewmacmini/.claude/projects/-Users-andrewmacmini/memory/curia-deployment.md` body to (keep frontmatter, update description to "Old Moomoo dashboard shelved as stock-control-center; Curia is now the manual tracker at ~/curia-app"):

```markdown
The original Moomoo-connected dashboard was SHELVED 2026-07-24: launchd agents
uninstalled, folder renamed to `~/stock-control-center`, GitHub repo renamed to
`stock-control-center`. Nothing deleted; `./ops/install.sh` revives it.

**Curia now means the v2 manual trade tracker** at `~/curia-app` (GitHub
`andrew4dean-code/curia`): React PWA + FastAPI trade store deployed on Andrew's
Railway account with Railway Postgres. Passcode auth via `CURIA_PASSCODE_SHA256`
env var. Spec: `~/curia-app/docs/superpowers/specs/2026-07-24-curia-tracker-design.md`.
Frontend toolchain: Vite 7 on Node 20 (`~/.nvm/versions/node/v20.20.2`) — Node 24
+ Vite 8 hangs builds on this Mac.
```

Update the `MEMORY.md` index line for Curia deployment to match ("old app shelved at ~/stock-control-center; Curia v2 tracker at ~/curia-app on Railway").

---

### Task 2: Scaffold the monorepo + carry over the Curia look

**Files:**
- Create: `~/curia-app/.gitignore`, `~/curia-app/README.md`
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Copy from `~/stock-control-center/frontend/`: `src/styles/curia-tokens.css`, `src/index.css`, `src/components/Odometer.tsx`, `src/components/TickerTape.tsx`, `src/hooks/useFlash.ts`, `src/lib/format.ts`, and `public/{apple-touch-icon.png,favicon.ico,favicon.svg,pwa-192.png,pwa-512.png}`
- Create: `backend/requirements.txt`, `backend/app/__init__.py` (empty)

**Interfaces:**
- Consumes: theme files from `~/stock-control-center/frontend/`.
- Produces: running dev toolchain. Later tasks import `Odometer` (`{ value: string; speed?: 'hero'|'detail'; className?: string; dataTestid?: string }`), `useFlash(value: number): string` (returns `''`/`'flash-up'`/`'flash-dn'` CSS class), `formatMoney/formatSignedMoney/formatSignedPct/formatPct/plColor` from `src/lib/format.ts`.

- [ ] **Step 1: Folders, gitignore, README stub**

```bash
cd ~/curia-app && mkdir -p frontend/src/{components,hooks,lib,styles,test} frontend/public backend/app backend/tests
```

`~/curia-app/.gitignore`:
```
node_modules/
dist/
.venv/
__pycache__/
*.db
.DS_Store
dev-dist/
```

`~/curia-app/README.md`:
```markdown
# Curia (v2)

Manual trade tracker PWA. You enter trades; Curia shows open positions and an
honest ledger. Frontend: React/Vite PWA (all money math client-side, tested).
Backend: dumb FastAPI store + passcode, Railway Postgres. Spec + plan in
`docs/superpowers/`.

Dev: `cd frontend && npm run dev` (Node 20!) · `cd backend && uvicorn app.main:app --reload`
Tests: `cd frontend && npx vitest run` · `cd backend && python -m pytest -q`
```

- [ ] **Step 2: Copy the look**

```bash
SRC=~/stock-control-center/frontend DST=~/curia-app/frontend
cp "$SRC/src/styles/curia-tokens.css" "$DST/src/styles/"
cp "$SRC/src/index.css" "$DST/src/"
cp "$SRC/src/components/Odometer.tsx" "$SRC/src/components/TickerTape.tsx" "$DST/src/components/"
cp "$SRC/src/hooks/useFlash.ts" "$DST/src/hooks/"
cp "$SRC/src/lib/format.ts" "$DST/src/lib/"
cp "$SRC"/public/apple-touch-icon.png "$SRC"/public/favicon.ico "$SRC"/public/favicon.svg "$SRC"/public/pwa-192.png "$SRC"/public/pwa-512.png "$DST/public/"
```

Then append to the END of `frontend/src/styles/curia-tokens.css` (the old repo defined these in a file we are not carrying; `format.ts#plColor` needs them):

```css
:root {
  --pl-up: var(--pl-green);
  --pl-down: var(--pl-red);
  --pl-flat: var(--ink-soft);
}
```

- [ ] **Step 3: Frontend config files**

`frontend/package.json`:
```json
{
  "name": "curia-frontend",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.0.0",
    "typescript": "~5.9.0",
    "vite": "^7.1.0",
    "vite-plugin-pwa": "^1.3.0",
    "vitest": "^4.1.0"
  }
}
```
(If `npm install` reports a peer conflict, resolve with the newest versions that satisfy `vite@7` — never `vite@8`.)

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Curia',
        short_name: 'Curia',
        description: 'Your trades, kept beautifully.',
        theme_color: '#16130d',
        background_color: '#E7DDC4',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
```

`frontend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // required for @testing-library/react auto-cleanup between tests
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`frontend/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`frontend/index.html` (same head as the old app minus push, fonts kept):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#16130d" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Curia" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Curia</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/curia-tokens.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/src/App.tsx` (placeholder until Task 6):
```tsx
export default function App() {
  return <h1 style={{ fontFamily: 'var(--font-display)', padding: 24 }}>Curia</h1>;
}
```

- [ ] **Step 4: Install and verify the toolchain**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd ~/curia-app/frontend && npm install && npm run build && npx vitest run
```
Expected: `npm run build` completes (produces `dist/`) — this is the exact step that hangs on the old toolchain, so it MUST finish. `vitest run` reports "no test files found" (exit code may be non-zero for zero tests; that is fine at this step).

- [ ] **Step 5: Backend venv**

`backend/requirements.txt`:
```
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy>=2.0
psycopg[binary]>=3.2
pytest>=8
httpx>=0.27
```

```bash
cd ~/curia-app/backend && python3 -m venv .venv && source .venv/bin/activate && pip install -q -r requirements.txt && python -c "import fastapi, sqlalchemy; print('ok')"
```
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add -A && git commit -m "feat: scaffold frontend/backend, carry over Curia parchment theme + motion"
```

---

### Task 3: Money math — types + FIFO closed trades (test-first)

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/fifo.ts`
- Test: `frontend/src/lib/__tests__/fifo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all shared types, and `computeClosedTrades(trades: Trade[]): ClosedTrade[]`.

- [ ] **Step 1: Write the types (shared by every later task)**

`frontend/src/lib/types.ts`:
```ts
export type Side = 'BUY' | 'SELL';

export interface Trade {
  id: number;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fees: number;
  executed_at: string; // YYYY-MM-DD
  note: string;
}

export interface Mark {
  symbol: string;
  price: number;
  marked_at: string; // ISO timestamp
  source: 'auto' | 'manual';
}

export interface ClosedTrade {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  realizedPl: number;
  realizedPlPct: number;
  openedAt: string; // YYYY-MM-DD
  closedAt: string; // YYYY-MM-DD
  isWin: boolean;
  fees: number;
}

export interface OpenPosition {
  symbol: string;
  qty: number;
  avgCost: number;
  mark: Mark | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
}

export interface Stats {
  winRate: number; // percent 0-100
  totalRealizedPl: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number; // negative or 0
  expectancy: number;
  bestTradePl: number;
  worstTradePl: number;
  closedCount: number;
}
```

- [ ] **Step 2: Write the failing FIFO tests**

`frontend/src/lib/__tests__/fifo.test.ts` — these cases are ported from the old Python `compute_realized_trades` semantics:
```ts
import { describe, expect, it } from 'vitest';
import { computeClosedTrades } from '../fifo';
import type { Trade } from '../types';

let nextId = 1;
function t(p: Partial<Trade> & Pick<Trade, 'symbol' | 'side' | 'qty' | 'price' | 'executed_at'>): Trade {
  return { id: nextId++, fees: 0, note: '', ...p };
}

describe('computeClosedTrades', () => {
  it('matches a simple round trip', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, executed_at: '2026-01-05' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 10, price: 110, executed_at: '2026-02-01' }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      symbol: 'AAPL', qty: 10, buyPrice: 100, sellPrice: 110,
      realizedPl: 100, openedAt: '2026-01-05', closedAt: '2026-02-01', isWin: true,
    });
    expect(closed[0].realizedPlPct).toBeCloseTo(10);
  });

  it('one sell consuming two lots FIFO produces two closed trades', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 200, executed_at: '2026-01-01' }),
      t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 220, executed_at: '2026-01-10' }),
      t({ symbol: 'TSLA', side: 'SELL', qty: 8, price: 230, executed_at: '2026-01-20' }),
    ]);
    expect(closed).toHaveLength(2);
    expect(closed[0]).toMatchObject({ qty: 5, buyPrice: 200 });
    expect(closed[1]).toMatchObject({ qty: 3, buyPrice: 220 });
  });

  it('apportions buy and sell fees by matched quantity', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'NVDA', side: 'BUY', qty: 10, price: 100, fees: 2, executed_at: '2026-01-01' }),
      t({ symbol: 'NVDA', side: 'SELL', qty: 5, price: 120, fees: 1, executed_at: '2026-01-15' }),
    ]);
    // gross = 20*5 = 100; sell fee share = 1 * 5/5 = 1; buy fee share = 2 * 5/10 = 1
    expect(closed[0].realizedPl).toBeCloseTo(98);
    expect(closed[0].fees).toBeCloseTo(2);
  });

  it('a losing trade has isWin false and negative pct', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'MEME', side: 'BUY', qty: 4, price: 50, executed_at: '2026-03-01' }),
      t({ symbol: 'MEME', side: 'SELL', qty: 4, price: 40, executed_at: '2026-03-02' }),
    ]);
    expect(closed[0].isWin).toBe(false);
    expect(closed[0].realizedPl).toBeCloseTo(-40);
    expect(closed[0].realizedPlPct).toBeCloseTo(-20);
  });

  it('skips a sell with no open lots (short) and sorts output by closedAt', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'GME', side: 'SELL', qty: 5, price: 20, executed_at: '2026-01-02' }),
      t({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10, executed_at: '2026-01-01' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 1, price: 12, executed_at: '2026-01-03' }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0].symbol).toBe('AAPL');
  });

  it('orders same-day trades by id', () => {
    const buyLate = t({ symbol: 'AMD', side: 'BUY', qty: 1, price: 90, executed_at: '2026-01-01' });
    const buyEarly = t({ symbol: 'AMD', side: 'BUY', qty: 1, price: 80, executed_at: '2026-01-01' });
    // ids ascend in creation order: buyLate.id < buyEarly.id, so buyLate lot is consumed first
    const closed = computeClosedTrades([
      buyEarly, buyLate,
      t({ symbol: 'AMD', side: 'SELL', qty: 1, price: 100, executed_at: '2026-01-02' }),
    ]);
    expect(closed[0].buyPrice).toBe(90);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd ~/curia-app/frontend && npx vitest run src/lib/__tests__/fifo.test.ts
```
Expected: FAIL — cannot resolve `../fifo`.

- [ ] **Step 4: Implement**

`frontend/src/lib/fifo.ts`:
```ts
import type { ClosedTrade, Trade } from './types';

interface Lot { qty: number; price: number; openedAt: string; origQty: number; fee: number }

const EPS = 1e-9;

export function sortForFifo(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) => a.executed_at.localeCompare(b.executed_at) || a.id - b.id,
  );
}

export function groupBySymbol(trades: Trade[]): Map<string, Trade[]> {
  const m = new Map<string, Trade[]>();
  for (const t of trades) {
    const arr = m.get(t.symbol);
    if (arr) arr.push(t);
    else m.set(t.symbol, [t]);
  }
  return m;
}

export function computeClosedTrades(trades: Trade[]): ClosedTrade[] {
  const closed: ClosedTrade[] = [];
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const lots: Lot[] = [];
    for (const t of sortForFifo(ts)) {
      if (t.side === 'BUY') {
        lots.push({ qty: t.qty, price: t.price, openedAt: t.executed_at, origQty: t.qty, fee: t.fees });
        continue;
      }
      let q = t.qty;
      const sellQty = t.qty;
      while (q > EPS && lots.length) {
        const lot = lots[0];
        const m = Math.min(q, lot.qty);
        const gross = (t.price - lot.price) * m;
        const sellFeeShare = sellQty ? t.fees * (m / sellQty) : 0;
        const buyFeeShare = lot.origQty ? lot.fee * (m / lot.origQty) : 0;
        const fees = sellFeeShare + buyFeeShare;
        const realizedPl = gross - fees;
        const basis = lot.price * m;
        closed.push({
          symbol,
          qty: m,
          buyPrice: lot.price,
          sellPrice: t.price,
          realizedPl,
          realizedPlPct: basis !== 0 ? (realizedPl / basis) * 100 : 0,
          openedAt: lot.openedAt,
          closedAt: t.executed_at,
          isWin: realizedPl > 0,
          fees: Math.round(fees * 10000) / 10000,
        });
        q -= m;
        if (m >= lot.qty - EPS) lots.shift();
        else lot.qty -= m;
      }
      // leftover sell with no lots => short position: skipped by design
    }
  }
  closed.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  return closed;
}
```

- [ ] **Step 5: Run to verify pass**

```bash
npx vitest run src/lib/__tests__/fifo.test.ts
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src/lib && git commit -m "feat(math): shared types + FIFO closed-trade matcher, test-first"
```

---

### Task 4: Money math — open positions + stats (test-first)

**Files:**
- Create: `frontend/src/lib/positions.ts`, `frontend/src/lib/stats.ts`
- Test: `frontend/src/lib/__tests__/positions.test.ts`, `frontend/src/lib/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `sortForFifo`/`groupBySymbol` from `fifo.ts` (Task 3).
- Produces: `computeOpenPositions(trades: Trade[], marks: Mark[]): OpenPosition[]` and `computeStats(closed: ClosedTrade[]): Stats`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/__tests__/positions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeOpenPositions } from '../positions';
import type { Mark, Trade } from '../types';

let nextId = 1;
function t(p: Partial<Trade> & Pick<Trade, 'symbol' | 'side' | 'qty' | 'price' | 'executed_at'>): Trade {
  return { id: nextId++, fees: 0, note: '', ...p };
}
const mark = (symbol: string, price: number): Mark => ({ symbol, price, marked_at: '2026-07-24T12:00:00Z', source: 'auto' });

describe('computeOpenPositions', () => {
  it('weighted average cost over remaining lots, fees excluded', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 5, executed_at: '2026-01-01' }),
        t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 120, executed_at: '2026-01-02' }),
        t({ symbol: 'AAPL', side: 'SELL', qty: 10, price: 130, executed_at: '2026-01-03' }),
      ],
      [mark('AAPL', 140)],
    );
    expect(pos).toHaveLength(1);
    expect(pos[0].qty).toBe(10);
    expect(pos[0].avgCost).toBeCloseTo(120); // first lot fully consumed by FIFO
    expect(pos[0].marketValue).toBeCloseTo(1400);
    expect(pos[0].unrealizedPl).toBeCloseTo(200);
    expect(pos[0].unrealizedPlPct).toBeCloseTo((20 / 120) * 100);
  });

  it('fully closed symbols disappear', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 200, executed_at: '2026-01-01' }),
        t({ symbol: 'TSLA', side: 'SELL', qty: 5, price: 210, executed_at: '2026-01-05' }),
      ],
      [],
    );
    expect(pos).toHaveLength(0);
  });

  it('no mark => null market fields, and output sorts by symbol', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'NVDA', side: 'BUY', qty: 2, price: 500, executed_at: '2026-01-01' }),
        t({ symbol: 'AMD', side: 'BUY', qty: 3, price: 100, executed_at: '2026-01-01' }),
      ],
      [mark('NVDA', 550)],
    );
    expect(pos.map((p) => p.symbol)).toEqual(['AMD', 'NVDA']);
    expect(pos[0].mark).toBeNull();
    expect(pos[0].unrealizedPl).toBeNull();
    expect(pos[1].unrealizedPl).toBeCloseTo(100);
  });
});
```

`frontend/src/lib/__tests__/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeStats } from '../stats';
import type { ClosedTrade } from '../types';

function ct(realizedPl: number): ClosedTrade {
  return {
    symbol: 'X', qty: 1, buyPrice: 1, sellPrice: 1, realizedPl,
    realizedPlPct: 0, openedAt: '2026-01-01', closedAt: '2026-01-02',
    isWin: realizedPl > 0, fees: 0,
  };
}

describe('computeStats', () => {
  it('zeroed stats on empty input', () => {
    expect(computeStats([])).toEqual({
      winRate: 0, totalRealizedPl: 0, wins: 0, losses: 0, avgWin: 0,
      avgLoss: 0, expectancy: 0, bestTradePl: 0, worstTradePl: 0, closedCount: 0,
    });
  });

  it('computes win rate, averages, expectancy (matches old Python ledger)', () => {
    const s = computeStats([ct(100), ct(50), ct(-30)]);
    expect(s.closedCount).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100);
    expect(s.totalRealizedPl).toBeCloseTo(120);
    expect(s.avgWin).toBeCloseTo(75);
    expect(s.avgLoss).toBeCloseTo(-30);
    expect(s.expectancy).toBeCloseTo((2 / 3) * 75 + (1 / 3) * -30);
    expect(s.bestTradePl).toBe(100);
    expect(s.worstTradePl).toBe(-30);
  });

  it('breakeven (0) counts as a loss, same as the old app', () => {
    const s = computeStats([ct(0)]);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/__tests__/positions.test.ts src/lib/__tests__/stats.test.ts
```
Expected: FAIL — cannot resolve `../positions` / `../stats`.

- [ ] **Step 3: Implement**

`frontend/src/lib/positions.ts`:
```ts
import { groupBySymbol, sortForFifo } from './fifo';
import type { Mark, OpenPosition, Trade } from './types';

const EPS = 1e-9;

export function computeOpenPositions(trades: Trade[], marks: Mark[]): OpenPosition[] {
  const markBySymbol = new Map(marks.map((m) => [m.symbol, m]));
  const out: OpenPosition[] = [];
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const lots: { qty: number; price: number }[] = [];
    for (const t of sortForFifo(ts)) {
      if (t.side === 'BUY') {
        lots.push({ qty: t.qty, price: t.price });
        continue;
      }
      let q = t.qty;
      while (q > EPS && lots.length) {
        const m = Math.min(q, lots[0].qty);
        q -= m;
        if (m >= lots[0].qty - EPS) lots.shift();
        else lots[0].qty -= m;
      }
    }
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= EPS) continue;
    const avgCost = lots.reduce((s, l) => s + l.qty * l.price, 0) / qty;
    const mark = markBySymbol.get(symbol) ?? null;
    out.push({
      symbol,
      qty,
      avgCost,
      mark,
      marketValue: mark ? mark.price * qty : null,
      unrealizedPl: mark ? (mark.price - avgCost) * qty : null,
      unrealizedPlPct: mark && avgCost !== 0 ? ((mark.price - avgCost) / avgCost) * 100 : null,
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}
```

`frontend/src/lib/stats.ts`:
```ts
import type { ClosedTrade, Stats } from './types';

export function computeStats(closed: ClosedTrade[]): Stats {
  if (!closed.length) {
    return {
      winRate: 0, totalRealizedPl: 0, wins: 0, losses: 0, avgWin: 0,
      avgLoss: 0, expectancy: 0, bestTradePl: 0, worstTradePl: 0, closedCount: 0,
    };
  }
  const pls = closed.map((t) => t.realizedPl);
  const winsPl = closed.filter((t) => t.isWin).map((t) => t.realizedPl);
  const lossesPl = closed.filter((t) => !t.isWin).map((t) => t.realizedPl);
  const closedCount = closed.length;
  const wins = winsPl.length;
  const losses = lossesPl.length;
  const avgWin = wins ? winsPl.reduce((a, b) => a + b, 0) / wins : 0;
  const avgLoss = losses ? lossesPl.reduce((a, b) => a + b, 0) / losses : 0;
  return {
    winRate: (wins / closedCount) * 100,
    totalRealizedPl: pls.reduce((a, b) => a + b, 0),
    wins,
    losses,
    avgWin,
    avgLoss,
    expectancy: (wins / closedCount) * avgWin + (losses / closedCount) * avgLoss,
    bestTradePl: Math.max(...pls),
    worstTradePl: Math.min(...pls),
    closedCount,
  };
}
```

- [ ] **Step 4: Run all frontend tests**

```bash
npx vitest run
```
Expected: fifo + positions + stats suites all pass (12 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src/lib && git commit -m "feat(math): open positions + ledger stats, test-first"
```

---

### Task 5: Backend — store, auth, export/import (test-first)

**Files:**
- Create: `backend/app/models.py`, `backend/app/db.py`, `backend/app/auth.py`, `backend/app/quotes.py`, `backend/app/routes.py`, `backend/app/main.py`
- Test: `backend/tests/conftest.py`, `backend/tests/test_auth.py`, `backend/tests/test_trades.py`, `backend/tests/test_export_import.py`, `backend/tests/test_quotes.py`

**Interfaces:**
- Consumes: nothing (independent of frontend).
- Produces the HTTP API the frontend calls in Task 6:
  - `GET /api/health` → `{"ok": true}` (no auth)
  - `GET /api/trades` → `[TradeOut]`; `POST /api/trades` (TradeIn) → TradeOut 201; `PUT /api/trades/{id}` → TradeOut; `DELETE /api/trades/{id}` → 204
  - `TradeIn = {symbol, side: "BUY"|"SELL", qty>0, price>=0, fees>=0, executed_at, note}`; `TradeOut = TradeIn + {id}`; symbols stored upper-cased/trimmed
  - `GET /api/marks` → `[{symbol, price, marked_at, source}]`; `PUT /api/marks/{symbol}` body `{"price": number}` → mark (upserts as `source: "manual"`, stamps `marked_at` now)
  - `POST /api/marks/refresh` → derives symbols with net open qty > 0 from trades, fetches Yahoo quotes for them, upserts as `source: "auto"` marks, returns the full marks list (same shape as `GET /api/marks`); quote-source failure returns the existing marks unchanged
  - `GET /api/export` → `{"version": 1, "trades": [TradeOut], "marks": [...]}`; `POST /api/import` body `{"confirm": true, "trades": [...], "marks": [...]}` → `{"trades": n, "marks": n}` (replaces everything; 400 without `confirm`)
  - All `/api/*` except health: 401 unless header `X-Curia-Key` matches.

- [ ] **Step 1: Write conftest + failing auth test**

`backend/tests/conftest.py`:
```python
import hashlib
import os

os.environ["CURIA_PASSCODE_SHA256"] = hashlib.sha256(b"test-pass").hexdigest()
os.environ["CURIA_AUTH_DELAY"] = "0"
os.environ["DATABASE_URL"] = "sqlite:///./test_curia.db"

import pytest
from fastapi.testclient import TestClient

from app.db import engine
from app.models import Base
from app.main import app

HEADERS = {"X-Curia-Key": "test-pass"}


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c
```

`backend/tests/test_auth.py`:
```python
from tests.conftest import HEADERS


def test_health_needs_no_key(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_missing_key_is_401(client):
    assert client.get("/api/trades").status_code == 401


def test_wrong_key_is_401(client):
    assert client.get("/api/trades", headers={"X-Curia-Key": "nope"}).status_code == 401


def test_right_key_passes(client):
    assert client.get("/api/trades", headers=HEADERS).status_code == 200
```

Note: run pytest from `backend/` with `python -m pytest` so both `app` and `tests` are importable packages; add empty `backend/tests/__init__.py`.

- [ ] **Step 2: Run to verify failure**

```bash
cd ~/curia-app/backend && source .venv/bin/activate && touch tests/__init__.py && python -m pytest tests/test_auth.py -q
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db'`.

- [ ] **Step 3: Implement models, db, auth, routes, main**

`backend/app/models.py`:
```python
from datetime import datetime, timezone

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str]
    side: Mapped[str]  # BUY | SELL
    qty: Mapped[float]
    price: Mapped[float]
    fees: Mapped[float] = mapped_column(default=0.0)
    executed_at: Mapped[str]  # YYYY-MM-DD
    note: Mapped[str] = mapped_column(default="")
    created_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow)


class Mark(Base):
    __tablename__ = "marks"
    symbol: Mapped[str] = mapped_column(primary_key=True)
    price: Mapped[float]
    marked_at: Mapped[str] = mapped_column(default=utcnow)
    source: Mapped[str] = mapped_column(default="manual")  # auto | manual
```

`backend/app/quotes.py`:
```python
"""US quotes via Yahoo Finance's unofficial chart endpoint — free, no account,
no API key. Requires a browser-like User-Agent (Yahoo rejects default clients).
(Stooq was the original pick but now blocks non-browser clients.)

GET https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1d
→ price at chart.result[0].meta.regularMarketPrice. Unknown symbols → HTTP 404.
"""
from typing import Optional

import httpx

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def price_from_chart(data: dict) -> Optional[float]:
    try:
        price = data["chart"]["result"][0]["meta"]["regularMarketPrice"]
    except (KeyError, IndexError, TypeError):
        return None
    return float(price) if isinstance(price, (int, float)) else None


def fetch_quotes(symbols: list[str]) -> dict[str, float]:
    """{SYMBOL: price} for the symbols Yahoo recognizes; skips per-symbol
    failures silently; {} on total failure. Never raises."""
    out: dict[str, float] = {}
    if not symbols:
        return out
    try:
        with httpx.Client(headers=_UA, timeout=8.0) as client:
            for sym in symbols:
                try:
                    resp = client.get(
                        CHART_URL.format(symbol=sym.upper()),
                        params={"interval": "1d", "range": "1d"},
                    )
                    resp.raise_for_status()
                    price = price_from_chart(resp.json())
                    if price is not None:
                        out[sym.upper()] = price
                except Exception:
                    continue
    except Exception:
        return out
    return out
```

`backend/app/db.py`:
```python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base


def _url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./curia.db")
    # Railway hands out postgres:// URLs; SQLAlchemy+psycopg3 wants postgresql+psycopg://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


_URL = _url()
engine = create_engine(
    _URL,
    connect_args={"check_same_thread": False} if _URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
```

`backend/app/auth.py`:
```python
import hashlib
import hmac
import os
import time

from fastapi import Header, HTTPException


def require_key(x_curia_key: str = Header(default="")) -> None:
    expected = os.environ.get("CURIA_PASSCODE_SHA256", "")
    given = hashlib.sha256(x_curia_key.encode()).hexdigest()
    if not expected or not hmac.compare_digest(given, expected):
        time.sleep(float(os.environ.get("CURIA_AUTH_DELAY", "1.0")))
        raise HTTPException(status_code=401, detail="wrong passcode")
```

`backend/app/routes.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app import quotes
from app.auth import require_key
from app.db import SessionLocal
from app.models import Mark, Trade, utcnow

router = APIRouter(prefix="/api", dependencies=[Depends(require_key)])


class TradeIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    side: str = Field(pattern="^(BUY|SELL)$")
    qty: float = Field(gt=0)
    price: float = Field(ge=0)
    fees: float = Field(default=0.0, ge=0)
    executed_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str = ""


class MarkIn(BaseModel):
    price: float = Field(ge=0)


class ImportBody(BaseModel):
    confirm: bool = False
    trades: list[dict] = []
    marks: list[dict] = []


def _trade_out(t: Trade) -> dict:
    return {
        "id": t.id, "symbol": t.symbol, "side": t.side, "qty": t.qty,
        "price": t.price, "fees": t.fees, "executed_at": t.executed_at, "note": t.note,
    }


def _mark_out(m: Mark) -> dict:
    return {"symbol": m.symbol, "price": m.price, "marked_at": m.marked_at, "source": m.source}


@router.get("/trades")
def list_trades() -> list[dict]:
    with SessionLocal() as s:
        rows = s.scalars(select(Trade).order_by(Trade.executed_at, Trade.id)).all()
        return [_trade_out(t) for t in rows]


@router.post("/trades", status_code=201)
def create_trade(body: TradeIn) -> dict:
    with SessionLocal() as s:
        t = Trade(**{**body.model_dump(), "symbol": body.symbol.strip().upper()})
        s.add(t)
        s.commit()
        return _trade_out(t)


@router.put("/trades/{trade_id}")
def update_trade(trade_id: int, body: TradeIn) -> dict:
    with SessionLocal() as s:
        t = s.get(Trade, trade_id)
        if t is None:
            raise HTTPException(status_code=404, detail="no such trade")
        for k, v in body.model_dump().items():
            setattr(t, k, v)
        t.symbol = body.symbol.strip().upper()
        t.updated_at = utcnow()
        s.commit()
        return _trade_out(t)


@router.delete("/trades/{trade_id}", status_code=204)
def delete_trade(trade_id: int) -> None:
    with SessionLocal() as s:
        t = s.get(Trade, trade_id)
        if t is None:
            raise HTTPException(status_code=404, detail="no such trade")
        s.delete(t)
        s.commit()


@router.get("/marks")
def list_marks() -> list[dict]:
    with SessionLocal() as s:
        return [_mark_out(m) for m in s.scalars(select(Mark).order_by(Mark.symbol)).all()]


@router.put("/marks/{symbol}")
def put_mark(symbol: str, body: MarkIn) -> dict:
    sym = symbol.strip().upper()
    with SessionLocal() as s:
        m = s.get(Mark, sym)
        if m is None:
            m = Mark(symbol=sym, price=body.price, marked_at=utcnow(), source="manual")
            s.add(m)
        else:
            m.price = body.price
            m.marked_at = utcnow()
            m.source = "manual"
        s.commit()
        return _mark_out(m)


@router.post("/marks/refresh")
def refresh_marks() -> list[dict]:
    with SessionLocal() as s:
        net: dict[str, float] = {}
        for sym, side, qty in s.execute(select(Trade.symbol, Trade.side, Trade.qty)).all():
            net[sym] = net.get(sym, 0.0) + (qty if side == "BUY" else -qty)
        open_syms = sorted(sym for sym, q in net.items() if q > 1e-9)
        for sym, price in quotes.fetch_quotes(open_syms).items():
            m = s.get(Mark, sym)
            if m is None:
                s.add(Mark(symbol=sym, price=price, marked_at=utcnow(), source="auto"))
            else:
                m.price = price
                m.marked_at = utcnow()
                m.source = "auto"
        s.commit()
        return [_mark_out(m) for m in s.scalars(select(Mark).order_by(Mark.symbol)).all()]


@router.get("/export")
def export_all() -> dict:
    with SessionLocal() as s:
        trades = [_trade_out(t) for t in s.scalars(select(Trade).order_by(Trade.id)).all()]
        marks = [_mark_out(m) for m in s.scalars(select(Mark)).all()]
        return {"version": 1, "trades": trades, "marks": marks}


@router.post("/import")
def import_all(body: ImportBody) -> dict:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="set confirm=true to replace all data")
    with SessionLocal() as s:
        s.execute(delete(Trade))
        s.execute(delete(Mark))
        for row in body.trades:
            data = TradeIn(**{k: row[k] for k in
                              ("symbol", "side", "qty", "price", "fees", "executed_at", "note")
                              if k in row})
            s.add(Trade(**{**data.model_dump(), "symbol": data.symbol.strip().upper()}))
        for row in body.marks:
            s.add(Mark(symbol=str(row["symbol"]).strip().upper(),
                       price=float(row["price"]),
                       marked_at=str(row.get("marked_at") or utcnow())))
        s.commit()
        return {"trades": len(body.trades), "marks": len(body.marks)}
```

`backend/app/main.py`:
```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="Curia")
    init_db()

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    app.include_router(router)

    static = Path(__file__).resolve().parent.parent / "static"
    if static.is_dir():
        app.mount("/", StaticFiles(directory=static, html=True), name="static")
    return app


app = create_app()
```

- [ ] **Step 4: Auth tests pass**

```bash
python -m pytest tests/test_auth.py -q
```
Expected: 4 passed.

- [ ] **Step 5: Write CRUD + export/import tests**

`backend/tests/test_trades.py`:
```python
from tests.conftest import HEADERS

AAPL = {"symbol": "aapl", "side": "BUY", "qty": 10, "price": 100.5,
        "fees": 1.25, "executed_at": "2026-07-01", "note": "starter"}


def test_crud_round_trip(client):
    created = client.post("/api/trades", json=AAPL, headers=HEADERS)
    assert created.status_code == 201
    t = created.json()
    assert t["symbol"] == "AAPL"  # upper-cased
    assert t["id"] > 0

    assert client.get("/api/trades", headers=HEADERS).json() == [t]

    updated = client.put(f"/api/trades/{t['id']}", json={**AAPL, "qty": 12}, headers=HEADERS)
    assert updated.json()["qty"] == 12

    assert client.delete(f"/api/trades/{t['id']}", headers=HEADERS).status_code == 204
    assert client.get("/api/trades", headers=HEADERS).json() == []


def test_validation_rejects_bad_side_and_qty(client):
    assert client.post("/api/trades", json={**AAPL, "side": "HOLD"}, headers=HEADERS).status_code == 422
    assert client.post("/api/trades", json={**AAPL, "qty": 0}, headers=HEADERS).status_code == 422
    assert client.post("/api/trades", json={**AAPL, "executed_at": "07/01/2026"}, headers=HEADERS).status_code == 422


def test_update_missing_trade_404(client):
    assert client.put("/api/trades/999", json=AAPL, headers=HEADERS).status_code == 404


def test_marks_upsert(client):
    m1 = client.put("/api/marks/nvda", json={"price": 500}, headers=HEADERS).json()
    assert m1["symbol"] == "NVDA"
    m2 = client.put("/api/marks/NVDA", json={"price": 510}, headers=HEADERS).json()
    assert m2["price"] == 510
    assert client.get("/api/marks", headers=HEADERS).json() == [m2]
```

`backend/tests/test_export_import.py`:
```python
from tests.conftest import HEADERS

AAPL = {"symbol": "AAPL", "side": "BUY", "qty": 10, "price": 100,
        "fees": 0, "executed_at": "2026-07-01", "note": ""}


def test_export_import_round_trip(client):
    client.post("/api/trades", json=AAPL, headers=HEADERS)
    client.put("/api/marks/AAPL", json={"price": 120}, headers=HEADERS)

    backup = client.get("/api/export", headers=HEADERS).json()
    assert backup["version"] == 1
    assert len(backup["trades"]) == 1

    # wipe by importing empty, then restore from the backup
    client.post("/api/import", json={"confirm": True}, headers=HEADERS)
    assert client.get("/api/trades", headers=HEADERS).json() == []

    result = client.post("/api/import", json={"confirm": True, **backup}, headers=HEADERS)
    assert result.json() == {"trades": 1, "marks": 1}
    assert client.get("/api/trades", headers=HEADERS).json()[0]["symbol"] == "AAPL"
    assert client.get("/api/marks", headers=HEADERS).json()[0]["price"] == 120


def test_import_without_confirm_is_400(client):
    assert client.post("/api/import", json={"trades": []}, headers=HEADERS).status_code == 400
```

- [ ] **Step 6: Quote tests**

`backend/tests/test_quotes.py`:
```python
from app import quotes
from tests.conftest import HEADERS


def test_price_from_chart_happy_and_malformed():
    payload = {"chart": {"result": [{"meta": {"regularMarketPrice": 100.5, "symbol": "AAPL"}}]}}
    assert quotes.price_from_chart(payload) == 100.5
    assert quotes.price_from_chart({"chart": {"result": []}}) is None
    assert quotes.price_from_chart({}) is None


def test_refresh_marks_only_touches_open_symbols(client, monkeypatch):
    for body in [
        {"symbol": "AAPL", "side": "BUY", "qty": 10, "price": 100, "fees": 0, "executed_at": "2026-07-01", "note": ""},
        {"symbol": "TSLA", "side": "BUY", "qty": 5, "price": 200, "fees": 0, "executed_at": "2026-07-01", "note": ""},
        {"symbol": "TSLA", "side": "SELL", "qty": 5, "price": 210, "fees": 0, "executed_at": "2026-07-02", "note": ""},
    ]:
        client.post("/api/trades", json=body, headers=HEADERS)

    seen = {}

    def fake_fetch(symbols):
        seen["symbols"] = symbols
        return {"AAPL": 123.45}

    monkeypatch.setattr(quotes, "fetch_quotes", fake_fetch)
    marks = client.post("/api/marks/refresh", headers=HEADERS).json()
    assert seen["symbols"] == ["AAPL"]  # TSLA is fully closed — not fetched
    assert len(marks) == 1
    assert marks[0]["symbol"] == "AAPL"
    assert marks[0]["price"] == 123.45
    assert marks[0]["source"] == "auto"


def test_stooq_failure_keeps_existing_marks(client, monkeypatch):
    client.post("/api/trades", json={"symbol": "AAPL", "side": "BUY", "qty": 1, "price": 100, "fees": 0, "executed_at": "2026-07-01", "note": ""}, headers=HEADERS)
    client.put("/api/marks/AAPL", json={"price": 111}, headers=HEADERS)
    monkeypatch.setattr(quotes, "fetch_quotes", lambda syms: {})  # simulated outage
    marks = client.post("/api/marks/refresh", headers=HEADERS).json()
    assert marks[0]["price"] == 111
    assert marks[0]["source"] == "manual"  # untouched


def test_manual_put_sets_source_manual(client):
    m = client.put("/api/marks/nvda", json={"price": 500}, headers=HEADERS).json()
    assert m["source"] == "manual"
```

- [ ] **Step 7: Run the full backend suite**

```bash
python -m pytest -q
```
Expected: 14 passed. (If test_trades fails but auth passed, the bug is in routes.py, not auth. `test_marks_upsert` in test_trades.py compares whole mark dicts — those now include `source`, which the responses carry automatically.)

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add backend && git commit -m "feat(backend): passcode-guarded trade/mark store, Stooq auto-quotes, export-import, test-first"
```

---

### Task 6: Frontend — API client, passcode gate, app shell + offline cache

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/time.ts`
- Create: `frontend/src/components/PasscodeGate.tsx`, `frontend/src/components/TabBar.tsx`, `frontend/src/components/OfflineBanner.tsx`
- Create: `frontend/src/styles/app.css`
- Modify: `frontend/src/App.tsx` (replace placeholder)
- Test: `frontend/src/lib/__tests__/time.test.ts`

**Interfaces:**
- Consumes: types (Task 3), backend API (Task 5).
- Produces for Tasks 7–8:
  - `api.ts`: `getPasscode(): string|null`, `setPasscode(p: string)`, `clearPasscode()`, `class ApiError extends Error { status: number }`, `interface Snapshot { trades: Trade[]; marks: Mark[]; fetchedAt: string }`, `fetchSnapshot(): Promise<Snapshot>` (also writes cache), `cachedSnapshot(): Snapshot|null`, `createTrade(t: Omit<Trade,'id'>)`, `updateTrade(t: Trade)`, `deleteTrade(id: number)`, `putMark(symbol: string, price: number)`, `refreshMarks(): Promise<Mark[]>` (POST /api/marks/refresh), `exportBackup(): Promise<unknown>`, `importBackup(data: unknown)`.
  - `time.ts`: `agoLabel(iso: string): string` → `"today"` or `"3d ago"`.
  - `App.tsx` renders `PortfolioTab`/`LedgerTab` with props `{ snap: Snapshot; onRefresh: () => Promise<void>; onEditTrade: (t: Trade|null) => void; onMark: (symbol: string) => void }` (Tabs are created as placeholder stubs here and filled in by Tasks 7–8).

- [ ] **Step 1: time helper, test-first**

`frontend/src/lib/__tests__/time.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agoLabel } from '../time';

describe('agoLabel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('same day is "today"', () => {
    vi.setSystemTime(new Date('2026-07-24T18:00:00Z'));
    expect(agoLabel('2026-07-24T09:00:00Z')).toBe('today');
  });

  it('three days is "3d ago"', () => {
    vi.setSystemTime(new Date('2026-07-24T18:00:00Z'));
    expect(agoLabel('2026-07-21T09:00:00Z')).toBe('3d ago');
  });
});
```

Run `npx vitest run src/lib/__tests__/time.test.ts` → FAIL (no module). Then `frontend/src/lib/time.ts`:
```ts
export function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
}
```
Re-run → 2 passed.

- [ ] **Step 2: API client**

`frontend/src/lib/api.ts`:
```ts
import type { Mark, Trade } from './types';

const KEY_STORAGE = 'curia-passcode';
const CACHE_STORAGE = 'curia-cache-v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getPasscode(): string | null {
  return localStorage.getItem(KEY_STORAGE);
}
export function setPasscode(p: string): void {
  localStorage.setItem(KEY_STORAGE, p);
}
export function clearPasscode(): void {
  localStorage.removeItem(KEY_STORAGE);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Curia-Key': getPasscode() ?? '',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiError(`request failed: ${res.status}`, res.status);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Snapshot {
  trades: Trade[];
  marks: Mark[];
  fetchedAt: string;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [trades, marks] = await Promise.all([
    request<Trade[]>('/api/trades'),
    request<Mark[]>('/api/marks'),
  ]);
  const snap: Snapshot = { trades, marks, fetchedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(snap));
  return snap;
}

export function cachedSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(CACHE_STORAGE);
  return raw ? (JSON.parse(raw) as Snapshot) : null;
}

export const createTrade = (t: Omit<Trade, 'id'>) =>
  request<Trade>('/api/trades', { method: 'POST', body: JSON.stringify(t) });
export const updateTrade = (t: Trade) =>
  request<Trade>(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify(t) });
export const deleteTrade = (id: number) =>
  request<void>(`/api/trades/${id}`, { method: 'DELETE' });
export const putMark = (symbol: string, price: number) =>
  request<Mark>(`/api/marks/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify({ price }),
  });
export const refreshMarks = () =>
  request<Mark[]>('/api/marks/refresh', { method: 'POST' });
export const exportBackup = () => request<unknown>('/api/export');
export const importBackup = (data: unknown) =>
  request<{ trades: number; marks: number }>('/api/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
```

- [ ] **Step 3: Shell components + styles**

`frontend/src/styles/app.css`:
```css
.shell { max-width: 640px; margin: 0 auto; padding: 16px 16px 96px; }
.hero { text-align: center; padding: 24px 0 8px; }
.hero .odo { font-family: var(--font-display); font-size: 44px; font-weight: 800; }
.hero-sub { color: var(--ink-soft); margin-top: 4px; font-size: 13px; }
.section-title { font-family: var(--font-display); font-size: 20px; font-weight: 700; margin: 20px 0 8px; border-bottom: 1px solid var(--rule); padding-bottom: 6px; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--rule); }
.row-main { min-width: 0; }
.row-sym { font-family: var(--font-display); font-weight: 700; font-size: 16px; }
.row-sub { color: var(--ink-soft); font-size: 12px; margin-top: 2px; }
.row-right { text-align: right; white-space: nowrap; }
.row-pl { font-size: 12px; margin-top: 2px; }
.tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: var(--parchment-card); border-top: 1px solid var(--rule); padding-bottom: env(safe-area-inset-bottom); }
.tabbar button { flex: 1; padding: 14px 0 12px; background: none; border: none; font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--ink-soft); }
.tabbar button.active { color: var(--maroon); border-top: 2px solid var(--maroon); margin-top: -1px; }
.fab { position: fixed; right: 20px; bottom: 76px; width: 56px; height: 56px; border-radius: 50%; background: var(--maroon); color: var(--parchment); font-size: 30px; line-height: 1; border: none; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
.sheet-backdrop { position: fixed; inset: 0; background: rgba(31,27,18,.45); display: flex; align-items: flex-end; z-index: 20; }
.sheet { background: var(--parchment-card); width: 100%; max-width: 640px; margin: 0 auto; border-radius: 14px 14px 0 0; padding: 20px 20px calc(20px + env(safe-area-inset-bottom)); }
.sheet h2 { font-family: var(--font-display); margin-bottom: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.field label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--gold-label); }
.field input, .field select { font-family: var(--font-mono); font-size: 16px; padding: 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--parchment); color: var(--ink); }
.btn { width: 100%; padding: 13px; border: none; border-radius: 8px; background: var(--maroon); color: var(--parchment); font-family: var(--font-display); font-size: 16px; font-weight: 700; }
.btn-ghost { background: none; color: var(--maroon); border: 1px solid var(--maroon); }
.btn-row { display: flex; gap: 10px; margin-top: 6px; }
.offline { background: var(--gold); color: var(--ink); text-align: center; font-size: 12px; padding: 6px; border-radius: 6px; margin-bottom: 10px; }
.gate { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 32px; max-width: 400px; margin: 0 auto; text-align: center; }
.gate h1 { font-family: var(--font-display); font-size: 40px; margin-bottom: 6px; }
.gate .error { color: var(--pl-red); font-size: 13px; margin-top: 10px; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.stat { background: var(--parchment-card); border: 1px solid var(--rule); border-radius: 10px; padding: 10px; }
.stat .label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-label); }
.stat .value { font-family: var(--font-display); font-size: 20px; font-weight: 700; margin-top: 2px; }
.link-row { text-align: center; margin: 18px 0; }
.link-row button { background: none; border: none; color: var(--maroon); text-decoration: underline; font-family: var(--font-mono); font-size: 13px; }
.empty { text-align: center; color: var(--ink-soft); padding: 40px 0; font-style: italic; }
```

`frontend/src/components/TabBar.tsx`:
```tsx
export type TabId = 'portfolio' | 'ledger';

const TABS: { id: TabId; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'ledger', label: 'Ledger' },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={active === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
```

`frontend/src/components/OfflineBanner.tsx`:
```tsx
import { agoLabel } from '../lib/time';

export function OfflineBanner({ fetchedAt }: { fetchedAt: string }) {
  return <div className="offline">Offline — showing data from {agoLabel(fetchedAt)}</div>;
}
```

`frontend/src/components/PasscodeGate.tsx`:
```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { clearPasscode, fetchSnapshot, setPasscode } from '../lib/api';
import type { Snapshot } from '../lib/api';

export function PasscodeGate({ onUnlocked }: { onUnlocked: (snap: Snapshot) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setPasscode(value);
    try {
      onUnlocked(await fetchSnapshot());
    } catch {
      clearPasscode();
      setError('Wrong passcode — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="gate" onSubmit={submit}>
      <h1>Curia</h1>
      <p className="hero-sub">Enter your passcode</p>
      <div className="field" style={{ marginTop: 20 }}>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Passcode"
        />
      </div>
      <button className="btn" disabled={busy || !value}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

- [ ] **Step 4: App shell**

Replace `frontend/src/App.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import './styles/app.css';
import { cachedSnapshot, fetchSnapshot, getPasscode, refreshMarks } from './lib/api';
import type { Snapshot } from './lib/api';
import type { Trade } from './lib/types';
import { PasscodeGate } from './components/PasscodeGate';
import { TabBar } from './components/TabBar';
import type { TabId } from './components/TabBar';
import { OfflineBanner } from './components/OfflineBanner';
import { PortfolioTab } from './components/PortfolioTab';
import { LedgerTab } from './components/LedgerTab';
import { AddTradeSheet } from './components/AddTradeSheet';
import { MarkSheet } from './components/MarkSheet';

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(() => (getPasscode() ? cachedSnapshot() : null));
  const [unlocked, setUnlocked] = useState(() => !!getPasscode());
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>('portfolio');
  const [sheet, setSheet] = useState<{ kind: 'trade'; trade: Trade | null } | { kind: 'mark'; symbol: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      // best-effort quote pull first, so the snapshot below carries fresh auto-marks;
      // a quote outage or offline phone must never block the snapshot itself
      await refreshMarks().catch(() => undefined);
      setSnap(await fetchSnapshot());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) void refresh();
  }, [unlocked, refresh]);

  if (!unlocked) {
    return (
      <PasscodeGate
        onUnlocked={(s) => {
          setSnap(s);
          setUnlocked(true);
        }}
      />
    );
  }
  if (!snap) return <div className="empty">Loading…</div>;

  const tabProps = {
    snap,
    onRefresh: refresh,
    onEditTrade: (trade: Trade | null) => setSheet({ kind: 'trade', trade }),
    onMark: (symbol: string) => setSheet({ kind: 'mark', symbol }),
  };

  return (
    <div className="shell">
      {offline && <OfflineBanner fetchedAt={snap.fetchedAt} />}
      {tab === 'portfolio' ? <PortfolioTab {...tabProps} /> : <LedgerTab {...tabProps} />}
      {!offline && (
        <button className="fab" aria-label="Add trade" onClick={() => setSheet({ kind: 'trade', trade: null })}>
          +
        </button>
      )}
      {sheet?.kind === 'trade' && (
        <AddTradeSheet trade={sheet.trade} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'mark' && (
        <MarkSheet symbol={sheet.symbol} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
```

Create placeholder stubs so the app compiles (Tasks 7–8 replace their bodies; the PROP TYPES here are the contract):

`frontend/src/components/PortfolioTab.tsx`:
```tsx
import type { Snapshot } from '../lib/api';
import type { Trade } from '../lib/types';

export interface TabProps {
  snap: Snapshot;
  onRefresh: () => Promise<void>;
  onEditTrade: (t: Trade | null) => void;
  onMark: (symbol: string) => void;
}

export function PortfolioTab(_props: TabProps) {
  return <div className="empty">Portfolio — Task 7</div>;
}
```

`frontend/src/components/LedgerTab.tsx`:
```tsx
import type { TabProps } from './PortfolioTab';

export function LedgerTab(_props: TabProps) {
  return <div className="empty">Ledger — Task 8</div>;
}
```

`frontend/src/components/AddTradeSheet.tsx`:
```tsx
import type { Trade } from '../lib/types';

export function AddTradeSheet(_props: { trade: Trade | null; onDone: () => Promise<void>; onCancel: () => void }) {
  return null;
}
```

`frontend/src/components/MarkSheet.tsx`:
```tsx
export function MarkSheet(_props: { symbol: string; onDone: () => Promise<void>; onCancel: () => void }) {
  return null;
}
```

- [ ] **Step 5: Verify it compiles, tests pass, and the gate works end-to-end**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd ~/curia-app/frontend && npm run build && npx vitest run
```
Expected: build succeeds; all tests pass (14).

Manual smoke (two terminals or background):
```bash
cd ~/curia-app/backend && source .venv/bin/activate \
  && CURIA_PASSCODE_SHA256=$(python -c "import hashlib;print(hashlib.sha256(b'dev-pass').hexdigest())") \
     CURIA_AUTH_DELAY=0 uvicorn app.main:app --port 8000 &
cd ~/curia-app/frontend && npm run dev
```
Open http://localhost:5173 in the Browser pane: passcode gate appears; wrong passcode shows "Wrong passcode — try again."; `dev-pass` unlocks to the tab shell with a + button. Kill both servers when done.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend && git commit -m "feat(shell): api client, passcode gate, offline cache, 2-tab shell"
```

---

### Task 7: Portfolio tab + Add Trade sheet + Mark sheet

**Files:**
- Modify: `frontend/src/components/PortfolioTab.tsx`, `frontend/src/components/AddTradeSheet.tsx`, `frontend/src/components/MarkSheet.tsx` (replace stub bodies; keep exported names/props EXACTLY as in Task 6)
- Test: `frontend/src/components/__tests__/PortfolioTab.test.tsx`

**Interfaces:**
- Consumes: `TabProps` (Task 6), `computeOpenPositions` (Task 4), `Odometer`, `TickerTape`, `useFlash`, `format.ts`, `agoLabel`, `createTrade/updateTrade/putMark` (Task 6).
- Produces: working Portfolio tab; `AddTradeSheet`/`MarkSheet` also used by Task 8.

- [ ] **Step 1: Write the failing component test**

`frontend/src/components/__tests__/PortfolioTab.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioTab } from '../PortfolioTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = {
  trades: [
    { id: 1, symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-07-01', note: '' },
    { id: 2, symbol: 'NVDA', side: 'BUY', qty: 2, price: 500, fees: 0, executed_at: '2026-07-02', note: '' },
  ],
  marks: [{ symbol: 'AAPL', price: 120, marked_at: new Date().toISOString(), source: 'auto' as const }],
  fetchedAt: new Date().toISOString(),
};

describe('PortfolioTab', () => {
  it('renders positions with P/L and staleness, and no-mark fallback', () => {
    render(<PortfolioTab snap={snap} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />);
    // AAPL and its P/L appear in both the row and the looping ticker/hero → getAllByText
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+\$200\.00/).length).toBeGreaterThan(0); // (120-100)*10
    expect(screen.getByText(/marked today/)).toBeInTheDocument();
    expect(screen.getByText(/no mark yet/)).toBeInTheDocument(); // NVDA
    // book value hero: AAPL 10*120 + NVDA fallback 2*500 = 2200
    expect(screen.getByTestId('book-value').getAttribute('data-value')).toBe('$2,200.00');
  });

  it('empty state invites the first trade', () => {
    render(
      <PortfolioTab snap={{ trades: [], marks: [], fetchedAt: snap.fetchedAt }} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByText(/No open positions/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/__tests__/PortfolioTab.test.tsx` — Expected: FAIL (stub renders "Task 7").

- [ ] **Step 2: Implement PortfolioTab**

Replace `frontend/src/components/PortfolioTab.tsx`:
```tsx
import type { Snapshot } from '../lib/api';
import type { Trade } from '../lib/types';
import { computeOpenPositions } from '../lib/positions';
import { Odometer } from './Odometer';
import { TickerTape } from './TickerTape';
import { useFlash } from '../hooks/useFlash';
import { formatMoney, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';
import { agoLabel } from '../lib/time';

export interface TabProps {
  snap: Snapshot;
  onRefresh: () => Promise<void>;
  onEditTrade: (t: Trade | null) => void;
  onMark: (symbol: string) => void;
}

export function PortfolioTab({ snap, onMark }: TabProps) {
  const positions = computeOpenPositions(snap.trades, snap.marks);
  const bookValue = positions.reduce(
    (s, p) => s + (p.marketValue ?? p.qty * p.avgCost),
    0,
  );
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0);
  const flash = useFlash(bookValue);

  return (
    <div>
      <header className="hero">
        <Odometer value={formatMoney(bookValue)} speed="hero" className={flash} dataTestid="book-value" />
        <div className="hero-sub" style={{ color: plColor(unrealized) }}>
          {formatSignedMoney(unrealized)} unrealized
        </div>
      </header>
      {positions.some((p) => p.mark) && (
        <TickerTape
          items={positions
            .filter((p) => p.mark)
            .map((p) => ({
              symbol: p.symbol,
              price: p.mark!.price,
              up: (p.unrealizedPl ?? 0) >= 0,
            }))}
        />
      )}
      <h2 className="section-title">Positions</h2>
      {positions.length === 0 && <div className="empty">No open positions — tap + to add your first trade.</div>}
      {positions.map((p) => (
        <button
          key={p.symbol}
          className="row"
          style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--rule)', textAlign: 'left', font: 'inherit', color: 'inherit' }}
          onClick={() => onMark(p.symbol)}
        >
          <div className="row-main">
            <div className="row-sym">{p.symbol}</div>
            <div className="row-sub">
              {p.qty} sh · avg {formatMoney(p.avgCost)} ·{' '}
              {p.mark
                ? `marked ${agoLabel(p.mark.marked_at)}${p.mark.source === 'manual' ? ' by you' : ''}`
                : 'no mark yet — tap to set price'}
            </div>
          </div>
          <div className="row-right">
            <div>{p.marketValue != null ? formatMoney(p.marketValue) : '—'}</div>
            {p.unrealizedPl != null && p.unrealizedPlPct != null && (
              <div className="row-pl" style={{ color: plColor(p.unrealizedPl) }}>
                {formatSignedMoney(p.unrealizedPl)} · {formatSignedPct(p.unrealizedPlPct)}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
```

Note: `TickerTape` (copied component) takes `items: { symbol: string; price: number; up: boolean }[]` and renders each item twice (looping tape) — which is why the test below uses `getAllByText`.

- [ ] **Step 3: Implement AddTradeSheet + MarkSheet**

Replace `frontend/src/components/AddTradeSheet.tsx`:
```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { createTrade, deleteTrade, updateTrade } from '../lib/api';
import type { Side, Trade } from '../lib/types';

const today = () => new Date().toISOString().slice(0, 10);

export function AddTradeSheet({
  trade,
  onDone,
  onCancel,
}: {
  trade: Trade | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<Side>(trade?.side ?? 'BUY');
  const [symbol, setSymbol] = useState(trade?.symbol ?? '');
  const [qty, setQty] = useState(trade ? String(trade.qty) : '');
  const [price, setPrice] = useState(trade ? String(trade.price) : '');
  const [fees, setFees] = useState(trade ? String(trade.fees) : '0');
  const [date, setDate] = useState(trade?.executed_at ?? today());
  const [note, setNote] = useState(trade?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      symbol: symbol.trim().toUpperCase(),
      side,
      qty: Number(qty),
      price: Number(price),
      fees: Number(fees) || 0,
      executed_at: date,
      note,
    };
    try {
      if (trade) await updateTrade({ ...body, id: trade.id });
      else await createTrade(body);
      await onDone();
    } catch {
      setError('Could not save — check the fields and your connection.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!trade) return;
    if (!window.confirm(`Delete this ${trade.symbol} ${trade.side.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await deleteTrade(trade.id);
      await onDone();
    } catch {
      setError('Could not delete — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{trade ? 'Edit trade' : 'Add trade'}</h2>
        <div className="field">
          <label htmlFor="side">Side</label>
          <select id="side" value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="symbol">Symbol</label>
          <input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required />
        </div>
        <div className="field">
          <label htmlFor="qty">Shares</label>
          <input id="qty" type="number" inputMode="decimal" step="any" min="0.000001" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="price">Price</label>
          <input id="price" type="number" inputMode="decimal" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="fees">Fees</label>
          <input id="fees" type="number" inputMode="decimal" step="any" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : trade ? 'Save changes' : 'Add trade'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {trade && (
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
        </div>
        {error && <div className="error" style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
```

Replace `frontend/src/components/MarkSheet.tsx`:
```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { putMark } from '../lib/api';

export function MarkSheet({
  symbol,
  onDone,
  onCancel,
}: {
  symbol: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await putMark(symbol, Number(price));
      await onDone();
    } catch {
      setError('Could not save the price — check your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{symbol} — current price</h2>
        <div className="field">
          <label htmlFor="mark-price">Price</label>
          <input id="mark-price" type="number" inputMode="decimal" step="any" min="0" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy || !price}>
          {busy ? 'Saving…' : 'Save price'}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
```

Also delete the now-duplicated `TabProps` re-export in `LedgerTab.tsx`'s import if TypeScript complains — `TabProps` lives in `PortfolioTab.tsx` and is imported from there.

- [ ] **Step 4: Run tests + build**

```bash
npx vitest run && npm run build
```
Expected: all tests pass (16). Build succeeds.

- [ ] **Step 5: Visual check in the browser**

Start both dev servers as in Task 6 Step 5. In the Browser pane: unlock, add a BUY (e.g. AAPL 10 @ 100), see the position appear; tap the row, set a mark 120; book value odometer rolls, +$200.00 shows in green-ish `--pl-up`. Screenshot for the user. Kill servers.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(portfolio): positions with manual marks, add/edit trade sheet, hero odometer"
```

---

### Task 8: Ledger tab — closed trades, stats, all entries, backup buttons

**Files:**
- Modify: `frontend/src/components/LedgerTab.tsx` (replace stub body)
- Test: `frontend/src/components/__tests__/LedgerTab.test.tsx`

**Interfaces:**
- Consumes: `TabProps` (from `PortfolioTab.tsx`), `computeClosedTrades` (Task 3), `computeStats` (Task 4), `AddTradeSheet` via `onEditTrade` (App wires it), `exportBackup`/`importBackup` (Task 6), `format.ts`.
- Produces: complete Ledger tab. No downstream consumers.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/__tests__/LedgerTab.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedgerTab } from '../LedgerTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = {
  trades: [
    { id: 1, symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-06-01', note: '' },
    { id: 2, symbol: 'AAPL', side: 'SELL', qty: 10, price: 110, fees: 0, executed_at: '2026-07-01', note: '' },
    { id: 3, symbol: 'NVDA', side: 'BUY', qty: 1, price: 500, fees: 0, executed_at: '2026-07-02', note: '' },
  ],
  marks: [],
  fetchedAt: new Date().toISOString(),
};

describe('LedgerTab', () => {
  it('shows closed trades and stats', () => {
    render(<LedgerTab snap={snap} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />);
    // +$100.00 appears in the trade row AND several stat tiles → getAllByText
    expect(screen.getAllByText(/\+\$100\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Win rate')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('all-entries view lists raw trades and edit fires onEditTrade', () => {
    const onEdit = vi.fn();
    render(<LedgerTab snap={snap} onRefresh={vi.fn()} onEditTrade={onEdit} onMark={vi.fn()} />);
    fireEvent.click(screen.getByText(/All entries/));
    // the still-open NVDA buy only exists in the raw entries list
    expect(screen.getByText(/NVDA/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText(/edit/i)[0]);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('empty ledger shows the honest empty state', () => {
    render(
      <LedgerTab snap={{ trades: [], marks: [], fetchedAt: snap.fetchedAt }} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByText(/No closed trades yet/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/__tests__/LedgerTab.test.tsx` — Expected: FAIL (stub).

- [ ] **Step 2: Implement LedgerTab**

Replace `frontend/src/components/LedgerTab.tsx`:
```tsx
import { useRef, useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { computeClosedTrades } from '../lib/fifo';
import { computeStats } from '../lib/stats';
import { exportBackup, importBackup } from '../lib/api';
import { formatMoney, formatPct, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';

export function LedgerTab({ snap, onRefresh, onEditTrade }: TabProps) {
  const [showEntries, setShowEntries] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closed = computeClosedTrades(snap.trades);
  const stats = computeStats(closed);

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `curia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    if (!window.confirm('Replace ALL current data with this backup?')) return;
    await importBackup({ ...parsed, confirm: true });
    await onRefresh();
  }

  return (
    <div>
      <h2 className="section-title">Closed trades</h2>
      {closed.length === 0 && <div className="empty">No closed trades yet — your first sell will write history.</div>}
      {[...closed].reverse().map((t, i) => (
        <div className="row" key={`${t.symbol}-${t.closedAt}-${i}`}>
          <div className="row-main">
            <div className="row-sym">{t.symbol}</div>
            <div className="row-sub">
              {t.qty} sh · {formatMoney(t.buyPrice)} → {formatMoney(t.sellPrice)} · {t.openedAt} → {t.closedAt}
            </div>
          </div>
          <div className="row-right">
            <div style={{ color: plColor(t.realizedPl) }}>{formatSignedMoney(t.realizedPl)}</div>
            <div className="row-pl" style={{ color: plColor(t.realizedPl) }}>{formatSignedPct(t.realizedPlPct)}</div>
          </div>
        </div>
      ))}

      {stats.closedCount > 0 && (
        <>
          <h2 className="section-title">The record</h2>
          <div className="stats-grid">
            <div className="stat"><div className="label">Win rate</div><div className="value">{formatPct(stats.winRate)}</div></div>
            <div className="stat"><div className="label">Realized P/L</div><div className="value" style={{ color: plColor(stats.totalRealizedPl) }}>{formatSignedMoney(stats.totalRealizedPl)}</div></div>
            <div className="stat"><div className="label">Avg win</div><div className="value">{formatSignedMoney(stats.avgWin)}</div></div>
            <div className="stat"><div className="label">Avg loss</div><div className="value">{formatSignedMoney(stats.avgLoss)}</div></div>
            <div className="stat"><div className="label">Expectancy</div><div className="value" style={{ color: plColor(stats.expectancy) }}>{formatSignedMoney(stats.expectancy)}</div></div>
            <div className="stat"><div className="label">Closed</div><div className="value">{stats.wins}W · {stats.losses}L</div></div>
          </div>
        </>
      )}

      <div className="link-row">
        <button onClick={() => setShowEntries(!showEntries)}>
          {showEntries ? 'Hide entries' : `All entries (${snap.trades.length})`}
        </button>
      </div>

      {showEntries && (
        <>
          {[...snap.trades].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id - a.id).map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <div className="row-sym">{t.symbol} <span style={{ color: t.side === 'BUY' ? 'var(--pl-up)' : 'var(--maroon)', fontSize: 12 }}>{t.side}</span></div>
                <div className="row-sub">{t.qty} sh @ {formatMoney(t.price)} · {t.executed_at}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className="row-right">
                <button className="link-row" style={{ background: 'none', border: 'none', color: 'var(--maroon)', textDecoration: 'underline', font: 'inherit', fontSize: 13 }} onClick={() => onEditTrade(t)}>
                  edit
                </button>
              </div>
            </div>
          ))}
          <div className="link-row">
            <button onClick={doExport}>Export backup</button>
            {' · '}
            <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests + build**

```bash
npx vitest run && npm run build
```
Expected: all tests pass (19). Build succeeds.

- [ ] **Step 4: Visual check**

Dev servers up (Task 6 Step 5 commands). Add AAPL BUY 10@100 (June date), SELL 10@110 (July date): Ledger shows +$100.00, win rate 100.0%, "The record" grid renders; All entries lists both rows; edit opens the sheet pre-filled; Export downloads a JSON. Screenshot for the user. Kill servers.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ledger): closed trades, the record stats, all entries, backup buttons"
```

---

### Task 9: Dockerfile + GitHub + Railway deploy

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Consumes: everything.
- Produces: the live app URL.

- [ ] **Step 1: Dockerfile + .dockerignore**

`~/curia-app/Dockerfile`:
```dockerfile
# --- frontend build ---
FROM node:22-alpine AS fe
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- backend + static serve ---
FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=fe /fe/dist ./static
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
```
(Note: Node 22 in Docker is fine — the build hang is specific to this Mac's Node 24 + the OLD repo's Vite 8; Vite 7 builds cleanly on 20/22.)

`~/curia-app/.dockerignore`:
```
frontend/node_modules
frontend/dist
backend/.venv
**/__pycache__
*.db
.git
```

- [ ] **Step 2: Verify the static-serve path locally (no Docker needed)**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd ~/curia-app/frontend && npm run build
mkdir -p ~/curia-app/backend/static && cp -R ~/curia-app/frontend/dist/* ~/curia-app/backend/static/
cd ~/curia-app/backend && source .venv/bin/activate \
  && CURIA_PASSCODE_SHA256=$(python -c "import hashlib;print(hashlib.sha256(b'dev-pass').hexdigest())") \
     CURIA_AUTH_DELAY=0 uvicorn app.main:app --port 8000 &
sleep 2 && curl -s http://127.0.0.1:8000/ | head -3 && curl -s http://127.0.0.1:8000/api/health
kill %1; rm -rf ~/curia-app/backend/static
```
Expected: HTML doctype from `/` and `{"ok":true}` from health. (`backend/static` is a build artifact — never commit it.)

- [ ] **Step 3: Commit + USER STEP — create the GitHub repo**

```bash
cd ~/curia-app && git add Dockerfile .dockerignore && git commit -m "feat(deploy): Dockerfile serving PWA + API from one Railway service"
```

Ask Andrew to create an empty repo named `curia` at https://github.com/new (public, NO readme/gitignore — the repo must be empty). Wait for confirmation, then:

```bash
cd ~/curia-app
git remote add origin https://github.com/andrew4dean-code/curia.git
git push -u origin main
```

- [ ] **Step 4: Generate the passcode hash for Andrew**

Ask Andrew for the passcode he wants (or have him pick one privately and run the command himself):

```bash
python3 -c "import hashlib,getpass;print(hashlib.sha256(getpass.getpass('passcode: ').encode()).hexdigest())"
```

He keeps the passcode; the HASH goes in Railway. (If he tells us the passcode in chat, compute the hash for him — the passcode is low-stakes by design, but prefer the getpass route.)

- [ ] **Step 5: USER STEP — Railway setup**

Walk Andrew through (railway.app dashboard, his existing account):
1. New Project → **Deploy from GitHub repo** → `andrew4dean-code/curia`. Railway auto-detects the Dockerfile.
2. In the project: **+ New → Database → Add PostgreSQL**.
3. On the app service → Variables: add `DATABASE_URL` = reference `${{Postgres.DATABASE_URL}}`, add `CURIA_PASSCODE_SHA256` = the hash from Step 4.
4. App service → Settings → Networking → **Generate Domain**.

- [ ] **Step 6: Verify production**

```bash
curl -s https://<railway-domain>/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://<railway-domain>/api/trades
curl -s https://<railway-domain>/ | head -3
```
Expected: `{"ok":true}`, `401`, and the app HTML. Then in the Browser pane: open the domain, unlock with the real passcode, add a real trade, confirm it appears. Screenshot for the user.

---

### Task 10: Phone install + end-to-end verification (with Andrew)

**Files:** none.

**Interfaces:** consumes the live URL from Task 9.

- [ ] **Step 1: Guided phone install**

Andrew, on the iPhone: open the Railway URL in Safari → unlock → Share → **Add to Home Screen**. Confirm the wax-seal icon and standalone (no Safari chrome) launch.

- [ ] **Step 2: End-to-end checklist (Andrew on phone, Claude verifying via API)**

- Add a real trade on the phone → `curl -s -H "X-Curia-Key: <passcode>" https://<domain>/api/trades` shows it.
- Within seconds of adding it, the position shows a price automatically (Yahoo, near-realtime) — no tapping needed.
- Update a mark by tapping a position → Portfolio P/L updates, odometer rolls, row says "by you".
- Ledger shows any closed trades + The Record stats.
- Airplane mode → app still opens showing "Offline — showing data from today"; + button hidden.
- Export backup downloads a JSON file.

- [ ] **Step 3: Update project docs + memory, final commit**

Update `~/curia-app/README.md` "Run" section with the live Railway domain. Confirm the Task 1 memory update still matches reality (Railway domain can be added to `curia-deployment.md`).

```bash
cd ~/curia-app && git add README.md && git commit -m "docs: live Railway URL + install notes" && git push
```
