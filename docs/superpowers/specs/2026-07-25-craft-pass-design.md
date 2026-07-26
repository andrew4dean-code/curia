# Curia — Craft Pass — Design

**Date:** 2026-07-25
**Status:** Approved in brainstorming.

## In plain words

One release, eighteen changes, in four passes. Andrew sees each pass as it lands and can
redirect while it is still cheap; nothing ships until all four are done.

The board gets quieter, the ceremonies get real, settling stops being silent, and a
position can finally be closed from the Portfolio.

## Andrew's decisions

- **Typewriter: option B** — the platen roller is visible, the page curls over it and feeds
  upward, typebars strike from below. Not just a bare arm, not the whole machine.
- **Trade ceremony length: ~8s** (from ~5.3s today). Let it breathe.
- **Week cards:** whatever is cleanest while still separating. Pills are welcome.
- **Close position: option A** — tap the position row, choose update price or close it out.
- **No page-turn between tabs** — explicitly rejected as too heavy for forty taps a day.

## Standing constraints

- **No reduced-motion gating anywhere.** Full animation unconditionally, every entry point,
  backdated or live. This is a repeated, explicit instruction.
- Dates are local-calendar `YYYY-MM-DD` strings compared lexicographically.
- Every tap target reaches 44px.
- Node 20 / Vite 7 for the frontend; Python 3.9 backend venv.
- Animation must hold up at 375×667 on a real iPhone.

---

# Pass 1 — Board and screens

## 1.1 Declutter the week cards

An empty week card currently carries four horizontal lines: the dashed card outline, the
solid rule under the week label, a dashed rule above the log button, and a dashed rule above
the quiet button. At four or five cards per screen that reads as noise.

**After:**

- The dashed card outline becomes a **soft solid hairline** (`--rule` at reduced alpha) plus
  a very slight card tint. Separation without the busy dashes.
- **One** rule survives inside: the existing `.wk-rule` under the week label. It gives the
  week its identity as a header.
- The two action rows become **pills** side by side beneath the content: `＋ log a trade`
  as a gold-outlined pill, `didn't trade this week` as a quieter ghost pill. The pill shape
  does the separating, so both dashed rules are deleted.
- The ghost numeral, the live-week breathing border, and the `.past` recede all stay.

Net: four lines to one, and the actions gain shape.

Pills keep their 44px minimum height. On a narrow screen the two pills wrap to two rows
rather than shrinking below the tap minimum.

## 1.2 Close a position from the Portfolio

Today tapping a position row opens the price-mark sheet, and there is no way to record
exiting a position except typing a fresh sell by hand through the + button.

**After:** tapping a position row opens a small **PositionSheet** naming the holding
(`TQQQ · 400 sh · avg $72.00`) with two actions:

- **Update price** — opens the existing MarkSheet, unchanged.
- **Close it out** — opens `AddTradeSheet` pre-filled: side `SELL`, the symbol, and the
  **full open share count**. Andrew types only the price. The quantity stays editable, so a
  partial exit is just an edit.

The close path reuses `AddTradeSheet` entirely — no second way to write a trade.

## 1.3 A closed position gets a send-off

Closing a position runs the trade ceremony as any trade does, but the ticket reads as an
exit: title `POSITION CLOSED`, and a line stating the realised result
(`+$1,240.00 realised` / `−$310.00 realised`), coloured by sign. The figure comes from the
existing FIFO close computation, not a new calculation.

## 1.4 Paper grain and page edge

Cards (`.wk`, `.card`, the sheets) gain a CSS-only paper grain — layered low-alpha radial
gradients at a small `background-size`, no image asset — and a warm bottom edge shadow so a
card reads as a sheet resting on the page rather than a beige rectangle. Grain must stay
subtle enough to be invisible as texture and only felt as warmth; it must not band on
retina displays.

## 1.5 "Needs settling" breathes

The unfinished tag currently sits static. It gains a slow pulse — the same idea as the live
week's existing `wk-breathe`, slower and quieter — so unfinished business nags without
shouting. Opacity and border-colour only; nothing that reflows layout.

