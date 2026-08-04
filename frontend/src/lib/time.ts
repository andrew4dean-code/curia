/** The app's one date voice: "Aug 7". Two hand-rolled copies of this used to live in
 *  OptionsTab and PortfolioTab while the Ledger printed raw ISO — so the same trade read
 *  "Fri Aug 7" on the board and "2026-08-07" in the record, and the ISO pair was long
 *  enough to wrap its row onto a second line. Parsed field-by-field, never through
 *  `new Date(iso)`, which reads a bare date as UTC and shifts it a day west of Greenwich. */
export function fmtShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A span between two dates, collapsing a shared month: "Jul 6 → 10", "Jul 28 → Aug 3". */
export function fmtDateSpan(from: string, to: string): string {
  if (!from || !to) return fmtShortDate(from || to);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmtShortDate(from)} → ${sameMonth ? Number(to.slice(8, 10)) : fmtShortDate(to)}`;
}

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
