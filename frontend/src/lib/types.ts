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
  // id of the SELL trade whose FIFO consumption produced this row. Optional
  // so existing fixtures/tests that construct a ClosedTrade by hand still
  // type-check; computeClosedTrades always sets it.
  sellId?: number;
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

export type OptionType = 'CALL' | 'PUT';
export type OptionStatus = 'OPEN' | 'EXPIRED' | 'BOUGHT_BACK' | 'ASSIGNED';

export interface OptionPosition {
  id: number;
  symbol: string;
  opt_type: OptionType;
  strike: number;
  expiration: string; // YYYY-MM-DD
  contracts: number;
  premium: number; // per share
  fees: number;
  opened_at: string;
  note: string;
  status: OptionStatus;
  closed_at: string | null;
  buyback_price: number;
  close_fees: number;
  assigned_trade_id: number | null;
}

export type OptionDraft = Omit<
  OptionPosition,
  'id' | 'status' | 'closed_at' | 'buyback_price' | 'close_fees' | 'assigned_trade_id'
>;

export interface OptionStats {
  totalKept: number;
  winRate: number; // percent
  expiredCount: number;
  boughtBackCount: number;
  assignedCount: number;
  settledCount: number;
  avgTake: number;
}

export interface Wheel {
  id: number;
  symbol: string;
  no: number;
  opened_at: string; // YYYY-MM-DD
  closed_at: string | null; // YYYY-MM-DD
}

export type WheelStage = 'SELL_PUT' | 'ASSIGNED' | 'SELLING_CALLS' | 'CALLED_AWAY' | 'COMPLETED';

export interface WheelSummary {
  wheel: Wheel;
  stage: WheelStage;
  sharesHeld: number;
  rawBasis: number | null;
  premiumBanked: number;
  trueBasis: number | null;
  closeToday: number;
  markMissing: boolean;
  callsSold: number;
  weeks: number;
}
