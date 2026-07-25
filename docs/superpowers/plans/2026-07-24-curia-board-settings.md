# Curia — Options Week-Board + Settings Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace form-first option entry with a gamified month board (tap a week line to sell into that Friday), plus a Settings tab with a build stamp, force-update button, and the relocated backup controls.

**Architecture:** Frontend-only — zero backend changes. New pure helpers in `lib/board.ts`; new `OptionsTab` + `OptionSellSheet` + `SettingsTab` components; `AddTradeSheet` reverts to stock-only; four-tab shell.

**Tech Stack:** unchanged (React 19 + Vite 7 on Node 20; deploy `railway up`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-curia-board-settings-design.md`. Branch `dev` off `main`; merge back at end. Node 20 first on PATH for every npm/npx command: `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.
- NO backend changes. All new logic client-side, money/date math in tested pure modules.
- Week = Mon–Sun; `weekFridayFor` maps Sat 1 back / Sun 2 back — never forward. All dates local, `YYYY-MM-DD` strings.
- Month score = Σ `optionRealizedPl` of settled options with `closed_at` in the displayed month + Σ `premiumCollected` of OPEN options with `expiration` in the displayed month.
- Ceremony still fires for option sells (OPTION TICKET) and stock trades; settling stays ceremony-free. NO reduced-motion handling anywhere.
- Tab ids exactly: `portfolio | options | ledger | settings`. FAB renders only on `portfolio` and `ledger` (and never while offline, as today).
- Update-now must NEVER remove the `curia-passcode` localStorage key.
- Test counts: suite is 44 before this plan. Never commit junk; commit per task with the given messages.

---

### Task 1: board.ts helpers (TDD) + four-tab shell + stubs

**Files:**
- Create: `frontend/src/lib/board.ts`, `frontend/src/lib/__tests__/board.test.ts`, `frontend/src/components/OptionsTab.tsx` (stub), `frontend/src/components/SettingsTab.tsx` (stub)
- Modify: `frontend/src/components/TabBar.tsx`, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `optionRealizedPl`, `premiumCollected` (lib/optionsMath), `OptionPosition`.
- Produces:
  - `fridaysOfMonth(year: number, month1: number): string[]`
  - `weekFridayFor(dateStr: string): string`
  - `monthScore(options: OptionPosition[], year: number, month1: number): number`
  - `TabId` union gains `'options' | 'settings'`; TABS order Portfolio, Options, Ledger, Settings.
  - Stub tabs render `<div className="empty">Options — Task 2</div>` / `Settings — Task 3`, both typed `(props: TabProps)` (import from PortfolioTab) so Task 2/3 swap bodies only.
  - App: renders the four tabs in a switch; FAB condition becomes `!offline && (tab === 'portfolio' || tab === 'ledger')`.

- [ ] **Step 1: Failing tests**

```bash
cd ~/curia-app && git checkout -b dev
```

`frontend/src/lib/__tests__/board.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fridaysOfMonth, monthScore, weekFridayFor } from '../board';
import type { OptionPosition } from '../types';

let nextId = 1;
function opt(p: Partial<OptionPosition>): OptionPosition {
  return {
    id: nextId++, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
    contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
    status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0,
    assigned_trade_id: null, ...p,
  };
}

describe('fridaysOfMonth', () => {
  it('lists a five-Friday month (May 2026)', () => {
    expect(fridaysOfMonth(2026, 5)).toEqual([
      '2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29',
    ]);
  });

  it('lists a four-Friday month (June 2026)', () => {
    expect(fridaysOfMonth(2026, 6)).toEqual([
      '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26',
    ]);
  });
});

describe('weekFridayFor', () => {
  it('midweek maps forward to its Friday', () => {
    expect(weekFridayFor('2026-08-12')).toBe('2026-08-14'); // Wed → Fri
  });
  it('Friday maps to itself', () => {
    expect(weekFridayFor('2026-08-14')).toBe('2026-08-14');
  });
  it('Saturday maps one day BACK', () => {
    expect(weekFridayFor('2026-08-15')).toBe('2026-08-14');
  });
  it('Sunday maps two days back', () => {
    expect(weekFridayFor('2026-08-16')).toBe('2026-08-14');
  });
});

describe('monthScore', () => {
  it('sums settled-in-month P/L plus open-in-month collected, ignoring other months', () => {
    const rows = [
      opt({ status: 'EXPIRED', closed_at: '2026-08-01', expiration: '2026-08-01', premium: 0.74, fees: 1.3 }), // +146.7
      opt({ status: 'OPEN', expiration: '2026-08-14' }),                                                       // +148 collected
      opt({ status: 'EXPIRED', closed_at: '2026-07-25', expiration: '2026-07-25' }),                           // other month
      opt({ status: 'OPEN', expiration: '2026-09-04' }),                                                       // next month
    ];
    expect(monthScore(rows, 2026, 8)).toBeCloseTo(294.7);
    expect(monthScore([], 2026, 8)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd ~/curia-app/frontend && npx vitest run src/lib/__tests__/board.test.ts
```
Expected: FAIL — no module `../board`.

- [ ] **Step 3: Implement**

`frontend/src/lib/board.ts`:
```ts
import { optionRealizedPl, premiumCollected } from './optionsMath';
import type { OptionPosition } from './types';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fridaysOfMonth(year: number, month1: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month1 - 1, 1);
  while (d.getMonth() === month1 - 1) {
    if (d.getDay() === 5) out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function weekFridayFor(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  // Mon–Sun week: Sat(6) → −1, Sun(0) → −2, else forward to Friday(5)
  const dow = d.getDay();
  const shift = dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
  d.setDate(d.getDate() + shift);
  return iso(d);
}

export function monthScore(options: OptionPosition[], year: number, month1: number): number {
  const prefix = `${year}-${String(month1).padStart(2, '0')}-`;
  let score = 0;
  for (const o of options) {
    if (o.status !== 'OPEN' && o.closed_at && o.closed_at.startsWith(prefix)) {
      score += optionRealizedPl(o) ?? 0;
    } else if (o.status === 'OPEN' && o.expiration.startsWith(prefix)) {
      score += premiumCollected(o);
    }
  }
  return score;
}
```

`TabBar.tsx`: `TabId = 'portfolio' | 'options' | 'ledger' | 'settings'`; TABS = Portfolio, Options, Ledger, Settings (same rendering).

Stubs:
```tsx
// OptionsTab.tsx
import type { TabProps } from './PortfolioTab';
export function OptionsTab(_props: TabProps) {
  return <div className="empty">Options — Task 2</div>;
}
// SettingsTab.tsx — same shape, text "Settings — Task 3"
```

`App.tsx`: import both; replace the two-way tab ternary with:
```tsx
{tab === 'portfolio' && <PortfolioTab {...tabProps} />}
{tab === 'options' && <OptionsTab {...tabProps} />}
{tab === 'ledger' && <LedgerTab {...tabProps} />}
{tab === 'settings' && <SettingsTab {...tabProps} />}
```
FAB condition: `{!offline && (tab === 'portfolio' || tab === 'ledger') && (…FAB…)}`.

- [ ] **Step 4: Full suite + build**

```bash
npx vitest run && npm run build
```
Expected: 53 passed (44 + 9 board). Build clean.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): week/score helpers test-first; four-tab shell with stubs"
```

---

### Task 2: OptionsTab board + OptionSellSheet + AddTradeSheet reversion

**Files:**
- Create: `frontend/src/components/OptionSellSheet.tsx`, `frontend/src/components/__tests__/OptionsTab.test.tsx`, `frontend/src/components/__tests__/OptionSellSheet.test.tsx`
- Modify: `frontend/src/components/OptionsTab.tsx` (real board), `frontend/src/components/AddTradeSheet.tsx` (stock-only reversion), `frontend/src/components/PortfolioTab.tsx` (drop Open Options section), `frontend/src/components/SettleSheet.tsx` (Edit label opens sell-sheet via existing `onEdit` — no change needed, verify only), `frontend/src/App.tsx` (sheet union gains `sellOption`; `optionEdit` now renders OptionSellSheet), `frontend/src/styles/app.css` (board styles)
- Test edits: `AddTradeSheet.test.tsx` (option-mode tests REMOVED, stock tests kept), `PortfolioTab.test.tsx` (open-options test removed; fixture keeps `options` in Snapshot)

**Interfaces:**
- Consumes: board.ts, optionsMath, time helpers, api `createOption`/`updateOption`, existing SettleSheet + ceremony contracts.
- Produces (binding):
  - `OptionSellSheet` props: `{ expiration: string; option?: OptionPosition | null; onDone: (ticket: TicketData) => Promise<void>; onCancel: () => void }` — `option` present = edit mode (expiration locked to the option's own value; `expiration` prop ignored then).
  - `TabProps` gains `onSellWeek: (expiration: string) => void` (OPTIONAL — `onSellWeek?:` so Ledger/Portfolio test renders compile unchanged).
  - App sheet union: `'trade'` (stock add/edit) | `'mark'` | `'settle'` | `'optionEdit'` (→ OptionSellSheet edit) | `'sellOption', expiration: string`.
  - `AddTradeSheet` props revert to `{ trade: Trade | null; onDone: (ticket: TicketData) => Promise<void>; onDeleted?: () => Promise<void>; onCancel: () => void }` (option prop gone).

- [ ] **Step 1: Failing tests**

`frontend/src/components/__tests__/OptionsTab.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsTab } from '../OptionsTab';
import type { Snapshot } from '../../lib/api';
import type { OptionPosition } from '../../lib/types';

