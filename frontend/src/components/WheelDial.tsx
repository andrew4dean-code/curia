import { useEffect, useRef, useState } from 'react';
import type { WheelStage } from '../lib/types';
import { cubicBezier, prefersReducedMotion } from '../lib/ease';

const ORDER: WheelStage[] = ['SELL_PUT', 'ASSIGNED', 'SELLING_CALLS', 'CALLED_AWAY'];

// The hand is drawn pointing UP; each station is a further quarter turn clockwise.
// Cumulative angles keep the sweep winding clockwise, never snapping back.
const HAND_ANGLE: Record<WheelStage, number> = {
  SELL_PUT: 0,
  ASSIGNED: 90,
  SELLING_CALLS: 180,
  CALLED_AWAY: 270,
  COMPLETED: 360,
};

/* The dial is wider than it is tall: the four station names sit outside the bezel and
   upright, and "SELLING CALLS" and "CALLED AWAY" need horizontal room to run. Rotating
   them to fit — which is what this dial used to do — is what made them unreadable. */
const CX = 195;
const CY = 120;

const R_FACE = 96; // outer edge of the bezel
const R_TICK_OUT = 84;
const R_TICK_IN = 76;
const R_TICK_IN_MAJOR = 71;
const R_INNER = 70; // inner hairline, edge of the engine-turned face
const R_MARKER = 80; // where the four station markers sit
const R_HUB = 27;

/** One slow sweep, heavy at the start and settling long into the station. */
const SWEEP_MS = 1900;
const sweepEase = cubicBezier(0.42, 0, 0.28, 1);
/** How long a ghost of the hand lingers behind it. */
const TRAIL_MS = 1100;
/** Degrees of travel between ghosts. Finer than this and the trail is a solid smear. */
const TRAIL_STEP_DEG = 1.2;

const STATIONS = [
  { stage: 'SELL_PUT' as WheelStage, label: 'SELL PUT', deg: 0, lx: 0, ly: -R_FACE - 12, anchor: 'middle' },
  { stage: 'ASSIGNED' as WheelStage, label: 'ASSIGNED', deg: 90, lx: R_FACE + 10, ly: 4, anchor: 'start' },
  { stage: 'SELLING_CALLS' as WheelStage, label: 'SELLING CALLS', deg: 180, lx: 0, ly: R_FACE + 22, anchor: 'middle' },
  { stage: 'CALLED_AWAY' as WheelStage, label: 'CALLED AWAY', deg: 270, lx: -R_FACE - 10, ly: 4, anchor: 'end' },
] as const;

/** The stage each dial was left pointing at, surviving unmount.
 *
 *  Same reason the odometer keeps one: tabs are keyed on the active tab, so settling an
 *  option on Options and returning to Portfolio remounts the card, and a fresh dial has
 *  no previous stage to sweep from — the hand would simply be in its new place. Keyed by
 *  wheel id, so two wheels never inherit each other's position.
 */
const STAGE_MEMORY = new Map<number, WheelStage>();

