import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- no @types/node in this project.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- no @types/node in this project.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- no @types/node in this project.
import { dirname, join } from 'node:path';
import { SettleCeremony, VERDICT_DONE_MS } from '../SettleCeremony';
import type { SettleExchange } from '../SettleCeremony';

/** The ceremony's behaviour lives in CSS that jsdom will never compute. Read it off disk and
 *  assert the relationships directly — a rendered assertion cannot tell a working ceremony
 *  from a broken one here. */
function ceremonyCss(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', 'styles', 'ceremony.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}
function rule(selector: string): string | null {
  const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(ceremonyCss());
  return m ? m[1] : null;
}

const data = { word: 'EXPIRED', tone: 'up' as const, amount: '$148.00', symbol: 'TQQQ' };

const exchange: SettleExchange = {
  goneLabel: 'cash committed', goneFigure: '−$24,800',
  gotLabel: 'shares received', gotFigure: '400 sh',
  verdict: 'put assigned · you own the shares',
  filedTo: 'filed to TQQQ',
};
const assigned = { ...data, word: 'ASSIGNED', tone: 'assign' as const, exchange };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettleCeremony — the verdict (expired, bought back)', () => {
  it('stamps the outcome and shows the amount', () => {
    render(<SettleCeremony data={data} onDone={vi.fn()} />);
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByTestId('settle-amount')).toHaveAttribute('data-value', '$148.00');
  });

  /* The stamp used to be absolutely positioned at top 46% while the amount sat in normal
     flow — nothing coordinated them, and they overlapped by a measured 228x45px, printing
     the word straight through the figure.

     Asserting the berth EXISTS in the JSX is worthless: it restates markup two lines apart
     in the component and stays green with `position: absolute` put straight back on the
     stamp. The property that actually prevents the collision lives in the stylesheet, so
     that is what this reads — the same trick chrome-layout.test.ts uses, and for the same
     reason: jsdom computes no layout and cannot see the overlap itself. */
  it('keeps the stamp in flow, so it cannot print over the figure', () => {
    const stamp = rule('.settle-stamp');
    expect(stamp, '.settle-stamp rule not found in ceremony.css').not.toBeNull();
    expect(stamp, 'the stamp is out of flow again — it will print over the amount').not.toMatch(
      /position:\s*(absolute|fixed)/,
    );
    // And the berth has to actually reserve the room the rotated word needs.
    const berth = rule('.settle-stamp-berth');
    expect(berth, '.settle-stamp-berth rule not found').not.toBeNull();
    const h = /height:\s*(\d+)px/.exec(berth!);
    expect(h, 'the berth must reserve a fixed height').not.toBeNull();
    // 220px of word at -12deg needs 220*sin12 + 48*cos12 = 93px.
    expect(Number(h![1])).toBeGreaterThanOrEqual(93);
  });

  it('the count stage actually counts: the figure holds at zero, then winds up', () => {
    const queue: FrameRequestCallback[] = [];
    let clock = 0;
    vi.useFakeTimers(); // first: the frame stubs below must outlive it
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    render(<SettleCeremony data={data} onDone={vi.fn()} />);
    const amount = screen.getByTestId('settle-amount');
    // Before the stamp has landed.
    expect(amount).toHaveTextContent('$0.00');
    expect(amount).toHaveAttribute('data-value', '$148.00');
    expect(queue).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(800); }); // stage 'count'
    expect(queue.length).toBeGreaterThan(0);

    const seen: string[] = [];
    for (let i = 0; i < 400 && queue.length; i++) {
      const due = queue.splice(0);
      clock += 16.7;
      act(() => due.forEach((cb) => cb(clock)));
      const now = amount.textContent ?? '';
      if (now !== seen[seen.length - 1]) seen.push(now);
    }
    expect(seen.length).toBeGreaterThan(20); // it counted, it did not cut
    expect(amount).toHaveTextContent('$148.00');
  });

  it('finishes and calls back', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SettleCeremony data={data} onDone={onDone} />);
    // Off the constant, not a number typed here: a literal is how the previous guard went
    // stale and let the count get cut off.
    vi.advanceTimersByTime(VERDICT_DONE_MS);
    expect(onDone).toHaveBeenCalledOnce();
  });

  /* The regression the review caught. The count is released at 'count' and needs
     DURATION_MS.hero to reach the total; the ceremony used to close 500ms before that, so
     the last frame the user saw read $142.70 against a target of $148.00. Driven off one
     clock — the rAF the Odometer counts on AND the timer that closes the ceremony — because
     stepping only one of them is what let the original version of this test pass while the
     figure was being torn down mid-wind. */
  it('lands the figure on its real total before it closes', () => {
    const queue: FrameRequestCallback[] = [];
    let clock = 0;
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    const onDone = vi.fn();
    render(<SettleCeremony data={data} onDone={onDone} />);
    const amount = screen.getByTestId('settle-amount');

    // One clock: advance the timers and the frames together, 16.7ms at a time.
    while (!onDone.mock.calls.length && clock < 10_000) {
      act(() => { vi.advanceTimersByTime(16.7); });
      clock += 16.7;
      const due = queue.splice(0);
      act(() => due.forEach((cb) => cb(clock)));
    }
    expect(onDone).toHaveBeenCalledOnce();
    expect(
      amount.textContent,
      'the ceremony closed while the figure was still counting — the last thing on screen was a wrong number',
    ).toBe('$148.00');
  });

  /* Replaces a test that asserted a verdict never reaches the 'file' stage and renders no
     .xc-swap. Both were true by construction once the branches split — 'file' is not in the
     verdict's stage union and the exchange JSX sits behind an early return — so it passed
     even with the verdict render entirely broken.

     What CAN break is which branch gets picked. It keys off the exchange payload, not the
     tone word, so that a tone of 'assign' with nothing to exchange still degrades to a
     readable verdict rather than an empty stage. */
  it('picks its branch off the exchange payload, not the tone word', () => {
    const noExchange = render(<SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign' as const }} onDone={vi.fn()} />);
    expect(noExchange.container.querySelector('.settle-verdict')).not.toBeNull();
    expect(noExchange.container.querySelector('.xc-swap')).toBeNull();
    expect(noExchange.container.querySelector('.settle-stamp')).toHaveTextContent('ASSIGNED');

    const withExchange = render(<SettleCeremony data={{ ...data, tone: 'up' as const, exchange }} onDone={vi.fn()} />);
    expect(withExchange.container.querySelector('.settle-exchange')).not.toBeNull();
    expect(withExchange.container.querySelector('.settle-stamp')).toBeNull();
  });
});

