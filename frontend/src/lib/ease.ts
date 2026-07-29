/** Evaluate a CSS `cubic-bezier(x1,y1,x2,y2)` timing function in JS.
 *
 *  A CSS bezier is a parametric curve, not a function of t: the x you are given is a
 *  position along the curve's own parameter, not the parameter itself. So solving for y
 *  means first solving x(s) = t for s, which Newton does in a handful of iterations for
 *  any curve whose x is monotonic (which every valid CSS timing function's is).
 *
 *  Used wherever motion is driven from JS rather than a CSS transition — the odometer
 *  count and the wheel dial's hand — so that both carry the same easing vocabulary as
 *  the stylesheet instead of inventing their own.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  return (t: number): number => {
    let s = t;
    for (let i = 0; i < 6; i++) {
      const dx = ((ax * s + bx) * s + cx) * s - t;
      if (Math.abs(dx) < 1e-5) break;
      const slope = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(slope) < 1e-6) break;
      s -= dx / slope;
    }
    s = Math.min(1, Math.max(0, s));
    return ((ay * s + by) * s + cy) * s;
  };
}

/** True when the viewer has asked the OS to reduce motion. Guarded for jsdom, where
 *  matchMedia does not exist and every test would otherwise throw on first render. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
