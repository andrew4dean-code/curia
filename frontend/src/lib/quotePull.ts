import { refreshMarks } from './api';

/** How often the app is willing to go and ask what things are worth.
 *
 *  The pull walks every held symbol one at a time, server-side, on an eight second timeout
 *  each. Firing it after every action meant a booking, a delete and a quiet-week tap each
 *  paid for a full walk, and three taps in a row paid three times over for prices that had
 *  not moved. A minute is well under how long a mark stays interesting and well over how
 *  fast Andrew taps. */
export const QUOTE_MIN_INTERVAL_MS = 60_000;

let lastPullAt = Number.NEGATIVE_INFINITY;

/** Drop the memory of the last pull. Tests share a module registry, so without this one
 *  test's pull sets the clock for the next. */
export function resetQuotePull(): void {
  lastPullAt = Number.NEGATIVE_INFINITY;
}

/** Ask for fresh quotes, at most once per interval.
 *
 *  Resolves true only when a pull actually ran and returned, which is the caller's signal
 *  that the marks on the server may have moved and the snapshot is worth re-reading.
 *
 *  A failed pull still starts the clock: a phone in a lift or a feed having a bad morning
 *  should be asked again in a minute, not on every tap until it recovers. Never throws —
 *  no price is worth breaking a refresh over.
 */
export async function pullQuotes(now: number = Date.now()): Promise<boolean> {
  if (now - lastPullAt < QUOTE_MIN_INTERVAL_MS) return false;
  lastPullAt = now;
  try {
    await refreshMarks();
    return true;
  } catch {
    return false;
  }
}