## 1.6 Months slide

Tapping ‹ or › currently swaps the board instantly. The board now slides horizontally in the
direction of travel, so browsing months reads as flipping through a binder. Direction is
derived from the sign of the month delta. Only the week list slides; the month header and
score stay put.

## 1.7 Week cards deal in

On entering the Options tab, the week cards stagger in from slightly below with a small
opacity ramp, one beat apart, like sheets dealt onto a desk. Stagger is by index and caps
out so a five-week month never feels slow. This replaces the current whole-tab fade for this
tab only.

---

# Pass 2 — The trade ceremony

Target total ≈ **8000ms**, from ~5300ms today.

## 2.1 The press: platen and typebars

The print stage gains a visible machine, drawn in CSS — no image assets:

- A **platen**: a dark rounded cylinder across the top of the scene, with a soft highlight
  along its upper edge to read as rubber.
- The **page** emerges from behind the platen and curls over it, so the sheet appears to be
  held by the roller rather than floating.
- A **typebar** — a thin ink-dark arm — swings up on an arc from below the current line and
  strikes at the caret position, then falls back. The strike lands *on* the character
  appearing, not before or after it.

Striking every character at the new slower speed is both expensive and visually frantic, so
the arm strikes on a **regular subset** of characters (roughly every third) while the text
continues to appear one character at a time. The eye reads continuous striking; the DOM does
a fraction of the work.

The page **feeds upward** as each line completes — a small discrete jump, the way real paper
advances — rather than the text simply extending downward.

## 2.2 Slower typing

Per-character interval goes from **22ms to ~48ms**. The print stage grows to about 4200ms:
roughly 800ms for the page to rise into the roller, typing from ~600ms, and the seal
stamping after the final character.

## 2.3 A real fold

Today the fold is a single `rotateX` on the whole ticket. It reads as a card tipping, not
paper folding.

**After:** a proper letter tri-fold. The ticket is split into three stacked panels. The
bottom panel folds up over the middle, then the top panel folds down over both. Each panel
carries its own shading that deepens toward the crease, and a bright crease highlight travels
along each fold as it closes. The folded result is a third of the original height and sits
correctly proportioned for the envelope that follows.

Fold stage grows from 950ms to ~1600ms to give the two folds distinct beats.

## 2.4 The seal presses

The wax seal currently fades in. Real wax is pressed: it should scale down from oversized,
squash past its resting size, rock very slightly off-axis, and settle — while the paper
beneath takes a soft inset dent and a brief darkened ring spreads from under the wax.

This applies to both the ticket seal and the envelope seal.

---

# Pass 3 — Settling

Settling an option is currently silent. It is the moment a week's result becomes real, and
it deserves the most weight in the app.

## 3.1 The stamp

A new **SettleCeremony**, opening on the settled ticket:

- A rubber stamp swings in from off-angle and **lands diagonally** across the ticket, about
  −12°, with a hard impact: the ticket jolts, the stamp rebounds slightly, ink bleeds a
  little at the edges of the letterforms.
- The word is the outcome — `EXPIRED`, `BOUGHT BACK`, or `ASSIGNED` — in the display face,
  ink-coloured with a rough edge, sitting over the ticket's text rather than replacing it.
- Colour follows the result: kept money stamps in `--pl-green`, given back in `--pl-red`,
  assignment in `--maroon` (it is neither a win nor a loss, it is a transformation).

## 3.2 The amount counts up

Beneath the stamp, the realised figure counts up from zero using the existing Odometer,
landing after the stamp settles. Sign-coloured, in the hero size.

## 3.3 The month total rolls

When the ceremony finishes and the board refreshes, the month score at the top of the
Options tab **rolls** to its new value on the existing Odometer rather than swapping. The
week you just settled visibly moves the month.

## 3.4 Assignment becomes a share certificate