const base: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

function snapWith(options: OptionPosition[]): Snapshot {
  return { trades: [], marks: [], options, fetchedAt: new Date().toISOString() };
}

const cbs = {
  onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(),
  onSettleOption: vi.fn(), onEditOption: vi.fn(),
};

describe('OptionsTab board', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 10, 0, 0)); // Wed Aug 12 2026
  });
  afterEach(() => vi.useRealTimers());

  it('renders every Friday of the current month as a week line', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText('August')).toBeInTheDocument();
    ['Aug 7', 'Aug 14', 'Aug 21', 'Aug 28'].forEach((d) =>
      expect(screen.getByText(new RegExp(d))).toBeInTheDocument(),
    );
  });

  it('shows the month score from settled + open options', () => {
    const rows = [
      { ...base, id: 2, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' },
      base,
    ];
    render(<OptionsTab snap={snapWith(rows)} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/\$294\.70 collected/)).toBeInTheDocument();
  });

  it('open option renders as a seal chip that opens the settle sheet', () => {
    const onSettle = vi.fn();
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSettleOption={onSettle} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /TQQQ \$62 PUT/ }));
    expect(onSettle).toHaveBeenCalledWith(base);
  });

  it('settled option prints kept amount on its line', () => {
    const settled = { ...base, id: 3, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    render(<OptionsTab snap={snapWith([settled])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/kept \+\$146\.70/)).toBeInTheDocument();
  });

  it('tapping an empty future week sells into that Friday; past weeks are inert', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 21/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-21');
    expect(screen.queryByRole('button', { name: /sell the week of Aug 7/i })).toBeNull();
  });

  it('chevrons browse months', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('September')).toBeInTheDocument();
  });
});
```

`frontend/src/components/__tests__/OptionSellSheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionSellSheet } from '../OptionSellSheet';

