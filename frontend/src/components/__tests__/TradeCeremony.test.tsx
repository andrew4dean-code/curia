import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

describe('TradeCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('types the ticket like a press and advances through the stages', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    expect(screen.getByText(/TRADE TICKET Nº 47/)).toBeInTheDocument();
    // the trade lines hammer out one character at a time
    expect(screen.queryByText('BUY 400 TQQQ')).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText('BUY 400 TQQQ')).toBeNull(); // still mid-word
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('BUY 400 TQQQ')).toBeInTheDocument();
    expect(screen.getByText('@ $72.00')).toBeInTheDocument();
    const root = container.querySelector('[data-stage]')!;
    act(() => vi.advanceTimersByTime(100)); // 2500ms total
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
