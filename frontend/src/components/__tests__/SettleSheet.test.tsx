import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleSheet } from '../SettleSheet';
import type { OptionPosition } from '../../lib/types';

const csp: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-31',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-24', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

describe('SettleSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('expired outcome settles in one tap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<SettleSheet option={csp} onDone={onDone} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Expired worthless/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Settle$/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).outcome).toBe('EXPIRED');
  });

  it('bought back reveals the price field and requires it', () => {
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Bought back/ }));
    expect(screen.getByLabelText('Buyback / share')).toBeRequired();
  });

  it('assigned shows exactly what will be booked', () => {
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Assigned/ }));
    expect(screen.getByText(/Books: BUY 200 TQQQ @ \$62\.00/)).toBeInTheDocument();
  });
});
