# Curia — Weekly Options Tracking + Trade Ceremony — Design

**Date:** 2026-07-24
**Status:** Approved in brainstorming (options: sold/premium-seller model; assignment auto-books the
stock trade; ceremony plays for every trade type).

## What this adds

1. **Options tracking** for a weekly premium seller: sold calls/puts, the premium collected,
   and each contract's fate — expired worthless, bought back, or assigned.
2. **The trade ceremony**: submitting any trade prints a letterpress ticket, folds it into an
   envelope, ships it off-screen, and stamps the new position into the page. Slow, deliberate,
   skippable.

## Non-goals

- No bought/long options (buying to open). The model is sell-to-open only.
- No market pricing of open options (no option marks/quotes). Profit is realized at settlement;
  open rows show premium collected, not mark-to-market.
- No Greeks, no chains, no broker anything.
- No animation library — the ceremony is hand-rolled CSS.

## Data model (backend, `options` table)

- `id` pk · `symbol` (underlying, upper-cased/trimmed) · `opt_type` (`CALL`|`PUT`)
- `strike` float ≥ 0 · `expiration` `YYYY-MM-DD` · `contracts` int ≥ 1
- `premium` float ≥ 0 (per share; total collected = premium × 100 × contracts)
- `fees` float ≥ 0 (entry) · `opened_at` `YYYY-MM-DD` · `note` str
- `status`: `OPEN` | `EXPIRED` | `BOUGHT_BACK` | `ASSIGNED`
- `closed_at` `YYYY-MM-DD` or null · `buyback_price` float (per share, BOUGHT_BACK only, else 0)
- `close_fees` float (settlement fees, default 0)
- `assigned_trade_id` int or null — the stock trade auto-created by assignment
- `created_at` / `updated_at` ISO UTC

### Realized P/L (computed client-side, like all money math)

- EXPIRED: `premium·100·contracts − fees`
- BOUGHT_BACK: `(premium − buyback_price)·100·contracts − fees − close_fees`
- ASSIGNED: `premium·100·contracts − fees` — the share economics live in the stock ledger,
  where assignment books the trade.

## API (all passcode-locked, same as everything)

- `GET /api/options` — all rows, open and settled
- `POST /api/options` — create (always status OPEN)
- `PUT /api/options/{id}` — edit an OPEN option's fields (typo repair); 409 if settled
- `DELETE /api/options/{id}`
- `POST /api/options/{id}/settle` — body `{outcome, closed_at?, buyback_price?, close_fees?}`
  - `EXPIRED` / `BOUGHT_BACK` (requires `buyback_price ≥ 0`) / `ASSIGNED`
  - **Assignment is atomic**: in one transaction, create the stock trade
    (PUT → BUY, CALL → SELL; qty = contracts·100; price = strike; fees 0; `executed_at` =
    closed_at; note `assigned: SYM $STRIKE TYPE exp EXPIRATION`), store its id in
    `assigned_trade_id`, mark the option ASSIGNED. A dropped connection can never half-book.
  - 409 if already settled; `closed_at` defaults to today (server-side UTC date is fine here;
    client always sends its local date explicitly).
- Export payload gains `"options": [...]` (version stays 1; `options` is optional on import so
  pre-options backups restore unchanged). Import validates every row through a pydantic model,
  pre-validate-then-replace like trades/marks. `assigned_trade_id` survives export/import as-is.

## Frontend

### Adding — the Add sheet grows a mode toggle

**Stock | Option** segmented control at the top of the existing sheet. Option mode fields:
underlying symbol, Call/Put, strike, expiration (date, defaulting to the coming Friday),
contracts, premium per share, fees (default 0), date sold (default today), note. Submit =
sold-to-open, premium collected.

### Portfolio tab — "Open Options" section

Below stock positions. One row per OPEN option:
`TQQQ $62 PUT · 2x · exp Fri (2d) · $148 collected` — countdown chip turns maroon when
expiring today/tomorrow. Tapping a row opens the **Settle sheet**:

- **Expired worthless** — one tap, keep it all.
- **Bought back** — asks buyback price per share (+ optional fees).
- **Assigned** — confirms what it will book (e.g. "BUY 200 TQQQ @ $62.00"), then does both
  sides in one shot.
- Settle date defaults to today. The sheet also carries small `edit` / `delete` links for
  fixing typos on open options.

### Ledger tab — "Premium Record" section

Settled options newest-first: outcome tag (EXPIRED / BOUGHT BACK / ASSIGNED), the P/L, dates.
Stats tiles for a weekly seller: total premium kept (sum of settled P/L), win rate (settled at
a profit), counts by outcome, and average take (total kept ÷ settled count). Stock "All Entries" stays stocks-only; options
live entirely in their own two sections.

### Snapshot

`fetchSnapshot` pulls trades + marks + options in parallel; cache key bumps to `curia-cache-v2`
(shape changed; old cache is discarded harmlessly).

## The ceremony

A full-screen overlay (`TradeCeremony`) choreographed by a five-state machine, pure CSS
keyframes (no dependencies), used for stock and option submissions alike:

1. **print** (~1.2s + 0.4s seal): a parchment ticket rises from the bottom edge as if off a
   press — "CURIA · TRADE TICKET Nº {id}", the trade typeset line by line, perforated (dashed)
   edges, then the maroon wax seal stamps down with a squash-and-settle.
2. **fold** (~0.9s): the ticket creases into thirds (CSS 3D, `preserve-3d`, two hinged panels).
3. **envelope** (~0.8s): an envelope wraps it, flap closes, seal presses onto the flap.
4. **ship** (~0.9s): lifts, tilts ~8°, sails off the top edge with a soft shadow shrink.
5. **stamp-in**: overlay unmounts, data refreshes, and the new row appears with a letterpress
   stamp-in (scale 1.06 → 1, ink-dark → normal) plus the existing amber flash; odometer rolls.

Rules: total ≈ 4.2s · **tap anywhere skips** straight to stamp-in · `prefers-reduced-motion`
skips the overlay entirely · failures still surface in the sheet (ceremony only plays after the
server accepted the trade).

## Testing (~15 new)

- **optionsMath (Vitest):** P/L for all three outcomes (fee handling), stats aggregation,
  days-to-expiry with fake timers.
- **Backend (pytest):** options CRUD + validation; settle each outcome; assignment atomically
  creates + links the stock trade; double-settle → 409; buyback without price → 422/400;
  export/import round-trip with options; a pre-options backup (no `options` key) imports clean.
- **Components:** Add sheet option mode; Open Options section + countdown; Settle sheet
  outcomes (assigned shows the booking preview); Premium Record + stats; ceremony state
  machine — advances through stages, tap skips, reduced-motion bypass (matchMedia mock).

## Build order

1. Backend options table + CRUD + settle (TDD)
2. optionsMath + types + snapshot/cache bump (TDD)
3. Add-sheet option mode + Open Options + Settle sheet
4. Premium Record + stats
5. Ceremony overlay + stamp-in wiring
6. Export/import extension + deploy + phone check
