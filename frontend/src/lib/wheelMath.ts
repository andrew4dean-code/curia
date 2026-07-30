import { computeClosedTrades, openLots } from './fifo';
import { optionRealizedPl, premiumCollected } from './optionsMath';
import type { Mark, OptionPosition, Trade, Wheel, WheelStage, WheelSummary } from './types';

const EPS = 1e-9;
const DAY_MS = 86_400_000;

// A wheel owns, for its symbol, records with opened_at <= record-date (<= closed_at).
// An open wheel (closed_at null) has no upper bound.
export function inWindow(w: Wheel, date: string): boolean {
  return w.opened_at <= date && (w.closed_at === null || date <= w.closed_at);
}

export function memberTrades(w: Wheel, trades: Trade[]): Trade[] {
  return trades.filter((t) => t.symbol === w.symbol && inWindow(w, t.executed_at));
}

export function memberOptions(w: Wheel, options: OptionPosition[]): OptionPosition[] {
  return options.filter((o) => o.symbol === w.symbol && inWindow(w, o.opened_at));
}


function sumPremiumBanked(options: OptionPosition[]): number {
  let sum = 0;
  for (const o of options) {
    sum += o.status === 'OPEN' ? premiumCollected(o) : (optionRealizedPl(o) ?? 0);
  }
  return sum;
}

// Whole weeks since opened_at (local calendar days), clamped to a minimum of 1.
function weeksSince(openedAt: string, today: Date): number {
  const [y, m, d] = openedAt.split('-').map(Number);
  const opened = new Date(y, m - 1, d);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((todayLocal.getTime() - opened.getTime()) / DAY_MS);
  return Math.max(1, Math.ceil(days / 7));
}

function deriveStage(
  w: Wheel,
  sharesHeld: number,
  memberTradeCount: number,
  memberOpts: OptionPosition[],
): WheelStage {
  if (w.closed_at !== null) return 'COMPLETED';
  const hasOpenPut = memberOpts.some((o) => o.opt_type === 'PUT' && o.status === 'OPEN');
  const hasOpenCall = memberOpts.some((o) => o.opt_type === 'CALL' && o.status === 'OPEN');
  if (sharesHeld <= EPS) {
    if (hasOpenPut) return 'SELL_PUT';
    // A wheel with no member history hasn't ridden the cycle — it's at the start,
    // not called away. Called-away means the campaign actually happened.
    if (memberTradeCount === 0 && memberOpts.length === 0) return 'SELL_PUT';
    return 'CALLED_AWAY';
  }
  return hasOpenCall ? 'SELLING_CALLS' : 'ASSIGNED';
}

export function summarizeWheel(
  w: Wheel,
  trades: Trade[],
  options: OptionPosition[],
  marks: Mark[],
): WheelSummary {
  const members = memberTrades(w, trades);
  const memberOpts = memberOptions(w, options);

  const lots = openLots(members);
  const sharesHeld = lots.reduce((s, l) => s + l.qty, 0);
  const rawBasis = sharesHeld > EPS
    ? lots.reduce((s, l) => s + l.qty * l.price, 0) / sharesHeld
    : null;

  const premiumBanked = sumPremiumBanked(memberOpts);
  const trueBasis = sharesHeld > EPS && rawBasis !== null
    ? rawBasis - premiumBanked / sharesHeld
    : null;

  const callsSold = memberOpts.filter((o) => o.opt_type === 'CALL').length;
  const weeks = weeksSince(w.opened_at, new Date());
  const stage = deriveStage(w, sharesHeld, members.length, memberOpts);

  let closeToday: number;
  let markMissing = false;
  if (stage === 'COMPLETED') {
    // All member options are settled by now (open ones still count their collected premium).
    const realizedPl = computeClosedTrades(members).reduce((s, c) => s + c.realizedPl, 0);
    closeToday = realizedPl + premiumBanked;
  } else if (sharesHeld > EPS) {
    const mark = marks.find((m) => m.symbol === w.symbol) ?? null;
    if (mark) {
      closeToday = (mark.price - (rawBasis as number)) * sharesHeld + premiumBanked;
    } else {
      markMissing = true;
      closeToday = premiumBanked; // share leg valued at rawBasis -> contributes 0
    }
  } else {
    closeToday = premiumBanked;
  }

  return {
    wheel: w,
    stage,
    sharesHeld,
    rawBasis,
    premiumBanked,
    trueBasis,
    closeToday,
    markMissing,
    callsSold,
    weeks,
  };
}

// Backfilling a record dated outside its wheel's window means the premium or
// shares silently never count toward it. Report the mismatch; never widen a
// wheel's window automatically — the window is Andrew's declaration, not ours.
export function wheelWindowNote(symbol: string, date: string, wheels: Wheel[]): string | null {
  const sym = symbol.trim().toUpperCase();
  const mine = wheels.filter((w) => w.symbol === sym);
  if (mine.length === 0) return null;
  if (mine.some((w) => inWindow(w, date))) return null;

  const before = mine
    .filter((w) => date < w.opened_at)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))[0];
  if (before) {
    return `This is before your ${sym} wheel started (${before.opened_at}) — it won't count toward it.`;
  }
  const after = mine
    .filter((w) => w.closed_at !== null && w.closed_at < date)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))[0];
  return after
    ? `This is after your ${sym} wheel completed (${after.closed_at}) — it won't count toward it.`
    : null;
}
