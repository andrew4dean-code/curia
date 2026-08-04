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
    version: '2.8.2',
    date: '2026-08-04',
    notes: [
      'A price ticking while a ceremony was on screen no longer counts as something your entry changed. Curia pulls quotes in the background, and a ceremony runs for several seconds, so an edit that moved nothing could still throw you off the board because an unrelated symbol moved. It now watches what you hold and what it cost — the things only a booking can change.',
    ],
  },
  {
    version: '2.8.1',
    date: '2026-08-03',
    notes: [
      'Wheels stay open. They started folded and, worse, forgot whether you had opened one the moment you looked at another tab — so a card you opened was shut again every time you came back. Open is the default now, and if you do fold one it stays folded through a tab switch, a reload and tomorrow.',
      'The week number in the corner of each week is no longer cut off by the edge of its card.',
    ],
  },
  {
    version: '2.8.0',
    date: '2026-08-03',
    notes: [
      'Assignment has a new ceremony. It is not a verdict on a trade — it is a conversion — so instead of a word stamped across the page, what left and what arrived now cross each other, and the certificate is filed behind its sleeve rather than fading out on top of it. It takes 3.4 seconds instead of 6.4, and the figure is no longer printed through.',
      'The amount you kept is legible when a contract settles. The outcome word and the figure used to be laid over one another with nothing holding them apart, so on a short ticket the number was struck through by the word.',
      'The month board fits on one screen. Weeks with nothing in them are a line rather than a card, the premium sits in a column you can read down, and a settled contract now says how it settled — expired, bought back or assigned — where it only ever said "kept" before.',
      'Wheels start folded, showing the symbol, the week and what you would take closing today. Tap one to open the dial. Your book value is at the top of the Portfolio again instead of below two full screens of instrument. A wheel that just moved opens itself.',
      'The ＋ button no longer sits on top of the last row. At the bottom of the Portfolio and the Ledger it was covering the last holding\'s profit, and no amount of scrolling would move it.',
      'Every date reads the same way. The Ledger printed 2026-04-15 where the board said Apr 15, and the pair of them was long enough to wrap onto a second line.',
      'Logging a trade now leaves you on the Portfolio, watching the totals roll, instead of on whichever tab you started from. Settings gives Save the weight and Update now the outline, rather than the other way round.',
    ],
  },
  {
    version: '2.7.0',
    date: '2026-07-31',
    notes: [
      'The sell sheet now has an Expiration field. It still starts at the week you tapped, but a contract that runs longer — sold on a Friday, expiring the Friday after — can be booked as what it is instead of a same-day expiry.',
      'Editing an option can correct its expiration, so a contract booked to the wrong week is no longer stuck there.',
    ],
  },
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
