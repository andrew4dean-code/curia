import { describe, expect, it } from 'vitest';
import { computeClosedTrades } from '../fifo';
import type { Trade } from '../types';

let nextId = 1;
function t(p: Partial<Trade> & Pick<Trade, 'symbol' | 'side' | 'qty' | 'price' | 'executed_at'>): Trade {
  return { id: nextId++, fees: 0, note: '', ...p };
}

describe('computeClosedTrades', () => {
  it('matches a simple round trip', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, executed_at: '2026-01-05' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 10, price: 110, executed_at: '2026-02-01' }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      symbol: 'AAPL', qty: 10, buyPrice: 100, sellPrice: 110,
      realizedPl: 100, openedAt: '2026-01-05', closedAt: '2026-02-01', isWin: true,
    });
    expect(closed[0].realizedPlPct).toBeCloseTo(10);
  });

  it('one sell consuming two lots FIFO produces two closed trades', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 200, executed_at: '2026-01-01' }),
      t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 220, executed_at: '2026-01-10' }),
      t({ symbol: 'TSLA', side: 'SELL', qty: 8, price: 230, executed_at: '2026-01-20' }),
    ]);
    expect(closed).toHaveLength(2);
    expect(closed[0]).toMatchObject({ qty: 5, buyPrice: 200 });
    expect(closed[1]).toMatchObject({ qty: 3, buyPrice: 220 });
  });

  it('apportions buy and sell fees by matched quantity', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'NVDA', side: 'BUY', qty: 10, price: 100, fees: 2, executed_at: '2026-01-01' }),
      t({ symbol: 'NVDA', side: 'SELL', qty: 5, price: 120, fees: 1, executed_at: '2026-01-15' }),
    ]);
    // gross = 20*5 = 100; sell fee share = 1 * 5/5 = 1; buy fee share = 2 * 5/10 = 1
    expect(closed[0].realizedPl).toBeCloseTo(98);
    expect(closed[0].fees).toBeCloseTo(2);
  });

  it('a losing trade has isWin false and negative pct', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'MEME', side: 'BUY', qty: 4, price: 50, executed_at: '2026-03-01' }),
      t({ symbol: 'MEME', side: 'SELL', qty: 4, price: 40, executed_at: '2026-03-02' }),
    ]);
    expect(closed[0].isWin).toBe(false);
    expect(closed[0].realizedPl).toBeCloseTo(-40);
    expect(closed[0].realizedPlPct).toBeCloseTo(-20);
  });

  it('skips a sell with no open lots (short) and sorts output by closedAt', () => {
    const closed = computeClosedTrades([
      t({ symbol: 'GME', side: 'SELL', qty: 5, price: 20, executed_at: '2026-01-02' }),
      t({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10, executed_at: '2026-01-01' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 1, price: 12, executed_at: '2026-01-03' }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0].symbol).toBe('AAPL');
  });

  it('orders same-day trades by id', () => {
    const buyLate = t({ symbol: 'AMD', side: 'BUY', qty: 1, price: 90, executed_at: '2026-01-01' });
    const buyEarly = t({ symbol: 'AMD', side: 'BUY', qty: 1, price: 80, executed_at: '2026-01-01' });
    // ids ascend in creation order: buyLate.id < buyEarly.id, so buyLate lot is consumed first
    const closed = computeClosedTrades([
      buyEarly, buyLate,
      t({ symbol: 'AMD', side: 'SELL', qty: 1, price: 100, executed_at: '2026-01-02' }),
    ]);
    expect(closed[0].buyPrice).toBe(90);
  });

  it('matches a same-day sell even when entered before its buy', () => {
    const sellFirst = t({ symbol: 'INTC', side: 'SELL', qty: 5, price: 30, executed_at: '2026-05-01' });
    const buyAfter = t({ symbol: 'INTC', side: 'BUY', qty: 5, price: 25, executed_at: '2026-05-01' });
    const closed = computeClosedTrades([sellFirst, buyAfter]);
    expect(closed).toHaveLength(1);
    expect(closed[0].realizedPl).toBeCloseTo(25);
  });
});
