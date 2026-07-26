import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleCeremony } from '../SettleCeremony';

const data = { word: 'EXPIRED', tone: 'up' as const, amount: '$148.00', symbol: 'TQQQ' };

afterEach(() => vi.useRealTimers());

describe('SettleCeremony', () => {
  it('stamps the outcome and shows the amount', () => {
    render(<SettleCeremony data={data} onDone={vi.fn()} />);
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByTestId('settle-amount')).toHaveAttribute('data-value', '$148.00');
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
});
