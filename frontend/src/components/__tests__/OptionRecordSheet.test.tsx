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
    render(<OptionRecordSheet option={settled} onCancel={vi.fn()} />);
    expect(screen.getByText(/Expired worthless/)).toBeInTheDocument();
    expect(screen.getByText('+$146.70')).toBeInTheDocument();
    expect(screen.queryByText(/booked share trade stays/)).toBeNull();
  });

  it('warns that the booked trade stays when the option was assigned', () => {
    render(
      <OptionRecordSheet
        option={{ ...settled, status: 'ASSIGNED', assigned_trade_id: 3 }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/booked share trade stays/)).toBeInTheDocument();
  });

  it('files an assigned call under "Called away"', () => {
    render(
      <OptionRecordSheet
        option={{ ...settled, opt_type: 'CALL', status: 'ASSIGNED', assigned_trade_id: 3 }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Called away/)).toBeInTheDocument();
    expect(screen.queryByText(/Assigned/)).toBeNull();
  });

  it('files an assigned put under "Assigned", which is right on that side', () => {
    render(
      <OptionRecordSheet
        option={{ ...settled, status: 'ASSIGNED', assigned_trade_id: 3 }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/Assigned/)).toBeInTheDocument();
    expect(screen.queryByText(/Called away/)).toBeNull();
  });

  it('deletes after confirm and refuses without it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OptionRecordSheet option={settled} onDeleted={onDeleted} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete record/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Delete record/ }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(onDeleted).toHaveBeenCalledWith(7);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/options/7');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('a failed delete leaves onDeleted uncalled — no strike, no fold', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OptionRecordSheet option={settled} onDeleted={onDeleted} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete record/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText(/Could not delete/)).toBeInTheDocument();
  });
});
