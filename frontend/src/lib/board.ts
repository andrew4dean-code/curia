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

// The board buckets every option into the Friday of its expiration week, so the
// month total has to use that same rule. Scoring settled rows by `closed_at`
// instead let a row render on one month's board while counting toward another —
// e.g. a Tue Jun 30 expiry shows under Fri Jul 3 but scored to June.
export function monthScore(options: OptionPosition[], year: number, month1: number): number {
  const prefix = `${year}-${String(month1).padStart(2, '0')}-`;
  let score = 0;
  for (const o of options) {
    if (!weekFridayFor(o.expiration).startsWith(prefix)) continue;
    score += o.status === 'OPEN' ? premiumCollected(o) : (optionRealizedPl(o) ?? 0);
  }
  return score;
}

// A week can be marked quiet once it has begun: this week, or any earlier one.
// Future weeks haven't had the chance to be quiet yet.
export function canMarkQuiet(friday: string, today: string): boolean {
  return friday <= weekFridayFor(today);
}

// Which way the board should travel when the month changes. Compared as an
// absolute month index so December -> January reads as forward, not backward.
export function slideDirection(from: [number, number], to: [number, number]): 'left' | 'right' {
  return to[0] * 12 + to[1] >= from[0] * 12 + from[1] ? 'left' : 'right';
}
