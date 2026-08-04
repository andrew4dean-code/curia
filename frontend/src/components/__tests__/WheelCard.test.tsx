import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WheelCard, FILIGREE_HOLD_MS, FILIGREE_FADE_MS } from '../WheelCard';
import { WheelDial, SWEEP_MS } from '../WheelDial';
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
      <WheelCard summary={base} mark={{ symbol: 'TQQQ', price: 64, marked_at: new Date().toISOString(), source: 'auto' }} openCall={null} onComplete={vi.fn()} onAbandon={vi.fn()} expanded onToggle={vi.fn()} />,
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
        expanded
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Banked this wheel')).toBeInTheDocument();
    screen.getByRole('button', { name: /Complete this wheel/ }).click();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

/* The card's border ornament draws itself in alongside the hand, then dries away. It
   lives on the card and not on the dial face because that face is already dense — every
   attempt to ornament it read as dirt. These pin the wiring: the dial tells the card a
   sweep has begun, and only then. */
describe('card filigree', () => {
  const props = { mark: null, openCall: null, onComplete: vi.fn(), onAbandon: vi.fn(), expanded: true, onToggle: vi.fn() };
  const fil = () => document.querySelector('[data-testid="card-filigree"]');

  it('is absent on a card that has not moved', () => {
    render(<WheelCard summary={base} {...props} />);
    expect(fil()).toBeNull();
  });

  it('draws in when the wheel moves on, and clears itself afterwards', () => {
    vi.useFakeTimers();
    // First mount records where the hand sits...
    const first = render(<WheelCard summary={base} {...props} />);
    first.unmount();
    // ...so remounting on a later stage sweeps, and the border draws with it.
    render(<WheelCard summary={{ ...base, stage: 'CALLED_AWAY' }} {...props} />);
    expect(fil()).not.toBeNull();
    expect(fil()!.querySelectorAll('.fil-corner')).toHaveLength(4);
    // 8 strokes per corner, each drawing on its own delay
    expect(fil()!.querySelectorAll('path')).toHaveLength(32);

    // Once drawn, held and dried, it unmounts — an idle card carries no running animation.
    act(() => { vi.advanceTimersByTime(SWEEP_MS + FILIGREE_HOLD_MS + FILIGREE_FADE_MS + 400); });
    expect(fil()).toBeNull();
    vi.useRealTimers();
  });

  it('keeps every corner the same square, so none is stretched out of shape', () => {
    // One box stretched across a tall card turns small scrolls into arcs the length of
    // the card. Four fixed squares is the whole reason this reads as a corner ornament.
    vi.useFakeTimers();
    const first = render(<WheelCard summary={base} {...props} />);
    first.unmount();
    render(<WheelCard summary={{ ...base, stage: 'CALLED_AWAY' }} {...props} />);
    const boxes = [...fil()!.querySelectorAll('.fil-corner')].map((s) => s.getAttribute('viewBox'));
    expect(new Set(boxes)).toEqual(new Set(['0 0 100 100']));
    expect(fil()!.querySelector('[preserveAspectRatio="none"]')).toBeNull();
    vi.useRealTimers();
  });
});
