import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memberOptions, memberTrades, summarizeWheel, wheelWindowNote } from '../wheelMath';
import type { Mark, OptionPosition, Trade, Wheel } from '../types';

let nextTradeId = 1;
function t(p: Partial<Trade> & Pick<Trade, 'symbol' | 'side' | 'qty' | 'price' | 'executed_at'>): Trade {
  return { id: nextTradeId++, fees: 0, note: '', ...p };
}

let nextOptId = 1;
function opt(p: Partial<OptionPosition> & Pick<OptionPosition, 'symbol' | 'opt_type' | 'opened_at'>): OptionPosition {
  return {
    id: nextOptId++, strike: 0, expiration: '2026-12-31', contracts: 1, premium: 0,
    fees: 0, note: '', status: 'OPEN', closed_at: null, buyback_price: 0,
    close_fees: 0, assigned_trade_id: null, ...p,
  };
}

function wheel(p: Partial<Wheel> & Pick<Wheel, 'symbol' | 'opened_at'>): Wheel {
  return { id: 1, no: 1, closed_at: null, ...p };
}

function mark(symbol: string, price: number): Mark {
  return { symbol, price, marked_at: '2026-07-25T10:00:00.000Z', source: 'auto' };
}

// All tests pinned to Sat 2026-07-25, 10:00 local ("today" for weeks/closeToday).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 25, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('memberTrades', () => {
  it('excludes a trade before the open wheel opened_at, includes on-open and inside', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-10' }); // open wheel, closed_at null
    const before = t({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-09' });
    const onOpen = t({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-10' });
    const inside = t({ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-15' });
    const otherSymbol = t({ symbol: 'MSFT', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-12' });
    expect(memberTrades(w, [before, onOpen, inside, otherSymbol])).toEqual([onOpen, inside]);
  });

  it('caps membership at closed_at for a closed wheel and excludes anything after', () => {
    const w = wheel({ symbol: 'TSLA', opened_at: '2026-07-01', closed_at: '2026-07-20' });
    const beforeOpen = t({ symbol: 'TSLA', side: 'BUY', qty: 1, price: 10, executed_at: '2026-06-30' });
    const onOpen = t({ symbol: 'TSLA', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-01' });
    const inside = t({ symbol: 'TSLA', side: 'SELL', qty: 1, price: 10, executed_at: '2026-07-15' });
    const onClose = t({ symbol: 'TSLA', side: 'SELL', qty: 1, price: 10, executed_at: '2026-07-20' });
    const afterClose = t({ symbol: 'TSLA', side: 'BUY', qty: 1, price: 10, executed_at: '2026-07-21' });
    expect(memberTrades(w, [beforeOpen, onOpen, inside, onClose, afterClose])).toEqual([onOpen, inside, onClose]);
  });
});

describe('memberOptions', () => {
  it('applies the same opened_at window and symbol filter as trades', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01', closed_at: '2026-07-20' });
    const before = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-06-30' });
    const onOpen = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-01' });
    const inside = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10' });
    const onClose = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-20' });
    const afterClose = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-21' });
    const otherSymbol = opt({ symbol: 'MSFT', opt_type: 'PUT', opened_at: '2026-07-05' });
    expect(memberOptions(w, [before, onOpen, inside, onClose, afterClose, otherSymbol]))
      .toEqual([onOpen, inside, onClose]);
  });
});

describe('rawBasis via FIFO within the membership window', () => {
  it('excludes fees and ignores a cheaper pre-window lot', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [
      // pre-window: must NOT enter the FIFO chain, else the sell below would
      // consume this cheap lot first and change both sharesHeld and rawBasis.
      t({ symbol: 'AAPL', side: 'BUY', qty: 50, price: 40, executed_at: '2026-06-25' }),
      t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, fees: 5, executed_at: '2026-07-01' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 40, price: 55, fees: 2, executed_at: '2026-07-10' }),
    ];
    const s = summarizeWheel(w, trades, [], []);
    // FIFO on member trades only: lot 100@50, sell 40 -> 60 sh remain @ 50.
    // fees (5 on the buy, 2 on the sell) never touch price-based basis.
    expect(s.sharesHeld).toBe(60);
    expect(s.rawBasis).toBeCloseTo(50);
  });
});

describe('premiumBanked', () => {
  it('sums settled + open member options and excludes non-members', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const openPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-05', premium: 1.0, contracts: 1, status: 'OPEN' });
    const settledCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-02', premium: 0.5, contracts: 2, fees: 1, status: 'EXPIRED' });
    const wrongSymbol = opt({ symbol: 'MSFT', opt_type: 'CALL', opened_at: '2026-07-05', premium: 5, contracts: 1, status: 'OPEN' });
    const beforeWindow = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-06-20', premium: 2, contracts: 1, status: 'EXPIRED' });
    const s = summarizeWheel(w, [], [openPut, settledCall, wrongSymbol, beforeWindow], []);
    // open PUT: premiumCollected = 1.00 * 100 * 1 = 100
    // settled CALL: (0.50 * 100 * 2) - fees 1 = 100 - 1 = 99
    // total = 100 + 99 = 199 (wrongSymbol and beforeWindow excluded)
    expect(s.premiumBanked).toBeCloseTo(199);
    expect(s.stage).toBe('SELL_PUT'); // no shares + an open member PUT
  });
});

describe('trueBasis', () => {
  it('is null when the wheel is flat, even with banked premium', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [
      t({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 50, executed_at: '2026-07-01' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 10, price: 60, executed_at: '2026-07-10' }),
    ];
    const openPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-05', premium: 0.5, contracts: 1, status: 'OPEN' });
    const s = summarizeWheel(w, trades, [openPut], []);
    expect(s.sharesHeld).toBe(0);
    expect(s.rawBasis).toBeNull();
    expect(s.trueBasis).toBeNull(); // rawBasis is null when sharesHeld is 0
  });
});

describe('closeToday', () => {
  // Shared SELLING_CALLS fixture: 100 sh assigned @ 50 (fees excluded from basis),
  // a settled member PUT and an open member CALL banking premium.
  function sellingCallsFixture() {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, fees: 5, executed_at: '2026-07-01' })];
    const settledPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-01', premium: 1.0, contracts: 1, fees: 2, status: 'ASSIGNED' });
    // strike 55 is deliberate: the mark below is 53, so this call is out of the money and
    // caps nothing, which is what these two cases were always testing. It used to carry
    // the opt() default of strike 0 — a call to hand 100 shares over for nothing — and
    // once an open call actually constrains the figure, that fixture stops meaning what
    // it says.
    const openCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-15', strike: 55, premium: 0.8, contracts: 1, status: 'OPEN' });
    return { w, trades, options: [settledPut, openCall] };
  }
  // premiumBanked = ASSIGNED put (1.00*100*1 - fees 2 = 98) + open call (0.80*100*1 = 80) = 178
  // rawBasis = 50 (single lot, fee-excluded), sharesHeld = 100
  // trueBasis = 50 - 178/100 = 50 - 1.78 = 48.22

  it('uses the mark when one exists: (mark - rawBasis) * sharesHeld + premiumBanked', () => {
    const { w, trades, options } = sellingCallsFixture();
    const s = summarizeWheel(w, trades, options, [mark('AAPL', 53)]);
    expect(s.stage).toBe('SELLING_CALLS');
    expect(s.trueBasis).toBeCloseTo(48.22);
    // (53 - 50) * 100 + 178 = 300 + 178 = 478
    expect(s.closeToday).toBeCloseTo(478);
    expect(s.markMissing).toBe(false);
  });

  it('falls back to the raw basis (zero share leg) when no mark exists', () => {
    const { w, trades, options } = sellingCallsFixture();
    const s = summarizeWheel(w, trades, options, []); // no mark for AAPL
    // share leg valued at rawBasis => (rawBasis - rawBasis) * 100 = 0, so closeToday = premiumBanked = 178
    expect(s.closeToday).toBeCloseTo(178);
    expect(s.markMissing).toBe(true);
    expect(s.cap).toBeNull(); // no price, so nothing can be said about a ceiling
  });
});

