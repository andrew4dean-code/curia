import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionSheet } from '../PositionSheet';
import type { OpenPosition } from '../../lib/types';

const pos: OpenPosition = {
  symbol: 'TQQQ', qty: 400, avgCost: 72, mark: null,
  marketValue: 25600, unrealizedPl: -3200, unrealizedPlPct: -11.1,
};

describe('PositionSheet', () => {
  it('names the holding', () => {
    render(<PositionSheet position={pos} onMark={vi.fn()} onClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/TQQQ/)).toBeInTheDocument();
    expect(screen.getByText(/400 sh/)).toBeInTheDocument();
    expect(screen.getByText(/\$72\.00/)).toBeInTheDocument();
  });

  it('offers both actions and routes each', () => {
    const onMark = vi.fn();
    const onClose = vi.fn();
    render(<PositionSheet position={pos} onMark={onMark} onClose={onClose} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /update price/i }));
    expect(onMark).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /close it out/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
