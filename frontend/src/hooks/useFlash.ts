import { useEffect, useRef, useState } from 'react';

/** How long the wash takes, in ms. Duplicated from `--flash` in curia-tokens.css the same
 *  way SEAL_MS is duplicated from `seal-stamp`, and pinned by the suite. */
export const FLASH_MS = 750;

/** A green or pink wash behind a figure that has just moved.
 *
 *  This used to strip the class on `requestAnimationFrame(requestAnimationFrame(...))`,
 *  i.e. about 33ms into a 750ms animation, so roughly 95% of the wash never rendered — on
 *  a 120Hz screen it was two frames and often not seen at all. What looked like a slow
 *  ease-out in the stylesheet was a flicker in the hand.
 *
 *  The double-rAF was load-bearing for one thing, though, and that is why it is still here
 *  on the SET side: re-setting an identical className does not restart a CSS animation, so
 *  a second move in the same direction inside the window would do nothing at all unless
 *  the class drops for a frame first.
 */
export function useFlash(value: number): string {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const dir = value > prev.current ? 'flash-up' : value < prev.current ? 'flash-dn' : '';
    prev.current = value;
    if (!dir) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setCls('');
    const raf = requestAnimationFrame(() => setCls(dir));
    return () => cancelAnimationFrame(raf);
  }, [value]);

  // Clear on the animation's own clock, not on the next frame.
  useEffect(() => {
    if (!cls) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCls('');
    }, FLASH_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [cls]);

  return cls;
}