/* A sold call is a promise to deliver shares at the strike. Valuing those shares at
   today's price while also banking the whole premium spends the same money twice, and
   the figure only lies once the stock is above the strike — which is exactly when you
   would be looking at it. Every case here fixes the raw basis at 50 and varies only the
   strike, the contract count and the price. */
describe('the ceiling an open call puts on the figure', () => {
  function sellingCalls(
    shares: number,
    calls: { strike: number; contracts: number }[],
    price: number | null,
  ) {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: shares, price: 50, executed_at: '2026-07-01' })];
    // premium 1.00/share throughout, so premiumBanked is just 100 x total contracts.
    const options = calls.map((c) =>
      opt({
        symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10',
        strike: c.strike, contracts: c.contracts, premium: 1.0, status: 'OPEN',
      }),
    );
    return summarizeWheel(w, trades, options, price === null ? [] : [mark('AAPL', price)]);
  }

  it('costs nothing while the call is out of the money', () => {
    // 200 sh, 2 contracts @ 60, price 55. The call expires, the shares stay yours.
    const s = sellingCalls(200, [{ strike: 60, contracts: 2 }], 55);
    // (55 - 50) * 200 + 200 premium = 1200, uncapped, because the ceiling is above the price
    expect(s.closeToday).toBeCloseTo(1200);
    expect(s.cap!.giveUp).toBe(0);
    expect(s.cap!.coveredShares).toBe(200);
    expect(s.cap!.strike).toBeNull(); // nothing in the money to name
  });

  it('caps the shares at the strike once the price passes it', () => {
    // 200 sh, 2 contracts @ 60, price 65.
    const s = sellingCalls(200, [{ strike: 60, contracts: 2 }], 65);
    // Uncapped this reads (65 - 50) * 200 + 200 = 3200, which you cannot collect: the
    // shares go at 60. Called away: (60 - 50) * 200 + 200 premium = 2200.
    expect(s.closeToday).toBeCloseTo(2200);
    expect(s.cap!.giveUp).toBeCloseTo(1000); // (65 - 60) * 200, the money above the strike
    expect(s.cap!.strike).toBe(60);
  });

  it('caps only the shares actually covered, leaving the rest at the market', () => {
    // 500 sh but only 3 contracts sold: 300 are spoken for, 200 are free to run.
    const s = sellingCalls(500, [{ strike: 60, contracts: 3 }], 65);
    // 300 called at 60 = 3000, 200 free at 65 = 3000, + 300 premium = 6300
    expect(s.closeToday).toBeCloseTo(6300);
    expect(s.cap!.coveredShares).toBe(300);
    expect(s.cap!.giveUp).toBeCloseTo(1500); // (65 - 60) * 300 only
    expect(s.cap!.nakedContracts).toBe(0);
  });

  it('sums the give-up across two strikes and names neither when both are in the money', () => {
    const s = sellingCalls(200, [{ strike: 55, contracts: 1 }, { strike: 60, contracts: 1 }], 65);
    // 100 called at 55 = 500, 100 called at 60 = 1000, + 200 premium = 1700
    expect(s.closeToday).toBeCloseTo(1700);
    expect(s.cap!.giveUp).toBeCloseTo(1500); // (65-55)*100 + (65-60)*100
    // No single figure is the ceiling here, so the card must not print one.
    expect(s.cap!.strike).toBeNull();
  });

  it('names the one strike that is in the money when the other is not', () => {
    const s = sellingCalls(200, [{ strike: 55, contracts: 1 }, { strike: 80, contracts: 1 }], 60);
    // (60 - 50) * 200 + 200 = 2200 uncapped, less (60 - 55) * 100 for the 55s only
    expect(s.closeToday).toBeCloseTo(1700);
    expect(s.cap!.giveUp).toBeCloseTo(500);
    expect(s.cap!.strike).toBe(55);
  });

  it('answers the lowest strike first, because that is the tightest promise', () => {
    // 100 shares against two contracts: only one can be covered. The 55 binds, not the 80.
    const s = sellingCalls(100, [{ strike: 80, contracts: 1 }, { strike: 55, contracts: 1 }], 65);
    expect(s.cap!.strike).toBe(55);
    expect(s.cap!.coveredShares).toBe(100);
    expect(s.cap!.giveUp).toBeCloseTo(1000); // (65 - 55) * 100
    // (65 - 50) * 100 + 200 premium = 1700, less 1000
    expect(s.closeToday).toBeCloseTo(700);
  });

  it('reports contracts with no shares behind them instead of capping shares you do not hold', () => {
    // 3 contracts against 100 shares: 2 of them are naked, and no ceiling can be
    // computed for stock that is not there.
    const s = sellingCalls(100, [{ strike: 55, contracts: 3 }], 65);
    expect(s.cap!.coveredShares).toBe(100);
    expect(s.cap!.nakedContracts).toBe(2);
    expect(s.cap!.giveUp).toBeCloseTo(1000); // (65 - 55) * 100, not * 300
    // (65 - 50) * 100 + 300 premium = 1800, less 1000
    expect(s.closeToday).toBeCloseTo(800);
  });

  it('is not capped by a call that has already settled', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-01' })];
    const settled = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10', strike: 55, contracts: 1, premium: 1, status: 'EXPIRED' });
    const s = summarizeWheel(w, trades, [settled], [mark('AAPL', 65)]);
    expect(s.cap).toBeNull(); // the promise is discharged; the shares are unencumbered
    expect(s.closeToday).toBeCloseTo(1600); // (65 - 50) * 100 + 100 premium
  });

  it('is not capped by an open put', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-01' })];
    const put = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-10', strike: 55, contracts: 1, premium: 1, status: 'OPEN' });
    const s = summarizeWheel(w, trades, [put], [mark('AAPL', 65)]);
    expect(s.cap).toBeNull(); // a short put obliges you to BUY; it puts no lid on shares held
  });

  it('has no ceiling to report on a flat wheel', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const openCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10', strike: 55, contracts: 1, premium: 1, status: 'OPEN' });
    const s = summarizeWheel(w, [], [openCall], [mark('AAPL', 65)]);
    expect(s.sharesHeld).toBe(0);
    expect(s.cap).toBeNull();
  });
});

