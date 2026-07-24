import { describe, expect, it } from 'vitest';
import { computeStats } from '../stats';
import type { ClosedTrade } from '../types';

function ct(realizedPl: number): ClosedTrade {
  return {
    symbol: 'X', qty: 1, buyPrice: 1, sellPrice: 1, realizedPl,
    realizedPlPct: 0, openedAt: '2026-01-01', closedAt: '2026-01-02',
    isWin: realizedPl > 0, fees: 0,
  };
}

describe('computeStats', () => {
  it('zeroed stats on empty input', () => {
    expect(computeStats([])).toEqual({
      winRate: 0, totalRealizedPl: 0, wins: 0, losses: 0, avgWin: 0,
      avgLoss: 0, expectancy: 0, bestTradePl: 0, worstTradePl: 0, closedCount: 0,
    });
  });

  it('computes win rate, averages, expectancy (matches old Python ledger)', () => {
    const s = computeStats([ct(100), ct(50), ct(-30)]);
    expect(s.closedCount).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo((2 / 3) * 100);
    expect(s.totalRealizedPl).toBeCloseTo(120);
    expect(s.avgWin).toBeCloseTo(75);
    expect(s.avgLoss).toBeCloseTo(-30);
    expect(s.expectancy).toBeCloseTo((2 / 3) * 75 + (1 / 3) * -30);
    expect(s.bestTradePl).toBe(100);
    expect(s.worstTradePl).toBe(-30);
  });

  it('breakeven (0) counts as a loss, same as the old app', () => {
    const s = computeStats([ct(0)]);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(1);
  });
});
