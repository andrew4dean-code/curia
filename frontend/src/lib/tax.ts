import type { ClosedTrade, OptionPosition } from './types';
import { optionRealizedPl } from './optionsMath';

export interface TaxEstimate {
  year: number;
  /** Realized share gains and option premium for the year, after fees. */
  realized: number;
  /** realized x rate, floored at zero. */
  setAside: number;
  ratePct: number;
}

/** What to keep back from realized gains, at a rate you set.
 *
 *  Tax is owed on gains you have REALIZED, not on cash you have withdrawn. Money sitting
 *  in the brokerage account from an expired put is already income for the year. So this
 *  counts realizations, and a withdrawal changes nothing about it.
 *
 *  Scoped to a calendar year because that is the unit tax is assessed in. A running
 *  all-time figure would keep growing past the point you had already settled up.
 *
 *  A LOSS-MAKING YEAR OWES NOTHING, so the estimate floors at zero. It deliberately does
 *  not carry a loss forward or net against other income: that is real tax work, and a
 *  number this app invented would be worse than no number.
 *
 *  It is also not tax advice, and it will not match a return. Curia books an assigned
 *  option's premium as realized the day it is assigned, whereas for tax that premium
 *  generally adjusts the basis of the shares instead and surfaces when they are sold. The
 *  totals converge; the timing does not.
 */
export function estimateTax(
  closed: ClosedTrade[],
  options: OptionPosition[],
  ratePct: number,
  year: number,
): TaxEstimate {
  const inYear = (iso: string | null | undefined) => !!iso && iso.slice(0, 4) === String(year);

  const shares = closed
    .filter((t) => inYear(t.closedAt))
    .reduce((sum, t) => sum + t.realizedPl, 0);

  const premium = options
    .filter((o) => o.status !== 'OPEN' && inYear(o.closed_at))
    .reduce((sum, o) => sum + (optionRealizedPl(o) ?? 0), 0);

  const realized = shares + premium;
  const rate = Math.max(0, Math.min(100, ratePct)) / 100;
  return {
    year,
    realized,
    setAside: realized > 0 ? realized * rate : 0,
    ratePct,
  };
}
