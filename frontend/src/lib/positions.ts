import { groupBySymbol, sortForFifo } from './fifo';
import type { Mark, OpenPosition, Trade } from './types';

const EPS = 1e-9;

export function computeOpenPositions(trades: Trade[], marks: Mark[]): OpenPosition[] {
  const markBySymbol = new Map(marks.map((m) => [m.symbol, m]));
  const out: OpenPosition[] = [];
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const lots: { qty: number; price: number }[] = [];
    for (const t of sortForFifo(ts)) {
      if (t.side === 'BUY') {
        lots.push({ qty: t.qty, price: t.price });
        continue;
      }
      let q = t.qty;
      while (q > EPS && lots.length) {
        const m = Math.min(q, lots[0].qty);
        q -= m;
        if (m >= lots[0].qty - EPS) lots.shift();
        else lots[0].qty -= m;
      }
    }
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
