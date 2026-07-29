import { describe, expect, it } from 'vitest';
import { optionDefaults } from '../optionEntry';
import type { OptionPosition, Trade, Wheel } from '../types';

const wheel = (id: number, symbol: string, opened_at = '2026-01-01', closed_at: string | null = null): Wheel =>
  ({ id, symbol, no: 1, opened_at, closed_at });

const buy = (id: number, symbol: string, qty: number, executed_at = '2026-02-01'): Trade =>
  ({ id, symbol, side: 'BUY', qty, price: 100, fees: 0, executed_at, note: '' });

const put = (id: number, symbol: string, opened_at = '2026-01-15'): OptionPosition =>
  ({ id, symbol, opt_type: 'PUT', strike: 100, expiration: '2026-02-01', contracts: 1, premium: 1,
     fees: 0, opened_at, note: '', status: 'ASSIGNED', closed_at: '2026-02-01', buyback_price: 0 } as OptionPosition);

describe('optionDefaults', () => {
  it('offers a put while the wheel is still waiting to be assigned', () => {
    const d = optionDefaults('TQQQ', [wheel(1, 'TQQQ')], [], []);
    expect(d).toEqual({ optType: 'PUT', contracts: null });
  });

  it('offers a covered call once the shares are held, one per hundred', () => {
    const d = optionDefaults('TQQQ', [wheel(1, 'TQQQ')], [buy(1, 'TQQQ', 400)], [put(1, 'TQQQ')]);
    expect(d?.optType).toBe('CALL');
    expect(d?.contracts).toBe(4);
  });

  it('rounds a partial lot down — 250 shares cover two calls, not three', () => {
    const d = optionDefaults('TQQQ', [wheel(1, 'TQQQ')], [buy(1, 'TQQQ', 250)], [put(1, 'TQQQ')]);
    expect(d?.contracts).toBe(2);
  });

  it('offers no count when the holding is under one lot', () => {
    // 60 shares cover nothing; a filled-in "0" would read as a decision.
    const d = optionDefaults('TQQQ', [wheel(1, 'TQQQ')], [buy(1, 'TQQQ', 60)], [put(1, 'TQQQ')]);
    expect(d?.optType).toBe('CALL');
    expect(d?.contracts).toBeNull();
  });

  it('says nothing about a symbol with no open wheel', () => {
    expect(optionDefaults('NVDA', [wheel(1, 'TQQQ')], [], [])).toBeNull();
  });

  it('ignores a wheel that has been closed', () => {
    expect(optionDefaults('TQQQ', [wheel(1, 'TQQQ', '2026-01-01', '2026-06-01')], [], [])).toBeNull();
  });

  it('matches the symbol whatever the case or spacing', () => {
    expect(optionDefaults(' tqqq ', [wheel(1, 'TQQQ')], [], [])?.optType).toBe('PUT');
  });

  it('says nothing for an empty symbol', () => {
    expect(optionDefaults('', [wheel(1, 'TQQQ')], [], [])).toBeNull();
    expect(optionDefaults('   ', [wheel(1, 'TQQQ')], [], [])).toBeNull();
  });
});
