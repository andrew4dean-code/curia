export type Side = 'BUY' | 'SELL';

export interface Trade {
  id: number;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  fees: number;
  executed_at: string; // YYYY-MM-DD
  note: string;
}

export interface Mark {
  symbol: string;
  price: number;
  marked_at: string; // ISO timestamp
  source: 'auto' | 'manual';
}

export interface ClosedTrade {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  realizedPl: number;
  realizedPlPct: number;
  openedAt: string; // YYYY-MM-DD
  closedAt: string; // YYYY-MM-DD
  isWin: boolean;
  fees: number;
}

export interface OpenPosition {
  symbol: string;
  qty: number;
  avgCost: number;
  mark: Mark | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
}

export interface Stats {
  winRate: number; // percent 0-100
  totalRealizedPl: number;
  wins: number;
  losses: number;
  avgWin: number;
  avgLoss: number; // negative or 0
  expectancy: number;
  bestTradePl: number;
  worstTradePl: number;
  closedCount: number;
}
