import { describe, expect, it } from 'vitest';
import { computeOpenPositions } from '../positions';
import type { Mark, Trade } from '../types';

let nextId = 1;
function t(p: Partial<Trade> & Pick<Trade, 'symbol' | 'side' | 'qty' | 'price' | 'executed_at'>): Trade {
  return { id: nextId++, fees: 0, note: '', ...p };
}
const mark = (symbol: string, price: number): Mark => ({ symbol, price, marked_at: '2026-07-24T12:00:00Z', source: 'auto' });

describe('computeOpenPositions', () => {
  it('weighted average cost over remaining lots, fees excluded', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 5, executed_at: '2026-01-01' }),
        t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 120, executed_at: '2026-01-02' }),
        t({ symbol: 'AAPL', side: 'SELL', qty: 10, price: 130, executed_at: '2026-01-03' }),
      ],
      [mark('AAPL', 140)],
    );
    expect(pos).toHaveLength(1);
    expect(pos[0].qty).toBe(10);
    expect(pos[0].avgCost).toBeCloseTo(120); // first lot fully consumed by FIFO
    expect(pos[0].marketValue).toBeCloseTo(1400);
    expect(pos[0].unrealizedPl).toBeCloseTo(200);
    expect(pos[0].unrealizedPlPct).toBeCloseTo((20 / 120) * 100);
  });

  it('fully closed symbols disappear', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'TSLA', side: 'BUY', qty: 5, price: 200, executed_at: '2026-01-01' }),
        t({ symbol: 'TSLA', side: 'SELL', qty: 5, price: 210, executed_at: '2026-01-05' }),
      ],
      [],
    );
    expect(pos).toHaveLength(0);
  });

  it('no mark => null market fields, and output sorts by symbol', () => {
    const pos = computeOpenPositions(
      [
        t({ symbol: 'NVDA', side: 'BUY', qty: 2, price: 500, executed_at: '2026-01-01' }),
        t({ symbol: 'AMD', side: 'BUY', qty: 3, price: 100, executed_at: '2026-01-01' }),
      ],
      [mark('NVDA', 550)],
    );
    expect(pos.map((p) => p.symbol)).toEqual(['AMD', 'NVDA']);
    expect(pos[0].mark).toBeNull();
    expect(pos[0].unrealizedPl).toBeNull();
    expect(pos[1].unrealizedPl).toBeCloseTo(100);
  });
});
