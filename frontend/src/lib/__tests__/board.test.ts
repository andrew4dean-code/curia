import { describe, expect, it } from 'vitest';
import { fridaysOfMonth, monthScore, weekFridayFor } from '../board';
import type { OptionPosition } from '../types';

let nextId = 1;
function opt(p: Partial<OptionPosition>): OptionPosition {
  return {
    id: nextId++, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
    contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
    status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0,
    assigned_trade_id: null, ...p,
  };
}

describe('fridaysOfMonth', () => {
  it('lists a five-Friday month (May 2026)', () => {
    expect(fridaysOfMonth(2026, 5)).toEqual([
      '2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29',
    ]);
  });

  it('lists a four-Friday month (June 2026)', () => {
    expect(fridaysOfMonth(2026, 6)).toEqual([
      '2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26',
    ]);
  });
});

describe('weekFridayFor', () => {
  it('midweek maps forward to its Friday', () => {
    expect(weekFridayFor('2026-08-12')).toBe('2026-08-14'); // Wed → Fri
  });
  it('Friday maps to itself', () => {
    expect(weekFridayFor('2026-08-14')).toBe('2026-08-14');
  });
  it('Saturday maps one day BACK', () => {
    expect(weekFridayFor('2026-08-15')).toBe('2026-08-14');
  });
  it('Sunday maps two days back', () => {
    expect(weekFridayFor('2026-08-16')).toBe('2026-08-14');
  });
});

describe('monthScore', () => {
  it('sums settled-in-month P/L plus open-in-month collected, ignoring other months', () => {
    const rows = [
      opt({ status: 'EXPIRED', closed_at: '2026-08-01', expiration: '2026-08-01', premium: 0.74, fees: 1.3 }), // +146.7
      opt({ status: 'OPEN', expiration: '2026-08-14' }),                                                       // +148 collected
      opt({ status: 'EXPIRED', closed_at: '2026-07-25', expiration: '2026-07-25' }),                           // other month
      opt({ status: 'OPEN', expiration: '2026-09-04' }),                                                       // next month
    ];
    expect(monthScore(rows, 2026, 8)).toBeCloseTo(294.7);
    expect(monthScore([], 2026, 8)).toBe(0);
  });
});
