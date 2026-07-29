import type { Mark, Trade, OptionDraft, OptionPosition, OptionStatus, Wheel } from './types';

const KEY_STORAGE = 'curia-passcode';
const CACHE_STORAGE = 'curia-cache-v3';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getPasscode(): string | null {
  return localStorage.getItem(KEY_STORAGE);
}
export function setPasscode(p: string): void {
  localStorage.setItem(KEY_STORAGE, p);
}
export function clearPasscode(): void {
  localStorage.removeItem(KEY_STORAGE);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Curia-Key': getPasscode() ?? '',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiError(`request failed: ${res.status}`, res.status);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Account preferences, held on the server so they survive a reinstall and match on
 *  every device. Fees are deliberately WORST CASE: it is better for a figure to
 *  understate what you kept than to overstate it. */
export interface Settings {
  option_fee_per_contract: number;
  stock_fee_per_trade: number;
  /** Percent, 0-100. An estimate you set; the app only multiplies. */
  tax_rate_pct: number;
  updated_at?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  option_fee_per_contract: 0,
  stock_fee_per_trade: 0,
  tax_rate_pct: 0,
};

export interface Snapshot {
  trades: Trade[];
  marks: Mark[];
  options: OptionPosition[];
  wheels: Wheel[];
  quietWeeks: string[];
  settings: Settings;
  fetchedAt: string;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [trades, marks, options, wheels, quietWeeks, settings] = await Promise.all([
    request<Trade[]>('/api/trades'),
    request<Mark[]>('/api/marks'),
    request<OptionPosition[]>('/api/options'),
    request<Wheel[]>('/api/wheels'),
    request<string[]>('/api/quiet-weeks'),
    request<Settings>('/api/settings'),
  ]);
  const snap: Snapshot = { trades, marks, options, wheels, quietWeeks, settings, fetchedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(snap));
  return snap;
}

export function cachedSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(CACHE_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    // A cache written before settings existed has none. Falling back to zeros keeps the
    // app readable offline; the real values arrive with the next refresh.
    return {
      ...parsed,
      quietWeeks: parsed.quietWeeks ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    localStorage.removeItem(CACHE_STORAGE);
    return null;
  }
}

export const createTrade = (t: Omit<Trade, 'id'>) =>
  request<Trade>('/api/trades', { method: 'POST', body: JSON.stringify(t) });
export const updateTrade = (t: Trade) =>
  request<Trade>(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify(t) });
export const deleteTrade = (id: number) =>
  request<void>(`/api/trades/${id}`, { method: 'DELETE' });
export const putMark = (symbol: string, price: number) =>
  request<Mark>(`/api/marks/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify({ price }),
  });
export const refreshMarks = () =>
  request<Mark[]>('/api/marks/refresh', { method: 'POST' });
export const exportBackup = () => request<unknown>('/api/export');
export const importBackup = (data: unknown) =>
  request<{ trades: number; marks: number }>('/api/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const createOption = (d: OptionDraft) =>
  request<OptionPosition>('/api/options', { method: 'POST', body: JSON.stringify(d) });
export const updateOption = (id: number, d: OptionDraft) =>
  request<OptionPosition>(`/api/options/${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const deleteOption = (id: number) =>
  request<void>(`/api/options/${id}`, { method: 'DELETE' });
export const settleOption = (
  id: number,
  body: { outcome: Exclude<OptionStatus, 'OPEN'>; closed_at?: string; buyback_price?: number; close_fees?: number },
) => request<OptionPosition>(`/api/options/${id}/settle`, { method: 'POST', body: JSON.stringify(body) });
export const openWheel = (symbol: string, opened_at?: string) =>
  request<Wheel>('/api/wheels', { method: 'POST', body: JSON.stringify({ symbol, ...(opened_at ? { opened_at } : {}) }) });
export const closeWheel = (id: number, closed_at?: string) =>
  request<Wheel>(`/api/wheels/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(closed_at ? { closed_at } : {}),
  });
export const deleteWheel = (id: number) =>
  request<void>(`/api/wheels/${id}`, { method: 'DELETE' });
export const markQuietWeek = (friday: string) =>
  request<{ friday: string }>('/api/quiet-weeks', { method: 'POST', body: JSON.stringify({ friday }) });
export const clearQuietWeek = (friday: string) =>
  request<void>(`/api/quiet-weeks/${friday}`, { method: 'DELETE' });

export function saveSettings(body: Settings): Promise<Settings> {
  return request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
}
