import { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Odometer } from '../Odometer';

/* The odometer used to hold a fixed 0-9 strip per digit and translate to the target,
   so travel was proportional to the numeric difference: 1->2 hopped one step while
   7->2 crawled backwards through five digits, and a carry that shifted a comma
   remounted the element and hard-snapped the figure. It now interpolates the value
   and re-renders the formatted string. These tests hold that line. */

let clock = 0;
let pending = new Map<number, FrameRequestCallback>();
let nextId = 1;
/** What getComputedStyle reports for --roll-scale. jsdom resolves no cascade, so the
 *  stylesheet's value never reaches the component on its own and every test would run
 *  at one duration. 1 is :root; 1.8 is .roll-slow — both read off the real page in
 *  headless Chrome against curia-tokens.css. */
let rollScale = 1;

beforeEach(() => {
  clock = 0;
  pending = new Map();
  nextId = 1;
  rollScale = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);

  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element, pe?: string | null) => {
    const cs = real(el, pe);
    return new Proxy(cs, {
      get(target, key) {
        if (key === 'getPropertyValue') {
          return (p: string) => (p === '--roll-scale' ? String(rollScale) : target.getPropertyValue(p));
        }
        const v = Reflect.get(target, key);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }) as typeof window.getComputedStyle);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tick(dt = 16.7) {
  clock += dt;
  const due = [...pending.values()];
  pending.clear();
  act(() => due.forEach((cb) => cb(clock)));
}

/** Run the count to completion, recording every figure it paints. `phase` is the gap
 *  from the effect's start() to the first frame — a display never hands the first
 *  callback over exactly one interval after a React commit. */
function play(el: HTMLElement, dt = 16.7, phase = dt) {
  const seen = [el.textContent ?? ''];
  let frames = 0;
  let first = true;
  while (pending.size && frames < 600) {
    tick(first ? phase : dt);
    first = false;
    frames++;
    const now = el.textContent ?? '';
    if (now !== seen[seen.length - 1]) seen.push(now);
  }
  return { seen, frames };
}

const num = (s: string) => Number(s.replace(/[^0-9.]/g, '')) * (/^[−-]/.test(s) ? -1 : 1);

function mount(value: string, props: { speed?: 'hero' | 'detail'; run?: boolean } = {}) {
  const view = render(<Odometer value={value} dataTestid="odo" {...props} />);
  const el = view.getByTestId('odo');
  const to = (next: string, more: typeof props = props) =>
    view.rerender(<Odometer value={next} dataTestid="odo" {...more} />);
  return { ...view, el, to };
}

/* The quantizer picks its step from the decade of the remaining distance, so which
   figures it paints depends on exactly where the frames land inside the run. Pinning
   any one of these axes hides a whole class of defect: at 60Hz, frame-aligned, plain
   hero, the count is clean at every one of 3,000 integer targets, while the same code
   ticked backward on 722 of them at 120Hz under .roll-slow. Every monotonicity test
   sweeps all four. */
interface Axis {
  dt: number;
  phase: number;
  scale: number;
  speed: 'hero' | 'detail';
}

const HZ = [
  { dt: 8.333, hz: 120 }, // ProMotion, where the count broke
  { dt: 16.7, hz: 60 },
  { dt: 6.944, hz: 144 },
  { dt: 11.111, hz: 90 },
  { dt: 33.333, hz: 30 }, // a thermally throttled phone
];
const PHASES = [0.13, 0.37, 0.5, 0.71, 1];
const SCALES = [1, 1.8]; // :root, .roll-slow
const SPEEDS = ['hero', 'detail'] as const;

function axes(): Axis[] {
  const out: Axis[] = [];
  for (const { dt } of HZ) {
    for (const f of PHASES) {
      for (const scale of SCALES) {
        for (const speed of SPEEDS) out.push({ dt, phase: dt * f, scale, speed });
      }
    }
  }
  return out;
}

const where = (a: Axis, from: string, to: string) =>
  `${from} -> ${to} @ ${(1000 / a.dt).toFixed(0)}Hz phase ${a.phase.toFixed(3)}ms ` +
  `scale ${a.scale} ${a.speed}`;

/* Figures that put a decade boundary inside the run, which is where the quantizer's
   step changes and where the count used to stumble. Measured in headless Chrome: at
   120Hz under .roll-slow, $0 -> $107.00 painted "$0.00 $10.00 $9.00 $11.00 ...". */
const UP_TARGETS = ['$107.00', '$109.00', '$1,090.00', '$1,194.00', '$9.99', '$2,200.00'];

const isMultiple = (v: number, q: number) => Math.abs(v / q - Math.round(v / q)) < 1e-6;

/** One complete count, mounted and torn down on its own axis. */
function sweepRun(from: string, to: string, a: Axis) {
  rollScale = a.scale;
  const view = mount(from, { speed: a.speed });
  view.to(to, { speed: a.speed });
  const { seen, frames } = play(view.el, a.dt, a.phase);
  view.unmount();
  return { seen, frames, values: seen.map(num) };
}

describe('Odometer', () => {
  it('paints the formatted figure and carries the target on data-value', () => {
    const { el, container } = mount('$2,200.00');
    expect(el).toHaveTextContent('$2,200.00');
    expect(el).toHaveAttribute('data-value', '$2,200.00');
    // No digit reels left to translate.
    expect(container.querySelectorAll('.odo-reel')).toHaveLength(0);
    expect(container.querySelectorAll('.odo-strip')).toHaveLength(0);
  });

  it('counts up through the value instead of translating digit strips', () => {
    const { el, to } = mount('$0.00');
    to('$148.00');
    const { seen, frames } = play(el);

    expect(frames).toBeGreaterThan(30);
    expect(seen.length).toBeGreaterThan(20); // a count, not a cut
    expect(seen[0]).toBe('$0.00');
    expect(seen[seen.length - 1]).toBe('$148.00'); // lands on the exact target string
    const values = seen.map(num);
    values.forEach((v, i) => {
      if (i > 0) expect(v).toBeGreaterThan(values[i - 1]);
    });
  });

  it('never ticks backward on the way up, at any frame rate, duration or phase', () => {
    for (const a of axes()) {
      for (const target of UP_TARGETS) {
        const { seen, values } = sweepRun('$0.00', target, a);
        expect(seen[seen.length - 1], where(a, '$0.00', target)).toBe(target);
        expect(seen.length, where(a, '$0.00', target)).toBeGreaterThan(15);
        for (let i = 1; i < values.length; i++) {
          // Strict: every painted figure is above the one the eye just saw.
          expect(
            values[i],
            `${where(a, '$0.00', target)} — painted ${seen[i - 1]} then ${seen[i]}`,
          ).toBeGreaterThan(values[i - 1]);
        }
      }
    }
  });

  it('quantizes to a step that shrinks as it converges, so low places hold', () => {
    // The code picks q from the UNQUANTIZED remainder and rounds to the nearest
    // multiple of it, so the painted figure sits within q/2 of the value q was chosen
    // for. Any claim stated on the painted remainder therefore needs half a step of
    // slack — asserting the decade exactly is asserting something the code does not
    // hold. A full decade of margin is well outside q/2 at every rung: while $2 of
    // travel remain the cents have provably not moved, while $20 remain the dimes
    // have not, while $200 remain the dollars have not.
    const LADDER = [
      { remaining: 200, step: 10 },
      { remaining: 20, step: 1 },
      { remaining: 2, step: 0.1 },
    ];
    let centyTotal = 0;
    for (const a of axes()) {
      for (const target of UP_TARGETS) {
        const { seen } = sweepRun('$0.00', target, a);
        const end = num(target);
        for (const s of seen) {
          const v = num(s);
          const rem = end - v;
          // The floor of the ladder: nothing finer than a cent is ever painted.
          expect(isMultiple(v, 0.01), `${where(a, '$0.00', target)} painted ${s}`).toBe(true);
          const rung = LADDER.find((l) => rem >= l.remaining);
          if (rung) {
            expect(
              isMultiple(v, rung.step),
              `${where(a, '$0.00', target)} painted ${s} with $${rem.toFixed(2)} left`,
            ).toBe(true);
          }
        }
        // Cents only ever move inside the last dollar (plus the half-step of slack).
        const centy = seen.filter((s) => !isMultiple(num(s), 0.1));
        expect(
          centy.every((s) => end - num(s) < 1.01),
          `${where(a, '$0.00', target)} cent-granular too early: ${centy[0]}`,
        ).toBe(true);
        centyTotal += centy.length;
      }
    }
    expect(centyTotal).toBeGreaterThan(0); // the ladder does reach the bottom rung
  });

  it('takes the same time whichever way and however far the figure travels', () => {
    const near = mount('$1.00');
    near.to('$2.00');
    const a = play(near.el);
    near.unmount();

    const far = mount('$7.00');
    far.to('$2.00');
    const b = play(far.el);

    expect(a.frames).toBe(b.frames); // 1->2 and 7->2 are the same motion
    expect(a.seen[a.seen.length - 1]).toBe('$2.00');
    expect(b.seen[b.seen.length - 1]).toBe('$2.00');
  });

  it('never overshoots the target on the way down', () => {
    const { el, to } = mount('$148.00');
    to('$0.00');
    const { seen } = play(el);

    const values = seen.map(num);
    expect(Math.min(...values)).toBe(0);
    values.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(v).toBeLessThan(values[i - 1]);
    });
    expect(seen[seen.length - 1]).toBe('$0.00');
  });

  it('never ticks backward on the way down, at any frame rate, duration or phase', () => {
    for (const a of axes()) {
      for (const from of UP_TARGETS) {
        const { seen, values } = sweepRun(from, '$0.00', a);
        expect(seen[seen.length - 1], where(a, from, '$0.00')).toBe('$0.00');
        expect(seen.length, where(a, from, '$0.00')).toBeGreaterThan(15);
        for (let i = 1; i < values.length; i++) {
          // Counting down, "backward" is a figure that rises — including the very
          // first frame, which used to round $109.00 up to $110.00 before falling.
          expect(
            values[i],
            `${where(a, from, '$0.00')} — painted ${seen[i - 1]} then ${seen[i]}`,
          ).toBeLessThan(values[i - 1]);
          expect(values[i], where(a, from, '$0.00')).toBeGreaterThanOrEqual(0);
        }
        expect(values[0], where(a, from, '$0.00')).toBe(num(from));
      }
    }
  });

  it('takes the sign from the interpolated value, not from the endpoint', () => {
    const { el, to } = mount('−$5.00', { speed: 'detail' });
    to('+$5.00', { speed: 'detail' });
    const { seen } = play(el);

    expect(seen.filter((s) => s.startsWith('−')).length).toBeGreaterThan(1);
    expect(seen).toContain('±$0.00'); // − -> ± -> + as it crosses
    expect(seen[seen.length - 1]).toBe('+$5.00');
    const lastMinus = seen.map((s) => s[0]).lastIndexOf('−');
    const firstPlus = seen.map((s) => s[0]).indexOf('+');
    expect(lastMinus).toBeLessThan(firstPlus);
    // Nothing negative was ever printed wearing the target's plus.
    expect(seen.every((s) => !s.startsWith('+') || num(s) >= 0)).toBe(true);
  });

  it('holds at zero until run is set, then winds up from there', () => {
    const { el, to } = mount('$148.00', { run: false });
    expect(el).toHaveTextContent('$0.00');
    expect(el).toHaveAttribute('data-value', '$148.00'); // the target is still declared

    to('$148.00', { run: true });
    const { seen } = play(el);
    expect(seen.length).toBeGreaterThan(20);
    expect(seen[0]).toBe('$0.00');
    expect(seen[seen.length - 1]).toBe('$148.00');
  });

  it('keeps one element across a carry that shifts a comma', () => {
    const { el, to } = mount('$980.00');
    to('$1,240.00');
    expect(el.style.minWidth).toBe('9ch'); // widest of the two, set before the first frame
    const node = el;
    const { seen } = play(el);

    expect(node.isConnected).toBe(true); // never remounted, so it cannot hard-snap
    expect(seen.some((s) => s.includes(','))).toBe(true);
    expect(seen[seen.length - 1]).toBe('$1,240.00');
  });

  it('pins its width to the longer figure and never clears it', () => {
    const { el, to } = mount('$980.00');
    to('$1,240.00');
    expect(el.style.minWidth).toBe('9ch');
    play(el);
    expect(el.style.minWidth).toBe('9ch'); // still pinned once the run has landed
    to('$1.00');
    expect(el.style.minWidth).toBe('9ch');
  });

  it('settles a detail row before the hero figure it sits under', () => {
    const hero = mount('$0.00', { speed: 'hero' });
    hero.to('$148.00', { speed: 'hero' });
    const a = play(hero.el);
    hero.unmount();

    const detail = mount('$0.00', { speed: 'detail' });
    detail.to('$148.00', { speed: 'detail' });
    const b = play(detail.el);

    expect(b.frames).toBeLessThan(a.frames);
  });

  it('re-renders only on frames where the figure actually changes', () => {
    let commits = 0;
    const view = render(
      <Profiler id="odo" onRender={() => { commits += 1; }}>
        <Odometer value="$0.00" dataTestid="odo" />
      </Profiler>,
    );
    view.rerender(
      <Profiler id="odo" onRender={() => { commits += 1; }}>
        <Odometer value="$0.02" dataTestid="odo" />
      </Profiler>,
    );
    const before = commits;
    let frames = 0;
    while (pending.size && frames < 400) {
      tick();
      frames += 1;
    }
    expect(frames).toBeGreaterThan(40);
    // $0.00 -> $0.02 is three distinct figures however many frames it spans.
    expect(commits - before).toBeLessThanOrEqual(3);
    expect(view.getByTestId('odo')).toHaveTextContent('$0.02');
  });

  it('cancels its frame on unmount and on every value change', () => {
    const { el, to, unmount } = mount('$0.00');
    to('$148.00');
    tick();
    expect(pending.size).toBe(1);

    to('$300.00');
    expect(pending.size).toBe(1); // the old run was cancelled, not left racing

    tick();
    unmount();
    expect(pending.size).toBe(0);
    expect(el.isConnected).toBe(false);
  });

  it('paints a figure it cannot rebuild verbatim and warns in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { el, to } = mount('12.5%');
    expect(el).toHaveTextContent('12.5%');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Odometer'));

    to('13.5%');
    expect(el).toHaveTextContent('13.5%');
    expect(pending.size).toBe(0); // no count was attempted
  });

  it('rebuilds every figure through the shared currency formatter', () => {
    const { el, to } = mount('$0.00');
    to('$1,234,567.89');
    const { seen } = play(el);
    // Commas land where Intl puts them at every magnitude the count passes through.
    expect(seen.every((s) => /^\$\d{1,3}(,\d{3})*\.\d{2}$/.test(s))).toBe(true);
    expect(seen[seen.length - 1]).toBe('$1,234,567.89');
  });
});
