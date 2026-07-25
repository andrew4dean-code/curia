# Curia — Past-Week Entry — Design

**Date:** 2026-07-25
**Status:** Approved in brainstorming.

## In plain words

Today the Options board won't let you tap a week that has already gone by, so a week you
missed can never be filled in. This change opens those weeks up and makes catching up a
loop you can actually finish:

1. **Tap any past week and log a trade into it**, exactly like the live week. Full ceremony.
2. **Trades you've logged but not finished get an "unfinished" mark**, so a missed week reads
   as a checklist: log it → see the mark → say how it ended → mark clears.
3. **Every week from this one back gets a "didn't trade this week" button**, so an empty week
   means "quiet on purpose" instead of "not caught up yet."
4. **Saying how an old trade ended defaults to the day it expired**, not today.
5. **A heads-up when a backdated record falls outside its wheel**, so premium doesn't silently
   go uncounted.
6. **The app stops asking for fees.** Andrew doesn't track them; the boxes just add a field to
   skip past on every entry.

## Why each piece exists

**(1)** is the actual block. `OptionsTab` gates the sell affordance behind `!isPast`, and the
sell sheet takes its expiration from the tapped line with no date field of its own — so a past
week is unreachable. Nothing else stops backdating: the backend validates dates as
`YYYY-MM-DD` and imposes no future-date rule, stock trades already have a free date field, and
`weekFridayFor` already buckets any option into the correct week and month score.

**(2)** exists because (1) alone creates a new silent-wrong-data path. A backfilled option lands
`OPEN`, and an expired-but-open option is indistinguishable from a live one on the board. It also
corrupts wheel stage: `deriveStage` reads any open PUT as `SELL_PUT`, even one that expired days
ago.

**(3)** is Andrew's addition. A blank week is ambiguous between "didn't trade" and "haven't caught
up," and that ambiguity is the whole problem being solved.

**(4)** is a correctness fix, not a convenience. On `ASSIGNED`, the backend books a real stock
trade with `executed_at` set to the settle date. Defaulting to today puts backfilled shares in
the ledger on the wrong day, giving wrong cost-basis timing and reordering FIFO lots against
other trades in that week.

**(5)** covers the remaining silent trap. Wheel membership is a symbol + date window
(`opened_at ≤ record date ≤ closed_at`). Backfill an option dated before its wheel's start and
the premium simply doesn't count, with nothing on screen saying so.

**(6)** is friction removal, and it compounds with (1): the whole point of this build is making a
missed week fast to catch up on, and every entry currently carries a field Andrew has no use for.

## Non-goals

- No separate "backfill mode" or dedicated past-trade screen — past weeks behave like the live
  week, no special rules.
- No reduced or skipped ceremony for backdated entries (explicitly rejected; Andrew wants full
  animation everywhere).
- No auto-detection of missed weeks and no reminders/nudges to catch up.
- No change to how wheel membership itself works — (5) reports the mismatch, it does not
  silently widen a wheel's window.
- No new date field on the option sell sheet; expiration still comes from the tapped line.
- Fees are removed from the **forms only** — no schema migration, no removal of `fees` from the
  API, backups, or the P/L math.

## Data model — `quiet_weeks` table (backend)

- `id` pk · `friday` `YYYY-MM-DD` **unique** · `created_at` ISO.

`friday` is the week's Friday, the same key the board already buckets by (`weekFridayFor`), so a
quiet mark and the rows it stands in for are addressed identically.

### API (passcode-locked like everything)

- `GET /api/quiet-weeks` → `["2026-07-17", ...]` ascending.
- `POST /api/quiet-weeks` body `{friday}` (pattern-validated) → 201 `{friday}` on first mark,
  200 `{friday}` if already marked. Idempotent — re-marking is never an error.
- `DELETE /api/quiet-weeks/{friday}` → 204. Deleting an unmarked week is 404.
- Export gains `"quiet_weeks": [...]`; import accepts it as **optional** so existing backups keep
  restoring. Export `version` stays `1` — same additive approach used when `wheels` landed.

`Snapshot` gains `quietWeeks: string[]`, fetched in the existing `Promise.all` in
`fetchSnapshot`, and therefore cached and offline-available like the rest.

## Behaviour

### Past weeks accept entry

`OptionsTab` drops the `!isPast` condition on the sell button. Copy differs by week so the board
still tells you where you are in time:

- future / live week: `＋ tap to sell this week` · `＋ sell another this week` (unchanged)
- past week: `＋ log a trade for this week` · `＋ log another for this week`

