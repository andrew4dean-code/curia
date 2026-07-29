import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LedgerTab } from '../LedgerTab';
import type { Snapshot } from '../../lib/api';
import { DEFAULT_SETTINGS } from '../../lib/api';
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
  quietWeeks: [],
  settings: DEFAULT_SETTINGS,
  fetchedAt: new Date().toISOString(),
};

const snapWithTrades: Snapshot = {
  ...snap,
  trades: [
    { id: 1, symbol: 'TQQQ', side: 'BUY', qty: 10, price: 100, fees: 0, executed_at: '2026-06-01', note: '' },
    ...snap.trades.slice(1),
  ],
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

const snapWithSettledOptions: Snapshot = {
  ...snap,
  options: [settledPut, { ...settledPut, id: 7, symbol: 'AAPL' }],
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
      <LedgerTab snap={{ trades: [], marks: [], options: [], wheels: [], quietWeeks: [], settings: DEFAULT_SETTINGS, fetchedAt: snap.fetchedAt }} {...cbs} />,
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

  it('inline delete routes through the App-level handler and strikes the row instead of just vanishing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    // A tiny harness standing in for App.tsx: it owns strikingTradeId and an
    // onDeleted that marks a row struck, mirroring the real onDeleted's
    // synchronous half (the 700ms clear-and-refresh is App.tsx's own concern
    // and is covered by the App-level strike-timer tests).
    function Harness() {
      const [strikingTradeId, setStrikingTradeId] = useState<number | null>(null);
      const onDeleted = async (id?: number) => {
        if (id != null) setStrikingTradeId(id);
      };
      return (
        <LedgerTab
          snap={snap}
          {...cbs}
          onRefresh={onRefresh}
          onDeleted={onDeleted}
          strikingTradeId={strikingTradeId}
        />
      );
    }

    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText(/All entries/));
    fireEvent.click(screen.getAllByText('delete')[0]);

    await waitFor(() => expect(container.querySelectorAll('.striking')).toHaveLength(1));
    expect(container.querySelector('.striking')?.textContent).toMatch(/NVDA/);
    // The App-level handler owns the refresh (after its own 700ms strike);
    // LedgerTab must not short-circuit it by refreshing directly.
    expect(onRefresh).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('a failed inline delete leaves the row untouched — no strike, no fold', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn().mockResolvedValue(undefined);

    render(<LedgerTab snap={snap} {...cbs} onRefresh={onRefresh} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText(/All entries/));
    fireEvent.click(screen.getAllByText('delete')[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // let the rejected delete settle without anything downstream firing
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onDeleted).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.striking')).toHaveLength(0);
    expect(screen.getByText(/NVDA/)).toBeInTheDocument();

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('marks the struck row and leaves its neighbours alone', () => {
    const { container } = render(<LedgerTab snap={snapWithTrades} {...cbs} strikingTradeId={1} />);
    const struck = container.querySelectorAll('.striking');
    expect(struck).toHaveLength(1);
    expect(struck[0].textContent).toMatch(/TQQQ/);
  });

  it('marks a struck settled option and leaves its neighbours alone', () => {
    const { container } = render(<LedgerTab snap={snapWithSettledOptions} {...cbs} strikingOptionId={7} />);
    const struck = container.querySelectorAll('.striking');
    expect(struck).toHaveLength(1);
    expect(struck[0].getAttribute('data-opt-id')).toBe('7');
  });
});
