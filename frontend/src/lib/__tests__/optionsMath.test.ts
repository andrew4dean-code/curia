import { describe, expect, it } from 'vitest';
import { computeOptionStats, needsSettling, optionRealizedPl, premiumCollected } from '../optionsMath';
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

describe('needsSettling', () => {
  const base: OptionPosition = {
    id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
    contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
    status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
  };
  const open = { ...base, status: 'OPEN' as const, expiration: '2026-07-17' };

  it('marks an open option whose expiration has passed', () => {
    expect(needsSettling(open, '2026-07-23')).toBe(true);
  });

  it('leaves an option expiring today alone', () => {
    expect(needsSettling(open, '2026-07-17')).toBe(false);
  });

  it('leaves a live option alone', () => {
    expect(needsSettling({ ...open, expiration: '2026-07-31' }, '2026-07-23')).toBe(false);
  });

  it('never marks an option that is already settled', () => {
    expect(needsSettling({ ...open, status: 'EXPIRED', closed_at: '2026-07-17' }, '2026-07-23')).toBe(false);
  });
});
