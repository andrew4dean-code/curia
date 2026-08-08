import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLASH_MS, useFlash } from '../useFlash';

/* The wash used to be stripped on requestAnimationFrame(requestAnimationFrame(...)), about
   33ms into a 750ms animation, so roughly 95% of it never rendered — on a 120Hz screen it
   was two frames and often not seen at all. What read as a slow ease-out in the stylesheet
   was a flicker in the hand. */
describe('useFlash', () => {
  /* requestAnimationFrame has to be named explicitly: Vitest's default toFake list is
     setTimeout/clearTimeout/setInterval/clearInterval/setImmediate/clearImmediate/Date and
     does NOT include it, so the hook's set-side frame never fires under plain fake timers
     and every assertion below reads ''. Stubbing rAF by hand instead is worse — then
     cancelAnimationFrame is handed an id that setTimeout created, and the timer mock throws. */
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
    }),
  );
  afterEach(() => vi.useRealTimers());

  const flash = (initial: number) => renderHook(({ v }) => useFlash(v), { initialProps: { v: initial } });
  /** The rerender and the clock must be SEPARATE acts: batched into one, the effect that
   *  schedules the frame has not run yet when the timers advance, so nothing fires. */
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it('says nothing on first render', () => {
    expect(flash(100).result.current).toBe('');
  });

  it('washes green on a rise and pink on a fall', () => {
    const h = flash(100);
    act(() => h.rerender({ v: 150 }));
    tick(20);
    expect(h.result.current).toBe('flash-up');

    tick(FLASH_MS);
    act(() => h.rerender({ v: 50 }));
    tick(20);
    expect(h.result.current).toBe('flash-dn');
  });

  it('holds the class for the whole animation, not for two frames', () => {
    const h = flash(100);
    act(() => h.rerender({ v: 150 }));
    tick(20);
    expect(h.result.current).toBe('flash-up');

    // The old implementation was already back to '' by here — about 33ms in.
    tick(FLASH_MS - 100);
    expect(h.result.current, 'the wash was stripped before it could be seen').toBe('flash-up');

    tick(200);
    expect(h.result.current).toBe('');
  });

  it('restarts on a second move in the SAME direction, which an identical className cannot', () => {
    const h = flash(100);
    act(() => h.rerender({ v: 150 }));
    tick(20);
    expect(h.result.current).toBe('flash-up');

    // Mid-wash, another rise. The class has to drop for a frame or CSS never replays it.
    act(() => h.rerender({ v: 200 }));
    expect(h.result.current, 'must clear before re-applying').toBe('');
    tick(20);
    expect(h.result.current).toBe('flash-up');
  });

  it('says nothing when the value has not moved', () => {
    const h = flash(100);
    act(() => h.rerender({ v: 100 }));
    tick(50);
    expect(h.result.current).toBe('');
  });
});
