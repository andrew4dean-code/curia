import { describe, expect, it } from 'vitest';
import { estimateTax } from '../tax';
import type { ClosedTrade, OptionPosition } from '../types';

const closed = (realizedPl: number, closedAt: string): ClosedTrade =>
  ({ symbol: 'TQQQ', qty: 100, buyPrice: 70, sellPrice: 71, realizedPl,
     realizedPlPct: 1, openedAt: '2026-01-01', closedAt, isWin: realizedPl > 0, fees: 0 } as ClosedTrade);

const opt = (over: Partial<OptionPosition> = {}): OptionPosition =>
  ({ id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 70, expiration: '2026-07-24', contracts: 1,
     premium: 1.5, fees: 0, opened_at: '2026-07-01', note: '', status: 'EXPIRED',
     closed_at: '2026-07-24', buyback_price: 0, close_fees: 0, ...over } as OptionPosition);

describe('estimateTax', () => {
  it('counts share gains and option premium realized in the year', () => {
    // $200 of share gain plus $150 of premium = $350, a quarter of which is $87.50.
    const e = estimateTax([closed(200, '2026-03-01')], [opt()], 25, 2026);
    expect(e.realized).toBe(350);
    expect(e.setAside).toBe(87.5);
  });

  it('ignores anything realized in another year', () => {
    // Tax is assessed per calendar year; last year's gains are already settled up.
    const e = estimateTax([closed(1000, '2025-12-31')], [opt({ closed_at: '2025-11-01' })], 25, 2026);
    expect(e.realized).toBe(0);
    expect(e.setAside).toBe(0);
  });

  it('ignores options still open — nothing has been realized yet', () => {
    const e = estimateTax([], [opt({ status: 'OPEN', closed_at: null })], 25, 2026);
    expect(e.realized).toBe(0);
  });

  it('owes nothing on a losing year, and never returns a negative', () => {
    // Curia will not invent a refund. Carrying losses forward is real tax work.
    const e = estimateTax([closed(-800, '2026-04-01')], [], 25, 2026);
    expect(e.realized).toBe(-800);
    expect(e.setAside).toBe(0);
  });

  it('nets a loss against a gain within the same year', () => {
    const e = estimateTax([closed(-200, '2026-04-01'), closed(600, '2026-05-01')], [], 30, 2026);
    expect(e.realized).toBe(400);
    expect(e.setAside).toBeCloseTo(120, 6);
  });

  it('subtracts the fees already booked against a position', () => {
    // The premium is $150; $3 of worst-case fees means $147 was actually realized.
    const e = estimateTax([], [opt({ fees: 3 })], 20, 2026);
    expect(e.realized).toBe(147);
  });

  it('estimates nothing at a zero rate, which is the untouched default', () => {
    expect(estimateTax([closed(500, '2026-02-02')], [], 0, 2026).setAside).toBe(0);
  });

  it('clamps a nonsense rate rather than trusting it', () => {
    expect(estimateTax([closed(100, '2026-02-02')], [], 400, 2026).setAside).toBe(100);
    expect(estimateTax([closed(100, '2026-02-02')], [], -50, 2026).setAside).toBe(0);
  });
});
