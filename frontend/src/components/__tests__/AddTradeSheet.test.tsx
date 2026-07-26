import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { AddTradeSheet } from '../AddTradeSheet';

// Passthrough spy: existing test still stubs global fetch and inspects it directly,
// this just lets the new tests assert on createTrade's own call args.
vi.spyOn(api, 'createTrade');

describe('AddTradeSheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('submitting a stock trade POSTs to /api/trades', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<AddTradeSheet trade={null} wheels={[]} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'aapl' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Add trade/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/trades');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'AAPL', side: 'BUY', qty: 10, price: 150 });
    expect(onDone.mock.calls[0][0]).toMatchObject({ no: 9, title: 'TRADE TICKET', symbol: 'AAPL' });
  });

  it('asks nothing about fees and sends zero', async () => {
    const create = vi.mocked(api.createTrade);
    create.mockClear();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 11 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<AddTradeSheet trade={null} wheels={[]} onDone={onDone} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/fees/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '62' } });
    fireEvent.click(screen.getByRole('button', { name: /add trade/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ fees: 0 }));
  });

  it('warns when the trade date falls before its wheel started', () => {
    const wheel = { id: 1, symbol: 'TQQQ', no: 1, opened_at: '2026-08-10', closed_at: null };
    render(<AddTradeSheet trade={null} wheels={[wheel]} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: 'TQQQ' } });
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-08-03' } });
    expect(screen.getByText(/before your TQQQ wheel started/i)).toBeInTheDocument();
  });

  it('a close-out prefill opens as a full-size sell that stays editable', () => {
    render(
      <AddTradeSheet
        trade={null}
        wheels={[]}
        prefill={{ side: 'SELL', symbol: 'TQQQ', qty: 400 }}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/side/i) as HTMLSelectElement).value).toBe('SELL');
    expect((screen.getByLabelText(/symbol/i) as HTMLInputElement).value).toBe('TQQQ');
    const qty = screen.getByLabelText(/shares/i) as HTMLInputElement;
    expect(qty.value).toBe('400');
    expect(qty.readOnly).toBe(false);
    fireEvent.change(qty, { target: { value: '150' } });
    expect(qty.value).toBe('150'); // a partial exit is just an edit
  });

  it('a close-out prints a POSITION CLOSED ticket carrying the realised figure', async () => {
    vi.mocked(api.createTrade).mockClear();
    vi.mocked(api.createTrade).mockResolvedValueOnce({
      id: 2, symbol: 'TQQQ', side: 'SELL', qty: 100, price: 72, fees: 0, executed_at: '2026-07-25', note: '',
    });
    const onDone = vi.fn();
    render(
      <AddTradeSheet
        trade={null}
        wheels={[]}
        trades={[{ id: 1, symbol: 'TQQQ', side: 'BUY', qty: 100, price: 60, fees: 0, executed_at: '2026-06-01', note: '' }]}
        prefill={{ side: 'SELL', symbol: 'TQQQ', qty: 100 }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /add trade/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const ticket = onDone.mock.calls[0][0];
    expect(ticket.title).toBe('POSITION CLOSED');
    expect(ticket.lines.join(' ')).toMatch(/\+\$1,200\.00 realised/);
  });

  it('a close-out flipped to Buy prints a TRADE TICKET', async () => {
    vi.mocked(api.createTrade).mockClear();
    vi.mocked(api.createTrade).mockResolvedValueOnce({
      id: 3, symbol: 'TQQQ', side: 'BUY', qty: 100, price: 72, fees: 0, executed_at: '2026-07-25', note: '',
    });
    const onDone = vi.fn();
    render(
      <AddTradeSheet
        trade={null}
        wheels={[]}
        trades={[{ id: 1, symbol: 'TQQQ', side: 'BUY', qty: 100, price: 60, fees: 0, executed_at: '2026-06-01', note: '' }]}
        prefill={{ side: 'SELL', symbol: 'TQQQ', qty: 100 }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/side/i), { target: { value: 'BUY' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /add trade/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const ticket = onDone.mock.calls[0][0];
    expect(ticket.title).toBe('TRADE TICKET');
    expect(ticket.lines.join(' ')).not.toMatch(/realised/);
  });
});
