/** Shares no wheel is watching still have to appear somewhere.
 *
 *  The Portfolio hid every position whose symbol had an active wheel, and a wheel only
 *  counts trades dated on or after the day it opened. Own 100 GLD in June and declare the
 *  wheel in July and the shares fell through the gap: no row under Other holdings, and a
 *  wheel card reading nought shares, waiting on a put. Only the hero total still knew they
 *  were there.
 */
import { describe, expect, it } from 'vitest';
import { computeUnwheeledPositions } from '../positions';
import type { Mark, Trade, Wheel } from '../types';

const trade = (o: Partial<Trade>): Trade => ({
  id: 1, symbol: 'GLD', side: 'BUY', qty: 100, price: 50, fees: 0,
  executed_at: '2026-06-01', note: '', ...o,
});

const wheel = (o: Partial<Wheel>): Wheel => ({
  id: 9, symbol: 'GLD', no: 1, opened_at: '2026-07-01', closed_at: null, ...o,
});

const MARKS: Mark[] = [{ symbol: 'GLD', price: 60, marked_at: '2026-07-30T00:00:00Z', source: 'auto' }];

describe('computeUnwheeledPositions', () => {
  it('surfaces shares bought before the wheel was declared', () => {
    const out = computeUnwheeledPositions([trade({})], MARKS, [wheel({})]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: 'GLD', qty: 100, avgCost: 50, marketValue: 6000 });
  });

  it('leaves out shares the wheel is already showing', () => {
    const out = computeUnwheeledPositions([trade({ executed_at: '2026-07-05' })], MARKS, [wheel({})]);
    expect(out).toEqual([]);
  });

  it('splits a holding that straddles the day the wheel opened', () => {
    const out = computeUnwheeledPositions(
      [trade({ id: 1, executed_at: '2026-06-01', qty: 100, price: 50 }),
       trade({ id: 2, executed_at: '2026-07-05', qty: 100, price: 54 })],
      MARKS,
      [wheel({})],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: 'GLD', qty: 100, avgCost: 50 });
  });

  it('leaves a symbol with no wheel exactly as it was', () => {
    const out = computeUnwheeledPositions([trade({ symbol: 'NVDA' })], [], [wheel({})]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('NVDA');
  });

  it('hands shares back once the wheel that claimed them completes', () => {
    const held = [trade({ executed_at: '2026-07-05' })];
    const done = [wheel({ closed_at: '2026-07-20' })];
    expect(computeUnwheeledPositions(held, MARKS, done)).toHaveLength(1);
  });

  it('ignores a sell that closed the position out', () => {
    const out = computeUnwheeledPositions(
      [trade({ id: 1, executed_at: '2026-06-01' }),
       trade({ id: 2, executed_at: '2026-06-20', side: 'SELL', price: 55 })],
      MARKS,
      [wheel({})],
    );
    expect(out).toEqual([]);
  });
});