describe('OptionSellSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('locks the expiration to the tapped week and quotes the take', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 12 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<OptionSellSheet expiration="2026-08-21" onDone={onDone} onCancel={vi.fn()} />);
    expect(screen.getByText(/week of Fri Aug 21/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Expiration')).toBeNull(); // no date field
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText('Strike'), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Premium / share'), { target: { value: '0.74' } });
    expect(screen.getByRole('button', { name: /collect \$148\.00/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sell to open/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'TQQQ', opt_type: 'PUT', expiration: '2026-08-21', strike: 62 });
    expect(onDone.mock.calls[0][0]).toMatchObject({ no: 12, title: 'OPTION TICKET', symbol: 'TQQQ' });
  });

  it('CALL toggle flips opt_type', () => {
    render(<OptionSellSheet expiration="2026-08-21" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CALL' }));
    expect(screen.getByRole('button', { name: 'CALL' })).toHaveClass('on');
  });
});
```

`AddTradeSheet.test.tsx`: DELETE the two option-mode tests; keep the file with its stock coverage (if the file then has no tests beyond imports, keep at least one stock smoke test — write one asserting the stock submit still calls `onDone` with `title: 'TRADE TICKET'` if none exists).

`PortfolioTab.test.tsx`: remove the `lists open options with countdown` test.

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/components/__tests__/OptionsTab.test.tsx src/components/__tests__/OptionSellSheet.test.tsx
```
Expected: FAIL (stub tab; no OptionSellSheet module).

- [ ] **Step 3: Implement**

`app.css` additions:
```css
.board-head { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 8px; }
.board-head h1 { font-family: var(--font-display); font-size: 26px; font-weight: 800; }
.board-head button { background: none; border: none; color: var(--maroon); font-size: 22px; padding: 4px 10px; }
.board-score { text-align: center; font-size: 12px; color: var(--gold-label); margin: 2px 0 18px; }
.board-rail { border-left: 1px solid var(--rule); margin-left: 8px; }
.wk { margin: 0 0 16px; padding-left: 14px; }
.wk-label { font-size: 11px; letter-spacing: .05em; color: var(--ink-soft); text-transform: uppercase; }
.wk.live .wk-label { color: var(--maroon); font-weight: 700; }
.wk-line { border-top: 2px solid var(--rule); margin-top: 4px; padding-top: 6px; }
.wk.live .wk-line { border-top-color: var(--maroon); }
.wk.past { opacity: .55; }
.wk-sell { display: block; width: 100%; text-align: left; background: none; border: none; border-top: 2px dashed var(--rule); margin-top: 4px; padding: 6px 0 0; font-family: var(--font-mono); font-size: 12px; color: var(--gold-label); }
.wk-chip { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 4px 0; font-family: var(--font-mono); font-size: 13px; color: var(--ink); text-align: left; }
.wk-seal { background: var(--maroon); color: var(--parchment); border-radius: 50%; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-display); font-size: 13px; flex: none; }
.wk-settled { font-size: 13px; padding: 3px 0; }
```

`OptionsTab.tsx` (replace stub):
```tsx
import { useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { fridaysOfMonth, monthScore, weekFridayFor } from '../lib/board';
import { optionRealizedPl, premiumCollected } from '../lib/optionsMath';
import { expiryLabel } from '../lib/time';
import { formatMoney, formatSignedMoney } from '../lib/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function OptionsTab({ snap, onSettleOption, onSellWeek }: TabProps) {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth() + 1]);
  const [year, month] = ym;
  const fridays = fridaysOfMonth(year, month);
  const today = localTodayIso();
  const score = monthScore(snap.options, year, month);
  const byWeek = new Map<string, typeof snap.options>();
  for (const o of snap.options) {
    const wk = weekFridayFor(o.expiration);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), o]);
  }
  const liveFriday = fridays.find((f) => f >= today);

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYm([d.getFullYear(), d.getMonth() + 1]);
  }

  return (
    <div>
      <header className="board-head">
        <button aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <h1>{MONTHS[month - 1]}</h1>
        <button aria-label="Next month" onClick={() => shift(1)}>›</button>
      </header>
      <div className="board-score">{formatMoney(score)} collected this month</div>
      <div className="board-rail">
        {fridays.map((friday, i) => {
          const rows = byWeek.get(friday) ?? [];
          const isPast = friday < today;
          const isLive = friday === liveFriday;
          return (
            <div key={friday} className={`wk${isPast ? ' past' : ''}${isLive ? ' live' : ''}`}>
              <div className="wk-label">
                WK {i + 1} · Fri {fmtShort(friday)}
                {isLive ? ` · ${expiryLabel(friday)} left` : ''}
              </div>
              {rows.length > 0 && (
                <div className="wk-line">
                  {rows.map((o) =>
                    o.status === 'OPEN' ? (
                      <button key={o.id} className="wk-chip" onClick={() => onSettleOption(o)}>
                        <span className="wk-seal">C</span>
                        {o.symbol} ${o.strike} {o.opt_type} · {o.contracts}x · {formatMoney(premiumCollected(o))}
                      </button>
                    ) : (
                      <div key={o.id} className="wk-settled" style={{ color: (optionRealizedPl(o) ?? 0) >= 0 ? 'var(--pl-up)' : 'var(--pl-down)' }}>
                        ✓ {o.symbol} ${o.strike} {o.opt_type} — {(optionRealizedPl(o) ?? 0) >= 0 ? 'kept' : 'gave back'} {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                      </div>
                    ),
                  )}
                </div>
              )}
              {rows.length === 0 && !isPast && onSellWeek && (
                <button className="wk-sell" aria-label={`sell the week of ${fmtShort(friday)}`} onClick={() => onSellWeek(friday)}>
                  ＋ tap the line to sell this week
                </button>
              )}
              {rows.length === 0 && isPast && <div className="wk-line" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

`OptionSellSheet.tsx`:
```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { createOption, updateOption } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { OptionDraft, OptionPosition, OptionType } from '../lib/types';
import type { TicketData } from './TradeCeremony';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function OptionSellSheet({
  expiration,
  option,
  onDone,
  onCancel,
}: {
  expiration: string;
  option?: OptionPosition | null;
  onDone: (ticket: TicketData) => Promise<void>;
  onCancel: () => void;
}) {
  const exp = option ? option.expiration : expiration;
  const [optType, setOptType] = useState<OptionType>(option?.opt_type ?? 'PUT');
  const [symbol, setSymbol] = useState(option?.symbol ?? '');
  const [strike, setStrike] = useState(option ? String(option.strike) : '');
  const [contracts, setContracts] = useState(option ? String(option.contracts) : '1');
  const [premium, setPremium] = useState(option ? String(option.premium) : '');
  const [fees, setFees] = useState(option ? String(option.fees) : '0');
  const [date, setDate] = useState(option?.opened_at ?? today());
  const [note, setNote] = useState(option?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const take = (Number(premium) || 0) * 100 * (Number(contracts) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const draft: OptionDraft = {
      symbol: symbol.trim().toUpperCase(), opt_type: optType, strike: Number(strike),
      expiration: exp, contracts: Number(contracts), premium: Number(premium),
      fees: Number(fees) || 0, opened_at: date, note,
    };
    try {
      const saved = option ? await updateOption(option.id, draft) : await createOption(draft);
      await onDone({
        no: saved.id,
        title: 'OPTION TICKET',
        symbol: draft.symbol,
        lines: [
          `SELL TO OPEN ${draft.contracts}x`,
          `${draft.symbol} $${draft.strike} ${draft.opt_type} · exp ${fmtDate(exp)}`,
          `${formatMoney(draft.premium * 100 * draft.contracts)} collected`,
        ],
      });
    } catch {
      setError('Could not save — check the fields and your connection.');
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{option ? 'Edit option' : `Sell — week of Fri ${fmtDate(exp)}`}</h2>
        <div className="hero-sub" style={{ marginBottom: 12 }}>expiration set by the line you tapped</div>
        <div className="toggle-row">
          <button type="button" className={optType === 'PUT' ? 'on' : ''} onClick={() => setOptType('PUT')}>PUT</button>
          <button type="button" className={optType === 'CALL' ? 'on' : ''} onClick={() => setOptType('CALL')}>CALL</button>
        </div>
        <div className="field">
          <label htmlFor="os-symbol">Symbol</label>
          <input id="os-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoCapitalize="characters" required />
        </div>
        <div className="field">
          <label htmlFor="os-strike">Strike</label>
          <input id="os-strike" type="number" inputMode="decimal" step="any" min="0" value={strike} onChange={(e) => setStrike(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-contracts">Contracts</label>
          <input id="os-contracts" type="number" inputMode="numeric" step="1" min="1" value={contracts} onChange={(e) => setContracts(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-premium">Premium / share</label>
          <input id="os-premium" type="number" inputMode="decimal" step="any" min="0" value={premium} onChange={(e) => setPremium(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-fees">Fees</label>
          <input id="os-fees" type="number" inputMode="decimal" step="any" min="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-date">Date sold</label>
          <input id="os-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="os-note">Note (optional)</label>
          <input id="os-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy || !symbol || !strike || !premium}>
          {busy ? 'Saving…' : option ? 'Save changes' : `Sell to open — collect ${formatMoney(take)}`}
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
        {error && <div style={{ color: 'var(--pl-red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
}
```
plus `app.css`:
```css
.toggle-row { display: flex; gap: 8px; margin-bottom: 12px; }
.toggle-row button { flex: 1; text-align: center; padding: 12px 0; border-radius: 8px; font-family: var(--font-mono); font-size: 14px; border: 1px solid var(--rule); background: var(--parchment); color: var(--ink-soft); }
.toggle-row button.on { background: var(--maroon); color: var(--parchment); border-color: var(--maroon); }
```

`AddTradeSheet.tsx`: remove `option` prop, mode state, segmented control, option fields, and the option submit branch — restore the pure stock sheet (keep TicketData onDone + onDeleted from O5).

`PortfolioTab.tsx`: delete the Open Options section block and its now-unused imports (`daysUntil`, `expiryLabel`, `premiumCollected`); keep `onSettleOption`/`onEditOption` in `TabProps` (board uses the former; SettleSheet edit path uses the latter) and add `onSellWeek?: (expiration: string) => void`.

`App.tsx`: sheet union — replace `optionEdit` rendering with `OptionSellSheet` (`option={sheet.option} expiration={sheet.option.expiration}` — the prop is required; edit mode reads the option's own value anyway), add `{ kind: 'sellOption'; expiration: string }` rendered as `<OptionSellSheet expiration={sheet.expiration} onDone={onTicket} onCancel={...} />` where `onTicket` is the existing ceremony-starting handler; `tabProps` gains `onSellWeek: (expiration) => setSheet({ kind: 'sellOption', expiration })`. OptionSellSheet's edit save also flows through `onTicket` (ceremony on edit stays, as decided).

- [ ] **Step 4: Full suite + build**

```bash
npx vitest run && npm run build
```
Expected: 59 passed (53 + 6 OptionsTab + 2 OptionSellSheet − 2 removed AddTradeSheet option tests − 1 removed PortfolioTab test + 1 added stock smoke if needed — the implementer states the exact arithmetic in the report). Build clean.

- [ ] **Step 5: Visual check**

Dev servers (dev-pass), seed one open option expiring this Friday + one settled last week via curl; Browser pane mobile: board shows the month, score, live week maroon with seal, dashed future weeks; tap a future line → sell sheet with locked week; sell → ceremony → seal appears on the line. Screenshot the board. Kill servers, delete backend/curia.db.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): options week-board tab, tap-a-week sell sheet, stock-only add sheet"
```

---

### Task 3: SettingsTab + build stamp + backup relocation

**Files:**
- Modify: `frontend/src/components/SettingsTab.tsx` (replace stub), `frontend/src/components/LedgerTab.tsx` (remove backup row + importError UI + doExport/doImport), `frontend/vite.config.ts` + `frontend/vitest.config.ts` (`define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) }`), `frontend/src/vite-env.d.ts` or new `frontend/src/global.d.ts` (`declare const __BUILD_STAMP__: string;`)
- Test: create `frontend/src/components/__tests__/SettingsTab.test.tsx`; modify `LedgerTab.test.tsx` (backup test moves out)

**Interfaces:**
- Consumes: `exportBackup`/`importBackup` from api (unchanged), TabProps.
- Produces: SettingsTab renders sections "The Press" (stamp + Update now + reassurance copy) and "Backup" (Export / Restore, identical semantics to the old Ledger implementation including the version pre-check and error messages).

- [ ] **Step 1: Failing tests**

`SettingsTab.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsTab } from '../SettingsTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = { trades: [], marks: [], options: [], fetchedAt: new Date().toISOString() };
const cbs = { onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(), onSettleOption: vi.fn(), onEditOption: vi.fn() };

describe('SettingsTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the build stamp', () => {
    render(<SettingsTab snap={snap} {...cbs} />);
    expect(screen.getByText(/Pressed /)).toBeInTheDocument();
  });

  it('update now clears caches but keeps the passcode, then reloads', async () => {
    localStorage.setItem('curia-passcode', '8800');
    localStorage.setItem('curia-cache-v2', '{"trades":[]}');
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } });
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['workbox-x']), delete: cacheDelete });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SettingsTab snap={snap} {...cbs} />);
    fireEvent.click(screen.getByRole('button', { name: /Update now/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(localStorage.getItem('curia-cache-v2')).toBeNull();
    expect(localStorage.getItem('curia-passcode')).toBe('8800');
    expect(unregister).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('workbox-x');
  });

  it('shows a friendly error for a bad backup file', async () => {
    render(<SettingsTab snap={snap} {...cbs} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bad = new File(['not json {'], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/isn't a Curia backup/)).toBeInTheDocument());
  });
});
```
`LedgerTab.test.tsx`: remove the bad-backup test (moves above); remove backup-related assertions.

- [ ] **Step 2: verify failure** — stub renders "Settings — Task 3".

- [ ] **Step 3: Implement**

Configs: add to BOTH `vite.config.ts` and `vitest.config.ts` top-level:
```ts
define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
```
`frontend/src/global.d.ts`: `declare const __BUILD_STAMP__: string;`

`SettingsTab.tsx`: port `doExport`/`doImport` (incl. version pre-check, `window.confirm`, `importError` state, input reset) verbatim from LedgerTab, then remove them there. Render:
```tsx
import { useRef, useState } from 'react';
import type { TabProps } from './PortfolioTab';
import { exportBackup, importBackup } from '../lib/api';

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SettingsTab({ onRefresh }: TabProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [busy, setBusy] = useState(false);

  async function updateNow() {
    setBusy(true);
    localStorage.removeItem('curia-cache-v2');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      location.reload();
    }
  }

  /* doExport / doImport ported verbatim from LedgerTab */

  return (
    <div>
      <h2 className="section-title">The Press</h2>
      <div className="row-sub" style={{ padding: '8px 0' }}>Pressed {fmtStamp(__BUILD_STAMP__)}</div>
      <button className="btn" onClick={() => void updateNow()} disabled={busy}>
        {busy ? 'Updating…' : 'Update now'}
      </button>
      <div className="row-sub" style={{ padding: '8px 0 0' }}>
        Fetches the newest Curia and clears cached data. Your trades live on the server — nothing is lost.
      </div>
      <h2 className="section-title">Backup</h2>
      <div className="link-row">
        <button onClick={() => void doExport()}>Export backup</button>
        {' · '}
        <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f); }} />
      </div>
      {importError && <div style={{ color: 'var(--pl-red)', textAlign: 'center', fontSize: 13 }}>{importError}</div>}
    </div>
  );
}
```
(`doImport` uses the passed `onRefresh` after a successful restore.)

`LedgerTab.tsx`: delete `doExport`, `doImport`, `importError`, `fileRef`, the backup link-row and error div, and now-unused imports (`useRef`, `exportBackup`, `importBackup`). All-entries toggle stays.

- [ ] **Step 4: Full suite + build** — `npx vitest run && npm run build` → 61 passed (59 + 3 settings − 1 moved from Ledger). Build clean; confirm `dist/assets/*.js` contains the literal build stamp (grep a fragment of today's date).

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend && git commit -m "feat(settings): press stamp + force update + relocated backups"
```

---

### Task 4: Merge, deploy, phone verification

- [ ] **Step 1:** Full suites on dev (backend 33, frontend 61), merge dev→main, delete dev, re-run both on main.
- [ ] **Step 2:** `git push origin main && railway up --service curia --detach`; poll health; verify prod: `/` serves, options board reachable (app HTML), `GET /api/options` 200 with key. No backend changes to smoke.
- [ ] **Step 3:** README one-liner (options board + settings), ledger + memory updates, push.
- [ ] **Step 4 (with Andrew):** reopen app (or use the new Update button once it's on!) → Options tab shows the month board with his real TQQQ put on its week; tap an empty week → sell sheet; Settings shows the stamp; Update now round-trips.
