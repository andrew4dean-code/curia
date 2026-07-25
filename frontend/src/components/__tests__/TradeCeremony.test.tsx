import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

describe('TradeCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('typesets the ticket and advances through the stages', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    expect(screen.getByText(/TRADE TICKET Nº 47/)).toBeInTheDocument();
    expect(screen.getByText('BUY 400 TQQQ')).toBeInTheDocument();
    const root = container.querySelector('[data-stage]')!;
    expect(root.getAttribute('data-stage')).toBe('print');
    act(() => vi.advanceTimersByTime(1700));
    expect(root.getAttribute('data-stage')).toBe('fold');
    act(() => vi.advanceTimersByTime(950));
    expect(root.getAttribute('data-stage')).toBe('envelope');
    act(() => vi.advanceTimersByTime(850));
    expect(root.getAttribute('data-stage')).toBe('ship');
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('a tap anywhere skips straight to done, exactly once', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    fireEvent.click(container.querySelector('[data-stage]')!);
    fireEvent.click(container.querySelector('[data-stage]')!);
    expect(onDone).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(6000));
    expect(onDone).toHaveBeenCalledOnce(); // timers cleaned up, no double fire
  });
});
