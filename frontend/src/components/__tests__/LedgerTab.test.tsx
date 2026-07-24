import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedgerTab } from '../LedgerTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = {
  trades: [
    { id: 1, symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-06-01', note: '' },
    { id: 2, symbol: 'AAPL', side: 'SELL', qty: 10, price: 110, fees: 0, executed_at: '2026-07-01', note: '' },
    { id: 3, symbol: 'NVDA', side: 'BUY', qty: 1, price: 500, fees: 0, executed_at: '2026-07-02', note: '' },
  ],
  marks: [],
  fetchedAt: new Date().toISOString(),
};

describe('LedgerTab', () => {
  it('shows closed trades and stats', () => {
    render(<LedgerTab snap={snap} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />);
    // +$100.00 appears in the trade row AND several stat tiles → getAllByText
    expect(screen.getAllByText(/\+\$100\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Win rate')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('all-entries view lists raw trades and edit fires onEditTrade', () => {
    const onEdit = vi.fn();
    render(<LedgerTab snap={snap} onRefresh={vi.fn()} onEditTrade={onEdit} onMark={vi.fn()} />);
    fireEvent.click(screen.getByText(/All entries/));
    // the still-open NVDA buy only exists in the raw entries list
    expect(screen.getByText(/NVDA/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText(/edit/i)[0]);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('empty ledger shows the honest empty state', () => {
    render(
      <LedgerTab snap={{ trades: [], marks: [], fetchedAt: snap.fetchedAt }} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByText(/No closed trades yet/)).toBeInTheDocument();
  });
});
