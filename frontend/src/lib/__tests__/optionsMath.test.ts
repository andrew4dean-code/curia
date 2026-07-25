import { describe, expect, it } from 'vitest';
import { computeOptionStats, optionRealizedPl, premiumCollected } from '../optionsMath';
import type { OptionPosition } from '../types';

let nextId = 1;
function opt(p: Partial<OptionPosition>): OptionPosition {
  return {
    id: nextId++, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-31',
    contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-24', note: '',
    status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0,
    assigned_trade_id: null, ...p,
  };
}

describe('optionsMath', () => {
  it('collected = premium x 100 x contracts', () => {
    expect(premiumCollected(opt({}))).toBeCloseTo(148);
  });

  it('open options have no realized P/L yet', () => {
    expect(optionRealizedPl(opt({}))).toBeNull();
  });

  it('expired keeps everything minus fees', () => {
    expect(optionRealizedPl(opt({ status: 'EXPIRED' }))).toBeCloseTo(146.7);
  });

  it('bought back nets premium minus buyback minus both fees', () => {
    const o = opt({ status: 'BOUGHT_BACK', buyback_price: 0.21, close_fees: 1 });
    // (0.74 - 0.21) * 200 - 1.3 - 1 = 106 - 2.3
    expect(optionRealizedPl(o)).toBeCloseTo(103.7);
  });

  it('assigned keeps the premium; share economics live in the stock ledger', () => {
    expect(optionRealizedPl(opt({ status: 'ASSIGNED' }))).toBeCloseTo(146.7);
  });

  it('stats aggregate settled options only, zeros when none', () => {
    expect(computeOptionStats([opt({})])).toEqual({
      totalKept: 0, winRate: 0, expiredCount: 0, boughtBackCount: 0,
      assignedCount: 0, settledCount: 0, avgTake: 0,
    });
    const s = computeOptionStats([
      opt({ status: 'EXPIRED' }),                                          // +146.7
      opt({ status: 'BOUGHT_BACK', buyback_price: 0.9, close_fees: 0 }),   // (0.74-0.9)*200-1.3 = -33.3
      opt({ status: 'ASSIGNED' }),                                         // +146.7
      opt({}),                                                             // open, ignored
    ]);
    expect(s.settledCount).toBe(3);
    expect(s.expiredCount).toBe(1);
    expect(s.boughtBackCount).toBe(1);
    expect(s.assignedCount).toBe(1);
    expect(s.totalKept).toBeCloseTo(260.1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100);
    expect(s.avgTake).toBeCloseTo(86.7);
  });
});
