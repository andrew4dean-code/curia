import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompleteWheelSheet, FreshWheelSheet } from '../WheelSheets';
import { WheelCeremony } from '../WheelCeremony';
import type { WheelSummary } from '../../lib/types';

describe('FreshWheelSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('opens the wheel and hands back ceremony data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 5, symbol: 'TQQQ', no: 2, opened_at: '2026-07-06', closed_at: null }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<FreshWheelSheet suggestions={['TQQQ']} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'TQQQ' })); // suggestion chip fills the symbol
    fireEvent.change(screen.getByLabelText('Started'), { target: { value: '2026-07-06' } });
    fireEvent.click(screen.getByRole('button', { name: /Open the wheel/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'TQQQ', opened_at: '2026-07-06' });
    expect(onDone.mock.calls[0][0]).toMatchObject({ mode: 'open', symbol: 'TQQQ', no: 2 });
  });
});

describe('CompleteWheelSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('closes the wheel and carries the final line into the ceremony', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const summary: WheelSummary = {
      wheel: { id: 9, symbol: 'NVDA', no: 1, opened_at: '2026-05-04', closed_at: null },
      stage: 'CALLED_AWAY', sharesHeld: 0, rawBasis: null, premiumBanked: 1241,
      trueBasis: null, closeToday: 1241, markMissing: false, callsSold: 7, weeks: 8, cap: null, putExposure: null,
    };
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<CompleteWheelSheet summary={summary} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Complete the wheel/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/wheels/9/close');
    expect(onDone.mock.calls[0][0]).toMatchObject({ mode: 'complete', symbol: 'NVDA', no: 1 });
    expect((onDone.mock.calls[0][0] as { totalLine: string }).totalLine).toMatch(/\+\$1,241\.00/);
  });
});

describe('WheelCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('draws, spins, stamps, types the caption, then finishes once', () => {
    const onDone = vi.fn();
    const { container } = render(
      <WheelCeremony data={{ mode: 'open', symbol: 'TQQQ', no: 2 }} onDone={onDone} />,
    );
    const root = container.querySelector('[data-phase]')!;
    expect(root.getAttribute('data-phase')).toBe('draw');
    act(() => vi.advanceTimersByTime(1400));
    expect(root.getAttribute('data-phase')).toBe('spin');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/TQQQ · WHEEL Nº 2/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400));
    expect(root.getAttribute('data-phase')).toBe('stamp');
    act(() => vi.advanceTimersByTime(900));
    expect(onDone).toHaveBeenCalledOnce();
    fireEvent.click(root);
    expect(onDone).toHaveBeenCalledOnce(); // never twice
  });

  it('a tap skips immediately', () => {
    const onDone = vi.fn();
    const { container } = render(
      <WheelCeremony data={{ mode: 'complete', symbol: 'NVDA', no: 1, totalLine: '+$1,241.00' }} onDone={onDone} />,
    );
    fireEvent.click(container.querySelector('[data-phase]')!);
    expect(onDone).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(6000));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
