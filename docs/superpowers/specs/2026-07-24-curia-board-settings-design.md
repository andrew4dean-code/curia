# Curia — The Options Board + Settings Tab — Design

**Date:** 2026-07-24
**Status:** Approved via mockup (https://claude.ai/code/artifact/f269299a-04b8-45f8-8bcc-b3650d130f8d).
Andrew's words: "easier, more gamified — click options, see lines that represent the weeks of the
month, click a week's line, enter call/put + strike + premium."

## What this changes

1. **A new Options tab** — the month as a board. Week lines replace the form-first flow;
   tapping a line sells into that week (no date field anywhere).
2. **A new Settings tab** — build stamp, a force-update button, and the backup buttons
   moved out of the Ledger's All-entries hideaway.
3. The bottom bar becomes **Portfolio · Options · Ledger · Settings**.

## Non-goals

- No backend changes at all — the board is a new lens on the existing `/api/options` data.
- No lock-this-device button; no ceremony-on-edit toggle (edits keep the ceremony).
- No multi-user/calendar sync anything.

## The Options board

- **Header:** ‹ Month › with chevrons (default: current month; browsing past months is
  view-only history, future months are sellable). Under it the month score:
  `$X collected this month` = Σ realized P/L of options settled (closed_at) in the month
  **plus** Σ premium collected on still-open options expiring in the month — matches the
  mockup arithmetic ($146 kept + $148 open = $294).
- **Week lines:** one line per Friday of the displayed month, labeled `WK n · FRI <date>`.
  - The **next upcoming Friday** (including today) renders live: maroon rule, countdown
    label from `expiryLabel` (`2d` → "2 DAYS LEFT" style).
  - **Open options** on a week sit on its line as wax-seal chips:
    `⬤ SYM $strike TYPE · Nx · $collected` — tapping a chip opens the existing SettleSheet.
  - **Settled options** print on their line faded: `✓ SYM $strike TYPE — kept $X`
    (green when P/L ≥ 0, red "gave back $X" when negative).
  - **Empty future weeks** (Friday ≥ today) show a dashed rule + `＋ tap the line to sell
    this week` — tapping opens the Sell sheet with expiration locked to that Friday.
  - **Empty past weeks** render faded with a plain rule and no action.
  - An option whose expiration isn't a Friday (legacy/edited data) attaches to the line of
    its expiration week's Friday (`weekFridayFor`).
- Multiple options in one week stack under the same line.

## The Sell sheet (replaces the Add-sheet's Option mode)

Opened only from a week line. Title: `Sell — week of Fri <date>`; subtitle: "expiration set
by the line you tapped". Fields: **PUT / CALL** as two big toggle buttons, symbol, strike,
premium/share, contracts, fees (default 0), note (optional), date sold (default today).
The submit button live-quotes the take: `Sell to open — collect $148`
(premium × 100 × contracts). Success fires the OPTION TICKET ceremony exactly as today.

- **Edit mode:** SettleSheet's Edit button opens this same sheet prefilled (expiration stays
  locked to the option's own value). Delete stays in SettleSheet.
- **AddTradeSheet reverts to stock-only**: the Stock|Option toggle and option fields are
  removed; the + FAB is for stocks. The FAB hides on the Options and Settings tabs.
- **Portfolio drops its Open Options section** — open options live on the board now.
  Ledger's Premium Record stays as-is.

## The Settings tab

- **The Press:** app wordmark, `Pressed <build stamp>` (a `__BUILD_STAMP__` compile-time
  constant, formatted local), and **Update now** — clears the snapshot cache
  (`curia-cache-v2`; the stored passcode is kept), unregisters every service worker, deletes
  all CacheStorage keys, and reloads. Copy under it: "Fetches the newest Curia and clears
  cached data. Your trades live on the server — nothing is lost."
- **Backup:** Export backup / Restore from backup move here from LedgerTab (identical
  behavior: dated JSON download; restore = version check → confirm → replace; errors show
  inline). LedgerTab loses its backup row and import-error UI.

## New pure helpers (`frontend/src/lib/board.ts`, test-first)

- `fridaysOfMonth(year, month1based): string[]` — the YYYY-MM-DD of every Friday in that month.
- `weekFridayFor(dateStr): string` — the Friday of the Mon–Sun week containing the date.
  A Wednesday maps 2 days forward to its Friday; a Friday maps to itself; a Saturday maps 1
  day BACK and a Sunday 2 days back (the weekend belongs to the week whose Friday just
  passed — never forward into next week).
- `monthScore(options, year, month1based): number` — per the header definition above.

## Testing (~14 new/changed)

- board.ts: fridaysOfMonth across a 4-Friday and a 5-Friday month; weekFridayFor for a
  Wednesday, a Friday, a Saturday, a Sunday; monthScore mixing settled/open/other-month rows.
- OptionsTab: renders the month's week lines with fake timers pinned; open chip, settled
  line, empty-future dashed line, empty-past faded; chip tap → onSettleOption; line tap →
  sell sheet with locked expiration; month score text; chevron navigation.
- OptionSellSheet: POSTs OptionDraft with the locked expiration; collect preview updates.
- AddTradeSheet: option-mode tests removed; stock tests unchanged.
- SettingsTab: version stamp renders; Update now clears cache key but keeps passcode,
  unregisters SW + deletes caches (mocked), reloads (mocked); backup tests ported from
  LedgerTab (which loses them).
- TabBar: four tabs; FAB hidden on Options/Settings.

## Build order

1. board.ts helpers (TDD) + 4-tab bar + App wiring with stub tabs + FAB visibility rule
2. OptionsTab board + OptionSellSheet + AddTradeSheet reversion + Portfolio section removal
3. SettingsTab (+ `__BUILD_STAMP__` define in vite+vitest configs) + backup move out of Ledger
4. Merge, deploy, phone check
