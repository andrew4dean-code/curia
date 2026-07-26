import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleCeremony } from '../SettleCeremony';

const data = { word: 'EXPIRED', tone: 'up' as const, amount: '$148.00', symbol: 'TQQQ' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettleCeremony', () => {
  it('stamps the outcome and shows the amount', () => {
    render(<SettleCeremony data={data} onDone={vi.fn()} />);
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByTestId('settle-amount')).toHaveAttribute('data-value', '$148.00');
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
    // Behind the stamp, before the amount rises into view.
    expect(amount).toHaveTextContent('$0.00');
    expect(amount).toHaveAttribute('data-value', '$148.00');
    expect(queue).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(1300); }); // stage 'count'
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
    vi.advanceTimersByTime(4000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('an assignment runs longer than an expiry', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ' }} onDone={onDone} />);
    vi.advanceTimersByTime(4000);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2600);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('the certificate stage draws a border and names the shares', () => {
    vi.useFakeTimers();
    const { container } = render(
      <SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ @ $62.00' }} onDone={vi.fn()} />,
    );
    act(() => vi.advanceTimersByTime(3900));
    expect(container.querySelector('.cert-frame')).not.toBeNull();
    expect(screen.getByText(/400 SHARES · TQQQ @ \$62\.00/)).toBeInTheDocument();
  });

  it('files the certificate away before finishing', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(
      <SettleCeremony data={{ ...data, word: 'ASSIGNED', tone: 'assign', shares: '400 SHARES · TQQQ @ $62.00' }} onDone={onDone} />,
    );
    act(() => { vi.advanceTimersByTime(5400); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).toBe('file');
    expect(container.querySelector('.settle-file')).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('an expiry never reaches the filing stage', () => {
    vi.useFakeTimers();
    const { container } = render(<SettleCeremony data={data} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(3700); });
    expect(container.querySelector('.settle-ceremony')?.getAttribute('data-stage')).not.toBe('file');
  });
});
