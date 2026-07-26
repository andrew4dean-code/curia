# Craft Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quieten the Options board, let a position be closed from the Portfolio, and make the app's ceremonies feel like paper, ink and wax rather than CSS transitions.

**Architecture:** Fifteen tasks in four reviewable passes on one branch, shipped as one release. Pass 1 is layout and one new sheet; Pass 2 rebuilds the trade ceremony's print and fold stages; Pass 3 adds a settle ceremony; Pass 4 is three isolated flourishes. Everything is CSS, SVG or existing components — no assets, no backend change, no new maths. Logic that can be tested (pre-fill quantities, stamp/colour selection, slide direction, stage timing) is extracted into pure helpers and tested; the animation itself is verified on a real phone viewport.

**Tech Stack:** React 19 + TypeScript + Vite 7 (Node 20), Vitest + Testing Library, CSS 3D transforms.

## Global Constraints

- **Node 20 only** — `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` before any frontend command. Node 24 + Vite 8 hangs builds on this Mac.
- **No reduced-motion gating anywhere.** No `prefers-reduced-motion` query, no lite mode, no setting to disable animation. This is a repeated explicit instruction from the owner. Full animation on every entry point, backdated or live.
- **Animate `transform` and `opacity` only** on anything running per frame. No animated `width`, `height`, `top`, `left`, or `box-shadow` in a keyframe loop. The ceremonies must hold 60fps at 375×667 on a real iPhone.
- **Every tap target reaches 44px minimum.**
- Dates are local-calendar `YYYY-MM-DD` strings compared lexicographically. Never `toISOString().slice(0,10)` — that is UTC and shifts the day.
- **No new backend endpoints, no schema changes, no new maths.** Realised figures come from the existing FIFO computation in `lib/fifo.ts`; close-out quantity comes from `computeOpenPositions`.
- Design tokens (use these, never raw hex): `--parchment #E7DDC4`, `--parchment-card #EFE7D2`, `--ink #2E2820`, `--ink-soft #655D4E`, `--maroon #8C2B26`, `--gold #A98842`, `--gold-label #835A24`, `--pl-green #4C6B2C`, `--pl-red #9B2D2D`, `--rule #C9B687`, `--font-display` Playfair Display, `--font-mono` Space Mono, `--roll-ease cubic-bezier(.18,.71,.21,1)`.
- **Spec:** `docs/superpowers/specs/2026-07-25-craft-pass-design.md`.
- Visual checkpoints are delivered as in-chat screenshots or screen recordings. Artifact links are unreliable on the owner's phone.

## Pass structure

| Pass | Tasks | Checkpoint |
|---|---|---|
| 1 — Board and screens | T1–T5 | Screenshots of the board and the close-out flow |
| 2 — Trade ceremony | T6–T8 | Screen recording of one full ceremony |
| 3 — Settling | T9–T11 | Recording of an expiry and an assignment |
| 4 — Everywhere else | T12–T14 | Short clips of each |
| Ship | T15 | — |

**Run continuously — do not stop for the owner between passes.** He has explicitly asked for
uninterrupted execution, after being told the risk that animation is taste and building all
eighteen items blind buries the misses under the hits. That is his call.

Still capture each checkpoint's screenshots or recording and deliver them in chat as the pass
lands, so he has the record and can redirect if he wants to — but keep going without waiting.

---

### Task 1: Week cards — one rule, two pills

**Files:**
- Modify: `frontend/src/components/OptionsTab.tsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/components/__tests__/OptionsTab.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. Existing aria-labels are unchanged and must stay so — `log a trade for the week of <Mon D>`, `sell the week of <Mon D>`, `didn't trade the week of <Mon D>`, `undo the quiet mark on <Mon D>`.

An empty week card currently shows four horizontal lines: the dashed card outline, `.wk-rule` under the label, `.wk-sell`'s dashed top border, and `.wk-quiet-set`'s dashed top border. Only `.wk-rule` survives.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/__tests__/OptionsTab.test.tsx`:

```tsx
  it('an empty week carries one rule and two pill actions', () => {
    const { container } = render(
      <OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} />,
    );
    const week = container.querySelector('.wk')!;
    expect(week.querySelectorAll('.wk-rule')).toHaveLength(1);
    expect(week.querySelector('.wk-actions')).not.toBeNull();
    expect(week.querySelectorAll('.wk-pill')).toHaveLength(2);
  });

  it('the quiet plate keeps its own rule and still offers the log pill', () => {
    const { container } = render(
      <OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={vi.fn()} />,
    );
    const quiet = container.querySelector('.wk-quiet')!;
    expect(quiet).not.toBeNull();
    expect(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — no `.wk-actions`, no `.wk-pill`.

- [ ] **Step 3: Wrap the actions in a pill row**

In `OptionsTab.tsx`, replace the action block (the `<>` fragment containing `wk-sell` and `wk-quiet-set`) with:

```tsx
                <div className="wk-actions">
                  {onSellWeek && (
                    <button
                      className="wk-pill wk-pill-go"
                      aria-label={
                        isPast
                          ? `log a trade for the week of ${fmtShort(friday)}`
                          : `sell the week of ${fmtShort(friday)}`
                      }
                      onClick={() => onSellWeek(friday)}
                    >
                      {isPast
                        ? rows.length > 0
                          ? '＋ log another'
                          : '＋ log a trade'
                        : rows.length > 0
                          ? '＋ sell another'
                          : '＋ sell this week'}
                    </button>
                  )}
                  {canQuiet && onMarkQuiet && (
                    <button
                      type="button"
                      className="wk-pill wk-pill-ghost"
                      aria-label={`didn't trade the week of ${fmtShort(friday)}`}
                      onClick={() => onMarkQuiet(friday)}
                    >
                      didn't trade
                    </button>
                  )}
                </div>
```

Keep the `isQuiet` quiet-plate branch exactly as it is, but render the `.wk-actions` block after it rather than in an either/or — a quiet week must still offer its log pill. The structure becomes: quiet plate (when `isQuiet`), then always the actions row.

- [ ] **Step 4: Replace the card and action styles**

In `frontend/src/styles/app.css`, replace the `.wk` rule and delete `.wk-sell`, `.wk-quiet-set`, and the `.wk:not(.past) .wk-sell:active` / `.wk-quiet-set:active` rules. Add:

```css
.wk { position: relative; overflow: hidden; background: var(--parchment-card); border: 1px solid rgba(201, 182, 135, .55); border-radius: 12px; padding: 14px 16px; min-height: 92px; }
.wk.past { background: var(--parchment); border-color: rgba(201, 182, 135, .38); }
.wk-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.wk-pill { min-height: 44px; padding: 0 16px; border-radius: 999px; font-family: var(--font-mono); font-size: 13px; background: none; }
.wk-pill-go { border: 1px solid var(--gold); color: var(--gold-label); }
.wk-pill-ghost { border: 1px solid rgba(201, 182, 135, .5); color: var(--ink-soft); }
.wk-pill:active { transform: scale(.97); }
.wk-quiet { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); font-style: italic; }
```

The `.wk.past` dashed border is deliberately gone — the tint carries the recede. Keep `.wk.live`, `.wk-num`, `.wk-label`, `.wk-rule`, `.wk-chip`, `.wk-seal`, `.wk-settled`, `.wk-todo`, and `.wk-quiet-undo` unchanged.

- [ ] **Step 5: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS, tsc clean. Existing aria-label assertions must still pass — if any fail, you changed a label and must restore it.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): one rule per week card, actions become pills"
```

