import type { ClosedTrade, Trade } from './types';

interface Lot { qty: number; price: number; openedAt: string; origQty: number; fee: number }

const EPS = 1e-9;

export function sortForFifo(trades: Trade[]): Trade[] {
  return [...trades].sort(
    (a, b) => a.executed_at.localeCompare(b.executed_at) || a.id - b.id,
  );
}

export function groupBySymbol(trades: Trade[]): Map<string, Trade[]> {
  const m = new Map<string, Trade[]>();
  for (const t of trades) {
    const arr = m.get(t.symbol);
    if (arr) arr.push(t);
    else m.set(t.symbol, [t]);
  }
  return m;
}

export function computeClosedTrades(trades: Trade[]): ClosedTrade[] {
  const closed: ClosedTrade[] = [];
  for (const [symbol, ts] of groupBySymbol(trades)) {
    const lots: Lot[] = [];
    for (const t of sortForFifo(ts)) {
      if (t.side === 'BUY') {
        lots.push({ qty: t.qty, price: t.price, openedAt: t.executed_at, origQty: t.qty, fee: t.fees });
        continue;
      }
      let q = t.qty;
      const sellQty = t.qty;
      while (q > EPS && lots.length) {
        const lot = lots[0];
        const m = Math.min(q, lot.qty);
        const gross = (t.price - lot.price) * m;
        const sellFeeShare = sellQty ? t.fees * (m / sellQty) : 0;
        const buyFeeShare = lot.origQty ? lot.fee * (m / lot.origQty) : 0;
        const fees = sellFeeShare + buyFeeShare;
        const realizedPl = gross - fees;
        const basis = lot.price * m;
        closed.push({
          symbol,
          qty: m,
          buyPrice: lot.price,
          sellPrice: t.price,
          realizedPl,
          realizedPlPct: basis !== 0 ? (realizedPl / basis) * 100 : 0,
          openedAt: lot.openedAt,
          closedAt: t.executed_at,
          isWin: realizedPl > 0,
          fees: Math.round(fees * 10000) / 10000,
        });
        q -= m;
        if (m >= lot.qty - EPS) lots.shift();
        else lot.qty -= m;
      }
      // leftover sell with no lots => short position: skipped by design
    }
  }
  closed.sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  return closed;
}
