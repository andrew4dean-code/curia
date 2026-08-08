import type { OptionStatus, OptionType } from './types';

/** What a settled contract is called, from your side of it.
 *
 *  ASSIGNED is the mechanism the broker uses, not the event. A put assigned puts shares
 *  to you, and "assigned" describes that well enough. A call assigned takes them away,
 *  and nobody calls that being assigned — you were called away. The status stored in the
 *  database stays ASSIGNED either way: it is the same mechanism, and renaming it would
 *  mean migrating rows to say something the exchange does not.
 *
 *  Every surface that names an outcome reads this one function — the settle button, the
 *  ceremony stamp, the week row, the record sheet — because the word was spelled out
 *  separately on each of them and could drift on any one.
 *
 *  Lowercase, because the surfaces disagree about case: the stamp is uppercase, the week
 *  tag is uppercased in CSS, the button and the record are sentence case.
 */
export function outcomeWord(
  status: Exclude<OptionStatus, 'OPEN'>,
  optType: OptionType,
): string {
  if (status === 'ASSIGNED') return optType === 'CALL' ? 'called away' : 'assigned';
  return status === 'BOUGHT_BACK' ? 'bought back' : 'expired';
}

// Assignment gets its own tone deliberately: it is neither a win nor a loss but
// a transformation — the shares changed hands. Colouring it green or red would
// claim an outcome the trade has not had yet.
export function stampFor(
  outcome: Exclude<OptionStatus, 'OPEN'>,
  realised: number,
  optType: OptionType,
): { word: string; tone: 'up' | 'down' | 'assign' } {
  const word = outcomeWord(outcome, optType).toUpperCase();
  if (outcome === 'ASSIGNED') return { word, tone: 'assign' };
  return { word, tone: realised >= 0 ? 'up' : 'down' };
}
