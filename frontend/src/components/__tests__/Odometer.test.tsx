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

beforeEach(() => {
  clock = 0;
  pending = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
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

/** Run the count to completion, recording every figure it paints. */
function play(el: HTMLElement) {
  const seen = [el.textContent ?? ''];
  let frames = 0;
  while (pending.size && frames < 400) {
    tick();
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

  it('quantizes to a step that shrinks as it converges, so low places hold', () => {
    const { el, to } = mount('$0.00');
    to('$148.00');
    const { seen } = play(el);

    const isMultiple = (v: number, q: number) => Math.abs(v / q - Math.round(v / q)) < 1e-6;
    for (const s of seen.slice(0, -1)) {
      const v = num(s);
      const rem = 148 - v;
      if (rem >= 100) expect(isMultiple(v, 10)).toBe(true); // tens
      else if (rem >= 10) expect(isMultiple(v, 1)).toBe(true); // whole dollars
      else if (rem >= 1) expect(isMultiple(v, 0.1)).toBe(true); // dimes
    }
    // The cents only ever move inside the last dollar.
    const centy = seen.filter((s) => !isMultiple(num(s), 0.1));
    expect(centy.every((s) => 148 - num(s) < 1)).toBe(true);
    expect(centy.length).toBeGreaterThan(0);
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
