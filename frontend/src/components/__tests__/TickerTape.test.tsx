import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TickerTape } from '../TickerTape';

const item = (symbol: string) => ({ symbol, price: 74.47, up: true });

/* ticker-scroll translates the track by -50%, which is seamless only while ONE half already
   fills the tape: the second half is what slides in behind the first. The component doubled
   the list and stopped there, so with one or two priced holdings a half was ~110-220px
   against a 375-640px tape — the tape crept left leaving a widening black band, reached two
   thirds empty, and snapped back in a single frame. */
describe('TickerTape', () => {
  const halves = (symbols: string[]) => {
    const { container } = render(<TickerTape items={symbols.map(item)} />);
    return container.querySelectorAll('.tk').length / 2;
  };

  it('carries enough per half to cover the widest the shell ever gets', () => {
    // 640px shell, entries about 110px wide.
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const syms = Array.from({ length: n }, (_, i) => `S${i}`);
      expect(halves(syms), `${n} holding(s) left a gap`).toBeGreaterThanOrEqual(6);
    }
  });

  it('still renders exactly two halves, since the animation translates by -50%', () => {
    const { container } = render(<TickerTape items={['A', 'B'].map(item)} />);
    expect(container.querySelectorAll('.tk').length % 2).toBe(0);
  });

  it('repeats whole copies of the list, so the loop seam falls between identical runs', () => {
    const { container } = render(<TickerTape items={['A', 'B'].map(item)} />);
    const syms = [...container.querySelectorAll('.tk')].map((e) => e.textContent!.trim().split(' ')[0]);
    const half = syms.slice(0, syms.length / 2);
    expect(syms.slice(syms.length / 2)).toEqual(half);
    // and the half is the base list, repeated whole
    for (let i = 0; i < half.length; i++) expect(half[i]).toBe(['A', 'B'][i % 2]);
  });

  it('does not divide by zero on an empty book', () => {
    const { container } = render(<TickerTape items={[]} />);
    expect(container.querySelectorAll('.tk').length).toBe(0);
  });
});
