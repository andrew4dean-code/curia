import { groupBySymbol, openLots } from './fifo';
import { inWindow } from './wheelMath';
import type { Mark, OpenPosition, Trade, Wheel } from './types';

const EPS = 1e-9;

export function computeOpenPositions(trades: Trade[], marks: Mark[]): OpenPosition[] {
  const markBySymbol = new Map(marks.map((m) => [m.symbol, m]));
  const out: OpenPosition[] = [];
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const lots = openLots(ts);
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= EPS) continue;
    const avgCost = lots.reduce((s, l) => s + l.qty * l.price, 0) / qty;
    const mark = markBySymbol.get(symbol) ?? null;
    out.push({
      symbol,
      qty,
      avgCost,
      mark,
      marketValue: mark ? mark.price * qty : null,
      unrealizedPl: mark ? (mark.price - avgCost) * qty : null,
      unrealizedPlPct: mark && avgCost !== 0 ? ((mark.price - avgCost) / avgCost) * 100 : null,
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

/** What you hold that no running wheel is watching.
 *
 *  A wheel claims its symbol's trades from the day it opened, so shares bought before that
 *  belong to no wheel. The Portfolio used to hide a position outright once its symbol had a
 *  wheel, which meant those shares showed in neither place — the wheel card read nought,
 *  the holdings list had no row, and only the hero total still counted them.
 *
 *  Derived by dropping the trades a live wheel claims and re-running the ordinary FIFO over
 *  what is left, so the remainder is a real position with a real basis rather than a
 *  subtracted quantity. Where a sell crosses the boundary the two ledgers each consume
 *  their own oldest lot, so the wheel's count and this one need not sum to the account
 *  total; the hero figure reads the undivided trade list and stays right regardless.
 */
export function computeUnwheeledPositions(
  trades: Trade[],
  marks: Mark[],
  wheels: Wheel[],
): OpenPosition[] {
  const live = wheels.filter((w) => w.closed_at === null);
  return computeOpenPositions(
    trades.filter(
      (t) => !live.some((w) => w.symbol === t.symbol && inWindow(w, t.executed_at)),
    ),
    marks,
  );
}
