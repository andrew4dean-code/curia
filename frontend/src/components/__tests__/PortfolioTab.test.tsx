import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioTab } from '../PortfolioTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = {
  trades: [
    { id: 1, symbol: 'AAPL', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-07-01', note: '' },
    { id: 2, symbol: 'NVDA', side: 'BUY', qty: 2, price: 500, fees: 0, executed_at: '2026-07-02', note: '' },
  ],
  marks: [{ symbol: 'AAPL', price: 120, marked_at: new Date().toISOString(), source: 'auto' as const }],
  options: [],
  wheels: [],
  fetchedAt: new Date().toISOString(),
};

describe('PortfolioTab', () => {
  it('renders positions with P/L and staleness, and no-mark fallback', () => {
    render(
      <PortfolioTab snap={snap} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                     onSettleOption={vi.fn()} onEditOption={vi.fn()} />,
    );
    // AAPL and its P/L appear in both the row and the looping ticker/hero → getAllByText
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+\$200\.00/).length).toBeGreaterThan(0); // (120-100)*10
    expect(screen.getByText(/marked today/)).toBeInTheDocument();
    expect(screen.getByText(/no mark yet/)).toBeInTheDocument(); // NVDA
    // book value hero: AAPL 10*120 + NVDA fallback 2*500 = 2200
    expect(screen.getByTestId('book-value').getAttribute('data-value')).toBe('$2,200.00');
  });

  it('empty state invites the first trade', () => {
    render(
      <PortfolioTab snap={{ trades: [], marks: [], options: [], wheels: [], fetchedAt: snap.fetchedAt }} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                     onSettleOption={vi.fn()} onEditOption={vi.fn()} />,
    );
    expect(screen.getByText(/No open positions/)).toBeInTheDocument();
  });

  it('an active wheel claims its symbol: card renders, holdings exclude it', () => {
    const withWheel: Snapshot = {
      ...snap,
      wheels: [{ id: 1, symbol: 'AAPL', no: 1, opened_at: '2026-06-01', closed_at: null }],
    };
    render(<PortfolioTab snap={withWheel} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                         onSettleOption={vi.fn()} onEditOption={vi.fn()} onFreshWheel={vi.fn()} />);
    expect(screen.getByText(/Wheel Nº 1/)).toBeInTheDocument();
    expect(screen.getByText('Other holdings')).toBeInTheDocument();
    // AAPL now lives in the wheel card; NVDA remains a plain holding
    expect(screen.getAllByText('NVDA').length).toBeGreaterThan(0);
  });

  it('with no wheels, invites a fresh one', () => {
    const onFreshWheel = vi.fn();
    render(<PortfolioTab snap={snap} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                         onSettleOption={vi.fn()} onEditOption={vi.fn()} onFreshWheel={onFreshWheel} />);
    fireEvent.click(screen.getByText(/Begin a fresh wheel/));
    expect(onFreshWheel).toHaveBeenCalledOnce();
  });

  it('completed wheels live in the archive with their final take', () => {
    const withArchive: Snapshot = {
      ...snap,
      wheels: [{ id: 3, symbol: 'AAPL', no: 1, opened_at: '2026-05-04', closed_at: '2026-06-27' }],
    };
    const onViewWheelRecord = vi.fn();
    render(<PortfolioTab snap={withArchive} onRefresh={vi.fn()} onEditTrade={vi.fn()} onMark={vi.fn()}
                         onSettleOption={vi.fn()} onEditOption={vi.fn()} onViewWheelRecord={onViewWheelRecord} />);
    fireEvent.click(screen.getByText(/Wheel archive \(1\)/));
    fireEvent.click(screen.getByText(/AAPL · Nº 1/));
    expect(onViewWheelRecord).toHaveBeenCalledOnce();
  });
});