Past weeks keep their receded `.past` styling — knowing when you are still matters. Entry opens
the existing `OptionSellSheet` with the tapped Friday as expiration; the ceremony runs unchanged.

### Unfinished mark

An `OPEN` option whose `expiration` is before today renders its chip with a "needs settling"
treatment. `expiryLabel()` already returns `'past due'` for this case and is currently never
surfaced. The mark is derived at render time — no stored state, nothing to keep in sync — and
clears the moment the option is settled.

### Quiet weeks

A week qualifies for the quiet mark when its Friday is on or before **this week's Friday**
(`friday <= weekFridayFor(today)`) — that is, this week and any week before it. Future weeks
cannot be marked.

- Qualifying week with **no options**: shows a `didn't trade this week` button alongside the log
  button.
- Marked week: renders a quiet plate in place of the empty state, with a way to clear the mark.
- **The mark is display-derived**: a week shows as quiet only when it is marked *and* holds zero
  options. Logging a trade into a marked week hides the mark with no write; deleting that trade
  again restores it. This avoids write-coupling between two independent records and any race
  between them.

### Settle date default

`SettleSheet` defaults its date to `expiration < today ? expiration : today`, and the field stays
editable in both cases. This is the common truth for the backfill case — expired worthless or
assigned at expiry — and it keeps the assigned-shares booking date correct without adding a step.

### Wheel-window heads-up

A shared helper answers one question: **the symbol has at least one wheel, and none of them
contains this date.** Stated exactly — warn when `wheels.some(w => w.symbol === sym)` is true and
`wheels.filter(w => w.symbol === sym).every(w => !inWindow(w, date))` is also true. A symbol with
no wheels is silent (nothing to miss), and a date inside *any* one of the symbol's wheels is
silent even when other wheels for that symbol exclude it.

The note names the nearest excluding wheel's boundary — its `opened_at` when the date falls
before it, its `closed_at` when the date falls after.

When true, the sheet shows a non-blocking inline note beneath the date field, naming the wheel's
start date. Saving is never prevented; the wheel's start date remains editable where it already
is. This applies to **both** `OptionSellSheet` and `AddTradeSheet` — the trap is identical for
backfilled assigned shares, and it is one helper serving both.

### Fees come off the forms

The three fee inputs are removed: `AddTradeSheet` (`fees`), `OptionSellSheet` (`fees`), and
`SettleSheet`'s bought-back `close_fees`. Each submits `0` in place of the removed field.

**The `fees` columns and API fields stay.** Removing them would mean a migration, would break
restore of every existing backup, and would touch `realizedPl`, `premiumCollected`, and
`optionRealizedPl` — all for a value that is now constant `0` and changes no total. The forms are
the thing Andrew asked to be rid of; the storage is inert.

One check during implementation: if any stored record already carries a non-zero fee, it would
keep affecting totals with no way left to see or edit it. Query the existing rows before shipping —
if any are non-zero, surface them to Andrew rather than silently hiding them. If all are zero
(expected — he has never tracked fees), nothing more is needed.

## Testing

Test-first, matching the existing suites.

**Backend (pytest):** quiet-week create / list / delete; idempotent re-mark; 404 on deleting an
unmarked week; bad-date rejection; export includes `quiet_weeks`; import with and without the key;
import round-trip.

**Frontend (Vitest):**
- quiet-week eligibility rule at the boundaries — this week's Friday qualifies, next week's does
  not; derived-display rule shows quiet only when marked *and* empty.
- past-due detection: open option expiring yesterday marks, expiring today does not, settled
  option never marks.
- settle-date default: past expiration → expiration, future expiration → today.
- wheel-window helper: date before `opened_at` warns, inside window silent, after `closed_at`
  warns, no wheel for symbol silent, and — with two wheels on one symbol — a date inside either
  one stays silent while a date outside both warns.
- board still buckets a backdated option into the correct week and month score (guards the
  `weekFridayFor` rule the recent fix established).
- each sheet submits `fees: 0` (and `close_fees: 0`) with no fee input present, and the existing
  P/L assertions still hold at zero fees.

## Risks

- **Quiet marks and reality drift.** A week marked quiet that later turns out to have had a trade
  is corrected by simply logging the trade — the derived-display rule handles it with no
  reconciliation step.
- **Backfilled options left unsettled** still skew wheel stage while open. The unfinished mark is
  the mitigation; it makes the condition visible rather than preventing it.
- **Wheel note is advisory only.** A user who ignores it still gets uncounted premium. Blocking
  the save was rejected as too aggressive for a manual tracker where the user is the authority.