---

### Task 2: Close a position from the Portfolio

**Files:**
- Create: `frontend/src/components/PositionSheet.tsx`
- Modify: `frontend/src/components/PortfolioTab.tsx`
- Modify: `frontend/src/components/AddTradeSheet.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/components/__tests__/PositionSheet.test.tsx` (create), `AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: `OpenPosition` from `lib/types` (`symbol`, `qty`, `avgCost`, `mark`, `marketValue`, `unrealizedPl`, `unrealizedPlPct`).
- Produces:
  - `PositionSheet({ position, onMark, onClose, onCancel })` where `onMark: () => void`, `onClose: () => void`, `onCancel: () => void`.
  - `AddTradeSheet` gains an optional `prefill?: { side: Side; symbol: string; qty: number }` prop. When present and `trade` is null, the form opens with those values.
  - `TabProps` gains `onPosition?: (p: OpenPosition) => void`.
  - `App`'s `Sheet` union gains `{ kind: 'position'; position: OpenPosition }` and `{ kind: 'trade'; trade: Trade | null; prefill?: { side: Side; symbol: string; qty: number } }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/PositionSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionSheet } from '../PositionSheet';
import type { OpenPosition } from '../../lib/types';

const pos: OpenPosition = {
  symbol: 'TQQQ', qty: 400, avgCost: 72, mark: null,
  marketValue: 25600, unrealizedPl: -3200, unrealizedPlPct: -11.1,
};

