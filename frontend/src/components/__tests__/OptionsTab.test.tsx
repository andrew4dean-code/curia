import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsTab } from '../OptionsTab';
import { DEFAULT_SETTINGS } from '../../lib/api';
import type { Snapshot } from '../../lib/api';
import type { OptionPosition } from '../../lib/types';

const base: OptionPosition = {
  id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 62, expiration: '2026-08-14',
  contracts: 2, premium: 0.74, fees: 1.3, opened_at: '2026-08-10', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

function snapWith(options: OptionPosition[], quietWeeks: string[] = []): Snapshot {
  return { trades: [], marks: [], options, wheels: [], quietWeeks, settings: DEFAULT_SETTINGS, fetchedAt: new Date().toISOString() };
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
    expect(screen.getByTestId('month-score')).toHaveAttribute('data-value', '$294.70');
    expect(screen.getByText(/collected this month/)).toBeInTheDocument();
  });

  it('the month score counts its value up rather than rolling digit reels', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    const score = screen.getByTestId('month-score');
    expect(score).toHaveAttribute('data-value', '$148.00');
    // One text node holding the whole formatted figure — no per-digit strip to translate.
    expect(score).toHaveTextContent('$148.00');
    expect(container.querySelectorAll('.odo-reel')).toHaveLength(0);
    expect(container.querySelectorAll('.odo-strip')).toHaveLength(0);
  });

  it('open option renders as a seal chip that opens the settle sheet', () => {
    const onSettle = vi.fn();
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSettleOption={onSettle} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /TQQQ \$62 PUT/ }));
    expect(onSettle).toHaveBeenCalledWith(base);
  });

  it('settled option prints its realized amount and opens its record on tap', () => {
    const settled = { ...base, id: 3, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    const onViewRecord = vi.fn();
    const { container } = render(<OptionsTab snap={snapWith([settled])} {...cbs} onSellWeek={vi.fn()} onViewRecord={onViewRecord} />);
    expect(container.querySelector('.wk-row.settled .wk-row-amt')).toHaveTextContent('+$146.70');
    // The outcome is on the row now — the board used to say only "kept", losing the
    // difference between an expiry, a buy-back and an assignment.
    expect(container.querySelector('.wk-row.settled .wk-tag')).toHaveTextContent('expired');
    fireEvent.click(screen.getByText(/\+\$146\.70/));
    expect(onViewRecord).toHaveBeenCalledWith(settled);
  });

  /* This tag was the raw status with its underscore swapped for a space, which is how a
     called-away call came to be labelled "assigned" on the board. */
  it('tags a called-away call as called away, and an assigned put as assigned', () => {
    const call = {
      ...base, id: 4, opt_type: 'CALL' as const, status: 'ASSIGNED' as const,
      closed_at: '2026-08-07', expiration: '2026-08-07',
    };
    const put = { ...call, id: 5, opt_type: 'PUT' as const };

    const callBoard = render(<OptionsTab snap={snapWith([call])} {...cbs} onSellWeek={vi.fn()} />);
    expect(callBoard.container.querySelector('.wk-row.settled .wk-tag')).toHaveTextContent('called away');
    callBoard.unmount();

    const putBoard = render(<OptionsTab snap={snapWith([put])} {...cbs} onSellWeek={vi.fn()} />);
    expect(putBoard.container.querySelector('.wk-row.settled .wk-tag')).toHaveTextContent('assigned');
  });

  it('still tags a bought-back contract the same on both sides', () => {
    const boughtBack = {
      ...base, id: 6, status: 'BOUGHT_BACK' as const, buyback_price: 0.2,
      closed_at: '2026-08-07', expiration: '2026-08-07',
    };
    const { container } = render(<OptionsTab snap={snapWith([boughtBack])} {...cbs} onSellWeek={vi.fn()} />);
    expect(container.querySelector('.wk-row.settled .wk-tag')).toHaveTextContent('bought back');
  });

  /* The premium used to orphan itself onto a second line whenever the symbol ran long,
     because a 34px seal disc restating CALL/PUT ate the width. Open and settled must
     share one grid so the figure sits in the same column on every row of the month. */
  it('puts open and settled amounts in the same column of the same row skeleton', () => {
    const settled = { ...base, id: 3, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    const { container } = render(<OptionsTab snap={snapWith([base, settled])} {...cbs} onSellWeek={vi.fn()} />);
    const rows = container.querySelectorAll('.wk-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelector('.wk-row-what')).not.toBeNull();
      expect(row.querySelector('.wk-row-amt')).not.toBeNull();
    }
    expect(container.querySelectorAll('.wk-seal')).toHaveLength(0);
  });

  it('logs into past weeks as readily as future ones', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 21/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-21');
    fireEvent.click(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-07');
  });

  it('an occupied week still offers selling another option', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={onSellWeek} />);
    fireEvent.click(screen.getByRole('button', { name: /sell the week of Aug 14/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-14');
  });

  it('flags an open option whose expiration has passed', () => {
    const stale = { ...base, expiration: '2026-08-07', opened_at: '2026-08-03' };
    render(<OptionsTab snap={snapWith([stale])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.getByText(/needs settling/i)).toBeInTheDocument();
  });

  it('does not flag a live option or a settled one', () => {
    const settled = { ...base, id: 4, expiration: '2026-08-07', status: 'EXPIRED' as const, closed_at: '2026-08-07' };
    render(<OptionsTab snap={snapWith([base, settled])} {...cbs} onSellWeek={vi.fn()} />);
    expect(screen.queryByText(/needs settling/i)).toBeNull();
  });

  it('offers the quiet mark on this week and earlier, never on a future week', () => {
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} />);
    // System time is Wed Aug 12 2026, so the live week is Fri Aug 14.
    expect(screen.getByRole('button', { name: /didn't trade the week of Aug 7/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /didn't trade the week of Aug 14/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /didn't trade the week of Aug 21/i })).toBeNull();
  });

  it('marking a week calls back with its Friday', () => {
    const onMarkQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={onMarkQuiet} />);
    fireEvent.click(screen.getByRole('button', { name: /didn't trade the week of Aug 7/i }));
    expect(onMarkQuiet).toHaveBeenCalledWith('2026-08-07');
  });

  it('a marked week shows as quiet and offers to undo', () => {
    const onClearQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={onClearQuiet} />);
    expect(screen.getByText(/no trades this week/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /undo the quiet mark on Aug 7/i }));
    expect(onClearQuiet).toHaveBeenCalledWith('2026-08-07');
  });

  it('a marked week holding a trade is not quiet — the trade wins, with no extra write', () => {
    const inThatWeek = { ...base, expiration: '2026-08-07', opened_at: '2026-08-03' };
    const onClearQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([inThatWeek], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={onClearQuiet} />);
    expect(screen.queryByText(/no trades this week/i)).toBeNull();
    expect(onClearQuiet).not.toHaveBeenCalled();
  });

  it('a marked, empty week still offers its log button, wired to that week\'s Friday', () => {
    const onSellWeek = vi.fn();
    render(<OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={onSellWeek} onMarkQuiet={vi.fn()} onClearQuiet={vi.fn()} />);
    expect(screen.getByText(/no trades this week/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i }));
    expect(onSellWeek).toHaveBeenCalledWith('2026-08-07');
  });

  it('logging into a marked week never clears the mark itself', () => {
    const onClearQuiet = vi.fn();
    render(<OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={onClearQuiet} />);
    fireEvent.click(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i }));
    expect(onClearQuiet).not.toHaveBeenCalled();
  });

  it('an empty week carries one rule and two pill actions', () => {
    const { container } = render(
      <OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} />,
    );
    const week = container.querySelector('.wk')!;
    expect(week.querySelectorAll('.wk-rule')).toHaveLength(1);
    expect(week.querySelector('.wk-actions')).not.toBeNull();
    expect(week.querySelectorAll('.wk-pill')).toHaveLength(2);
  });

  it('the quiet plate keeps its own rule and still offers the log pill', () => {
    const { container } = render(
      <OptionsTab snap={snapWith([], ['2026-08-07'])} {...cbs} onSellWeek={vi.fn()} onMarkQuiet={vi.fn()} onClearQuiet={vi.fn()} />,
    );
    const quiet = container.querySelector('.wk-quiet')!;
    expect(quiet).not.toBeNull();
    expect(screen.getByRole('button', { name: /log a trade for the week of Aug 7/i })).toBeInTheDocument();
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

  it('marks the slide direction when browsing months', () => {
    const { container } = render(<OptionsTab snap={snapWith([])} {...cbs} onSellWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(container.querySelector('.board-weeks')?.getAttribute('data-slide')).toBe('left');
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(container.querySelector('.board-weeks')?.getAttribute('data-slide')).toBe('right');
  });

  it('strikes an open option chip on the board', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} strikingOptionId={base.id} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(1);
  });

  it('strikes a settled option row on the board', () => {
    const settled = { ...base, id: 9, status: 'EXPIRED' as const, closed_at: '2026-08-07', expiration: '2026-08-07' };
    const { container } = render(<OptionsTab snap={snapWith([settled])} {...cbs} onSellWeek={vi.fn()} strikingOptionId={9} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(1);
  });

  it('strikes nothing when no option is being deleted', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    expect(container.querySelectorAll('.striking')).toHaveLength(0);
  });

  it('pins the month controls and the total together', () => {
    const { container } = render(<OptionsTab snap={snapWith([base])} {...cbs} onSellWeek={vi.fn()} />);
    const sticky = container.querySelector('.board-head-sticky');
    expect(sticky).not.toBeNull();
    expect(sticky!.querySelector('[aria-label="Previous month"]')).not.toBeNull();
    expect(sticky!.querySelector('[aria-label="Next month"]')).not.toBeNull();
    expect(sticky!.querySelector('[data-testid="month-score"]')).not.toBeNull();
  });
});