/* The mirror of the ceiling. A sold put is a promise to BUY at the strike, so below it
   the banked premium is paying for shares you are already down on — and a flat wheel
   showing premium alone reads as clean profit the whole way down. */
describe('the obligation an open put puts on the figure', () => {
  function sellingPuts(puts: { strike: number; contracts: number }[], price: number | null) {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    // premium 2.00/share, so premiumBanked is 200 x total contracts.
    const options = puts.map((p) =>
      opt({
        symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-10',
        strike: p.strike, contracts: p.contracts, premium: 2.0, status: 'OPEN',
      }),
    );
    return summarizeWheel(w, [], options, price === null ? [] : [mark('AAPL', price)]);
  }

  it('costs nothing while the put is out of the money', () => {
    const s = sellingPuts([{ strike: 50, contracts: 1 }], 55);
    expect(s.closeToday).toBeCloseTo(200); // the premium, clean
    expect(s.putExposure!.underwater).toBe(0);
    expect(s.putExposure!.shares).toBe(100);
    expect(s.putExposure!.strike).toBeNull();
  });

  it('eats into the banked premium once the stock falls through the strike', () => {
    // Sold a 50 put for $2.00, stock now 48. Assigned, you pay 50 for something worth 48.
    const s = sellingPuts([{ strike: 50, contracts: 1 }], 48);
    // 200 premium less (50 - 48) * 100 = 200 -> exactly flat, which is the point of the
    // figure: the premium has been entirely consumed by where the stock went.
    expect(s.closeToday).toBeCloseTo(0);
    expect(s.putExposure!.underwater).toBeCloseTo(200);
    expect(s.putExposure!.strike).toBe(50);
  });

  it('goes negative when the fall is bigger than the premium', () => {
    const s = sellingPuts([{ strike: 50, contracts: 1 }], 44);
    // 200 premium less (50 - 44) * 100 = 600 -> -400
    expect(s.closeToday).toBeCloseTo(-400);
    expect(s.putExposure!.underwater).toBeCloseTo(600);
  });

  it('obliges every put on its own, with no shares to share out between them', () => {
    // Both are in the money and both must be honoured: 100 sh at 50 AND 200 sh at 55.
    const s = sellingPuts([{ strike: 50, contracts: 1 }, { strike: 55, contracts: 2 }], 48);
    expect(s.putExposure!.shares).toBe(300);
    // (50-48)*100 + (55-48)*200 = 200 + 1400 = 1600
    expect(s.putExposure!.underwater).toBeCloseTo(1600);
    expect(s.putExposure!.strike).toBeNull(); // two strikes in the money, name neither
    expect(s.closeToday).toBeCloseTo(600 - 1600); // premium 3 contracts x 200 = 600
  });

  it('counts only the put that is in the money when the other is not', () => {
    const s = sellingPuts([{ strike: 50, contracts: 1 }, { strike: 40, contracts: 1 }], 48);
    expect(s.putExposure!.underwater).toBeCloseTo(200); // the 40 expires worthless
    expect(s.putExposure!.strike).toBe(50);
  });

  it('says nothing without a price', () => {
    const s = sellingPuts([{ strike: 50, contracts: 1 }], null);
    expect(s.putExposure).toBeNull();
    expect(s.closeToday).toBeCloseTo(200); // unchanged, not guessed at
  });

  it('still obliges you while you are holding shares under a call', () => {
    // Shares AND a short put at once: the two are independent, and both bite.
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-01' })];
    const call = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10', strike: 60, contracts: 1, premium: 1, status: 'OPEN' });
    const put = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-10', strike: 70, contracts: 1, premium: 1, status: 'OPEN' });
    const s = summarizeWheel(w, trades, [call, put], [mark('AAPL', 65)]);
    // shares: capped at the 60 call -> (60-50)*100 = 1000; premium 100 + 100 = 200
    // put at 70 with the stock at 65 is in the money -> (70-65)*100 = 500 owed
    expect(s.cap!.giveUp).toBeCloseTo(500);
    expect(s.putExposure!.underwater).toBeCloseTo(500);
    expect(s.closeToday).toBeCloseTo(1000 + 200 - 500);
  });

  it('is not obliged by a put that has already settled', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    // An assigned put is discharged: it produced the shares, it no longer obliges you.
    const settled = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-10', strike: 50, contracts: 1, premium: 2, fees: 0, status: 'EXPIRED' });
    const s = summarizeWheel(w, [], [settled], [mark('AAPL', 44)]);
    expect(s.putExposure).toBeNull();
    expect(s.closeToday).toBeCloseTo(200); // kept in full, however far the stock fell after
  });
});

