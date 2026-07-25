import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsTab } from '../OptionsTab';
import type { Snapshot } from '../../lib/api';
import type { OptionPosition } from '../../lib/types';

const base: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

function snapWith(options: OptionPosition[]): Snapshot {
  return { trades: [], marks: [], options, fetchedAt: new Date().toISOString() };
}

const cbs = {
  onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(),
  onSettleOption: vi.fn(), onEditOption: vi.fn(),
};

describe('OptionsTab board', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 10, 0, 0)); // Wed Aug 12 2026
  });
  afterEach(() => vi.useRealTimers());

  it('renders every Friday of the current month as a week line', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText('August')).toBeInTheDocument();
    ['Aug 7', 'Aug 14', 'Aug 21', 'Aug 28'].forEach((d) =>
      expect(screen.getByText(new RegExp(d))).toBeInTheDocument(),
    );
  });

  it('shows the month score from settled + open options', () => {
    const rows = [
      { ...base, id: 2, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' },
      base,
    ];
    render(<OptionsTab snap={snapWith(rows)} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/\$294\.70 collected/)).toBeInTheDocument();
  });

  it('open option renders as a seal chip that opens the settle sheet', () => {
    const onSettle = vi.fn();
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSettleOption={onSettle} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /TQQQ \$62 PUT/ }));
    expect(onSettle).toHaveBeenCalledWith(base);
  });

  it('settled option prints kept amount on its line', () => {
    const settled = { ...base, id: 3, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    render(<OptionsTab snap={snapWith([settled])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/kept \+\$146\.70/)).toBeInTheDocument();
  });

  it('tapping an empty future week sells into that Friday; past weeks are inert', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 21/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-21');
    expect(screen.queryByRole('button', { name: /sell the week of Aug 7/i })).toBeNull();
  });

  it('an occupied week still offers selling another option', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 14/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-14');
  });

  it('chevrons browse months', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('September')).toBeInTheDocument();
  });

  it('does not fake a live week when browsing other months', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('September')).toBeInTheDocument();
    expect(screen.queryByText(/left/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText(/left/)).toBeInTheDocument(); // current month's real live week returns
  });
});
