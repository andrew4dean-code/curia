import type { Mark, Trade } from './types';

const KEY_STORAGE = 'curia-passcode';
const CACHE_STORAGE = 'curia-cache-v1';

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
  fetchedAt: string;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [trades, marks] = await Promise.all([
    request<Trade[]>('/api/trades'),
    request<Mark[]>('/api/marks'),
  ]);
  const snap: Snapshot = { trades, marks, fetchedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_STORAGE, JSON.stringify(snap));
  return snap;
}

export function cachedSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(CACHE_STORAGE);
  return raw ? (JSON.parse(raw) as Snapshot) : null;
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
