import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memberOptions, memberTrades, summarizeWheel } from '../wheelMath';
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
    const openCall = opt({ symbol: 'AAPL', opt_type: 'CALL', opened_at: '2026-07-15', premium: 0.8, contracts: 1, status: 'OPEN' });
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
});
