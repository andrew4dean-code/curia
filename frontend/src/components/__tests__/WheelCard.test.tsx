import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WheelCard } from '../WheelCard';
import { WheelDial } from '../WheelDial';
import type { WheelSummary } from '../../lib/types';

const base: WheelSummary = {
  wheel: { id: 1, symbol: 'TQQQ', no: 2, opened_at: '2026-07-06', closed_at: null },
  stage: 'SELLING_CALLS',
  sharesHeld: 400,
  rawBasis: 72,
  premiumBanked: 412,
  trueBasis: 70.97,
  closeToday: -2788,
  markMissing: false,
  callsSold: 3,
  weeks: 3,
};

describe('WheelDial', () => {
  it('marks passed, current and ahead stations and etches one spoke per call', () => {
    const { container } = render(<WheelDial stage="SELLING_CALLS" callsSold={3} no={2} weeks={3} />);
    expect(container.querySelector('[data-station="SELL_PUT"]')!.getAttribute('data-state')).toBe('passed');
    expect(container.querySelector('[data-station="ASSIGNED"]')!.getAttribute('data-state')).toBe('passed');
    expect(container.querySelector('[data-station="SELLING_CALLS"]')!.getAttribute('data-state')).toBe('current');
    expect(container.querySelector('[data-station="CALLED_AWAY"]')!.getAttribute('data-state')).toBe('ahead');
    expect(container.querySelectorAll('[data-testid="dial-spoke"]')).toHaveLength(3);
  });

  /* Settling an option happens on the Options tab, and the wheel it moves is drawn on
     Portfolio. Tabs are keyed on the active tab, so arriving at Portfolio mounts the
     dial fresh — and a fresh dial has nothing to sweep from, so the arm would simply
     already be at the new station. The one moment the sweep exists for is the one
     moment it would not have played. The dial therefore remembers, per wheel, where its
     hand was left. */
  describe('hand memory across a remount', () => {
    const angleOf = (c: HTMLElement) =>
      c.querySelector('.wheel-hand')!.getAttribute('transform');

    it('opens at the stage it was left on, not the one it is now', () => {
      const first = render(<WheelDial stage="SELL_PUT" callsSold={0} no={1} weeks={1} wheelId={7} />);
      expect(angleOf(first.container)).toBe('rotate(0.00)');
      first.unmount();

      // The wheel moved on while this card was not on screen.
      const again = render(<WheelDial stage="ASSIGNED" callsSold={0} no={1} weeks={2} wheelId={7} />);
      // Still pointing at SELL_PUT on the first frame: the sweep to ASSIGNED runs from
      // here. Landing already at rotate(90) would mean the travel never happened.
      expect(angleOf(again.container)).toBe('rotate(0.00)');
    });

    it('points straight at the stage on a cold mount', () => {
      const { container } = render(<WheelDial stage="ASSIGNED" callsSold={0} no={1} weeks={2} wheelId={9} />);
      expect(angleOf(container)).toBe('rotate(90.00)');
    });

    it('keeps each wheel to its own hand', () => {
      const a = render(<WheelDial stage="SELLING_CALLS" callsSold={0} no={1} weeks={1} wheelId={1} />);
      a.unmount();
      // A different wheel must not inherit wheel 1's position.
      const b = render(<WheelDial stage="SELL_PUT" callsSold={0} no={2} weeks={1} wheelId={2} />);
      expect(angleOf(b.container)).toBe('rotate(0.00)');
    });

    it('does not sweep a dial with no identity', () => {
      const first = render(<WheelDial stage="SELL_PUT" callsSold={0} no={1} weeks={1} />);
      first.unmount();
      const again = render(<WheelDial stage="CALLED_AWAY" callsSold={0} no={1} weeks={1} />);
      expect(angleOf(again.container)).toBe('rotate(270.00)');
    });
  });
});

describe('WheelCard', () => {
  it('shows the basis tiles and the close-today total', () => {
    render(
      <WheelCard summary={base} mark={{ symbol: 'TQQQ', price: 64, marked_at: new Date().toISOString(), source: 'auto' }} openCall={null} onComplete={vi.fn()} onAbandon={vi.fn()} />,
    );
    expect(screen.getByText('$72.00')).toBeInTheDocument();
    expect(screen.getByText('$412.00')).toBeInTheDocument();
    expect(screen.getByText('$70.97')).toBeInTheDocument();
    expect(screen.getByTestId('wheel-total-1').getAttribute('data-value')).toBe('−$2,788.00');
    expect(screen.queryByRole('button', { name: /Complete this wheel/ })).toBeNull();
  });

  it('offers completion only when called away (flat)', () => {
    const onComplete = vi.fn();
    render(
      <WheelCard
        summary={{ ...base, stage: 'CALLED_AWAY', sharesHeld: 0, rawBasis: null, trueBasis: null, closeToday: 412 }}
        mark={null}
        openCall={null}
        onComplete={onComplete}
        onAbandon={vi.fn()}
      />,
    );
    expect(screen.getByText('Banked this wheel')).toBeInTheDocument();
    screen.getByRole('button', { name: /Complete this wheel/ }).click();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
