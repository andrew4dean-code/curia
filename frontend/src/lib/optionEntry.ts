import type { OptionPosition, OptionType, Trade, Wheel } from './types';
import { summarizeWheel } from './wheelMath';

export interface OptionDefaults {
  optType: OptionType;
  /** Contracts the position itself implies, or null when it does not imply one. */
  contracts: number | null;
}

/** What selling on this symbol almost certainly is, read off its open wheel.
 *
 *  A wheel tells you the trade before you type it. Waiting to be assigned means the next
 *  thing sold is a put; holding the shares means it is a call, and a covered call is
 *  covered by definition — one contract per hundred shares. That leaves strike and
 *  premium, which genuinely change every week, and nothing else.
 *
 *  Returns null when the wheel implies nothing: no open wheel on that symbol, or a wheel
 *  that has been called away and is not selling anything at all. Guessing there would be
 *  worse than an empty field, because a filled field reads as decided.
 *
 *  Marks are deliberately not required. summarizeWheel only consults them to value
 *  closeToday; stage and sharesHeld — the two facts used here — do not depend on price.
 */
export function optionDefaults(
  symbol: string,
  wheels: Wheel[],
  trades: Trade[],
  options: OptionPosition[],
): OptionDefaults | null {
  const wanted = symbol.trim().toUpperCase();
  if (!wanted) return null;

  const wheel = wheels.find((w) => w.closed_at === null && w.symbol.toUpperCase() === wanted);
  if (!wheel) return null;

  const { stage, sharesHeld } = summarizeWheel(wheel, trades, options, []);

  if (stage === 'SELL_PUT') {
    // How many puts to sell is a position-sizing decision, not something the wheel knows.
    return { optType: 'PUT', contracts: null };
  }
  if (stage === 'ASSIGNED' || stage === 'SELLING_CALLS') {
    const covered = Math.floor(sharesHeld / 100);
    return { optType: 'CALL', contracts: covered >= 1 ? covered : null };
  }
  return null; // CALLED_AWAY, COMPLETED — nothing is being sold here
}
