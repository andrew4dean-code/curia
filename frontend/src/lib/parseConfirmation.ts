import type { OptionType } from './types';

/** What a broker confirmation yields, once read.
 *
 *  `side` matters: a confirmation for a contract you BOUGHT is a buyback closing a
 *  position, not a new sale, and filling the sell sheet with it would book the opposite
 *  of what happened. The caller decides what to do with that; the parser only reports it.
 */
export interface ParsedConfirmation {
  symbol: string;
  optType: OptionType;
  /** ISO yyyy-mm-dd, expanded from the contract's yymmdd. */
  expiration: string;
  strike: number;
  contracts: number;
  /** Per share, as brokers quote it. */
  premium: number;
  side: 'SOLD' | 'BOUGHT';
  /** ISO yyyy-mm-dd the fill happened, when the text carries one. */
  filledOn: string | null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** yymmdd as brokers write an option's expiry -> yyyy-mm-dd. Two-digit years are read as
 *  20xx: these are contracts, and none of them expire in the 1900s. */
function expandExpiry(yymmdd: string): string | null {
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (!(mm >= 1 && mm <= 12) || !(dd >= 1 && dd <= 31)) return null;
  return `${2000 + yy}-${pad(mm)}-${pad(dd)}`;
}

/** Read a pasted broker confirmation.
 *
 *  Written against Moomoo's wording:
 *    "Transaction Reminder: [Order Filled] 1 contract of $TQQQ 260724 70.00P$ was sold
 *     at 1.49 on Jul 21, 2026 12:30:16 ET . [Moomoo US]"
 *
 *  Matched loosely on purpose — the surrounding chrome ("Transaction Reminder", the
 *  bracketed status, the trailing broker tag) is decoration that varies, while the
 *  contract descriptor and the fill price are the parts that carry meaning. Anchoring on
 *  the whole sentence would break the day any of the decoration is reworded.
 *
 *  Returns null rather than a half-filled object: a partially understood confirmation
 *  that silently fills three fields out of six is worse than one that admits it failed.
 */
export function parseConfirmation(text: string): ParsedConfirmation | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, ' ').trim();

  // $TQQQ 260724 70.00P$  — symbol, yymmdd, strike, P|C
  const contract = /\$([A-Z][A-Z.]{0,9})\s+(\d{6})\s+(\d+(?:\.\d+)?)\s*([PC])\b/i.exec(s);
  if (!contract) return null;
  const expiration = expandExpiry(contract[2]);
  if (!expiration) return null;

  const strike = Number(contract[3]);
  if (!Number.isFinite(strike) || strike <= 0) return null;

  // "was sold at 1.49" / "was bought at 0.30"
  const fill = /\bwas\s+(sold|bought)\s+at\s+(\d+(?:\.\d+)?)/i.exec(s);
  if (!fill) return null;
  const premium = Number(fill[2]);
  if (!Number.isFinite(premium) || premium < 0) return null;

  // "1 contract of" / "3 contracts of". Absent, one contract is the only safe reading.
  const qty = /(\d+)\s+contracts?\b/i.exec(s);
  const contracts = qty ? Number(qty[1]) : 1;
  if (!Number.isInteger(contracts) || contracts < 1) return null;

  // "on Jul 21, 2026" — optional; the sheet falls back to today without it.
  let filledOn: string | null = null;
  const when = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (when) {
    const mm = MONTHS[when[1].toLowerCase()];
    const dd = Number(when[2]);
    if (mm && dd >= 1 && dd <= 31) filledOn = `${when[3]}-${mm}-${pad(dd)}`;
  }

  return {
    symbol: contract[1].toUpperCase(),
    optType: contract[4].toUpperCase() === 'P' ? 'PUT' : 'CALL',
    expiration,
    strike,
    contracts,
    premium,
    side: fill[1].toLowerCase() === 'sold' ? 'SOLD' : 'BOUGHT',
    filledOn,
  };
}
