import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleCeremony } from '../SettleCeremony';
import type { SettleExchange } from '../SettleCeremony';

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
     the word straight through the figure. The berth is what keeps them apart, so its
     presence is the thing worth pinning: jsdom computes no layout and cannot see the
     collision itself. */
  it('gives the stamp its own berth in flow, so it cannot print over the figure', () => {
    const { container } = render(<SettleCeremony data={data} onDone={vi.fn()} />);
    const berth = container.querySelector('.settle-stamp-berth');
    expect(berth).not.toBeNull();
    expect(berth!.querySelector('.settle-stamp')).not.toBeNull();
    // Out of flow again and the collision is back.
    expect(container.querySelector('.settle-stamp')!.closest('.settle-stamp-berth')).toBe(berth);
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
    vi.advanceTimersByTime(2500);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('never reaches the filing stage — only an assignment is filed', () => {
    vi.useFakeTimers();
    const { container } = render(<SettleCeremony data={data} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(2300); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).not.toBe('file');
    expect(container.querySelector('.xc-swap')).toBeNull();
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
     on top of one, which is why nothing ever read as filed. The clipping window is the
     mechanism, and jsdom cannot see clip-path take effect — so pin the structure: the
     travelling card must be inside the window, and the sleeve must not be. */
  it('files the certificate through a clipping window the sleeve sits outside of', () => {
    const { container } = render(<SettleCeremony data={assigned} onDone={vi.fn()} />);
    const window_ = container.querySelector('.xc-window');
    const sleeve = container.querySelector('.xc-sleeve');
    expect(window_!.querySelector('.xc-filing .xc-swap')).not.toBeNull();
    expect(sleeve).not.toBeNull();
    expect(window_!.contains(sleeve)).toBe(false);
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
