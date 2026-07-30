import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkSheet } from '../MarkSheet';
import type { Mark } from '../../lib/types';

const manual: Mark = { symbol: 'GLD', price: 61.25, marked_at: '2026-07-30T12:00:00Z', source: 'manual' };
const auto: Mark = { ...manual, price: 58.1, source: 'auto' };

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('MarkSheet', () => {
  it('saves a typed price', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ symbol: 'GLD', price: 61.25 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<MarkSheet symbol="GLD" mark={null} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '61.25' } });
    fireEvent.click(screen.getByRole('button', { name: /Save price/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/marks/GLD');
  });

  it('says a hand-set price will now be left alone', () => {
    render(<MarkSheet symbol="GLD" mark={manual} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('mark-source')).toHaveTextContent(/your price/i);
  });

  it('offers to hand a hand-set symbol back to the live price', async () => {
    const fetchMock = stubFetch();
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<MarkSheet symbol="GLD" mark={manual} onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /live price/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/marks/GLD');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('does not offer to release a price it fetched itself', () => {
    render(<MarkSheet symbol="GLD" mark={auto} onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /live price/i })).toBeNull();
  });
});
