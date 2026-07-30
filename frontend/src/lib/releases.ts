/** What shipped, newest first.
 *
 *  The head entry's version MUST match package.json — a test asserts it, because a
 *  version the app prints and a version the package declares that disagree is worse
 *  than showing no version at all. Bumping one without the other fails the suite.
 *
 *  Notes are written for the one person who reads them. Say what changed from the
 *  outside, not which file moved.
 */
export interface Release {
  version: string;
  /** ISO date, so it sorts and formats without a parser guessing at the order. */
  date: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '2.6.0',
    date: '2026-07-30',
    notes: [
      'A price you type now stays. The automatic quote pull used to write over it within the second, so a mark you set by hand was gone before you looked away. Curia leaves yours alone until you tap "Use the live price".',
      'Editing a trade no longer changes what it cost. Fixing a note used to restamp the fee at whatever Settings says today — including on the share fill an assignment books, which has no commission on purpose — and realized P/L and the tax set-aside moved with it. A recorded fee is history now. Correcting an option\'s contract count still scales its fee, at the rate it was booked at.',
      'Shares you already owned when you declared a wheel have a row again. A wheel only counts from its start date, so those shares were showing in neither the wheel card nor the holdings list, while still counting toward your book value.',
      'Every tap used to wait on a symbol-by-symbol trip to the quote feed. The figures land first now and prices catch up behind them, at most once a minute.',
      'A confirmation that spells its month out in capitals is read properly, and a contract dated to a day that does not exist is refused rather than quietly booked.',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-07-29',
    notes: [
      'Fees are finally counted. Set a worst-case figure per contract and per stock fill in Settings, and every new entry carries it — so your P/L understates rather than flatters.',
      'A set-aside line on the Ledger estimates tax on what you have realized this year, at a rate you set. Withdrawing does not change it: gains are taxable when realized, not when you take the cash out.',
      'Settings now live on the server, so they survive a reinstall, match on every device, and ride along in your backups.',
    ],
  },
  {
    version: '2.4.2',
    date: '2026-07-28',
    notes: ['Tapping the paste box no longer zooms the page in and pushes the sheet off the side of the screen.'],
  },
  {
    version: '2.4.1',
    date: '2026-07-28',
    notes: [
      'Pasting a fill of more than one contract works. Moomoo writes "were sold" rather than "was sold" when there is more than one, and Curia was only listening for the singular.',
      'A button that cannot be used now looks like it.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-07-28',
    notes: [
      'Paste a broker confirmation and Curia reads it — symbol, strike, expiry, contracts and price — then types the ticket out for you. A bought contract is understood as a buyback and goes to settle instead.',
      'Symbols you have traded before are one tap away on the trade and option sheets, newest first.',
      'Picking a symbol now sets put or call from the wheel it belongs to, and the contract count from the shares you hold.',
      'Engraved scrollwork draws itself into the corners of a wheel card while the hand travels, then dries away.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-07-28',
    notes: [
      'Figures no longer sit in oversized boxes — the width is measured from the number itself rather than guessed, so nothing floats away from the word beside it.',
      'Come back to a tab and the numbers count up to what changed while you were away, instead of already being right.',
      'Book an option that moves a wheel along and Curia takes you to it, so you watch the arm travel to the new stage.',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-07-28',
    notes: [
      'The wheel dial is redrawn: graduated chapter ring, engine-turned face, and the four stage names upright outside the bezel instead of rotated sideways.',
      'The hand now sweeps into position and leaves a fading trail behind it.',
      'More figures roll — the ledger totals, unrealized P/L and the wheel basis lines.',
      'This screen now tells you which Curia you are running.',
    ],
  },
  {
    version: '2.1.2',
    date: '2026-07-28',
    notes: ['The count winds up from rest and settles back down instead of starting at full speed.'],
  },
  {
    version: '2.1.1',
    date: '2026-07-28',
    notes: ['The count takes longer, so the figures roll rather than flick.'],
  },
  {
    version: '2.1.0',
    date: '2026-07-28',
    notes: ['Money counts up across the whole roll instead of snapping most of the way and creeping the rest.'],
  },
  {
    version: '2.0.0',
    date: '2026-07-25',
    notes: ['The Wheel: campaign cards, true basis, close-today totals, and the crest ceremony.'],
  },
];

export const CURRENT = RELEASES[0];
