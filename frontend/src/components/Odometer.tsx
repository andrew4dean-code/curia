import { useEffect, useRef, useState } from 'react';
import { usd } from '../lib/format';
import { cubicBezier } from '../lib/ease';

export type RollSpeed = 'hero' | 'detail';

interface OdometerProps {
  value: string;
  speed?: RollSpeed;
  className?: string;
  dataTestid?: string;
  /** While false the figure holds at zero. Flipping it true counts up from there —
   *  the settle ceremony sets it when its 'count' stage arrives. */
  run?: boolean;
}

/** A WheelCard row is one of many, so it settles faster than the book value: a row
 *  that churns longer than the hero figure reads as noise, not as counting. The 1.45
 *  ratio between the two is what stages them, so both move together. */
export const DURATION_MS: Record<RollSpeed, number> = { hero: 2200, detail: 1520 };

/** Cent precision, taken from the formatter itself so the two can never disagree. */
const DP = usd.resolvedOptions().maximumFractionDigits ?? 2;

/** format.ts emits '+' (U+002B), '−' (U+2212) and '±' (U+00B1); a bare ASCII '-' is
 *  what Intl itself prints when formatMoney() is handed a negative. Accept all four. */
const MONEY = /^([+−±-])?\$[\d,]+\.\d+$/;

interface Parsed {
  n: number;
  /** True when the string carries a forced P&L sign, so zero must print as '±'. */
  signed: boolean;
}

function parseMoney(s: string): Parsed | null {
  const m = MONEY.exec(s);
  if (!m) return null;
  const sign = m[1] ?? '';
  const mag = Number(s.slice(sign.length + 1).replace(/,/g, ''));
  if (!Number.isFinite(mag)) return null;
  // ASCII '-' is Intl's own minus on an unsigned figure; U+2212 is the forced P&L one.
  const n = sign === '−' || sign === '-' ? -mag : mag;
  return { n, signed: sign === '+' || sign === '±' || sign === '−' };
}

/** Rebuild a figure through the same Intl instance format.ts lands on. The sign comes
 *  from the value in hand, never from the endpoint, so a total crossing zero flips
 *  − → ± → + as it passes rather than wearing its destination's sign the whole way. */
function build(n: number, signed: boolean): string {
  const v = n === 0 ? 0 : n; // kill -0, or Intl prints "-$0.00"
  if (!signed) return usd.format(v);
  const abs = usd.format(Math.abs(v));
  return v > 0 ? `+${abs}` : v < 0 ? `−${abs}` : `±${abs}`;
}

/** The count deliberately does NOT run on the app's --roll-ease. That curve is shaped
 *  for a panel sliding into place — it covers 65% of its travel in the first fifth and
 *  then creeps — which on a figure that is read rather than watched lands the number
 *  almost at once and leaves the rest of the duration to a twitch in the cents.
 *
 *  This one is a true ease-in-out: it starts from a standstill, winds up to about 2.4x
 *  average speed a quarter of the way through, and glides back down to rest (20% / 77% /
 *  93% of the value at a fifth, half and seven tenths). Both endpoints matter. An earlier
 *  pass fixed only the landing and left the start at nearly 2x speed from the first frame,
 *  and it still read as stopping abruptly — the eye judges a deceleration against the
 *  acceleration that preceded it, and there wasn't one to judge against.
 *
 *  The cost is ~185ms of stillness before the figure moves, and a middle that runs fast
 *  enough to blur. That is the trade for the arc, and it is deliberate.
 *
 *  Kept in JS, not as a CSS token: nothing in CSS reads it, and unlike --roll-scale it
 *  does not vary by cascade. */
const ease = cubicBezier(0.3, 0, 0.25, 1);

/** .roll-slow winds every figure out during a ceremony landing. */
function rollScale(el: HTMLElement | null): number {
  if (!el || typeof getComputedStyle !== 'function') return 1;
  const n = parseFloat(getComputedStyle(el).getPropertyValue('--roll-scale'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function firstPaint(value: string, run: boolean): string {
  if (run) return value;
  const p = parseMoney(value);
  return p ? build(0, p.signed) : value;
}

export function Odometer({ value, speed = 'hero', className, dataTestid, run = true }: OdometerProps) {
  const host = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | null>(null);
  /** The number currently on screen — updated every painted frame, so a value that
   *  changes mid-count picks up from what the eye last saw. */
  const cur = useRef<number | null>(null);
  const [shown, setShown] = useState(() => firstPaint(value, run));
  const shownRef = useRef(shown);
  const [minWidth, setMinWidth] = useState(() => `${value.length}ch`);

  useEffect(() => {
    // Only re-render on frames where the figure actually changes: at 44px Playfair a
    // repaint per frame with no visible change is a strobe, not a count.
    const paint = (next: string) => {
      if (next === shownRef.current) return;
      shownRef.current = next;
      setShown(next);
    };

    setMinWidth(`${Math.max(shownRef.current.length, value.length)}ch`);

    const to = parseMoney(value);
    if (!to || build(to.n, to.signed) !== value) {
      if (import.meta.env.DEV) {
        console.warn(`Odometer: cannot rebuild ${JSON.stringify(value)} through Intl — painting it with no count.`);
      }
      cur.current = null;
      paint(value);
      return;
    }

    if (!run) {
      cur.current = 0;
      paint(build(0, to.signed));
      return;
    }

    const from = cur.current;
    if (from === null || from === to.n) {
      cur.current = to.n;
      paint(value);
      return;
    }

    const dur = DURATION_MS[speed] * rollScale(host.current);
    const start = performance.now();
    const up = to.n >= from;
    /** The last figure the eye was actually shown. The count ratchets against this. */
    let last = from;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      if (t >= 1) {
        frame.current = null;
        cur.current = to.n;
        paint(value); // land on the exact target string, never on a rebuilt float
        return;
      }
      const v = from + (to.n - from) * ease(t);
      // Quantize to a step that shrinks as it converges: tens while tens remain, then
      // ones, then dimes, then cents. The highest moving place locks first and the low
      // places hold until their decade arrives — that is the winding read.
      const rem = Math.abs(to.n - v);
      const q = Math.pow(10, Math.max(-DP, rem > 0 ? Math.floor(Math.log10(rem)) - 1 : -DP));
      let s = Math.round(v / q) * q;
      s = up ? Math.min(s, to.n) : Math.max(s, to.n); // never overshoot
      s = Number(s.toFixed(DP));
      // ...and never step behind the figure already on screen. q is a decade of the
      // UNQUANTIZED remainder, so on the frame the remainder crosses a decade q drops
      // tenfold and the finer rounding can land under the coarser value just painted
      // ($10.00 then $9.00 on the way up). Clamping only against to.n never caught it.
      // A ratchet against the last painted figure does: the count may hold for a frame,
      // it can never reverse.
      s = up ? Math.max(s, last) : Math.min(s, last);
      last = s;
      cur.current = s;
      paint(build(s, to.signed));
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [value, run, speed]);

  const cls = ['odo', speed === 'detail' ? 'odo-detail' : '', className].filter(Boolean).join(' ');
  return (
    <span ref={host} className={cls} data-value={value} data-testid={dataTestid} style={{ minWidth }}>
      {shown}
    </span>
  );
}
