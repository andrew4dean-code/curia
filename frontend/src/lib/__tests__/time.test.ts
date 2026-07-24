import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agoLabel } from '../time';

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
