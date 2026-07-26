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
});
