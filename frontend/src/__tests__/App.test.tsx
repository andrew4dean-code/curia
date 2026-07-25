import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('App re-lock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns to the gate and clears the key when refresh gets a 401', async () => {
    localStorage.setItem('curia-passcode', 'stale-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Passcode')).toBeInTheDocument());
    expect(localStorage.getItem('curia-passcode')).toBeNull();
  });
});

describe('App landing timer race', () => {
  const emptySnapshot = { trades: [], marks: [], options: [], wheels: [], fetchedAt: '2026-01-01T00:00:00.000Z' };

  function stubApi() {
    let nextId = 1;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (method === 'GET' && (url === '/api/trades' || url === '/api/marks' || url === '/api/options' || url === '/api/wheels' || url === '/api/quiet-weeks')) {
        return new Response('[]', { status: 200 });
      }
      if (method === 'POST' && url === '/api/marks/refresh') {
        return new Response('[]', { status: 200 });
      }
      if (method === 'POST' && url === '/api/trades') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ id: nextId++, ...body }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function flush(ms = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function addTradeAndSkipCeremony(symbol: string, price: string) {
    fireEvent.click(screen.getByLabelText('Add trade'));
    const sheet = document.querySelector('.sheet') as HTMLElement;
    fireEvent.change(within(sheet).getByLabelText('Symbol'), { target: { value: symbol } });
    fireEvent.change(within(sheet).getByLabelText('Shares'), { target: { value: '1' } });
    fireEvent.change(within(sheet).getByLabelText('Price'), { target: { value: price } });
    fireEvent.submit(sheet);
    await flush(); // let createTrade POST resolve and the ceremony mount
    const overlay = document.querySelector('.ceremony') as HTMLElement;
    fireEvent.click(overlay); // skip the ceremony animation -> fires onDone
    await flush(); // let refresh() resolve so the 3s landing timer gets armed
  }

  function isLanding() {
    return document.querySelector('.shell')?.className.includes('roll-slow') ?? false;
  }

  beforeEach(() => {
    localStorage.setItem('curia-passcode', 'test-key');
    localStorage.setItem('curia-cache-v3', JSON.stringify(emptySnapshot));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the second landing alive instead of letting the first ceremony\'s stale timer clear it', async () => {
    stubApi();
    vi.useFakeTimers();
    render(<App />);
    await flush(); // let the initial mount refresh() settle

    await addTradeAndSkipCeremony('AAA', '10');
    expect(isLanding()).toBe(true);

    await flush(1000); // 1s into trade 1's 3s landing window

    await addTradeAndSkipCeremony('BBB', '20'); // trade 2's onTicket must clear trade 1's pending timer
    expect(isLanding()).toBe(true);

    // Trade 1's stale timer would have fired ~2000ms from here (3000ms after
    // its own onDone, which landed 1000ms + a hair before this point). Advance
    // past that mark and confirm trade 2's landing survives.
    await flush(2500);
    expect(isLanding()).toBe(true);

    // Trade 2's own timer (armed fresh at its onDone) should fire by now.
    await flush(1000);
    expect(isLanding()).toBe(false);
  });
});
