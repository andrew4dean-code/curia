import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedSnapshot, clearQuietWeek, fetchSnapshot, markQuietWeek } from '../api';

describe('cachedSnapshot', () => {
  afterEach(() => localStorage.clear());

  it('returns null and clears the entry when the cache is corrupted', () => {
    localStorage.setItem('curia-cache-v3', '{not json');
    expect(cachedSnapshot()).toBeNull();
    expect(localStorage.getItem('curia-cache-v3')).toBeNull();
  });
});

describe('quiet weeks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fetchSnapshot pulls quiet weeks alongside everything else', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === '/api/quiet-weeks' ? ['2026-07-17'] : [],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const snap = await fetchSnapshot();
    expect(snap.quietWeeks).toEqual(['2026-07-17']);
    expect(fetchMock).toHaveBeenCalledWith('/api/quiet-weeks', expect.anything());
  });

  it('a cache written before this feature reads back with no quiet weeks', () => {
    localStorage.setItem(
      'curia-cache-v3',
      JSON.stringify({ trades: [], marks: [], options: [], wheels: [], fetchedAt: 'x' }),
    );
    expect(cachedSnapshot()?.quietWeeks).toEqual([]);
  });

  it('marks and clears a week', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ friday: '2026-07-17' }) }));
    vi.stubGlobal('fetch', fetchMock);
    await markQuietWeek('2026-07-17');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quiet-weeks',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ friday: '2026-07-17' }) }),
    );
    await clearQuietWeek('2026-07-17');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quiet-weeks/2026-07-17',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
