import type { OptionStatus } from './types';

// Assignment gets its own tone deliberately: it is neither a win nor a loss but
// a transformation — the puts became shares. Colouring it green or red would
// claim an outcome the trade has not had yet.
export function stampFor(
  outcome: Exclude<OptionStatus, 'OPEN'>,
  realised: number,
): { word: string; tone: 'up' | 'down' | 'assign' } {
  if (outcome === 'ASSIGNED') return { word: 'ASSIGNED', tone: 'assign' };
  const word = outcome === 'BOUGHT_BACK' ? 'BOUGHT BACK' : 'EXPIRED';
  return { word, tone: realised >= 0 ? 'up' : 'down' };
}
