import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddTradeSheet } from '../AddTradeSheet';

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
    render(<AddTradeSheet trade={null} onDone={onDone} onCancel={vi.fn()} />);
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
});
