/** A recorded fee is history, not a setting.
 *
 *  Both sheets used to rebuild `fees` from Settings on the update path as well as the
 *  create path, so fixing a typo in a note restated what the trade had cost. Worse on the
 *  share trade an assignment books, which the backend records at exactly zero on purpose:
 *  one innocent edit stamped a commission on a fill that never had one, and realized P/L
 *  and the tax set-aside both moved.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddTradeSheet } from '../AddTradeSheet';
import { OptionSellSheet } from '../OptionSellSheet';
import type { OptionPosition, Trade } from '../../lib/types';

const SETTINGS = { option_fee_per_contract: 0.65, stock_fee_per_trade: 1.5, tax_rate_pct: 25 };

/** Booked by an assignment last month: the backend records fees = 0 by design. */
const ASSIGNED_FILL: Trade = {
  id: 5, symbol: 'GLD', side: 'BUY', qty: 100, price: 50, fees: 0,
  executed_at: '2026-06-01', note: 'assigned: GLD $50 PUT exp 2026-06-05',
};

/** Sold when the per-contract fee was still 0.40, three contracts, so 1.20 recorded. */
const OLD_OPTION: OptionPosition = {
  id: 7, symbol: 'TQQQ', opt_type: 'PUT', strike: 70, expiration: '2026-07-24',
  contracts: 3, premium: 1.49, fees: 1.2, opened_at: '2026-07-21', note: '',
  status: 'OPEN', closed_at: null, buyback_price: 0, close_fees: 0, assigned_trade_id: null,
};

function stubFetch(id: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof stubFetch>) =>
  JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('a fee already on the record', () => {
  it('survives editing the trade around it', async () => {
    const fetchMock = stubFetch(5);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(
      <AddTradeSheet trade={ASSIGNED_FILL} wheels={[]} settings={SETTINGS} onDone={onDone} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'assigned (tidied)' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(sentBody(fetchMock).fees).toBe(0);
  });

  it('survives editing the option around it', async () => {
    const fetchMock = stubFetch(7);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(
      <OptionSellSheet
        option={OLD_OPTION}
        expiration={OLD_OPTION.expiration}
        wheels={[]}
        settings={SETTINGS}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'rolled from Jul 17' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(sentBody(fetchMock).fees).toBeCloseTo(1.2);
  });

  it('follows the contract count when that is what the edit corrects', async () => {
    const fetchMock = stubFetch(7);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(
      <OptionSellSheet
        option={OLD_OPTION}
        expiration={OLD_OPTION.expiration}
        wheels={[]}
        settings={SETTINGS}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
    // Three contracts were really six. The rate it was booked at still stands: 0.40 each.
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(sentBody(fetchMock).fees).toBeCloseTo(2.4);
  });
});

describe('a new entry', () => {
  it('still takes the stock fee whole', async () => {
    const fetchMock = stubFetch(1);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<AddTradeSheet trade={null} wheels={[]} settings={SETTINGS} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'GLD' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Add trade/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(sentBody(fetchMock).fees).toBe(1.5);
  });

  it('still takes the option fee per contract', async () => {
    const fetchMock = stubFetch(2);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(
      <OptionSellSheet expiration="2026-07-31" wheels={[]} settings={SETTINGS} onDone={onDone} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText('Strike'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Premium / share'), { target: { value: '1.49' } });
    fireEvent.click(screen.getByRole('button', { name: /Sell to open/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(sentBody(fetchMock).fees).toBeCloseTo(2.6);
  });
});
