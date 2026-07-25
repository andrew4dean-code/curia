import type { Mark, Trade, OptionDraft, OptionPosition, OptionStatus } from './types';

const KEY_STORAGE = 'curia-passcode';
const CACHE_STORAGE = 'curia-cache-v2';

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

export interface Snapshot {
  trades: Trade[];
  marks: Mark[];
  options: OptionPosition[];
  fetchedAt: string;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [trades, marks, options] = await Promise.all([
    request<Trade[]>('/api/trades'),
    request<Mark[]>('/api/marks'),
    request<OptionPosition[]>('/api/options'),
  ]);
  const snap: Snapshot = { trades, marks, options, fetchedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(snap));
  return snap;
}

export function cachedSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(CACHE_STORAGE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
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
