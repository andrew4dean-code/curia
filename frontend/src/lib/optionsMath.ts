import type { OptionPosition, OptionStats } from './types';

export function premiumCollected(o: OptionPosition): number {
  return o.premium * 100 * o.contracts;
}

export function optionRealizedPl(o: OptionPosition): number | null {
  switch (o.status) {
    case 'OPEN':
      return null;
    case 'EXPIRED':
    case 'ASSIGNED':
      return premiumCollected(o) - o.fees;
    case 'BOUGHT_BACK':
      return (o.premium - o.buyback_price) * 100 * o.contracts - o.fees - o.close_fees;
  }
}

export function computeOptionStats(options: OptionPosition[]): OptionStats {
  const settled = options.filter((o) => o.status !== 'OPEN');
  if (!settled.length) {
    return {
      totalKept: 0, winRate: 0, expiredCount: 0, boughtBackCount: 0,
      assignedCount: 0, settledCount: 0, avgTake: 0,
    };
  }
  const pls = settled.map((o) => optionRealizedPl(o) ?? 0);
  const wins = pls.filter((p) => p > 0).length;
  const totalKept = pls.reduce((a, b) => a + b, 0);
  return {
    totalKept,
    winRate: (wins / settled.length) * 100,
    expiredCount: settled.filter((o) => o.status === 'EXPIRED').length,
    boughtBackCount: settled.filter((o) => o.status === 'BOUGHT_BACK').length,
    assignedCount: settled.filter((o) => o.status === 'ASSIGNED').length,
    settledCount: settled.length,
    avgTake: totalKept / settled.length,
  };
}
