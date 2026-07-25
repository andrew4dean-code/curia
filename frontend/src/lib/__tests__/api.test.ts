import { afterEach, describe, expect, it } from 'vitest';
import { cachedSnapshot } from '../api';

describe('cachedSnapshot', () => {
  afterEach(() => localStorage.clear());

  it('returns null and clears the entry when the cache is corrupted', () => {
    localStorage.setItem('curia-cache-v2', '{not json');
    expect(cachedSnapshot()).toBeNull();
    expect(localStorage.getItem('curia-cache-v2')).toBeNull();
  });
});
