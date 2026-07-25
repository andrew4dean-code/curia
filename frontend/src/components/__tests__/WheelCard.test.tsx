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
