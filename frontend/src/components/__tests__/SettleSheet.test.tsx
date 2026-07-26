import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { SettleSheet } from '../SettleSheet';
import type { OptionPosition } from '../../lib/types';

// Passthrough spy: existing tests still stub global fetch and inspect it directly,
// this just lets the new tests assert on settleOption's own call args.
vi.spyOn(api, 'settleOption');

const csp: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-31',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-24', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

describe('SettleSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('defaults the settle date to the expiration once it has passed', () => {
    vi.setSystemTime(new Date(2026, 6, 23, 9, 0, 0)); // Thu Jul 23 2026
    const stale = { ...csp, expiration: '2026-07-17', status: 'OPEN' as const };
    render(<SettleSheet option={stale} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/settle date/i) as HTMLInputElement).value).toBe('2026-07-17');
  });

  it('defaults to today while the option is still live', () => {
    vi.setSystemTime(new Date(2026, 6, 23, 9, 0, 0));
    const live = { ...csp, expiration: '2026-07-31', status: 'OPEN' as const };
    render(<SettleSheet option={live} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/settle date/i) as HTMLInputElement).value).toBe('2026-07-23');
  });

  it('asks nothing about fees when buying back', () => {
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bought back/i }));
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
  });

  it('settles a buyback with zero fees', async () => {
    const settle = vi.mocked(api.settleOption);
    render(<SettleSheet option={csp} onDone={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bought back/i }));
    fireEvent.change(screen.getByLabelText(/buyback \/ share/i), { target: { value: '0.20' } });
    fireEvent.click(screen.getByRole('button', { name: /^settle$/i }));
    await waitFor(() =>
      expect(settle).toHaveBeenCalledWith(csp.id, expect.objectContaining({ buyback_price: 0.2, close_fees: 0 })),
    );
  });
});
