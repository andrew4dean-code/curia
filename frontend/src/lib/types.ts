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

/** What an open covered call does to the figure.
 *
 *  A call you have sold is a promise to hand shares over at the strike. Valuing those
 *  shares at today's price while ALSO banking the whole premium counts the same money
 *  twice: above the strike you cannot both keep the stock's gain and keep the premium.
 *  Capping a covered share at its strike is arithmetically identical to buying the call
 *  back at intrinsic value, which is the other honest way to say the same thing.
 */
export interface WheelCap {
  /** Shares actually spoken for by open calls, never more than you hold. */
  coveredShares: number;
  /** Contracts with no shares behind them. Nonzero means the position is naked, and
   *  the cap below deliberately does not pretend to price that risk. */
  nakedContracts: number;
  /** What the cap costs at today's price: the money sitting above your strikes. Zero
   *  while every call is out of the money, which is most of the time — and while it is
   *  zero the capped figure equals the uncapped one. */
  giveUp: number;
  /** The strike doing the capping, or null when more than one distinct strike is in
   *  the money, because no single number names the ceiling then. */
  strike: number | null;
}

/** The other half of the same idea as WheelCap.
 *
 *  A sold put is a promise to BUY at the strike. Below it you are obliged to pay more
 *  than the shares are worth, and a wheel sitting on premium alone shows none of that —
 *  it reads as pure profit right up to the moment it becomes a position you are already
 *  down on. Unlike calls there is no scarcity to allocate: every put obliges you
 *  independently, so each one is priced on its own.
 */
export interface WheelPutExposure {
  /** Shares you would have to buy: 100 x contracts, across every open put. */
  shares: number;
  /** What assignment would cost you at today's price. Zero while every put is out of
   *  the money, and while it is zero the figure is untouched. */
  underwater: number;
  /** The strike you would be assigned at, or null when more than one is in the money. */
  strike: number | null;
}

export interface WheelSummary {
  wheel: Wheel;
  stage: WheelStage;
  sharesHeld: number;
  rawBasis: number | null;
  premiumBanked: number;
  trueBasis: number | null;
  /** Already net of `cap.giveUp` — the ceiling, not the uncapped share move. */
  closeToday: number;
  markMissing: boolean;
  callsSold: number;
  weeks: number;
  /** Null when nothing caps the figure: no open calls, no shares, or no price yet. */
  cap: WheelCap | null;
  /** Null when no put is sold, or there is no price yet. Independent of `cap`: a wheel
   *  can be holding shares under a call AND short a put at the same time. */
  putExposure: WheelPutExposure | null;
}
