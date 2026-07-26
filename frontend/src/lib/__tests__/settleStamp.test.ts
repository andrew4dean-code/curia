import { describe, expect, it } from 'vitest';
import { stampFor } from '../settleStamp';

describe('stampFor', () => {
  it('expiry keeps the premium and stamps green', () => {
    expect(stampFor('EXPIRED', 148)).toEqual({ word: 'EXPIRED', tone: 'up' });
  });

  it('a profitable buyback stamps green, a costly one red', () => {
    expect(stampFor('BOUGHT_BACK', 40)).toEqual({ word: 'BOUGHT BACK', tone: 'up' });
    expect(stampFor('BOUGHT_BACK', -60)).toEqual({ word: 'BOUGHT BACK', tone: 'down' });
  });

  it('assignment is neither a win nor a loss', () => {
    expect(stampFor('ASSIGNED', 148)).toEqual({ word: 'ASSIGNED', tone: 'assign' });
    expect(stampFor('ASSIGNED', -20)).toEqual({ word: 'ASSIGNED', tone: 'assign' });
  });

  it('treats a flat result as kept, not lost', () => {
    expect(stampFor('EXPIRED', 0).tone).toBe('up');
  });
});
