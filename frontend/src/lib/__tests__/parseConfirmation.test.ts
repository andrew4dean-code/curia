import { describe, expect, it } from 'vitest';
import { matchOpenOption, parseConfirmation } from '../parseConfirmation';
import type { OptionPosition } from '../types';

/** The exact string a Moomoo fill arrives as. */
const MOOMOO =
  'Transaction Reminder: [Order Filled] 1 contract of $TQQQ 260724 70.00P$ was sold at 1.49 on Jul 21, 2026 12:30:16 ET . [Moomoo US]';

/* The verb agrees with the contract count: one "was sold", three "were sold". Anchoring
   on "was" meant every multi-contract fill failed while every single-contract one worked,
   so the bug hid behind the easiest case — and this is the exact message that exposed it. */
const MOOMOO_PLURAL =
  'Transaction Reminder: [Order Filled] 3 contracts of $TQQQ 260710 69.00P$ were sold at 1 on Jul 7, 2026 10:04:38 ET . [Moomoo US]';

describe('parseConfirmation', () => {
  it('reads a multi-contract fill, where the broker says "were sold"', () => {
    expect(parseConfirmation(MOOMOO_PLURAL)).toEqual({
      symbol: 'TQQQ',
      optType: 'PUT',
      expiration: '2026-07-10',
      strike: 69,
      contracts: 3,
      premium: 1,          // a whole-dollar fill, with no decimal point
      side: 'SOLD',
      filledOn: '2026-07-07',
    });
  });

  it('reads the same sentence whichever verb the broker uses', () => {
    const one = parseConfirmation('1 contract of $TQQQ 260710 69.00P$ was sold at 1.20');
    const many = parseConfirmation('3 contracts of $TQQQ 260710 69.00P$ were sold at 1.20');
    const bare = parseConfirmation('3 contracts of $TQQQ 260710 69.00P$ sold at 1.20');
    expect(one?.premium).toBe(1.2);
    expect(many?.premium).toBe(1.2);
    expect(bare?.premium).toBe(1.2);
    expect([one?.contracts, many?.contracts, bare?.contracts]).toEqual([1, 3, 3]);
  });

  it('handles a plural buyback too', () => {
    expect(parseConfirmation('2 contracts of $TQQQ 260710 69.00P$ were bought at 0.05')?.side).toBe('BOUGHT');
  });

  it('reads every field out of a real Moomoo confirmation', () => {
    expect(parseConfirmation(MOOMOO)).toEqual({
      symbol: 'TQQQ',
      optType: 'PUT',
      expiration: '2026-07-24', // 260724, expanded
      strike: 70,
      contracts: 1,
      premium: 1.49,
      side: 'SOLD',
      filledOn: '2026-07-21',
    });
  });

  it('reads a call, several contracts, and a fractional strike', () => {
    const r = parseConfirmation(
      '[Order Filled] 3 contracts of $NVDA 261218 132.50C$ was sold at 2.05 on Dec 1, 2026 09:31:02 ET',
    );
    expect(r).toMatchObject({ symbol: 'NVDA', optType: 'CALL', strike: 132.5, contracts: 3, premium: 2.05 });
    expect(r?.expiration).toBe('2026-12-18');
  });

  it('distinguishes a buyback from a sale', () => {
    // A bought contract closes a position. Filling the sell sheet from it would book the
    // opposite of what happened, so the side has to survive parsing.
    const r = parseConfirmation('1 contract of $TQQQ 260724 70.00P$ was bought at 0.30 on Jul 23, 2026');
    expect(r?.side).toBe('BOUGHT');
  });

  it('carries a dotted symbol through intact', () => {
    expect(parseConfirmation('1 contract of $BRK.B 261120 400.00P$ was sold at 3.10')?.symbol).toBe('BRK.B');
  });

  it('assumes one contract when the text does not say', () => {
    expect(parseConfirmation('$TQQQ 260724 70.00P$ was sold at 1.49')?.contracts).toBe(1);
  });

  it('survives the broker rewording everything around the contract', () => {
    // Only the descriptor and the fill carry meaning; the chrome is decoration.
    const r = parseConfirmation('Fill notice — your order for $TQQQ 260724 70.00P$ was sold at 1.49. Thanks!');
    expect(r).toMatchObject({ symbol: 'TQQQ', strike: 70, premium: 1.49 });
  });

  it('copes with the text arriving across several lines', () => {
    const r = parseConfirmation('[Order Filled]\n  1 contract of $TQQQ 260724 70.00P$\n  was sold at 1.49\n');
    expect(r?.premium).toBe(1.49);
  });

  it('leaves the fill date null when there is none, rather than inventing one', () => {
    expect(parseConfirmation('1 contract of $TQQQ 260724 70.00P$ was sold at 1.49')?.filledOn).toBeNull();
  });

  it('refuses anything it cannot fully understand', () => {
    // Half a confirmation filling half a form is worse than an honest failure.
    expect(parseConfirmation('')).toBeNull();
    expect(parseConfirmation('just some text off the clipboard')).toBeNull();
    expect(parseConfirmation('$TQQQ 260724 70.00P$ — no fill price anywhere')).toBeNull();
    expect(parseConfirmation('was sold at 1.49 — but no contract descriptor')).toBeNull();
  });

  it('rejects an impossible expiry rather than shifting it into a real date', () => {
    // 261340 is not a month or a day. Date maths would silently roll it into 2027.
    expect(parseConfirmation('1 contract of $TQQQ 261340 70.00P$ was sold at 1.49')).toBeNull();
  });
});

describe('matchOpenOption', () => {
  const parsed = parseConfirmation('1 contract of $TQQQ 260724 70.00P$ was bought at 0.30')!;
  const opt = (over: Partial<OptionPosition> = {}): OptionPosition =>
    ({ id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 70, expiration: '2026-07-24', contracts: 1,
       premium: 1.49, fees: 0, opened_at: '2026-07-21', note: '', status: 'OPEN',
       closed_at: null, buyback_price: 0, ...over } as OptionPosition);

  it('finds the open contract the buyback closes', () => {
    expect(matchOpenOption(parsed, [opt()])?.id).toBe(1);
  });

  it('treats 70 and 70.00 as the same strike', () => {
    expect(matchOpenOption(parsed, [opt({ strike: 70.0 })])?.id).toBe(1);
  });

  it('will not settle a contract that is already closed', () => {
    expect(matchOpenOption(parsed, [opt({ status: 'EXPIRED' })])).toBeNull();
  });

  it('refuses to choose between two identical open contracts', () => {
    // Guessing here settles a leg you did not mean; the caller must ask.
    expect(matchOpenOption(parsed, [opt({ id: 1 }), opt({ id: 2 })])).toBeNull();
  });

  it('requires every one of symbol, type, strike and expiry to agree', () => {
    expect(matchOpenOption(parsed, [opt({ symbol: 'NVDA' })])).toBeNull();
    expect(matchOpenOption(parsed, [opt({ opt_type: 'CALL' })])).toBeNull();
    expect(matchOpenOption(parsed, [opt({ strike: 71 })])).toBeNull();
    expect(matchOpenOption(parsed, [opt({ expiration: '2026-07-31' })])).toBeNull();
  });
});
