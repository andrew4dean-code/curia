/** The quote pull is a nicety. It must never be in the way.
 *
 *  refresh() used to await /api/marks/refresh before fetching the snapshot, and the backend
 *  walks the held symbols one at a time on an eight second timeout each. Every booking,
 *  settle, delete and quiet-week tap sat behind that walk — including the taps that needed
 *  no quote at all. Now the snapshot lands first and the pull happens behind it, no more
 *  often than the market moves enough to care about.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { QUOTE_MIN_INTERVAL_MS, pullQuotes, resetQuotePull } from '../lib/quotePull';

const TRADES = [
  { id: 1, symbol: 'GLD', side: 'BUY', qty: 100, price: 50, fees: 0, executed_at: '2026-07-01', note: '' },
];

/** @param quotes how /api/marks/refresh behaves: 'hangs' never resolves. */
function stubApi(quotes: 'hangs' | 'ok') {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/marks/refresh') {
      if (quotes === 'hangs') return new Promise<Response>(() => {});
      return new Response('[]', { status: 200 });
    }
    if (url === '/api/trades') return new Response(JSON.stringify(TRADES), { status: 200 });
    if (url === '/api/settings') {
      return new Response(JSON.stringify({ option_fee_per_contract: 0, stock_fee_per_trade: 0, tax_rate_pct: 0 }), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const pulls = (calls: string[]) => calls.filter((c) => c === 'POST /api/marks/refresh').length;

beforeEach(() => {
  localStorage.setItem('curia-passcode', 'test-key');
  resetQuotePull();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('pullQuotes', () => {
  it('reports a pull that actually happened', async () => {
    const calls = stubApi('ok');
    expect(await pullQuotes(1_000_000)).toBe(true);
    expect(pulls(calls)).toBe(1);
  });

  it('sits out a burst of refreshes', async () => {
    const calls = stubApi('ok');
    await pullQuotes(1_000_000);
    expect(await pullQuotes(1_000_100)).toBe(false);
    expect(await pullQuotes(1_000_200)).toBe(false);
    expect(pulls(calls)).toBe(1);
  });

  it('pulls again once the interval is up', async () => {
    const calls = stubApi('ok');
    await pullQuotes(1_000_000);
    expect(await pullQuotes(1_000_000 + QUOTE_MIN_INTERVAL_MS)).toBe(true);
    expect(pulls(calls)).toBe(2);
  });

  it('reports nothing changed when the feed fails, and does not retry straight away', async () => {
    const calls = stubApi('ok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await pullQuotes(1_000_000)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    expect(await pullQuotes(1_000_100)).toBe(false);
    expect(pulls(calls)).toBe(0);
  });
});

describe('the snapshot', () => {
  it('is not held hostage by a hanging feed', async () => {
    stubApi('hangs');
    render(<App />);
    // The holdings row is drawn from /api/trades alone. It must not wait on Yahoo.
    await waitFor(() => expect(screen.getByTestId('holding-GLD')).toBeInTheDocument());
  });
});
