import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { OptionSellSheet } from '../OptionSellSheet';

// Passthrough spy: existing tests still stub global fetch and inspect it directly,
// this just lets the new tests assert on createOption's own call args.
vi.spyOn(api, 'createOption');

describe('OptionSellSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('locks the expiration to the tapped week and quotes the take', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 12 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<OptionSellSheet expiration="2026-08-21" wheels={[]} onDone={onDone} onCancel={vi.fn()} />);
    expect(screen.getByText(/week of Fri Aug 21/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Expiration')).toBeNull(); // no date field
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText('Strike'), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Premium / share'), { target: { value: '0.74' } });
    expect(screen.getByRole('button', { name: /collect \$148\.00/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sell to open/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'TQQQ', opt_type: 'PUT', expiration: '2026-08-21', strike: 62 });
    expect(onDone.mock.calls[0][0]).toMatchObject({ no: 12, title: 'OPTION TICKET', symbol: 'TQQQ' });
  });

  it('CALL toggle flips opt_type', () => {
    render(<OptionSellSheet expiration="2026-08-21" wheels={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CALL' }));
    expect(screen.getByRole('button', { name: 'CALL' })).toHaveClass('on');
  });

  it('asks nothing about fees', () => {
    render(<OptionSellSheet expiration="2026-08-14" wheels={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
  });

  it('sends zero fees', async () => {
    const create = vi.mocked(api.createOption);
    create.mockClear();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 13 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<OptionSellSheet expiration="2026-08-14" wheels={[]} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText(/strike/i), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText(/premium/i), { target: { value: '0.74' } });
    fireEvent.click(screen.getByRole('button', { name: /sell to open/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ fees: 0 }));
  });

  it('warns when the sale date falls before its wheel started', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<OptionSellSheet expiration="2026-08-14" wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/date sold/i), { target: { value: '2026-08-03' } });
    expect(screen.getByText(/before your TQQQ wheel started \(2026-08-10\)/i)).toBeInTheDocument();
  });

  it('stays quiet once the date is inside the wheel', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<OptionSellSheet expiration="2026-08-14" wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/date sold/i), { target: { value: '2026-08-12' } });
    expect(screen.queryByText(/won't count toward it/i)).toBeNull();
  });
});

/* Selling a weekly on a wheel, four of the six fields were already knowable: the wheel's
   stage says whether the next thing sold is a put or a call, and a covered call is
   covered by definition. These cover the sheet reading that, and — more importantly —
   knowing when to stop. */
describe('OptionSellSheet wheel-derived entry', () => {
  const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-01-01', closed_at: null };
  const assignedPut = {
    id: 1, symbol: 'TQQQ', opt_type: 'PUT', strike: 100, expiration: '2026-02-01', contracts: 1,
    premium: 1, fees: 0, opened_at: '2026-01-15', note: '', status: 'ASSIGNED',
    closed_at: '2026-02-01', buyback_price: 0,
  } as never;
  const heldShares = {
    id: 1, symbol: 'TQQQ', side: 'BUY', qty: 400, price: 100, fees: 0,
    executed_at: '2026-02-01', note: '',
  } as never;

  const sheet = (props: Record<string, unknown> = {}) =>
    render(
      <OptionSellSheet
        expiration="2026-08-21"
        wheels={[wheel]}
        trades={[heldShares]}
        options={[assignedPut]}
        onDone={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        {...props}
      />,
    );

  const isOn = (name: string) =>
    screen.getByRole('button', { name }).className.includes('on');

  it('picks the side and the count off the wheel when you tap the symbol', () => {
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'TQQQ' }));
    expect(isOn('CALL')).toBe(true); // shares are held, so the next sale is a call
    expect(screen.getByLabelText('Contracts')).toHaveValue(4); // 400 shares / 100
    expect(screen.getByTestId('implied-note')).toHaveTextContent('4 covered');
  });

  it('stops choosing the side once you have chosen it yourself', () => {
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'PUT' })); // deliberate override
    fireEvent.click(screen.getByRole('button', { name: 'TQQQ' }));
    expect(isOn('PUT')).toBe(true); // the wheel does not overrule you
  });

  it('stops choosing the count once you have typed one', () => {
    sheet();
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'TQQQ' }));
    expect(screen.getByLabelText('Contracts')).toHaveValue(2);
  });

  it('fills nothing for a symbol with no open wheel', () => {
    sheet({ wheels: [] });
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'NVDA' } });
    expect(screen.queryByTestId('implied-note')).toBeNull();
  });

  it('leaves an existing option alone — those fields are the record, not a guess', () => {
    const existing = {
      id: 9, symbol: 'TQQQ', opt_type: 'PUT', strike: 55, expiration: '2026-08-21', contracts: 1,
      premium: 2, fees: 0, opened_at: '2026-08-01', note: '', status: 'OPEN',
      closed_at: null, buyback_price: 0,
    } as never;
    sheet({ option: existing });
    expect(isOn('PUT')).toBe(true); // not flipped to CALL by the wheel behind it
    expect(screen.getByLabelText('Contracts')).toHaveValue(1);
    expect(screen.queryByTestId('implied-note')).toBeNull();
  });
});
