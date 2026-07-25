import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedgerTab } from '../LedgerTab';
import type { Snapshot } from '../../lib/api';
import type { OptionPosition } from '../../lib/types';

const snap: Snapshot = {
  trades: [
    { id: 1, symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-06-01', note: '' },
    { id: 2, symbol: 'AAPL', side: 'SELL', qty: 10, price: 110, fees: 0, executed_at: '2026-07-01', note: '' },
    { id: 3, symbol: 'NVDA', side: 'BUY', qty: 1, price: 500, fees: 0, executed_at: '2026-07-02', note: '' },
  ],
  marks: [],
  options: [],
  wheels: [],
  fetchedAt: new Date().toISOString(),
};

const cbs = {
  onRefresh: vi.fn(),
  onEditTrade: vi.fn(),
  onMark: vi.fn(),
  onSettleOption: vi.fn(),
  onEditOption: vi.fn(),
};

const settledPut: OptionPosition = {
  id: 11, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-07-18',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-07-14', note: '',
  status: 'EXPIRED', closed_at: '2026-07-18', buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

describe('LedgerTab', () => {
  it('shows closed trades and stats', () => {
    render(<LedgerTab snap={snap} {...cbs} />);
    // +$100.00 appears in the trade row AND several stat tiles → getAllByText
    expect(screen.getAllByText(/\+\$100\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Win rate')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('all-entries view lists raw trades and edit fires onEditTrade', () => {
    const onEdit = vi.fn();
    render(<LedgerTab snap={snap} {...cbs} onEditTrade={onEdit} />);
    fireEvent.click(screen.getByText(/All entries/));
    // the still-open NVDA buy only exists in the raw entries list
    expect(screen.getByText(/NVDA/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText(/edit/i)[0]);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('empty ledger shows the honest empty state', () => {
    render(
      <LedgerTab snap={{ trades: [], marks: [], options: [], wheels: [], fetchedAt: snap.fetchedAt }} {...cbs} />,
    );
    expect(screen.getByText(/No closed trades yet/)).toBeInTheDocument();
  });

  it('shows the premium record with outcome tag and P/L', () => {
    render(<LedgerTab snap={{ ...snap, options: [settledPut] }} {...cbs} />);
    expect(screen.getByText('Premium Record')).toBeInTheDocument();
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getAllByText(/\+\$146\.70/).length).toBeGreaterThan(0);
    expect(screen.getByText('Premium kept')).toBeInTheDocument();
  });

  it('open options do not appear in the premium record', () => {
    render(<LedgerTab snap={{ ...snap, options: [{ ...settledPut, id: 12, status: 'OPEN', closed_at: null }] }} {...cbs} />);
    expect(screen.queryByText('Premium Record')).not.toBeInTheDocument();
  });

  it('a premium record row opens its record sheet', () => {
    const onViewRecord = vi.fn();
    render(<LedgerTab snap={{ ...snap, options: [settledPut] }} {...cbs} onViewRecord={onViewRecord} />);
    fireEvent.click(screen.getByText(/TQQQ \$62 PUT/));
    expect(onViewRecord).toHaveBeenCalledWith(settledPut);
  });

  it('all-entries rows offer a confirmed delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<LedgerTab snap={snap} {...cbs} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText(/All entries/));
    fireEvent.click(screen.getAllByText('delete')[0]);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/trades\/\d+/);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
