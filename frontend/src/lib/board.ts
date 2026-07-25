import { optionRealizedPl, premiumCollected } from './optionsMath';
import type { OptionPosition } from './types';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fridaysOfMonth(year: number, month1: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month1 - 1, 1);
  while (d.getMonth() === month1 - 1) {
    if (d.getDay() === 5) out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function weekFridayFor(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  // Mon–Sun week: Sat(6) → −1, Sun(0) → −2, else forward to Friday(5)
  const dow = d.getDay();
  const shift = dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
  d.setDate(d.getDate() + shift);
  return iso(d);
}

export function monthScore(options: OptionPosition[], year: number, month1: number): number {
  const prefix = `${year}-${String(month1).padStart(2, '0')}-`;
  let score = 0;
  for (const o of options) {
    if (o.status !== 'OPEN' && o.closed_at && o.closed_at.startsWith(prefix)) {
      score += optionRealizedPl(o) ?? 0;
    } else if (o.status === 'OPEN' && o.expiration.startsWith(prefix)) {
      score += premiumCollected(o);
    }
  }
  return score;
}
