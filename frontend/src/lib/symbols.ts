import type { OptionPosition, Trade } from './types';

/** Symbols you have actually used, most recently used first.
 *
 *  The fresh-wheel sheet already offered these, but built with a bare Set over the trade
 *  list — which is insertion order, so the symbol you touched first sat at the front and
 *  the one you touched this morning sat at the back. On a list long enough to matter that
 *  is the wrong end. Ordered by date, then by id to break ties within a day, since two
 *  trades on one date carry no finer timestamp than the order they were entered in.
 */
export function recentSymbols(trades: Trade[], options: OptionPosition[], limit = 8): string[] {
  const used = [
    ...trades.map((t) => ({ symbol: t.symbol, on: t.executed_at, id: t.id })),
    ...options.map((o) => ({ symbol: o.symbol, on: o.opened_at, id: o.id })),
  ].sort((a, b) => b.on.localeCompare(a.on) || b.id - a.id);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of used) {
    const symbol = u.symbol.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    if (out.length >= limit) break;
  }
  return out;
}