/* An assignment is a conversion, not a verdict on a trade, so it does not get the stamp at
   all: it shows what left and what arrived, side by side, and files the certificate. */
describe('SettleCeremony — the exchange (assigned)', () => {
  it('draws both halves of the exchange, in separate columns', () => {
    const { container } = render(<SettleCeremony data={assigned} onDone={vi.fn()} />);
    const gone = container.querySelector('.xc-gone');
    const got = container.querySelector('.xc-got');
    expect(gone).toHaveTextContent('cash committed');
    expect(gone).toHaveTextContent('−$24,800');
    expect(got).toHaveTextContent('shares received');
    expect(got).toHaveTextContent('400 sh');
    // Siblings in one row, never one stacked over the other: this is what makes the old
    // stamp-through-the-figure collision structurally impossible here.
    expect(gone!.parentElement).toBe(got!.parentElement);
    expect(gone!.parentElement).toHaveClass('xc-swap');
    expect(container.querySelector('.settle-stamp')).toBeNull();
  });

  it('names what happened and where it was filed', () => {
    const { container } = render(<SettleCeremony data={assigned} onDone={vi.fn()} />);
    expect(container.querySelector('.xc-verdict')).toHaveTextContent('put assigned · you own the shares');
    expect(container.querySelector('.xc-filed')).toHaveTextContent('filed to TQQQ');
  });

  /* The certificate has to go BEHIND the sleeve. The old ceremony faded it out at opacity 0
     on top of one, which is why nothing ever read as filed.

     Sibling order alone does not prove that: delete the clip-path and push the sleeve off
     the stage and an order-only assertion is still green while the defect is fully restored.
     What makes filing work is arithmetic — the window's clipped floor has to land exactly on
     the sleeve's mouth — so compute it from the stylesheet and check it. */
  it('clips the filing window off exactly at the sleeve mouth', () => {
    const win = rule('.xc-window');
    const sleeve = rule('.xc-sleeve');
    expect(win, '.xc-window rule not found').not.toBeNull();
    expect(sleeve, '.xc-sleeve rule not found').not.toBeNull();

    const top = Number(/top:\s*(\d+)px/.exec(win!)![1]);
    const height = Number(/height:\s*(\d+)px/.exec(win!)![1]);
    const inset = /clip-path:\s*inset\(\s*0\s+0\s+(\d+)px/.exec(win!);
    expect(inset, '.xc-window must clip its bottom, or the card files in front of nothing').not.toBeNull();
    const sleeveTop = Number(/top:\s*(\d+)px/.exec(sleeve!)![1]);

    expect(
      top + height - Number(inset![1]),
      'the clipped floor must sit on the sleeve mouth, or the certificate is cut off in mid-air ' +
        'or slides visibly past the sleeve instead of behind it',
    ).toBe(sleeveTop);
  });

  it('puts the travelling card inside that window and the sleeve outside it', () => {
    const { container } = render(<SettleCeremony data={assigned} onDone={vi.fn()} />);
    const win = container.querySelector('.xc-window');
    expect(win!.querySelector('.xc-filing .xc-swap')).not.toBeNull();
    expect(win!.contains(container.querySelector('.xc-sleeve'))).toBe(false);
  });

  it('runs longer than a verdict, and finishes', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(<SettleCeremony data={assigned} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onDone).not.toHaveBeenCalled(); // a verdict would already be done
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).toBe('file');
    act(() => { vi.advanceTimersByTime(600); });
    expect(onDone).toHaveBeenCalledOnce();
  });

  /* It used to run 6.4s with ~2.25s of byte-identical frames in it. */
  it('is shorter than the ceremony it replaced', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SettleCeremony data={assigned} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(3400); });
    expect(onDone).toHaveBeenCalledOnce();
  });
});
