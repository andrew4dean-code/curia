import { describe, expect, it } from 'vitest';
import { canMarkQuiet, fridaysOfMonth, monthScore, slideDirection, weekFridayFor } from '../board';
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
  it('sums settled P/L plus open collected for the weeks the month renders', () => {
    // Sat Aug 1 belongs to the week ending Fri Jul 31, so the JULY board is what
    // renders it and July is what counts it.
    expect(weekFridayFor('2026-08-01')).toBe('2026-07-31');
    const rows = [
      opt({ status: 'EXPIRED', closed_at: '2026-08-01', expiration: '2026-08-01', premium: 0.74, fees: 1.3 }), // +146.7, July week
      opt({ status: 'OPEN', expiration: '2026-08-14' }),                                                       // +148 collected
      opt({ status: 'EXPIRED', closed_at: '2026-07-25', expiration: '2026-07-25' }),                           // +146.7, July week
      opt({ status: 'OPEN', expiration: '2026-09-04' }),                                                       // next month
    ];
    expect(monthScore(rows, 2026, 8)).toBeCloseTo(148);
    expect(monthScore(rows, 2026, 7)).toBeCloseTo(146.7 * 2);
    expect(monthScore([], 2026, 8)).toBe(0);
  });

  it('counts an option in the month whose board actually renders it', () => {
    // Jun 30 2026 is a Tuesday, so its week's Friday is Jul 3 and the JULY board
    // is what shows this row. The July total must therefore include it, and June
    // — which never renders it — must not.
    expect(weekFridayFor('2026-06-30')).toBe('2026-07-03');
    const rows = [
      opt({ status: 'EXPIRED', closed_at: '2026-06-30', expiration: '2026-06-30', premium: 0.74, fees: 1.3 }),
    ];
    expect(monthScore(rows, 2026, 7)).toBeCloseTo(146.7);
    expect(monthScore(rows, 2026, 6)).toBe(0);
  });
});

describe('canMarkQuiet', () => {
  // Thu Jul 23 2026 sits in the week of Fri Jul 24.
  it('allows this week and every week before it', () => {
    expect(canMarkQuiet('2026-07-24', '2026-07-23')).toBe(true); // this week
    expect(canMarkQuiet('2026-07-17', '2026-07-23')).toBe(true); // last week
    expect(canMarkQuiet('2026-06-26', '2026-07-23')).toBe(true); // a month back
  });

  it('refuses weeks that have not started', () => {
    expect(canMarkQuiet('2026-07-31', '2026-07-23')).toBe(false);
    expect(canMarkQuiet('2026-08-07', '2026-07-23')).toBe(false);
  });

  it('still allows this week when today is its Friday', () => {
    expect(canMarkQuiet('2026-07-24', '2026-07-24')).toBe(true);
  });
});

describe('slideDirection', () => {
  it('moves left going forward and right going back', () => {
    expect(slideDirection([2026, 7], [2026, 8])).toBe('left');
    expect(slideDirection([2026, 8], [2026, 7])).toBe('right');
  });

  it('handles the year boundary in both directions', () => {
    expect(slideDirection([2026, 12], [2027, 1])).toBe('left');
    expect(slideDirection([2027, 1], [2026, 12])).toBe('right');
  });
});
