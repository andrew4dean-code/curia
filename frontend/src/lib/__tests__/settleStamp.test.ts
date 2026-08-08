import { describe, expect, it } from 'vitest';
import { outcomeWord, stampFor } from '../settleStamp';

describe('outcomeWord', () => {
  it('names an assigned call "called away", not "assigned"', () => {
    expect(outcomeWord('ASSIGNED', 'CALL')).toBe('called away');
  });

  it('leaves an assigned put as "assigned" — that side really is put to you', () => {
    expect(outcomeWord('ASSIGNED', 'PUT')).toBe('assigned');
  });

  it('does not vary the other two outcomes by side', () => {
    for (const side of ['CALL', 'PUT'] as const) {
      expect(outcomeWord('EXPIRED', side)).toBe('expired');
      expect(outcomeWord('BOUGHT_BACK', side)).toBe('bought back');
    }
  });

  it('returns lowercase, because the surfaces disagree about case', () => {
    for (const side of ['CALL', 'PUT'] as const) {
      for (const status of ['EXPIRED', 'BOUGHT_BACK', 'ASSIGNED'] as const) {
        const word = outcomeWord(status, side);
        expect(word).toBe(word.toLowerCase());
      }
    }
  });
});

describe('stampFor', () => {
  it('expiry keeps the premium and stamps green', () => {
    expect(stampFor('EXPIRED', 148, 'CALL')).toEqual({ word: 'EXPIRED', tone: 'up' });
  });

  it('a profitable buyback stamps green, a costly one red', () => {
    expect(stampFor('BOUGHT_BACK', 40, 'CALL')).toEqual({ word: 'BOUGHT BACK', tone: 'up' });
    expect(stampFor('BOUGHT_BACK', -60, 'PUT')).toEqual({ word: 'BOUGHT BACK', tone: 'down' });
  });

  it('assignment is neither a win nor a loss', () => {
    expect(stampFor('ASSIGNED', 148, 'PUT')).toEqual({ word: 'ASSIGNED', tone: 'assign' });
    expect(stampFor('ASSIGNED', -20, 'PUT')).toEqual({ word: 'ASSIGNED', tone: 'assign' });
  });

  it('stamps a called-away call with its own word, still on the assign tone', () => {
    expect(stampFor('ASSIGNED', 400, 'CALL')).toEqual({ word: 'CALLED AWAY', tone: 'assign' });
    expect(stampFor('ASSIGNED', -1300, 'CALL')).toEqual({ word: 'CALLED AWAY', tone: 'assign' });
  });

  it('stamps uppercase, because .settle-stamp has no text-transform to do it', () => {
    for (const side of ['CALL', 'PUT'] as const) {
      for (const status of ['EXPIRED', 'BOUGHT_BACK', 'ASSIGNED'] as const) {
        const { word } = stampFor(status, 0, side);
        expect(word).toBe(word.toUpperCase());
      }
    }
  });

  it('treats a flat result as kept, not lost', () => {
    expect(stampFor('EXPIRED', 0, 'CALL').tone).toBe('up');
  });
});