describe('callsSold', () => {
  it('counts member CALL options regardless of status, ignores PUTs and non-members', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const openCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-05', status: 'OPEN' });
    const boughtBackCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-12', status: 'BOUGHT_BACK', buyback_price: 0.1 });
    const settledPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-02', status: 'EXPIRED' });
    const nonMemberCall = opt({ symbol: 'MSFT', opt_type: 'CALL', opened_at: '2026-07-05', status: 'OPEN' });
    const beforeWindowCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-06-01', status: 'OPEN' });
    const s = summarizeWheel(w, [], [openCall, boughtBackCall, settledPut, nonMemberCall, beforeWindowCall], []);
    expect(s.callsSold).toBe(2);
  });
});

describe('weeks', () => {
  it('is whole weeks since opened_at, clamped to a minimum of 1', () => {
    // today pinned to 2026-07-25
    const cases: [string, number][] = [
      ['2026-07-25', 1], // 0 days -> ceil(0/7)=0 -> clamped to 1
      ['2026-07-18', 1], // 7 days -> ceil(7/7)=1
      ['2026-07-17', 2], // 8 days -> ceil(8/7)=2
      ['2026-07-01', 4], // 24 days -> ceil(24/7)=4
    ];
    for (const [openedAt, expected] of cases) {
      const w = wheel({ symbol: 'AAPL', opened_at: openedAt });
      expect(summarizeWheel(w, [], [], []).weeks).toBe(expected);
    }
  });
});

