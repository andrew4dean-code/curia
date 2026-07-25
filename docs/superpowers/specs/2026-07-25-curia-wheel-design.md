# Curia — The Wheel — Design

**Date:** 2026-07-25
**Status:** Approved in brainstorming (hero-tab merge; manual Fresh Wheel button with ceremony;
engraved cycle dial per mockup https://claude.ai/code/artifact/68a1eb08-3a25-45c8-b6ed-b9378ac433d8 —
dial styling stays adjustable until the card task ships).

## What this adds

Wheel-campaign tracking for the wheel strategy (sell puts → get assigned → sell covered calls →
called away). The Portfolio tab becomes the **hero tab**: active wheel cards on top with an
engraved cycle dial, true-basis math, and an "if you closed today" total; a Wheel Archive of
completed campaigns below. Wheels are declared manually (Fresh Wheel button, with ceremony) and
everything inside them is derived from trades/options already entered.

## Non-goals

- No per-trade wheel tagging — membership is symbol + date-window, period.
- No automatic wheel opening/closing (Andrew chose manual control).
- No changes to Options board, Ledger, or Settings beyond what's listed.

## Data model (backend, `wheels` table)

- `id` pk · `symbol` (upper) · `no` int (per-symbol sequence, server-assigned on create)
- `opened_at` `YYYY-MM-DD` · `closed_at` `YYYY-MM-DD` or null · `created_at`/`updated_at` ISO.

### API (passcode-locked like everything)

- `GET /api/wheels` → all, ordered (`symbol`, `no`)
- `POST /api/wheels` body `{symbol, opened_at?}` (default today UTC-date server-side; client
  sends local) → 201 WheelOut; **409 if the symbol already has an open wheel**
- `POST /api/wheels/{id}/close` body `{closed_at?}` → WheelOut; 404/409 (already closed)
- `DELETE /api/wheels/{id}` → 204 (either state; deleting a wheel never touches trades/options)
- Export gains `"wheels": [...]`; import accepts optional `wheels` (validated `WheelRow`,
  pre-validate-then-replace; no id remapping needed — nothing references wheel ids).

## Membership + math (client-side `lib/wheelMath.ts`, test-first)

A wheel owns, for its symbol, trades with `opened_at ≤ executed_at (≤ closed_at)` and options
with `opened_at ≤ option.opened_at (≤ closed_at)`. Derived, for active wheels:

- `sharesHeld` + `rawBasis`: FIFO over the wheel's trades (reuse fifo helpers).
- `premiumBanked`: Σ `optionRealizedPl` of settled member options + Σ `premiumCollected` of open
  member options.
- `trueBasis`: `rawBasis − premiumBanked / sharesHeld` (null when no shares).
- `closeToday`: `(mark − rawBasis) × sharesHeld + premiumBanked` (mark from marks; null mark →
  share leg valued at rawBasis, i.e. closeToday = premiumBanked, flagged `markMissing`).
- `callsSold`: count of member CALL options. `weeks`: whole weeks since `opened_at` (≥ 1).
- `stage` for the dial: no shares & an open member PUT → `SELL_PUT`; shares > 0 & no open member
  CALL → `ASSIGNED` (holding); shares > 0 & open member CALL → `SELLING_CALLS`; no shares & no
  open options & wheel still open → `CALLED_AWAY` **only when the wheel has member history** —
  a freshly opened wheel with zero member trades and options sits at `SELL_PUT` (the start of
  the cycle, discovered in visual testing); closed wheel → `COMPLETED`.
- Completed wheel total: realized share P/L from member closed trades (fee-inclusive FIFO)
  + `premiumBanked` (all member options are settled by then; open ones count collected).

## The hero tab (Portfolio)

- **Active wheel cards first** (one per open wheel, newest first): masthead
  `SYMBOL · WHEEL Nº n · STARTED d · WEEK w`, open-CC tag when one exists, the **cycle dial**,
  tiles RAW BASIS / PREMIUM BANKED / TRUE BASIS, the gold **basis-walk bar** (needle = mark),
  and the double-ruled `IF YOU CLOSED TODAY` total (odometer digits, landing slow-roll applies).
  When the wheel's `stage` is `CALLED_AWAY` (flat), the card shows **Complete this wheel**.
  A small `abandon` link inside the card's overflow (record-sheet style confirm) deletes an
  open wheel without ceremony.
- **The dial** (SVG component `WheelDial`): rim with 4 stations (SELL PUT / ASSIGNED /
  SELLING CALLS / CALLED AWAY), stations passed get a ✓ and green ink, current station bold
  maroon with the hand pointing at it; gold spokes, one per call sold; hub = `Nº n` + `wk w`.
  Hand movement animates with the odometer easing. Stations map to `stage`.
- **Holdings** section below: book-value odometer + positions NOT covered by an active wheel's
  symbol (wheel symbols' positions live in their card). No active wheels → today's layout plus a
  parchment **Begin a fresh wheel** panel.
- **Wheel Archive** at the bottom (collapsible, like All entries): completed wheels newest
  first — `SYMBOL · Nº n · dates · w weeks · c calls sold` + final total, tap → record sheet
  (details + Delete record; deleting the wheel record never touches trades/options).

## Fresh Wheel + ceremonies

- **Fresh Wheel button**: on the hero tab (panel when no wheels; a quiet `＋ fresh wheel` link
  above the cards otherwise). Sheet: symbol (suggest symbols with recent activity), start date
  (default today, backdatable). Submit → POST → **wheel crest ceremony**.
- **Crest ceremony** (`WheelCeremony`, reuses ceremony overlay patterns, no reduced-motion):
  the crest draws itself (rim + spokes stroke-draw ~1.2s), spins up slowly, `SYMBOL · WHEEL Nº n`
  typewrites around/below the crest, then the whole crest stamps (seal-squash) and the overlay
  releases to the hero tab where the new card stamps in (existing landing slow-roll).
- **Completion ceremony**: tapping Complete → confirm sheet showing the final numbers → crest
  returns with a `COMPLETED` banner pressed across it + final total typewrited, then the card
  glides to the Archive (list stamp-in). Uses the same overlay machinery, ~3.5s, tap-skips.

## Testing (~18 new)

- wheelMath: membership windows (inside/before/after, closed-wheel cap), rawBasis/premium/
  trueBasis/closeToday (incl. null-mark path), stage transitions for all five states,
  callsSold/weeks, completed-wheel total.
- Backend: CRUD, per-symbol `no` sequencing, 409 double-open, close/404/409, delete both
  states, export/import round-trip incl. pre-wheels backups.
- Components: WheelDial stage rendering (station states, spoke count); WheelCard numbers +
  Complete button gating; hero layout (wheel symbols excluded from Holdings); FreshWheelSheet
  POST body; Archive rendering + record sheet delete; ceremony stage machine + tap-skip.

## Build order

1. Backend wheels table + endpoints + backup rows (TDD)
2. wheelMath + api client + types (TDD)
3. WheelDial + WheelCard + hero-tab layout + Archive (visual check)
4. FreshWheelSheet + crest/completion ceremonies + wiring (visual check)
5. Merge, deploy, phone check
