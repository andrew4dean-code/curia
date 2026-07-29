import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { LANDING_MS, movedWheel, wheelStages } from '../App';
import { DURATION_MS } from '../components/Odometer';
// @ts-expect-error -- no @types/node in this project.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- no @types/node in this project.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- no @types/node in this project.
import { dirname, join } from 'node:path';

/* The landing window, the count duration and the .roll-slow multiplier live in three
   different files and have drifted into conflict twice. Nothing rendered proves the
   relationship — jsdom computes no animation, and by the time it is wrong the only
   symptom is a highlight clearing under a still-turning figure on a real device. So
   assert the arithmetic directly, reading the multiplier off the stylesheet on disk
   rather than restating 1.8 here, where it could go stale exactly like the rest. */
describe('landing window covers the count it wraps', () => {
  function rollSlowScale(): number {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', 'styles', 'curia-tokens.css'), 'utf8');
    const m = /\.roll-slow\s*\{[^}]*--roll-scale:\s*([\d.]+)/.exec(css);
    if (!m) throw new Error('.roll-slow --roll-scale not found in curia-tokens.css');
    return Number(m[1]);
  }

  it('outlasts the hero odometer at the ceremony roll scale', () => {
    const scale = rollSlowScale();
    expect(scale).toBeGreaterThan(1); // a landing that does not slow anything is a dead class
    const slowestCount = DURATION_MS.hero * scale;
    expect(
      LANDING_MS,
      `LANDING_MS ${LANDING_MS}ms must outlast the hero count under .roll-slow ` +
        `(${DURATION_MS.hero} x ${scale} = ${slowestCount}ms). Raise LANDING_MS in App.tsx.`,
    ).toBeGreaterThan(slowestCount);
  });

  it('leaves the settle ceremony room to finish counting before the certificate', () => {
    // SettleCeremony runs at scale 1 (landing is false during it): the count is released
    // at its 'count' stage and the certificate covers the figure when it arrives.
    const COUNT_STAGE_MS = 1250;
    const CERTIFICATE_MS = 3800;
    expect(
      COUNT_STAGE_MS + DURATION_MS.hero,
      `the settle count must land before the certificate at ${CERTIFICATE_MS}ms`,
    ).toBeLessThan(CERTIFICATE_MS);
  });
});

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

    await flush(1000); // 1s into trade 1's landing window

    await addTradeAndSkipCeremony('BBB', '20'); // trade 2's onTicket must clear trade 1's pending timer
    expect(isLanding()).toBe(true);

    // Trade 1's stale timer would have fired LANDING_MS - 1000ms from here (it was armed
    // 1000ms + a hair before this point). Advance just past that mark — but stop short of
    // trade 2's own deadline — and confirm trade 2's landing survives its predecessor's.
    await flush(LANDING_MS - 1000 + 100);
    expect(isLanding()).toBe(true);

    // Trade 2's own timer (armed fresh at its onDone) should fire by now.
    await flush(LANDING_MS);
    expect(isLanding()).toBe(false);
  });
});