describe('stage', () => {
  it('SELL_PUT: no shares and an open member PUT', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const openPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-07-05', status: 'OPEN' });
    expect(summarizeWheel(w, [], [openPut], []).stage).toBe('SELL_PUT');
  });

  it('ASSIGNED: shares held and no open member CALL', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-05' })];
    expect(summarizeWheel(w, trades, [], []).stage).toBe('ASSIGNED');
  });

  it('SELLING_CALLS: shares held and an open member CALL', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-05' })];
    const openCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10', status: 'OPEN' });
    expect(summarizeWheel(w, trades, [openCall], []).stage).toBe('SELLING_CALLS');
  });

  it('CALLED_AWAY: no shares, no open options, wheel still open', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-07-01' });
    const trades = [
      t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, executed_at: '2026-07-05' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 100, price: 55, executed_at: '2026-07-15' }),
    ];
    expect(summarizeWheel(w, trades, [], []).stage).toBe('CALLED_AWAY');
  });

  it('COMPLETED: closed wheel, final total = member closed-trade P/L + premiumBanked', () => {
    const w = wheel({ symbol: 'AAPL', opened_at: '2026-06-01', closed_at: '2026-07-20' });
    const trades = [
      t({ symbol: 'AAPL', side: 'BUY', qty: 100, price: 50, fees: 5, executed_at: '2026-06-01' }),
      t({ symbol: 'AAPL', side: 'SELL', qty: 100, price: 55, fees: 6, executed_at: '2026-07-20' }),
    ];
    const settledPut = opt({ symbol: 'AAPL', opt_type: 'PUT', opened_at: '2026-06-01', premium: 1.0, contracts: 1, fees: 2, status: 'ASSIGNED' });
    const settledCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-10', premium: 0.9, contracts: 1, fees: 1, status: 'ASSIGNED' });
    const s = summarizeWheel(w, trades, [settledPut, settledCall], []);
    // closed-trade P/L (fee-inclusive FIFO): gross (55-50)*100=500; sell fee 6*(100/100)=6;
    // buy fee 5*(100/100)=5; fees=11; realizedPl = 500-11 = 489
    // premiumBanked: put (100-2=98) + call (90-1=89) = 187
    // final total = 489 + 187 = 676
    expect(s.stage).toBe('COMPLETED');
    expect(s.sharesHeld).toBe(0);
    expect(s.rawBasis).toBeNull();
    expect(s.trueBasis).toBeNull();
    expect(s.callsSold).toBe(1);
    expect(s.closeToday).toBeCloseTo(676);
    expect(s.markMissing).toBe(false);
  });

  it('a fresh wheel with no member records starts at SELL_PUT, not CALLED_AWAY', () => {
    const fresh = { id: 40, symbol: 'NVDA', no: 1, opened_at: '2026-07-25', closed_at: null };
    // shares bought BEFORE the wheel opened are not members; nothing else exists
    const preWheelTrade = t({ symbol: 'NVDA', side: 'BUY', qty: 10, price: 180, executed_at: '2026-07-01' });
    const s = summarizeWheel(fresh, [preWheelTrade], [], []);
    expect(s.sharesHeld).toBe(0);
    expect(s.stage).toBe('SELL_PUT');
  });
});

