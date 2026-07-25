import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddTradeSheet } from '../AddTradeSheet';

describe('AddTradeSheet option mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('switching to Option shows option fields', () => {
    render(<AddTradeSheet trade={null} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option' }));
    expect(screen.getByLabelText('Strike')).toBeInTheDocument();
    expect(screen.getByLabelText('Expiration')).toBeInTheDocument();
    expect(screen.getByLabelText('Contracts')).toBeInTheDocument();
    expect(screen.getByLabelText('Premium / share')).toBeInTheDocument();
  });

  it('submitting an option POSTs to /api/options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9 }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<AddTradeSheet trade={null} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Option' }));
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'tqqq' } });
    fireEvent.change(screen.getByLabelText('Strike'), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText('Contracts'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Premium / share'), { target: { value: '0.74' } });
    fireEvent.click(screen.getByRole('button', { name: /Sell to open/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/options');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ symbol: 'TQQQ', opt_type: 'PUT', strike: 62, contracts: 2, premium: 0.74 });
    expect(onDone.mock.calls[0][0]).toMatchObject({ no: 9, title: 'OPTION TICKET', symbol: 'TQQQ' });
  });
});