Assignment is the biggest event in the wheel and currently settles as quietly as an expiry.
When the outcome is `ASSIGNED`, the ceremony continues past the stamp: the ticket's option
terms dissolve and reform as the share line — `400 SHARES · TQQQ @ $62.00` — while an ornate
certificate border draws itself in around the sheet, corner to corner. The sheet is then
filed away as the trade ceremony's envelope does.

This is presentation only. The shares are booked by the existing settle endpoint exactly as
they are today; the animation reflects that booking, it does not perform it.

---

# Pass 4 — Everywhere else

## 4.1 The wheel dial hand sweeps

When a wheel's stage changes, the dial hand currently jumps to its new station. It now
**sweeps** — accelerating out, overshooting its target slightly, and settling back like a
weighted gauge needle. The sweep runs on stage change only, not on every render.

## 4.2 Delete strikes through

A deleted row currently vanishes. It now takes a **line of ink drawn through it** left to
right, holds for a beat, then folds away to zero height. You do not erase a ledger, you
strike it. Applies to trade rows, option records, and settled entries.

The strike is presentation ahead of the existing delete call; a failed delete must restore
the row rather than leave it struck.

## 4.3 Unlocking opens the book

The passcode gate is the first thing Andrew sees every time. On a correct passcode, a cover
panel swings away on its spine to reveal the app beneath, rather than the app simply
appearing. Wrong passcode keeps its existing shake — the cover does not move.

The cover animation must not delay access: the app is interactive as the cover clears, and
a slow device must never leave Andrew waiting on decoration.

---

## Non-goals

- **No page-turn between tabs.** Explicitly rejected.
- No reduced-motion or "lite" mode anywhere, and no setting to disable animation.
- No image, video, or Lottie assets — everything is CSS, SVG, or existing components.
- No new backend endpoints, no schema changes, no new maths. Pass 3's realised figures and
  Pass 1's close-out quantity come from the existing FIFO and options calculations.
- No change to what any ceremony *means* — only how it looks. Every write path stays exactly
  as it is today.
- The close-out path does not introduce a second way to write a trade; it pre-fills the
  existing sheet.

## Testing

Animation cannot be asserted meaningfully in jsdom, so the split is deliberate:

**Unit-tested (Vitest):**
- Close-out pre-fill: side is `SELL`, symbol matches, quantity equals the full open share
  count, and the quantity remains editable for a partial exit.
- The realised figure on a closed-position ticket matches the FIFO computation, including
  the loss case.
- Stamp word and colour selection per outcome — `EXPIRED` / `BOUGHT BACK` / `ASSIGNED`
  mapping to green / red / maroon, driven by the realised sign where applicable.
- Month-slide direction derives from the sign of the month delta, including across a
  year boundary.
- Ceremony stage sequencing and total duration: the stage table sums to the ~8000ms target,
  and every timer is cleared on unmount (the existing ceremony already guards this — the
  new stages must not regress it).
- Settle ceremony reaches its terminal state and fires its completion callback, including
  the longer assignment branch.
- Position sheet offers both actions and routes each to the right sheet.

**Verified visually, at 375×667, with screenshots or a screen recording delivered in chat:**
every animation in all four passes. Artifact links are unreliable on Andrew's phone.

**Performance:** the ceremonies must hold 60fps on the real device. Animate `transform` and
`opacity` only; no animated `width`, `height`, `top`, or `box-shadow` on anything running per
frame. The typebar's reduced strike rate exists for this reason.

## Risks

- **Eight seconds is long when you are catching up.** Andrew chose it, and chose full
  ceremony on backdated entries. If backfilling a missed week turns out to drag, the fix is
  his call, not a quiet exception — flag it after he has lived with it.
- **The tri-fold is the hardest thing here.** Three panels, per-panel shading, and travelling
  crease highlights in CSS 3D can read as cardboard rather than paper. This is the item most
  likely to need a second attempt, which is exactly why the passes are reviewed separately.
- **Grain can band or cost frames** on a retina phone. If it does either, it comes out — it
  is the least important item in the release.
- **Stagger plus slide can collide**: changing month while cards are still dealing in must
  not double-animate. The slide owns the transition; the deal-in runs on tab entry only.
