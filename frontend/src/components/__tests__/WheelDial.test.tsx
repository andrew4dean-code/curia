import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WheelDial, forwardTo } from '../WheelDial';

/* The hand winds CLOCKWISE, always. HAND_ANGLE is absolute — SELL PUT 0, ASSIGNED 90,
   SELLING CALLS 180, CALLED AWAY 270, COMPLETED 360 — so a naive "animate from where I am
   to that number" unwinds the hand backwards the moment a wheel closes its circle, which is
   the one move the whole instrument is named after. */
describe('forwardTo', () => {
  it('closes the wheel forwards: called away to the next put is a quarter turn, not three', () => {
    expect(forwardTo(270, 0)).toBe(360);
  });

  it('leaves an already-forward move alone', () => {
    expect(forwardTo(0, 90)).toBe(90);
    expect(forwardTo(90, 180)).toBe(180);
    expect(forwardTo(180, 270)).toBe(270);
  });

  it('never returns a destination behind where the hand stands', () => {
    const stations = [0, 90, 180, 270, 360];
    for (const from of stations) {
      for (const to of stations) {
        expect(forwardTo(from, to), `${from} -> ${to} went backwards`).toBeGreaterThanOrEqual(from);
      }
    }
  });

  it('keeps winding past a full turn rather than resetting', () => {
    // A second lap: the hand is at 360 and the wheel starts again at SELL PUT -> ASSIGNED.
    expect(forwardTo(360, 90)).toBe(450);
    expect(forwardTo(450, 180)).toBe(540);
  });

  it('treats COMPLETED as a whole turn beyond SELL PUT, not the same place', () => {
    // Both are multiples of 360 apart, so plain modular arithmetic collapses them and the
    // dial would simply not move when a wheel completed from its opening station.
    expect(forwardTo(0, 360)).toBe(360);
  });

  it('does not move when the stage has not changed', () => {
    for (const a of [0, 90, 180, 270, 360]) expect(forwardTo(a, a)).toBe(a);
  });
});

describe('WheelDial', () => {
  it('counts calls in the singular when there is one', () => {
    render(<WheelDial stage="SELLING_CALLS" callsSold={1} no={1} weeks={3} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/1 call sold/);
  });

  it('and in the plural otherwise', () => {
    render(<WheelDial stage="SELLING_CALLS" callsSold={4} no={2} weeks={3} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/4 calls sold/);
  });
});