describe('wheelWindowNote', () => {
  const open = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-07-20', closed_at: null };
  const done = { id: 2, symbol: 'TQQQ', no: 2, opened_at: '2026-05-01', closed_at: '2026-05-29' };

  it('says nothing when the symbol has no wheel at all', () => {
    expect(wheelWindowNote('NVDA', '2026-07-18', [open])).toBeNull();
  });

  it('says nothing when the date sits inside the wheel', () => {
    expect(wheelWindowNote('TQQQ', '2026-07-22', [open])).toBeNull();
  });

  it('warns, naming the start date, when the date is before the wheel began', () => {
    expect(wheelWindowNote('TQQQ', '2026-07-18', [open])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });

  it('warns, naming the end date, when the date is after a completed wheel', () => {
    expect(wheelWindowNote('TQQQ', '2026-06-05', [done])).toBe(
      "This is after your TQQQ wheel completed (2026-05-29) — it won't count toward it.",
    );
  });

  it('stays silent when the date is inside any one of several wheels', () => {
    expect(wheelWindowNote('TQQQ', '2026-05-10', [open, done])).toBeNull();
  });

  it('warns when the date falls outside every wheel for the symbol', () => {
    expect(wheelWindowNote('TQQQ', '2026-06-15', [open, done])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });

  it('matches the symbol case-insensitively so it works mid-typing', () => {
    expect(wheelWindowNote('tqqq', '2026-07-18', [open])).toBe(
      "This is before your TQQQ wheel started (2026-07-20) — it won't count toward it.",
    );
  });
});
