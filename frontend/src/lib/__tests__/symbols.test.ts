import { describe, expect, it } from 'vitest';
import { recentSymbols } from '../symbols';
import type { OptionPosition, Trade } from '../types';

const trade = (id: number, symbol: string, executed_at: string): Trade => ({
  id, symbol, side: 'BUY', qty: 1, price: 1, fees: 0, executed_at, note: '',
});

const option = (id: number, symbol: string, opened_at: string): OptionPosition => ({
  id, symbol, opt_type: 'PUT', strike: 1, expiration: '2026-08-01', contracts: 1,
  premium: 1, fees: 0, opened_at, note: '', status: 'OPEN', closed_at: null, buyback_price: 0,
} as OptionPosition);

describe('recentSymbols', () => {
  it('puts the symbol you touched most recently first', () => {
    // The fresh-wheel sheet used to build this with a bare Set over the trade list, which
    // is insertion order — so the oldest symbol led and the one from this morning came
    // last. That is the wrong end of the list to surface.
    const trades = [trade(1, 'AAA', '2026-01-01'), trade(2, 'BBB', '2026-06-01')];
    expect(recentSymbols(trades, [])).toEqual(['BBB', 'AAA']);
  });

  it('draws on options as well as trades, interleaved by date', () => {
    const trades = [trade(1, 'AAA', '2026-01-01'), trade(2, 'CCC', '2026-05-01')];
    const options = [option(1, 'BBB', '2026-03-01')];
    expect(recentSymbols(trades, options)).toEqual(['CCC', 'BBB', 'AAA']);
  });

  it('lists a symbol once, at its most recent use', () => {
    const trades = [trade(1, 'AAA', '2026-01-01'), trade(2, 'BBB', '2026-02-01'), trade(3, 'AAA', '2026-09-01')];
    expect(recentSymbols(trades, [])).toEqual(['AAA', 'BBB']);
  });

  it('breaks a same-day tie by entry order, newest first', () => {
    // Dates carry no time, so two entries on one day are only ordered by the sequence
    // they were recorded in.
    const trades = [trade(1, 'AAA', '2026-04-01'), trade(2, 'BBB', '2026-04-01')];
    expect(recentSymbols(trades, [])).toEqual(['BBB', 'AAA']);
  });

  it('normalises case and whitespace, and drops blanks', () => {
    const trades = [trade(1, ' tqqq ', '2026-01-01'), trade(2, 'TQQQ', '2026-02-01'), trade(3, '  ', '2026-03-01')];
    expect(recentSymbols(trades, [])).toEqual(['TQQQ']);
  });

  it('caps the list so the row cannot swallow the sheet', () => {
    const trades = Array.from({ length: 30 }, (_, i) => trade(i, `S${i}`, '2026-01-01'));
    expect(recentSymbols(trades, [])).toHaveLength(8);
    expect(recentSymbols(trades, [], 3)).toHaveLength(3);
  });

  it('returns nothing when nothing has been traded', () => {
    expect(recentSymbols([], [])).toEqual([]);
  });
});
