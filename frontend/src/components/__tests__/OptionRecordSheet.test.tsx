import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionRecordSheet } from '../OptionRecordSheet';
import type { OptionPosition } from '../../lib/types';

const settled: OptionPosition = {
  id: 7, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-24',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-20', note: '',
  status: 'EXPIRED', closed_at: '2026-07-24', buyback_price: 0, close_fees: 0,
  assigned_trade_id: null,
};

describe('OptionRecordSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the record and its P/L', () => {
    render(<OptionRecordSheet option={settled} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Expired worthless/)).toBeInTheDocument();
    expect(screen.getByText('+$146.70')).toBeInTheDocument();
    expect(screen.queryByText(/booked share trade stays/)).toBeNull();
  });

  it('warns that the booked trade stays when the option was assigned', () => {
    render(
      <OptionRecordSheet
        option={{ ...settled, status: 'ASSIGNED', assigned_trade_id: 3 }}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/booked share trade stays/)).toBeInTheDocument();
  });

  it('deletes after confirm and refuses without it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OptionRecordSheet option={settled} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete record/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Delete record/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/options/7');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});