/** Module state outlives a test; without this one test's final stage seeds the next. */
export function resetDialMemory(): void {
  STAGE_MEMORY.clear();
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const px = (r: number, deg: number) => +(r * Math.sin(rad(deg))).toFixed(2);
const py = (r: number, deg: number) => +(-r * Math.cos(rad(deg))).toFixed(2);

/** A tapered pointer with a counterweight tail, drawn pointing up from the hub. A plain
 *  stroked line reads as a spoke; the taper and the tail are what make it a needle. */
function handPath(len: number): string {
  return `M 0 ${-len} L 3.6 ${-len + 16} L 6.4 ${-len + 32} L 3 -14 L 3 12 L -3 12 L -3 -14 L -6.4 ${-len + 32} L -3.6 ${-len + 16} Z`;
}

interface Ghost {
  deg: number;
  born: number;
}

export function WheelDial({
  stage,
  callsSold,
  no,
  weeks,
  wheelId,
}: {
  stage: WheelStage;
  callsSold: number;
  no: number;
  weeks: number;
  /** Identity for remembering where the hand was left. Without it the dial still works,
   *  it simply never sweeps across a remount. */
  wheelId?: number;
}) {
  const idx = stage === 'COMPLETED' ? ORDER.length : ORDER.indexOf(stage);
  const spokes = Math.min(callsSold, 12);
  const target = HAND_ANGLE[stage];
  /** Where this dial was last left, if it has been drawn before. Read once, at mount:
   *  after that the live angle is the truth and the registry only follows it. */
  const remembered = useRef(wheelId !== undefined ? STAGE_MEMORY.get(wheelId) : undefined);

  const [angle, setAngle] = useState(
    remembered.current !== undefined ? HAND_ANGLE[remembered.current] : target,
  );
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const frame = useRef<number | null>(null);
  const live = useRef(angle);
  /** The first render places the hand; only a later change to stage sweeps it. Without
   *  this every card would wind up from SELL PUT on mount, including on a cold load. */
  const mounted = useRef(false);

  useEffect(() => {
    if (wheelId !== undefined) STAGE_MEMORY.set(wheelId, stage);

    // First render places the hand rather than sweeping it — EXCEPT when this dial was
    // left pointing somewhere else, which is the case that matters: settle an option on
    // Options, come back, and the arm should travel to where the wheel has moved rather
    // than already be there. A cold load remembers nothing and simply points.
    if (!mounted.current) {
      mounted.current = true;
      const from = remembered.current;
      if (from === undefined || from === stage) {
        live.current = target;
        setAngle(target);
        return;
      }
      live.current = HAND_ANGLE[from];
      // fall through and sweep from the remembered stage to this one
    }
    if (prefersReducedMotion()) {
      live.current = target;
      setAngle(target);
      setGhosts([]);
      return;
    }

    const from = live.current;
    if (from === target) return;
    const start = performance.now();
    const trail: Ghost[] = [];

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SWEEP_MS);
      const deg = from + (target - from) * sweepEase(t);
      live.current = deg;
      if (!trail.length || Math.abs(trail[trail.length - 1].deg - deg) > TRAIL_STEP_DEG) {
        trail.push({ deg, born: now });
      }
      while (trail.length && now - trail[0].born > TRAIL_MS) trail.shift();
      setAngle(deg);
      setGhosts([...trail]);
      // The sweep is over but the trail is not: keep painting until the last ghost dies,
      // or the glow would be cut off mid-fade the instant the hand lands.
      if (t < 1 || trail.length) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [target, stage, wheelId]);

  const now = typeof performance !== 'undefined' ? performance.now() : 0;

  return (
    <svg
      className="wheel-dial"
      viewBox="0 0 390 252"
      role="img"
      aria-label={`Wheel ${no}, week ${weeks}, stage ${stage.replace('_', ' ').toLowerCase()}, ${callsSold} calls sold`}
    >
      <defs>
        <filter id={`dial-glow-${no}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${CX},${CY})`}>
        {/* bezel: a fat rule between two hairlines, the letterpress double rule */}
        <circle r={R_FACE} fill="var(--parchment)" />
        <circle r={R_FACE} fill="none" stroke="var(--rule)" strokeWidth="1" />
        <circle r={R_FACE - 4.5} fill="none" stroke="var(--rule)" strokeWidth="3" />
        <circle r={R_FACE - 10} fill="none" stroke="var(--rule)" strokeWidth="0.75" />

        {/* chapter ring: 60 graduations, heavier and longer at the four stations */}
        <g stroke="var(--rule)">
          {Array.from({ length: 60 }, (_, i) => {
            const deg = i * 6;
            const major = i % 15 === 0;
            const ri = major ? R_TICK_IN_MAJOR : R_TICK_IN;
            return (
              <line
                key={deg}
                x1={px(ri, deg)}
                y1={py(ri, deg)}
                x2={px(R_TICK_OUT, deg)}
                y2={py(R_TICK_OUT, deg)}
                strokeWidth={major ? 2.4 : 1}
                opacity={major ? 1 : 0.6}
              />
            );
          })}
        </g>
        <circle r={R_INNER} fill="none" stroke="var(--rule)" strokeWidth="0.75" />

        {/* engine turning: concentric hairlines across the face */}
        <g opacity="0.3">
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} r={36 + i * 5} fill="none" stroke="var(--rule)" strokeWidth="0.5" />
          ))}
        </g>

        {/* one gold graduation per call sold, up to twelve */}
        <g stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" opacity="0.9">
          {Array.from({ length: spokes }, (_, i) => {
            const deg = i * 30 + 15;
            return (
              <line
                key={i}
                data-testid="dial-spoke"
                x1={px(40, deg)}
                y1={py(40, deg)}
                x2={px(62, deg)}
                y2={py(62, deg)}
              />
            );
          })}
        </g>

        {/* station markers: filled where you are, hollow ahead, green behind */}
        <g>
          {STATIONS.map((s, i) => {
            const passed = i < idx;
            const current = i === idx;
            return (
              <circle
                key={s.stage}
                cx={px(R_MARKER, s.deg)}
                cy={py(R_MARKER, s.deg)}
                r={current ? 5 : 4}
                fill={current ? 'var(--maroon)' : passed ? 'var(--pl-green)' : 'none'}
                stroke={current ? 'none' : passed ? 'none' : 'var(--rule)'}
                strokeWidth="1.5"
              />
            );
          })}
        </g>

        {/* the trail: ghosts of the hand along the path it just swept, fading as they age */}
        <g filter={`url(#dial-glow-${no})`} aria-hidden="true">
          {ghosts.map((g, i) => {
            const age = (now - g.born) / TRAIL_MS;
            if (age >= 1) return null;
            return (
              <g key={i} transform={`rotate(${g.deg.toFixed(2)})`} opacity={((1 - age) * 0.34).toFixed(3)}>
                <path d={handPath(76)} fill="var(--gold)" />
              </g>
            );
          })}
        </g>

        <g className="wheel-hand" transform={`rotate(${angle.toFixed(2)})`}>
          <path d={handPath(76)} fill="var(--maroon)" />
          <circle cy="16" r="9" fill="var(--maroon)" />
        </g>

        <circle r={R_HUB} fill="var(--maroon)" />
        <circle r={R_HUB + 3.5} fill="none" stroke="var(--gold)" strokeWidth="0.9" opacity="0.75" />
        <text x="0" y="-2" fontFamily="var(--font-display)" fontSize="13" fill="var(--parchment)" textAnchor="middle">
          Nº {no}
        </text>
        <text x="0" y="14" fontFamily="var(--font-display)" fontSize="11.5" fill="var(--parchment)" textAnchor="middle" opacity="0.85">
          wk {weeks}
        </text>

        {/* Upright, outside the bezel, with room to run. No rotation, no halo knockout:
            nothing overlaps a ring any more, so nothing needs to be knocked out of one. */}
        <g fontFamily="var(--font-mono)" fontSize="10.5" letterSpacing="0.14em">
          {STATIONS.map((s, i) => {
            const passed = i < idx;
            const current = i === idx;
            return (
              <text
                key={s.stage}
                x={s.lx}
                y={s.ly}
                textAnchor={s.anchor}
                fill={passed ? 'var(--pl-green)' : current ? 'var(--maroon)' : 'var(--ink-soft)'}
                fontWeight={current ? 700 : 400}
                data-station={s.stage}
                data-state={passed ? 'passed' : current ? 'current' : 'ahead'}
              >
                {s.label}
                {passed ? ' ✓' : ''}
              </text>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
