import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agoLabel, daysUntil, expiryLabel, nextFriday, settleDateDefault } from '../time';

describe('agoLabel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('same day is "today"', () => {
    vi.setSystemTime(new Date('2026-07-24T18:00:00Z'));
    expect(agoLabel('2026-07-24T09:00:00Z')).toBe('today');
  });

  it('three days is "3d ago"', () => {
    vi.setSystemTime(new Date('2026-07-24T18:00:00Z'));
    expect(agoLabel('2026-07-21T09:00:00Z')).toBe('3d ago');
  });
});

describe('expiry helpers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('daysUntil and expiryLabel count local days', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 18, 0, 0)); // Fri Jul 24, 6pm local
    expect(daysUntil('2026-07-24')).toBe(0);
    expect(expiryLabel('2026-07-24')).toBe('today');
    expect(expiryLabel('2026-07-25')).toBe('tomorrow');
    expect(expiryLabel('2026-07-31')).toBe('7d');
    expect(expiryLabel('2026-07-20')).toBe('past due');
  });

  it('nextFriday returns today on a Friday, else the coming Friday', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 9, 0, 0)); // Friday
    expect(nextFriday()).toBe('2026-07-24');
    vi.setSystemTime(new Date(2026, 6, 27, 9, 0, 0)); // Monday
    expect(nextFriday()).toBe('2026-07-31');
  });
});

describe('settleDateDefault', () => {
  it('uses the expiration when it has already passed', () => {
    expect(settleDateDefault('2026-07-17', '2026-07-23')).toBe('2026-07-17');
  });

  it('uses today when the option has not expired yet', () => {
    expect(settleDateDefault('2026-07-31', '2026-07-23')).toBe('2026-07-23');
  });

  it('uses today on expiration day itself', () => {
    expect(settleDateDefault('2026-07-23', '2026-07-23')).toBe('2026-07-23');
  });
});
