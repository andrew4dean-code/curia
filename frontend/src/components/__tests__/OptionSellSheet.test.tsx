import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionSellSheet } from '../OptionSellSheet';

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
    render(<OptionSellSheet expiration="2026-08-21" onDone={onDone} onCancel={vi.fn()} />);
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
    render(<OptionSellSheet expiration="2026-08-21" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CALL' }));
    expect(screen.getByRole('button', { name: 'CALL' })).toHaveClass('on');
  });
});
