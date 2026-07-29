import { describe, expect, it } from 'vitest';
import { parseConfirmation } from '../parseConfirmation';

/** The exact string a Moomoo fill arrives as. */
const MOOMOO =
  'Transaction Reminder: [Order Filled] 1 contract of $TQQQ 260724 70.00P$ was sold at 1.49 on Jul 21, 2026 12:30:16 ET . [Moomoo US]';

describe('parseConfirmation', () => {
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
