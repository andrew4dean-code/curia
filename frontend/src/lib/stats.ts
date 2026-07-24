import type { ClosedTrade, Stats } from './types';

export function computeStats(closed: ClosedTrade[]): Stats {
  if (!closed.length) {
    return {
      winRate: 0, totalRealizedPl: 0, wins: 0, losses: 0, avgWin: 0,
      avgLoss: 0, expectancy: 0, bestTradePl: 0, worstTradePl: 0, closedCount: 0,
    };
  }
  const pls = closed.map((t) => t.realizedPl);
  const winsPl = closed.filter((t) => t.isWin).map((t) => t.realizedPl);
  const lossesPl = closed.filter((t) => !t.isWin).map((t) => t.realizedPl);
  const closedCount = closed.length;
  const wins = winsPl.length;
  const losses = lossesPl.length;
  const avgWin = wins ? winsPl.reduce((a, b) => a + b, 0) / wins : 0;
  const avgLoss = losses ? lossesPl.reduce((a, b) => a + b, 0) / losses : 0;
  return {
    winRate: (wins / closedCount) * 100,
    totalRealizedPl: pls.reduce((a, b) => a + b, 0),
    wins,
    losses,
    avgWin,
    avgLoss,
    expectancy: (wins / closedCount) * avgWin + (losses / closedCount) * avgLoss,
    bestTradePl: Math.max(...pls),
    worstTradePl: Math.min(...pls),
    closedCount,
  };
}
