export function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function expiryLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return 'past due';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days}d`;
}

export function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); // 0 when already Friday
  return localDateString(d);
}

export function todayIso(): string {
  return localDateString(new Date());
}

// An already-expired option almost always ended on its expiration day — expired
// worthless, or assigned at expiry. Defaulting to today would misdate the stock
// the backend books on ASSIGNED, and reorder FIFO lots against that week.
export function settleDateDefault(expiration: string, today: string): string {
  return expiration < today ? expiration : today;
}