describe('PositionSheet', () => {
  it('names the holding', () => {
    render(<PositionSheet position={pos} onMark={vi.fn()} onClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/TQQQ/)).toBeInTheDocument();
    expect(screen.getByText(/400 sh/)).toBeInTheDocument();
    expect(screen.getByText(/\$72\.00/)).toBeInTheDocument();
  });

  it('offers both actions and routes each', () => {
    const onMark = vi.fn();
    const onClose = vi.fn();
    render(<PositionSheet position={pos} onMark={onMark} onClose={onClose} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /update price/i }));
    expect(onMark).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /close it out/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

Add to `frontend/src/components/__tests__/AddTradeSheet.test.tsx`:

```tsx
  it('a close-out prefill opens as a full-size sell that stays editable', () => {
    render(
      <AddTradeSheet
        trade={null}
        wheels={[]}
        prefill={{ side: 'SELL', symbol: 'TQQQ', qty: 400 }}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/side/i) as HTMLSelectElement).value).toBe('SELL');
    expect((screen.getByLabelText(/symbol/i) as HTMLInputElement).value).toBe('TQQQ');
    const qty = screen.getByLabelText(/shares/i) as HTMLInputElement;
    expect(qty.value).toBe('400');
    expect(qty.readOnly).toBe(false);
    fireEvent.change(qty, { target: { value: '150' } });
    expect(qty.value).toBe('150'); // a partial exit is just an edit
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/PositionSheet.test.tsx src/components/__tests__/AddTradeSheet.test.tsx`
Expected: FAIL — `PositionSheet` does not exist, `prefill` is not a prop.

- [ ] **Step 3: Create the sheet**

Create `frontend/src/components/PositionSheet.tsx`:

```tsx
import type { OpenPosition } from '../lib/types';
import { formatMoney } from '../lib/format';

export function PositionSheet({
  position,
  onMark,
  onClose,
  onCancel,
}: {
  position: OpenPosition;
  onMark: () => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{position.symbol}</h2>
        <div className="row-sub" style={{ marginBottom: 16 }}>
          {position.qty} sh · avg {formatMoney(position.avgCost)}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close it out
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onMark}>
            Update price
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Teach AddTradeSheet to accept a prefill**

In `AddTradeSheet.tsx`, add `Side` to the type import if absent, add the prop, and seed state from it:

```tsx
export function AddTradeSheet({
  trade,
  wheels,
  prefill,
  onDone,
  onDeleted,
  onCancel,
}: {
  trade: Trade | null;
  wheels: Wheel[];
  prefill?: { side: Side; symbol: string; qty: number };
  onDone: (ticket: TicketData) => Promise<void>;
  onDeleted?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [side, setSide] = useState<Side>(trade?.side ?? prefill?.side ?? 'BUY');
  const [symbol, setSymbol] = useState(trade?.symbol ?? prefill?.symbol ?? '');
  const [qty, setQty] = useState(trade ? String(trade.qty) : prefill ? String(prefill.qty) : '');
```

Leave every other state initialiser, the fields, and the submit path untouched. The quantity input keeps no `readOnly` attribute, so a partial exit is an ordinary edit.

- [ ] **Step 5: Route the position row**

In `PortfolioTab.tsx`, add `onPosition?: (p: OpenPosition) => void;` to `TabProps` (import `OpenPosition` from `../lib/types` if not already imported), destructure `onPosition`, and change the holdings row handler:

```tsx
          onClick={() => (onPosition ? onPosition(p) : onMark(p.symbol))}
```

The fallback keeps every existing test that renders `PortfolioTab` without the new prop working unchanged.

- [ ] **Step 6: Wire it in App**

In `App.tsx`, extend the `Sheet` union:

```tsx
  | { kind: 'trade'; trade: Trade | null; prefill?: { side: Side; symbol: string; qty: number } }
  | { kind: 'position'; position: OpenPosition }
```

Import `Side` and `OpenPosition` from `./lib/types`. Add to `tabProps`:

```tsx
    onPosition: (p: OpenPosition) => setSheet({ kind: 'position', position: p }),
```

Pass the prefill through the trade render:

```tsx
        <AddTradeSheet trade={sheet.trade} wheels={snap.wheels} prefill={sheet.prefill} onDone={onTicket} onDeleted={onDeleted} onCancel={() => setSheet(null)} />
```

And render the new sheet:

```tsx
      {sheet?.kind === 'position' && (
        <PositionSheet
          position={sheet.position}
          onMark={() => setSheet({ kind: 'mark', symbol: sheet.position.symbol })}
          onClose={() =>
            setSheet({
              kind: 'trade',
              trade: null,
              prefill: { side: 'SELL', symbol: sheet.position.symbol, qty: sheet.position.qty },
            })
          }
          onCancel={() => setSheet(null)}
        />
      )}
```

Import `PositionSheet` alongside the other sheet imports.

- [ ] **Step 7: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(portfolio): tap a position to update its price or close it out"
```

---

### Task 3: A closed position gets its own ticket

**Files:**
- Modify: `frontend/src/lib/fifo.ts` (export a helper only if one does not already fit)
- Modify: `frontend/src/components/AddTradeSheet.tsx`
- Test: `frontend/src/lib/__tests__/fifo.test.ts`, `frontend/src/components/__tests__/AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: `computeClosedTrades(trades: Trade[]): ClosedTrade[]` from `lib/fifo.ts` and `ClosedTrade` from `lib/types`.
- Produces: `realisedForSell(trades: Trade[], sell: Trade): number` in `lib/fifo.ts` — the realised P/L attributable to one SELL, computed by the existing FIFO walk. Read `lib/fifo.ts` and `lib/types.ts` first: if `ClosedTrade` already carries the sell's id and realised amount, this helper is a thin lookup, not a new calculation. **Do not write a second FIFO implementation.**

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/__tests__/fifo.test.ts` (match the file's existing `Trade` fixture style):

```ts
describe('realisedForSell', () => {
  const buy = { id: 1, symbol: 'TQQQ', side: 'BUY' as const, qty: 100, price: 60, fees: 0, executed_at: '2026-06-01', note: '' };
  const win = { id: 2, symbol: 'TQQQ', side: 'SELL' as const, qty: 100, price: 72, fees: 0, executed_at: '2026-07-01', note: '' };
  const loss = { id: 3, symbol: 'TQQQ', side: 'SELL' as const, qty: 100, price: 51, fees: 0, executed_at: '2026-07-01', note: '' };

  it('returns the gain on a profitable exit', () => {
    expect(realisedForSell([buy, win], win)).toBeCloseTo(1200, 6);
  });

  it('returns a negative number on a loss', () => {
    expect(realisedForSell([buy, loss], loss)).toBeCloseTo(-900, 6);
  });

  it('returns 0 for a sell it cannot match', () => {
    expect(realisedForSell([win], win)).toBeCloseTo(0, 6);
  });
});
```

Add to `frontend/src/components/__tests__/AddTradeSheet.test.tsx`:

```tsx
  it('a close-out prints a POSITION CLOSED ticket carrying the realised figure', async () => {
    vi.mocked(api.createTrade).mockClear();
    const onDone = vi.fn();
    render(
      <AddTradeSheet
        trade={null}
        wheels={[]}
        trades={[{ id: 1, symbol: 'TQQQ', side: 'BUY', qty: 100, price: 60, fees: 0, executed_at: '2026-06-01', note: '' }]}
        prefill={{ side: 'SELL', symbol: 'TQQQ', qty: 100 }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /add trade/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const ticket = onDone.mock.calls[0][0];
    expect(ticket.title).toBe('POSITION CLOSED');
    expect(ticket.lines.join(' ')).toMatch(/\+\$1,200\.00 realised/);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/lib/__tests__/fifo.test.ts src/components/__tests__/AddTradeSheet.test.tsx`
Expected: FAIL — `realisedForSell` undefined, ticket title is `TRADE TICKET`.

- [ ] **Step 3: Add the helper**

In `lib/fifo.ts`, add — adapting the body to whatever `ClosedTrade` actually exposes, and reusing `computeClosedTrades` rather than re-walking lots:

```ts
// The realised result attributable to one SELL, read out of the existing FIFO
// walk. A close-out ticket states what the exit actually earned; it must never
// disagree with the Ledger, so it reads the same computation the Ledger does.
export function realisedForSell(trades: Trade[], sell: Trade): number {
  return computeClosedTrades(trades)
    .filter((c) => c.sellId === sell.id)
    .reduce((sum, c) => sum + c.realizedPl, 0);
}
```

If `ClosedTrade` names those fields differently, use the real names — do not rename the type.

- [ ] **Step 4: Build the ticket**

In `AddTradeSheet.tsx`, add an optional `trades?: Trade[]` prop (defaulting to `[]`), import `realisedForSell` and `formatSignedMoney`, and in `submit`, after `saved`, branch the ticket:

```tsx
      const closing = !trade && prefill?.side === 'SELL';
      const realised = closing ? realisedForSell([...(trades ?? []), { ...body, id: saved.id }], { ...body, id: saved.id }) : 0;
      const ticket: TicketData = closing
        ? {
            no: saved.id,
            title: 'POSITION CLOSED',
            symbol: body.symbol,
            lines: [
              `SOLD ${body.qty} ${body.symbol}`,
              `@ ${formatMoney(body.price)} · ${fmtDate(body.executed_at)}`,
              `${formatSignedMoney(realised)} realised`,
            ],
          }
        : {
            no: saved.id,
            title: 'TRADE TICKET',
            symbol: body.symbol,
            lines: [
              `${body.side} ${body.qty} ${body.symbol}`,
              `@ ${formatMoney(body.price)} · ${fmtDate(body.executed_at)}`,
            ],
          };
```

In `App.tsx`, pass `trades={snap.trades}` to the `AddTradeSheet` render.

The ceremony colours the realised line by sign — add to `ceremony.css`:

```css
.ticket-line[data-sign='up'] { color: var(--pl-green); }
.ticket-line[data-sign='down'] { color: var(--pl-red); }
```

and in `TradeCeremony.tsx`, set `data-sign` on a line whose text contains `realised`, from whether it starts with `−`/`-`.

- [ ] **Step 5: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(portfolio): a closed position prints its realised result"
```

---

### Task 4: Paper grain, page edge, breathing tag

**Files:**
- Modify: `frontend/src/styles/app.css`
- Test: none — pure presentation with no branch to assert. Verified visually at the Pass 1 checkpoint.

- [ ] **Step 1: Add the styles**

Append to `frontend/src/styles/app.css`:

```css
.wk, .sheet, .card { background-image: radial-gradient(rgba(46,40,32,.030) .5px, transparent .5px), radial-gradient(rgba(46,40,32,.022) .5px, transparent .5px); background-size: 7px 7px, 11px 11px; background-position: 0 0, 3px 4px; }
.wk { box-shadow: 0 1px 0 rgba(255,255,255,.45) inset, 0 2px 5px rgba(46,40,32,.07); }
.wk-todo { animation: todo-breathe 3.6s ease-in-out infinite; }
@keyframes todo-breathe { 0%, 100% { opacity: 1; border-color: var(--maroon); } 50% { opacity: .62; border-color: rgba(140,43,38,.45); } }
```

Two offset dot grids at different sizes read as fibre rather than a visible pattern. The `.wk` shadow is static, not animated, so it costs nothing per frame.

- [ ] **Step 2: Verify nothing regressed**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run`
Expected: all PASS (no test touches these rules).

- [ ] **Step 3: Check for banding**

Start the preview, view at 375×667, and confirm the grain reads as warmth rather than a visible dot pattern, and that it does not band on the card backgrounds. **If it bands or reads as texture, halve both alpha values and re-check.** If it still bands, delete the grain rule and note it — the spec ranks it the least important item in the release.

- [ ] **Step 4: Commit**

```bash
cd ~/curia-app && git add frontend/src/styles/app.css && git commit -m "feat(ui): paper grain, page edge, breathing unfinished tag"
```

---

### Task 5: Months slide, week cards deal in

**Files:**
- Modify: `frontend/src/lib/board.ts`
- Modify: `frontend/src/components/OptionsTab.tsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/lib/__tests__/board.test.ts`, `frontend/src/components/__tests__/OptionsTab.test.tsx`

**Interfaces:**
- Produces: `slideDirection(from: [number, number], to: [number, number]): 'left' | 'right'` in `lib/board.ts`, where each tuple is `[year, month1]`. Returns `'left'` when moving forward in time.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/__tests__/board.test.ts` (add `slideDirection` to the import):

```ts
describe('slideDirection', () => {
  it('moves left going forward and right going back', () => {
    expect(slideDirection([2026, 7], [2026, 8])).toBe('left');
    expect(slideDirection([2026, 8], [2026, 7])).toBe('right');
  });

  it('handles the year boundary in both directions', () => {
    expect(slideDirection([2026, 12], [2027, 1])).toBe('left');
    expect(slideDirection([2027, 1], [2026, 12])).toBe('right');
  });
});
```

Add to `OptionsTab.test.tsx`:

```tsx
  it('marks the slide direction when browsing months', () => {
    const { container } = render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(container.querySelector('.board-weeks')?.getAttribute('data-slide')).toBe('left');
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(container.querySelector('.board-weeks')?.getAttribute('data-slide')).toBe('right');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/lib/__tests__/board.test.ts src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — `slideDirection` undefined, no `data-slide`.

- [ ] **Step 3: Add the helper**

Append to `lib/board.ts`:

```ts
// Which way the board should travel when the month changes. Compared as an
// absolute month index so December -> January reads as forward, not backward.
export function slideDirection(from: [number, number], to: [number, number]): 'left' | 'right' {
  return to[0] * 12 + to[1] >= from[0] * 12 + from[1] ? 'left' : 'right';
}
```

- [ ] **Step 4: Drive it from the component**

In `OptionsTab.tsx`, import `slideDirection`, add state, and set it in `shift`:

```tsx
  const [slide, setSlide] = useState<'left' | 'right'>('left');
```

```tsx
  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const next: [number, number] = [d.getFullYear(), d.getMonth() + 1];
    setSlide(slideDirection(ym, next));
    setYm(next);
  }
```

Key the week list on the month so React remounts it, and tag the direction:

```tsx
      <div className="board-weeks" data-slide={slide} key={`${year}-${month}`}>
```

- [ ] **Step 5: Add the animations**

Append to `frontend/src/styles/app.css`:

```css
.board-weeks[data-slide='left'] { animation: board-in-left .34s cubic-bezier(.22,.9,.28,1) both; }
.board-weeks[data-slide='right'] { animation: board-in-right .34s cubic-bezier(.22,.9,.28,1) both; }
@keyframes board-in-left { from { transform: translateX(26%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes board-in-right { from { transform: translateX(-26%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.board-weeks .wk { animation: wk-deal .32s cubic-bezier(.22,.9,.28,1) both; animation-delay: calc(var(--wk-i, 0) * 55ms); }
@keyframes wk-deal { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
```

Set the index custom property on each week in `OptionsTab.tsx`'s map, capped so a five-week month never drags:

```tsx
            <div key={friday} className={...} style={{ ['--wk-i' as string]: Math.min(i, 4) }}>
```

The month container animating and its children animating are separate transforms on separate elements, so the slide and the deal-in compose rather than fight. Remounting via `key` means only one slide runs at a time.

- [ ] **Step 6: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): months slide, week cards deal in"
```

- [ ] **Step 8: PASS 1 CHECKPOINT**

Start the preview at 375×667, seed a month with one open past-due option, one quiet week, one empty past week and one future week. Capture: the decluttered board, the pill actions, a month slide, the deal-in, the position sheet, and a close-out ticket. Deliver in chat, then **continue straight to Task 6** — do not wait.

---

### Task 6: The press — platen, typebar, slower typing

**Files:**
- Modify: `frontend/src/components/TradeCeremony.tsx`
- Modify: `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/TradeCeremony.test.tsx`

**Interfaces:**
- Produces: `STAGE_MS` in `TradeCeremony.tsx` becomes the exported source of truth for ceremony timing — `export const STAGE_MS: [Stage, number][]`. Task 7 and Task 8 tune its entries; Task 15 asserts the total.

New timing, summing to 8000ms:

| Stage | Was | Now |
|---|---|---|
| `print` | 2500 | 4200 |
| `fold` | 950 | 1600 |
| `envelope` | 850 | 1100 |
| `ship` | 1000 | 1100 |

`TYPE_CHAR_MS` goes 22 → 48. `TYPE_START_MS` goes 300 → 600 (the page must reach the roller before it is typed on).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/__tests__/TradeCeremony.test.tsx` (create it if absent, matching the fake-timer style used elsewhere):

```tsx
  it('runs for about eight seconds and clears every timer on unmount', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { unmount } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    vi.advanceTimersByTime(7999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDone).toHaveBeenCalledOnce();
    unmount();
    vi.advanceTimersByTime(10000);
    expect(onDone).toHaveBeenCalledOnce(); // no timer fired after unmount
    vi.useRealTimers();
  });

  it('the stage table sums to the eight-second target', () => {
    expect(STAGE_MS.reduce((n, [, ms]) => n + ms, 0)).toBe(8000);
  });

  it('shows the press furniture while printing', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    expect(container.querySelector('.platen')).not.toBeNull();
    expect(container.querySelector('.typebar')).not.toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run src/components/__tests__/TradeCeremony.test.tsx`
Expected: FAIL — total is 5300, no `.platen`.

- [ ] **Step 3: Retime and add the press**

In `TradeCeremony.tsx`:

```tsx
export const STAGE_MS: [Stage, number][] = [
  ['print', 4200],
  ['fold', 1600],
  ['envelope', 1100],
  ['ship', 1100],
];

const TYPE_START_MS = 600;
const TYPE_CHAR_MS = 48;
const STRIKE_EVERY = 3;
```

Add strike state driven off the typed count, so the arm swings on roughly every third character while text still appears one at a time:

```tsx
  const strike = Math.floor(typedCount / STRIKE_EVERY);
```

Render the press furniture inside `.ceremony-scene`, before `.ticket`:

```tsx
        <div className="platen" aria-hidden="true" />
        <div className="typebar" data-strike={strike % 2} aria-hidden="true" />
```

Add `data-typing={typing ? 'yes' : 'no'}` to the `.ceremony` root so CSS can hold the arm down when typing stops. Add the feed offset to the ticket, so the page advances as lines complete:

```tsx
        <div className="ticket" style={{ ['--feed' as string]: typedLines.length - 1 }}>
```

- [ ] **Step 4: Style the press**

Append to `frontend/src/styles/ceremony.css`:

```css
.platen { position: absolute; left: -14px; right: -14px; top: -26px; height: 26px; border-radius: 13px; background: linear-gradient(#4a4137, #241f19 62%, #171310); box-shadow: 0 2px 5px rgba(0,0,0,.45), 0 -1px 0 rgba(255,255,255,.13) inset; z-index: 3; }
.typebar { position: absolute; left: 50%; top: 46%; width: 3px; height: 78px; margin-left: -1.5px; background: linear-gradient(var(--ink), #0f0d0a); border-radius: 2px; transform-origin: 50% 100%; opacity: 0; z-index: 2; }
.ceremony[data-typing='yes'] .typebar { opacity: .92; }
.ceremony[data-typing='yes'] .typebar[data-strike='0'] { animation: bar-hit 96ms cubic-bezier(.3,0,.2,1) both; }
.ceremony[data-typing='yes'] .typebar[data-strike='1'] { animation: bar-hit 96ms cubic-bezier(.3,0,.2,1) both; }
@keyframes bar-hit { 0% { transform: rotate(26deg) translateY(10px); } 55% { transform: rotate(0deg) translateY(0); } 100% { transform: rotate(22deg) translateY(8px); } }
.ceremony[data-stage='print'] .ticket { transform: translateY(calc(var(--feed, 0) * -3px)); transition: transform .13s steps(2, end); }
```

Both `data-strike` values carry the same animation deliberately: toggling the attribute between `0` and `1` restarts it, which is what makes each strike a discrete hit rather than one continuous loop.

The existing `.ceremony[data-stage='print'] .ticket { animation: ticket-rise ... }` must be retimed to 800ms and must not fight the feed transform — move the rise onto a wrapper element or fold the feed into the rise keyframe's end state. Read the existing rule before editing and keep the rise's settle.

- [ ] **Step 5: Run the full suite**

Run: `cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): platen, striking typebar, page feed, slower typing"
```

---

### Task 7: A real tri-fold

**Files:**
- Modify: `frontend/src/components/TradeCeremony.tsx`
- Modify: `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/TradeCeremony.test.tsx`

The current fold is one `rotateX` on the whole ticket and reads as a card tipping. This replaces it with a letter tri-fold: bottom panel up over the middle, then top panel down over both.

**This is the hardest item in the release and the one most likely to need a second attempt.** Build it, look at it, and say plainly if it reads as cardboard rather than paper.

- [ ] **Step 1: Write the failing test**

```tsx
  it('the fold stage builds three panels', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    vi.advanceTimersByTime(4300);
    expect(container.querySelectorAll('.fold-panel')).toHaveLength(3);
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/TradeCeremony.test.tsx`
Expected: FAIL — no `.fold-panel`.

- [ ] **Step 3: Render the panels**

In `TradeCeremony.tsx`, when `stage` is `fold` or later, render three panels layered over the ticket. Each shows the same ticket content clipped to its third, so the fold folds the actual page rather than a blank card:

```tsx
        {stage !== 'print' && (
          <div className="fold" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div className={`fold-panel fold-p${n}`} key={n}>
                <div className="fold-inner" style={{ transform: `translateY(-${n * 33.333}%)` }}>
                  <div className="ticket-head">CURIA · {ticket.title} Nº {ticket.no}</div>
                  {ticket.lines.map((l) => (
                    <div className="ticket-line" key={l}>{l}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Style and animate the fold**

Append to `ceremony.css`:

```css
.fold { position: absolute; inset: 0; transform-style: preserve-3d; perspective: 1100px; }
.fold-panel { position: absolute; left: 0; right: 0; height: 33.334%; overflow: hidden; background: var(--parchment-card); backface-visibility: hidden; }
.fold-inner { position: absolute; left: 0; right: 0; top: 0; height: 300%; padding: 22px 20px; }
.fold-p0 { top: 0; transform-origin: 50% 100%; z-index: 3; }
.fold-p1 { top: 33.333%; z-index: 1; }
.fold-p2 { top: 66.666%; transform-origin: 50% 0%; z-index: 2; }
.ceremony[data-stage='fold'] .fold-p2 { animation: fold-up .62s cubic-bezier(.45,0,.2,1) both; }
.ceremony[data-stage='fold'] .fold-p0 { animation: fold-down .62s .70s cubic-bezier(.45,0,.2,1) both; }
@keyframes fold-up { 0% { transform: rotateX(0deg); box-shadow: 0 0 0 rgba(0,0,0,0); } 60% { box-shadow: 0 -8px 16px rgba(46,40,32,.34); } 100% { transform: rotateX(-180deg) translateZ(1px); box-shadow: 0 -3px 9px rgba(46,40,32,.26); } }
@keyframes fold-down { 0% { transform: rotateX(0deg); } 60% { box-shadow: 0 8px 16px rgba(46,40,32,.34); } 100% { transform: rotateX(180deg) translateZ(2px); box-shadow: 0 3px 9px rgba(46,40,32,.26); } }
.fold-panel::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; background: linear-gradient(rgba(255,255,255,.5), rgba(46,40,32,.16)); }
.ceremony[data-stage='fold'] .fold-p2::after { animation: crease .62s ease-out both; }
.ceremony[data-stage='fold'] .fold-p0::after { animation: crease .62s .70s ease-out both; }
@keyframes crease { 0% { opacity: 0; } 45% { opacity: .85; } 100% { opacity: .3; } }
```

Hide the flat ticket once folding begins (`.ceremony[data-stage='fold'] .ticket { opacity: 0; }`) and delete the old `ticket-fold` keyframe and its rule. The envelope stage's existing `.ticket` transform rule must be updated to target `.fold` instead, or the folded packet will not hand off to the envelope.

The `box-shadow` inside these keyframes is deliberate and acceptable: the fold runs once for ~1.3s on two elements, not per-frame across a list.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ceremony): letter tri-fold with travelling creases"
```

---

### Task 8: The seal presses

**Files:**
- Modify: `frontend/src/styles/ceremony.css`
- Test: none — replaces one keyframe with another; verified at the Pass 2 checkpoint.

- [ ] **Step 1: Replace the stamp keyframes**

In `ceremony.css`, replace the `seal-stamp` keyframe and add the paper dent. Both the ticket seal and the envelope seal use it:

```css
@keyframes seal-stamp { 0% { opacity: 0; transform: scale(1.9) rotate(-9deg); } 45% { opacity: 1; transform: scale(.88) rotate(2.5deg); } 70% { transform: scale(1.06) rotate(-1deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
.ticket-seal, .envelope-seal { box-shadow: 0 2px 6px rgba(0,0,0,.35), 0 0 0 0 rgba(46,40,32,.32); }
.ceremony[data-stage='print'] .ticket-seal { animation: seal-stamp .46s 3.4s cubic-bezier(.3,1.5,.5,1) both, seal-dent .46s 3.4s ease-out both; }
@keyframes seal-dent { 0% { box-shadow: 0 2px 6px rgba(0,0,0,.35), 0 0 0 0 rgba(46,40,32,0); } 45% { box-shadow: 0 1px 3px rgba(0,0,0,.4), 0 0 0 13px rgba(46,40,32,.20); } 100% { box-shadow: 0 2px 6px rgba(0,0,0,.35), 0 0 0 7px rgba(46,40,32,.09); } }
.ceremony[data-stage='envelope'] .envelope-seal { animation: seal-stamp .4s .6s cubic-bezier(.3,1.5,.5,1) both, seal-dent .4s .6s ease-out both; }
```

The `3.4s` delay places the ticket seal after the last character at the new typing speed. If a longer ticket types past it, raise the delay rather than speeding the typing back up.

- [ ] **Step 2: Verify nothing regressed**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd ~/curia-app && git add frontend/src/styles/ceremony.css && git commit -m "feat(ceremony): the seal presses and dents the paper"
```

- [ ] **Step 4: PASS 2 CHECKPOINT**

Record one complete trade ceremony at 375×667 and deliver it in chat. Say plainly whether the fold reads as paper. **Continue straight to Task 9** — do not wait.

---

### Task 9: The settle stamp

**Files:**
- Create: `frontend/src/lib/settleStamp.ts`
- Create: `frontend/src/components/SettleCeremony.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/SettleSheet.tsx`
- Modify: `frontend/src/styles/ceremony.css`
- Test: `frontend/src/lib/__tests__/settleStamp.test.ts` (create), `frontend/src/components/__tests__/SettleCeremony.test.tsx` (create)

**Interfaces:**
- Produces:
  - `stampFor(outcome: Exclude<OptionStatus, 'OPEN'>, realised: number): { word: string; tone: 'up' | 'down' | 'assign' }` in `lib/settleStamp.ts`.
  - `SettleCeremony({ data, onDone })` where `data: { word: string; tone: 'up' | 'down' | 'assign'; amount: string; symbol: string; shares?: string }`.

Colour follows the result: kept money green, given back red, assignment maroon — assignment is neither a win nor a loss, it is a transformation.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/settleStamp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stampFor } from '../settleStamp';

describe('stampFor', () => {
  it('expiry keeps the premium and stamps green', () => {
    expect(stampFor('EXPIRED', 148)).toEqual({ word: 'EXPIRED', tone: 'up' });
  });

  it('a profitable buyback stamps green, a costly one red', () => {
    expect(stampFor('BOUGHT_BACK', 40)).toEqual({ word: 'BOUGHT BACK', tone: 'up' });
    expect(stampFor('BOUGHT_BACK', -60)).toEqual({ word: 'BOUGHT BACK', tone: 'down' });
  });

  it('assignment is neither a win nor a loss', () => {
    expect(stampFor('ASSIGNED', 148)).toEqual({ word: 'ASSIGNED', tone: 'assign' });
    expect(stampFor('ASSIGNED', -20)).toEqual({ word: 'ASSIGNED', tone: 'assign' });
  });

  it('treats a flat result as kept, not lost', () => {
    expect(stampFor('EXPIRED', 0).tone).toBe('up');
  });
});
```

Create `frontend/src/components/__tests__/SettleCeremony.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleCeremony } from '../SettleCeremony';

const data = { word: 'EXPIRED', tone: 'up' as const, amount: '$148.00', symbol: 'TQQQ' };

afterEach(() => vi.useRealTimers());

describe('SettleCeremony', () => {
  it('stamps the outcome and shows the amount', () => {
    render(<SettleCeremony data={data} onDone={vi.fn()} />);
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByTestId('settle-amount')).toHaveAttribute('data-value', '$148.00');
  });

  it('finishes and calls back', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SettleCeremony data={data} onDone={onDone} />);
    vi.advanceTimersByTime(4000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('an assignment runs longer than an expiry', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ' }} onDone={onDone} />);
    vi.advanceTimersByTime(4000);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2600);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/settleStamp.test.ts src/components/__tests__/SettleCeremony.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Add the selector**

Create `frontend/src/lib/settleStamp.ts`:

```ts
import type { OptionStatus } from './types';

// Assignment gets its own tone deliberately: it is neither a win nor a loss but
// a transformation — the puts became shares. Colouring it green or red would
// claim an outcome the trade has not had yet.
export function stampFor(
  outcome: Exclude<OptionStatus, 'OPEN'>,
  realised: number,
): { word: string; tone: 'up' | 'down' | 'assign' } {
  if (outcome === 'ASSIGNED') return { word: 'ASSIGNED', tone: 'assign' };
  const word = outcome === 'BOUGHT_BACK' ? 'BOUGHT BACK' : 'EXPIRED';
  return { word, tone: realised >= 0 ? 'up' : 'down' };
}
```

- [ ] **Step 4: Build the ceremony**

Create `frontend/src/components/SettleCeremony.tsx`. Stages: `swing` (stamp arrives) → `hit` (impact, ticket jolts, ink bleeds) → `count` (amount rolls up) → optional `certificate` (Task 11) → done. Base run 3800ms; the assignment branch adds 2600ms.

```tsx
import { useEffect, useRef, useState } from 'react';
import { Odometer } from './Odometer';

export interface SettleData {
  word: string;
  tone: 'up' | 'down' | 'assign';
  amount: string;
  symbol: string;
  shares?: string;
}

type Stage = 'swing' | 'hit' | 'count' | 'certificate';

export function SettleCeremony({ data, onDone }: { data: SettleData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('swing');
  const timers = useRef<number[]>([]);
  const done = useRef(false);

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(620, () => setStage('hit'));
    at(1250, () => setStage('count'));
    if (data.shares) {
      at(3800, () => setStage('certificate'));
      at(6400, finish);
    } else {
      at(3800, finish);
    }
    const t = timers.current;
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    onDone();
  }

  return (
    <div className="ceremony settle-ceremony" data-stage={stage} data-tone={data.tone} onClick={finish}>
      <div className="ceremony-scene">
        <div className="ticket settle-ticket">
          <div className="ticket-head">CURIA · {data.symbol}</div>
          <div className="settle-stamp">{data.word}</div>
          {stage !== 'swing' && (
            <div className="settle-amount">
              <Odometer value={data.amount} speed="hero" dataTestid="settle-amount" />
            </div>
          )}
          {stage === 'certificate' && data.shares && (
            <div className="settle-cert">{data.shares}</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Style the stamp**

Append to `ceremony.css`:

```css
.settle-ceremony[data-tone='up'] { --stamp: var(--pl-green); }
.settle-ceremony[data-tone='down'] { --stamp: var(--pl-red); }
.settle-ceremony[data-tone='assign'] { --stamp: var(--maroon); }
.settle-stamp { position: absolute; left: 50%; top: 46%; margin-left: -110px; width: 220px; text-align: center; font-family: var(--font-display); font-weight: 800; font-size: 30px; letter-spacing: .05em; color: var(--stamp); border: 3px solid var(--stamp); border-radius: 6px; padding: 6px 0; opacity: 0; transform: rotate(-12deg); }
.settle-ceremony[data-stage='swing'] .settle-stamp { animation: stamp-swing .62s cubic-bezier(.4,0,.25,1) both; }
.settle-ceremony:not([data-stage='swing']) .settle-stamp { opacity: .92; }
@keyframes stamp-swing { 0% { opacity: 0; transform: rotate(-40deg) scale(2.4) translateY(-90px); } 70% { opacity: 1; transform: rotate(-9deg) scale(.94); } 100% { opacity: .92; transform: rotate(-12deg) scale(1); } }
.settle-ceremony[data-stage='hit'] .settle-ticket { animation: ticket-jolt .3s cubic-bezier(.36,.07,.19,.97) both; }
@keyframes ticket-jolt { 0%, 100% { transform: translateY(0); } 22% { transform: translateY(7px) rotate(.6deg); } 55% { transform: translateY(-3px) rotate(-.3deg); } }
.settle-amount { margin-top: 74px; text-align: center; font-size: 30px; color: var(--stamp); }
.settle-cert { margin-top: 14px; text-align: center; font-family: var(--font-mono); font-size: 14px; letter-spacing: .08em; color: var(--ink); }
```

- [ ] **Step 6: Fire it from the settle path**

In `App.tsx`, add `settleCeremony` state alongside `ceremony`. `SettleSheet`'s `onDone` currently closes the sheet and refreshes; it must now also hand back what was settled. Change `SettleSheet`'s `onDone` to `onDone: (c: SettleData) => Promise<void>`, build the data in `SettleSheet.submit` using `stampFor` and the existing `optionRealizedPl` of the settled option, and in `App` set the ceremony, then refresh when it finishes — mirroring exactly how `wheelCeremony` already works.

Render it beside the others:

```tsx
      {settleCeremony && (
        <SettleCeremony data={settleCeremony} onDone={() => { setSettleCeremony(null); void refresh(); }} />
      )}
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(settle): the outcome stamps and the amount counts up"
```

---

### Task 10: The month total rolls

**Files:**
- Modify: `frontend/src/components/OptionsTab.tsx`
- Test: `frontend/src/components/__tests__/OptionsTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('the month score rolls on an odometer', () => {
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByTestId('month-score')).toHaveAttribute('data-value', '$148.00');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/OptionsTab.test.tsx`
Expected: FAIL — no `month-score` testid.

- [ ] **Step 3: Swap in the Odometer**

In `OptionsTab.tsx`, import `Odometer` and replace the score span:

```tsx
        <Odometer className="board-score-amount" value={formatMoney(score)} speed="hero" dataTestid="month-score" />
```

Update the existing month-score test that asserts `getByText('$294.70')` — the Odometer splits its value across per-digit elements, so the text is no longer contiguous. Assert on `data-value` instead. **Do not delete that test.**

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(board): the month total rolls when a week settles"
```

---

### Task 11: Assignment becomes a share certificate

**Files:**
- Modify: `frontend/src/components/SettleCeremony.tsx`, `frontend/src/components/SettleSheet.tsx`
- Modify: `frontend/src/styles/ceremony.css`
- Test: `frontend/src/components/__tests__/SettleCeremony.test.tsx`

The `certificate` stage and its 2600ms already exist from Task 9. This task makes it look like something: the option terms dissolve, the share line forms, and an ornate border draws itself in corner to corner.

**Presentation only.** The shares are booked by the existing settle endpoint exactly as they are today.

- [ ] **Step 1: Write the failing test**

```tsx
  it('the certificate stage draws a border and names the shares', () => {
    vi.useFakeTimers();
    const { container } = render(
      <SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ @ $62.00' }} onDone={vi.fn()} />,
    );
    vi.advanceTimersByTime(3900);
    expect(container.querySelector('.cert-frame')).not.toBeNull();
    expect(screen.getByText(/400 SHARES · TQQQ @ \$62\.00/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/SettleCeremony.test.tsx`
Expected: FAIL — no `.cert-frame`.

- [ ] **Step 3: Add the frame**

In `SettleCeremony.tsx`, inside the `certificate` branch, render the frame around the share line:

```tsx
          {stage === 'certificate' && data.shares && (
            <>
              <div className="cert-frame" aria-hidden="true" />
              <div className="settle-cert">{data.shares}</div>
            </>
          )}
```

- [ ] **Step 4: Style the transformation**

Append to `ceremony.css`:

```css
.settle-ceremony[data-stage='certificate'] .settle-stamp { animation: stamp-dissolve .6s ease-in both; }
@keyframes stamp-dissolve { to { opacity: 0; transform: rotate(-12deg) scale(1.25); filter: blur(3px); } }
.settle-ceremony[data-stage='certificate'] .settle-amount { animation: cert-settle .6s ease-out both; }
@keyframes cert-settle { from { transform: translateY(0); } to { transform: translateY(-10px); } }
.cert-frame { position: absolute; inset: 6px; border: 2px solid var(--gold); border-radius: 3px; box-shadow: 0 0 0 3px var(--parchment-card) inset, 0 0 0 4px rgba(169,136,66,.55) inset; clip-path: inset(0 100% 100% 0); animation: cert-draw 1.5s .35s cubic-bezier(.3,.8,.3,1) both; }
@keyframes cert-draw { 0% { clip-path: inset(0 100% 100% 0); } 50% { clip-path: inset(0 0 100% 0); } 100% { clip-path: inset(0 0 0 0); } }
.settle-ceremony[data-stage='certificate'] .settle-cert { animation: cert-text .7s .9s ease-out both; }
@keyframes cert-text { from { opacity: 0; letter-spacing: .3em; } to { opacity: 1; letter-spacing: .08em; } }
```

`filter: blur()` runs once on a single dissolving element for 600ms — acceptable, unlike a per-frame blur across a list.

- [ ] **Step 5: Supply the share line**

In `SettleSheet.tsx`, when the chosen outcome is `ASSIGNED`, include `shares` in the ceremony data, using the values the sheet already computes for its books preview:

```tsx
        shares: `${option.contracts * 100} SHARES · ${option.symbol} @ ${formatMoney(option.strike)}`,
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(settle): assignment becomes a share certificate"
```

- [ ] **Step 8: PASS 3 CHECKPOINT**

Record settling an option two ways — one expiring worthless, one assigned — and deliver both in chat, then **continue straight to Task 12** — do not wait.

---

### Task 12: The dial hand sweeps

**Files:**
- Modify: `frontend/src/components/WheelDial.tsx`
- Modify: `frontend/src/styles/curia-tokens.css`
- Test: none — a single easing change; verified at the Pass 4 checkpoint.

The hand already transitions over 2.2s with `--roll-ease`, which is a plain ease-out — it glides to a stop with no weight. Read `WheelDial.tsx` around the `wheel-hand` transform before editing.

- [ ] **Step 1: Add an overshoot easing token**

In `curia-tokens.css`, beside `--roll-ease`:

```css
  --sweep-ease: cubic-bezier(.34, 1.32, .48, 1);
```

- [ ] **Step 2: Use it for the hand**

In `WheelDial.tsx`, change the hand's inline transition to `transform 1.6s var(--sweep-ease)`. Shorter than 2.2s because the overshoot now supplies the sense of weight that the long glide was standing in for.

- [ ] **Step 3: Verify nothing regressed**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(wheel): the dial hand overshoots and settles like a gauge needle"
```

---

### Task 13: Delete strikes through

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/components/LedgerTab.tsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/components/__tests__/LedgerTab.test.tsx`

Deletes happen from sheets: confirm, delete, refresh — and the row simply disappears when the snapshot reloads. To strike it, the row must survive briefly after the delete succeeds.

**Interfaces:**
- Produces: `TabProps` gains `strikingTradeId?: number | null`. `LedgerTab` renders that row with a `.striking` class.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/__tests__/LedgerTab.test.tsx`:

```tsx
  it('marks the struck row and leaves its neighbours alone', () => {
    const { container } = render(<LedgerTab snap={snapWithTrades} {...cbs} strikingTradeId={1} />);
    const struck = container.querySelectorAll('.striking');
    expect(struck).toHaveLength(1);
    expect(struck[0].textContent).toMatch(/TQQQ/);
  });
```

Use the file's existing snapshot fixture; if it has no trade with id 1, add one whose symbol is `TQQQ`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/__tests__/LedgerTab.test.tsx`
Expected: FAIL — `strikingTradeId` is not a prop.

- [ ] **Step 3: Thread the id**

Add `strikingTradeId?: number | null;` to `TabProps` in `PortfolioTab.tsx`. In `LedgerTab.tsx`, destructure it and add `striking` to the row's class when the ids match.

In `App.tsx`, add `const [strikingTradeId, setStrikingTradeId] = useState<number | null>(null);`, include it in `tabProps`, and change `onDeleted` so the strike plays before the refresh removes the row:

```tsx
  const onDeleted = async (id?: number) => {
    setSheet(null);
    if (id == null) { await refresh(); return; }
    setStrikingTradeId(id);
    window.setTimeout(() => { setStrikingTradeId(null); void refresh(); }, 700);
  };
```

`AddTradeSheet.remove` must pass the deleted trade's id to `onDeleted`. **If the delete request rejects, `onDeleted` is never called and the row is never struck** — the existing catch already keeps the sheet open and shows the error, so a failed delete leaves the row intact, which is the required behaviour.

- [ ] **Step 4: Style the strike**

Append to `app.css`:

```css
.row.striking { position: relative; animation: row-fold .3s .4s cubic-bezier(.5,0,.75,0) both; }
.row.striking::after { content: ''; position: absolute; left: 0; top: 50%; height: 2px; width: 100%; background: var(--ink); transform-origin: 0 50%; transform: scaleX(0); animation: strike .34s cubic-bezier(.3,.7,.4,1) both; }
@keyframes strike { to { transform: scaleX(1); } }
@keyframes row-fold { to { transform: scaleY(0); opacity: 0; } }
```

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(ledger): a deleted row is struck through before it folds away"
```

---

### Task 14: Unlocking opens the book

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/src/__tests__/App.test.tsx`

**The cover must never gate access.** The app renders and is interactive as the cover clears; the cover is an overlay that animates away, not a barrier that must finish first.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/App.test.tsx`, following the file's existing unlock test:

```tsx
  it('the app is present and interactive the moment it unlocks, cover or no cover', async () => {
    renderUnlockedApp(); // use whatever helper this file already has
    await waitFor(() => expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it passes or fails**

Run: `npx vitest run src/__tests__/App.test.tsx`
Expected: PASS before the change — this test exists to guarantee your change does not break it. Note the pass, then continue; it must still pass at Step 5.

- [ ] **Step 3: Add the cover**

In `App.tsx`, add `const [cover, setCover] = useState(false);`. Set it true in the passcode-gate success handler, and clear it after 900ms. Render the cover as the last child of the shell, above everything:

```tsx
      {cover && <div className="book-cover" aria-hidden="true" onAnimationEnd={() => setCover(false)} />}
```

The `onAnimationEnd` clears it even if the timer is lost. The cover has `pointer-events: none`, so the app underneath is tappable the entire time.

- [ ] **Step 4: Style it**

Append to `app.css`:

```css
.book-cover { position: fixed; inset: 0; z-index: 60; pointer-events: none; background: linear-gradient(120deg, #6B2320, var(--maroon) 45%, #521a17); transform-origin: 0% 50%; animation: cover-open .9s cubic-bezier(.5,0,.2,1) both; }
.book-cover::after { content: 'C'; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font-family: var(--font-display); font-weight: 800; font-size: 64px; color: var(--gold); opacity: .85; }
@keyframes cover-open { 0% { transform: perspective(1200px) rotateY(0deg); } 100% { transform: perspective(1200px) rotateY(-105deg); opacity: 0; } }
```

Leave the wrong-passcode path untouched — the cover only appears on success.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, including the Step 2 test.

- [ ] **Step 6: Commit**

```bash
cd ~/curia-app && git add frontend/src && git commit -m "feat(gate): unlocking swings the cover open"
```

- [ ] **Step 7: PASS 4 CHECKPOINT**

Short clips of the dial sweep, a delete, and an unlock. Deliver in chat, then **continue straight to Task 15** — do not wait.

---

### Task 15: Verify and ship

- [ ] **Step 1: Run both suites**

```bash
cd ~/curia-app/backend && .venv/bin/pytest -q
```

```bash
cd ~/curia-app/frontend && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && npx vitest run && npx tsc --noEmit
```

Expected: 50 pytest (unchanged — this release touches no backend code), frontend green, tsc clean.

- [ ] **Step 2: Confirm no reduced-motion gating crept in**

```bash
cd ~/curia-app/frontend && grep -rn "prefers-reduced-motion" src/ || echo "CLEAN — no motion gating"
```

Expected: `CLEAN`. Any hit is a constraint violation and must be removed.

- [ ] **Step 3: Full walkthrough at 375×667**

Every item in all four passes, on the preview, in one pass: board, pills, slide, deal-in, position close, trade ceremony end to end, both settle paths, dial sweep, delete, unlock. Check the console for errors and confirm no dropped frames during the ceremonies.

- [ ] **Step 4: Merge and deploy**

```bash
cd ~/curia-app && git checkout main && git merge --no-ff feat/craft-pass
```

```bash
cd ~/curia-app && export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && railway up --service curia
```

- [ ] **Step 5: Verify production and log**

Confirm the deployed bundle carries the new class names (`wk-pill`, `settle-stamp`, `book-cover`, `cert-frame`), push `main`, and append the outcome to `.superpowers/sdd/progress.md` under `## Craft pass build`.

---

## Self-Review

**Spec coverage:** 1.1→T1 · 1.2→T2 · 1.3→T3 · 1.4→T4 · 1.5→T4 · 1.6→T5 · 1.7→T5 · 2.1→T6 · 2.2→T6 · 2.3→T7 · 2.4→T8 · 3.1→T9 · 3.2→T9 · 3.3→T10 · 3.4→T11 · 4.1→T12 · 4.2→T13 · 4.3→T14. All eighteen mapped. The four checkpoints sit at T5, T8, T11 and T14 as the spec requires.

**Placeholders:** none — every code step carries its code, every run step its command and expected result. Three steps deliberately instruct the implementer to read existing code before editing (T3's `ClosedTrade` field names, T6's `ticket-rise` rule, T12's hand transform) rather than guessing at contents this plan cannot see; each names exactly what to look for.

**Type consistency:** `realisedForSell`, `stampFor`, `slideDirection`, `SettleData`, `PositionSheet`, `prefill`, `onPosition`, `strikingTradeId`, and `STAGE_MS` are each named identically where defined and where consumed. `stampFor`'s `tone` union (`'up' | 'down' | 'assign'`) matches `SettleData.tone` and the three `[data-tone]` CSS selectors.

**Known ripples, all flagged inline:** T10 breaks the existing month-score text assertion (the Odometer splits digits into separate elements) — T10 Step 3 says to convert it, not delete it. T2's new `TabProps` member is optional with a fallback so existing `PortfolioTab` renders keep working. T7 must retarget the envelope stage's `.ticket` rule to `.fold` or the folded packet will not hand off.

**Deliberate test gaps:** T4, T8 and T12 have no unit tests. Each is a pure CSS or easing change with no branch to assert; jsdom computes no animation. They are covered by the pass checkpoints, which is the honest place for them rather than a test that asserts a class name and proves nothing.