describe('App cover', () => {
  const emptySnapshot = { trades: [], marks: [], options: [], wheels: [], quietWeeks: [], fetchedAt: '2026-01-01T00:00:00.000Z' };

  function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (method === 'GET' && (url === '/api/trades' || url === '/api/marks' || url === '/api/options' || url === '/api/wheels' || url === '/api/quiet-weeks')) {
        return new Response('[]', { status: 200 });
      }
      if (method === 'POST' && url === '/api/marks/refresh') {
        return new Response('[]', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function renderUnlockedApp() {
    localStorage.setItem('curia-passcode', 'test-key');
    localStorage.setItem('curia-cache-v3', JSON.stringify(emptySnapshot));
    stubApi();
    render(<App />);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('the app is present and interactive the moment it unlocks, cover or no cover', async () => {
    renderUnlockedApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
});

describe('App strike timer race', () => {
  const twoTrades = {
    trades: [
      { id: 1, symbol: 'AAA', side: 'BUY', qty: 1, price: 10, fees: 0, executed_at: '2026-01-02', note: '' },
      { id: 2, symbol: 'BBB', side: 'BUY', qty: 1, price: 20, fees: 0, executed_at: '2026-01-01', note: '' },
    ],
    marks: [],
    options: [],
    wheels: [],
    quietWeeks: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };

  function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/trades') return new Response(JSON.stringify(twoTrades.trades), { status: 200 });
      if (method === 'GET' && (url === '/api/marks' || url === '/api/options' || url === '/api/wheels' || url === '/api/quiet-weeks')) {
        return new Response('[]', { status: 200 });
      }
      if (method === 'POST' && url === '/api/marks/refresh') return new Response('[]', { status: 200 });
      if (method === 'DELETE' && /^\/api\/trades\/\d+$/.test(url)) return new Response(null, { status: 204 });
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

  function struckSymbol() {
    return document.querySelector('.row.striking')?.textContent ?? null;
  }

  beforeEach(() => {
    localStorage.setItem('curia-passcode', 'test-key');
    localStorage.setItem('curia-cache-v3', JSON.stringify(twoTrades));
    // jsdom has no scrollTo; the Ledger tab switch below calls it and would
    // otherwise spam "not implemented" errors to the console.
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("does not let the first delete's stale timer cut off the second row's strike", async () => {
    stubApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useFakeTimers();
    render(<App />);
    await flush(); // let the initial mount refresh() settle

    fireEvent.click(screen.getByText('Ledger'));
    fireEvent.click(screen.getByText(/All entries/));

    fireEvent.click(screen.getAllByText('delete')[0]); // AAA — arms a 700ms timer
    await flush();
    expect(struckSymbol()).toMatch(/AAA/);

    await flush(400); // 400ms into AAA's window — still pending

    fireEvent.click(screen.getAllByText('delete')[1]); // BBB, while AAA is still striking
    await flush(); // BBB's onDeleted must cancel AAA's stale timer
    expect(struckSymbol()).toMatch(/BBB/);

    // AAA's original timer would have fired ~300ms from here (700ms after AAA's
    // delete). Without the fix it would clear strikingTradeId and refresh early,
    // cutting BBB's strike short. Confirm BBB is still struck at that mark.
    await flush(300);
    expect(struckSymbol()).toMatch(/BBB/);

    // BBB's own timer (armed fresh at its own delete) should fire by now.
    await flush(400);
    expect(struckSymbol()).toBeNull();
  });

  it('clears the strike timer on unmount so it never fires after the component is gone', async () => {
    const fetchMock = stubApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useFakeTimers();
    const { unmount } = render(<App />);
    await flush();

    fireEvent.click(screen.getByText('Ledger'));
    fireEvent.click(screen.getByText(/All entries/));
    fireEvent.click(screen.getAllByText('delete')[0]);
    await flush();
    expect(struckSymbol()).toMatch(/AAA/);

    const callsAtUnmount = fetchMock.mock.calls.length;
    unmount();

    // If the timer leaked, it would fire here and trigger a refresh (more
    // fetch calls) well after the component is gone.
    await flush(700);
    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount);
  });
});

describe('App strike timer race across kinds', () => {
  // A trade and a settled option, sharing strikeTimer, is the whole point of
  // this fixture: it lets a trade delete and an option delete race each other.
  const tradeAndOption = {
    trades: [
      { id: 1, symbol: 'AAA', side: 'BUY', qty: 1, price: 10, fees: 0, executed_at: '2026-01-02', note: '' },
      { id: 2, symbol: 'BBB', side: 'BUY', qty: 1, price: 20, fees: 0, executed_at: '2026-01-01', note: '' },
    ],
    marks: [],
    options: [
      {
        id: 1,
        symbol: 'CCC',
        opt_type: 'PUT',
        strike: 50,
        expiration: '2026-01-10',
        contracts: 1,
        premium: 1,
        fees: 0,
        opened_at: '2025-12-01',
        note: '',
        status: 'EXPIRED',
        closed_at: '2026-01-10',
        buyback_price: 0,
        close_fees: 0,
        assigned_trade_id: null,
      },
    ],
    wheels: [],
    quietWeeks: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };

  function stubApi() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/trades') return new Response(JSON.stringify(tradeAndOption.trades), { status: 200 });
      if (method === 'GET' && url === '/api/options') return new Response(JSON.stringify(tradeAndOption.options), { status: 200 });
      if (method === 'GET' && (url === '/api/marks' || url === '/api/wheels' || url === '/api/quiet-weeks')) {
        return new Response('[]', { status: 200 });
      }
      if (method === 'POST' && url === '/api/marks/refresh') return new Response('[]', { status: 200 });
      if (method === 'DELETE' && /^\/api\/trades\/\d+$/.test(url)) return new Response(null, { status: 204 });
      if (method === 'DELETE' && /^\/api\/options\/\d+$/.test(url)) return new Response(null, { status: 204 });
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

  // Unlike the single-kind race (one shared id, so only one row can ever be
  // "the" struck one), a trade and an option are tracked by two separate ids
  // (strikingTradeId / strikingOptionId). A broken, unshared timer wouldn't
  // just mistime a clear — it would let BOTH ids be non-null at once, i.e.
  // both rows struck simultaneously. So assert on the full set of struck
  // rows, not just whichever one a plain querySelector happens to find first.
  function strikingRows() {
    return Array.from(document.querySelectorAll('.row.striking'));
  }

  function expectOnlyStruck(symbol: string) {
    const rows = strikingRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(new RegExp(symbol));
  }

  function openOptionRecord() {
    fireEvent.click(document.querySelector('[data-opt-id="1"]') as HTMLElement);
  }

  beforeEach(() => {
    localStorage.setItem('curia-passcode', 'test-key');
    localStorage.setItem('curia-cache-v3', JSON.stringify(tradeAndOption));
    // jsdom has no scrollTo; the Ledger tab switch below calls it and would
    // otherwise spam "not implemented" errors to the console.
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("does not let a trade's stale timer cut off an option's strike", async () => {
    stubApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useFakeTimers();
    render(<App />);
    await flush(); // let the initial mount refresh() settle

    fireEvent.click(screen.getByText('Ledger'));
    fireEvent.click(screen.getByText(/All entries/));

    fireEvent.click(screen.getAllByText('delete')[0]); // AAA trade — arms the shared 700ms timer
    await flush();
    expectOnlyStruck('AAA');

    await flush(400); // 400ms into AAA's window — still pending

    openOptionRecord();
    fireEvent.click(screen.getByText('Delete record')); // CCC option, while AAA is still striking
    await flush(); // the option's onOptionDeleted must cancel AAA's stale timer, not run alongside it
    expectOnlyStruck('CCC');

    // AAA's original timer would have fired ~300ms from here (700ms after AAA's
    // delete). With an unshared timer, AAA would still be marked striking this
    // whole time (never cancelled) and CCC would be too — two rows struck at
    // once instead of one superseding the other.
    await flush(300);
    expectOnlyStruck('CCC');

    // CCC's own timer (armed fresh at its own delete) should fire by now.
    await flush(400);
    expect(strikingRows()).toHaveLength(0);
  });

  it("does not let an option's stale timer cut off a trade's strike", async () => {
    stubApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useFakeTimers();
    render(<App />);
    await flush(); // let the initial mount refresh() settle

    fireEvent.click(screen.getByText('Ledger'));

    openOptionRecord();
    fireEvent.click(screen.getByText('Delete record')); // CCC option — arms the shared 700ms timer
    await flush();
    expectOnlyStruck('CCC');

    await flush(400); // 400ms into CCC's window — still pending

    fireEvent.click(screen.getByText(/All entries/));
    fireEvent.click(screen.getAllByText('delete')[0]); // AAA trade, while CCC is still striking
    await flush(); // AAA's onDeleted must cancel CCC's stale timer, not run alongside it
    expectOnlyStruck('AAA');

    // CCC's original timer would have fired ~300ms from here (700ms after CCC's
    // delete). With an unshared timer, CCC would still be marked striking this
    // whole time (never cancelled) and AAA would be too — two rows struck at
    // once instead of one superseding the other.
    await flush(300);
    expectOnlyStruck('AAA');

    // AAA's own timer (armed fresh at its own delete) should fire by now.
    await flush(400);
    expect(strikingRows()).toHaveLength(0);
  });
});

/* Booking an option that assigns you shares moves a wheel from SELL PUT to ASSIGNED.
   That happens on the Options tab; the wheel is drawn on Portfolio. These decide whether
   the app should carry you there to watch the hand travel. */
describe('wheel stage change detection', () => {
  const stages = (m: Record<number, string>) => new Map<number, string>(Object.entries(m).map(([k, v]) => [Number(k), v]));

  it('finds the wheel whose stage moved', () => {
    expect(movedWheel(stages({ 1: 'SELL_PUT', 2: 'ASSIGNED' }), stages({ 1: 'ASSIGNED', 2: 'ASSIGNED' }))).toBe(1);
  });

  it('reports nothing when every wheel stands still', () => {
    expect(movedWheel(stages({ 1: 'SELL_PUT' }), stages({ 1: 'SELL_PUT' }))).toBeNull();
  });

  it('does not count a wheel that only just appeared', () => {
    // Opening a fresh wheel has its own ceremony; it must not also throw the tab across.
    expect(movedWheel(stages({}), stages({ 3: 'SELL_PUT' }))).toBeNull();
  });

  it('does not count a wheel that went away', () => {
    // Completing a wheel should not yank the tab out from under the sheet doing it.
    expect(movedWheel(stages({ 4: 'CALLED_AWAY' }), stages({}))).toBeNull();
  });

  it('reads no stages at all from a missing snapshot', () => {
    expect(wheelStages(null).size).toBe(0);
  });
});
