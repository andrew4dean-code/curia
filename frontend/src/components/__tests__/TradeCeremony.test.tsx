import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGE_MS, TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';
// @ts-expect-error -- no @types/node in this project; read the raw CSS source directly so the
// test sees the real rules on disk, bypassing Vitest's mocked CSS-import handling (which returns
// '' for .css imports under jsdom by default, so a normal `import` here would prove nothing).
import { readFileSync } from 'node:fs';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

// Long enough to walk through many strike cycles: STRIKE_EVERY(3) * TYPE_CHAR_MS(48) = 144ms per
// flip, and this fixture's 68 characters keep typing entirely inside the print stage's typing
// window (600ms-4200ms) so the stage never advances out from under the sampling loop below.
const longTicket: TicketData = {
  no: 91,
  title: 'TRADE TICKET',
  symbol: 'NVDA',
  lines: ['SELL 500 NVDA CALLS LIMIT', 'STRIKE 120 EXP FRIDAY', 'ACCOUNT REF 55210-TQ'],
};

describe('TradeCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('types the ticket like a press and advances through the stages', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    expect(screen.getByText(/TRADE TICKET Nº 47/)).toBeInTheDocument();
    // the trade lines hammer out one character at a time
    expect(screen.queryByText('BUY 400 TQQQ')).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText('BUY 400 TQQQ')).toBeNull(); // typing hasn't started yet
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('BUY 400 TQQQ')).toBeInTheDocument();
    expect(screen.getByText('@ $72.00')).toBeInTheDocument();
    const root = container.querySelector('[data-stage]')!;
    act(() => vi.advanceTimersByTime(1800)); // 4200ms total
    expect(root.getAttribute('data-stage')).toBe('fold');
    act(() => vi.advanceTimersByTime(1600));
    expect(root.getAttribute('data-stage')).toBe('envelope');
    act(() => vi.advanceTimersByTime(1100));
    expect(root.getAttribute('data-stage')).toBe('ship');
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1100));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('a tap anywhere skips straight to done, exactly once', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    fireEvent.click(container.querySelector('[data-stage]')!);
    fireEvent.click(container.querySelector('[data-stage]')!);
    expect(onDone).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(6000));
    expect(onDone).toHaveBeenCalledOnce(); // timers cleaned up, no double fire
  });

  it('runs for about eight seconds and clears every timer on unmount', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { unmount } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    vi.advanceTimersByTime(7999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDone).toHaveBeenCalledOnce();
    unmount();
    vi.advanceTimersByTime(10000);
    expect(onDone).toHaveBeenCalledOnce(); // no timer fired after unmount
    vi.useRealTimers();
  });

  it('the stage table sums to the eight-second target', () => {
    expect(STAGE_MS.reduce((n, [, ms]) => n + ms, 0)).toBe(8000);
  });

  it('draws a press with a platen, an arm and a typehead', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    expect(container.querySelector('.press-platen')).not.toBeNull();
    expect(container.querySelector('.press-arm')).not.toBeNull();
    expect(container.querySelector('.press-head')).not.toBeNull();
  });

  it('clips the arm so it can never cross the ticket', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    expect(arm.getAttribute('clip-path')).toMatch(/press-clip/);
    expect(container.querySelector('#press-clip')).not.toBeNull();
  });

  it('keeps the typehead inside the clip band on the third line of a three-line ticket', () => {
    // Regression for the defect where strikeY moved with the line index but the head's `y` was
    // hard-coded to 112. On line three (the common case: option sells and closing trades both run
    // three lines) strikeY landed below the head, so the clip removed it entirely and only a bare
    // shaft remained visible.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(600)); // TYPE_START_MS: typing begins
    // longTicket's first two lines plus their newlines are 47 characters (25 + 1 + 21), so the 49th
    // typed character is the second character of the third line - comfortably inside line index 2
    // and well within the print stage's typing window (600ms-4200ms for this fixture).
    for (let i = 0; i < 49; i++) {
      act(() => vi.advanceTimersByTime(48)); // TYPE_CHAR_MS
    }

    const head = container.querySelector('.press-head')!;
    const headGroup = head.parentElement!;
    const offsetMatch = headGroup.getAttribute('transform')?.match(/translate\(0,\s*(-?\d+(?:\.\d+)?)\)/);
    expect(offsetMatch).toBeTruthy();
    const offset = Number(offsetMatch![1]);
    const headY = Number(head.getAttribute('y')) + offset;
    const headHeight = Number(head.getAttribute('height'));

    const clipRect = container.querySelector('#press-clip rect')!;
    const clipY = Number(clipRect.getAttribute('y'));
    const clipHeight = Number(clipRect.getAttribute('height'));

    expect(headY).toBeGreaterThanOrEqual(clipY);
    expect(headY + headHeight).toBeLessThanOrEqual(clipY + clipHeight);
  });

  it('the fold stage builds three panels', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(4300));
    expect(container.querySelectorAll('.fold-panel')).toHaveLength(3);
    vi.useRealTimers();
  });

  it('the arm actually restrikes: data-strike alternates through printing, not just once', () => {
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    act(() => vi.advanceTimersByTime(600)); // TYPE_START_MS: typing begins

    // Sample data-strike after every character tick across the whole print stage. If the
    // attribute only ever flips once (or never) this regresses to "strikes once at mount,
    // then freezes" — the exact bug that shipped silently before.
    const samples: string[] = [];
    for (let i = 0; i < 70; i++) {
      act(() => vi.advanceTimersByTime(48)); // TYPE_CHAR_MS
      samples.push(arm.getAttribute('data-strike')!);
    }

    const seen = new Set(samples);
    expect(seen.has('0')).toBe(true);
    expect(seen.has('1')).toBe(true);

    const flips = samples.slice(1).filter((value, i) => value !== samples[i]).length;
    expect(flips).toBeGreaterThan(2);
  });

  it('binds data-strike=0 and data-strike=1 to two different keyframe names', () => {
    // Read the CSS straight off disk (not via a bundled import) so this pins the actual rules
    // that ship, not a jsdom-mocked stand-in.
    const testFilePath = new URL(import.meta.url).pathname;
    const cssPath = testFilePath.replace(/components\/__tests__\/TradeCeremony\.test\.tsx$/, 'styles/ceremony.css');
    const css = readFileSync(cssPath, 'utf8');

    const strike0 = css.match(/\.press-arm\[data-strike='0'\]\s*\{\s*animation:\s*(\S+)/);
    const strike1 = css.match(/\.press-arm\[data-strike='1'\]\s*\{\s*animation:\s*(\S+)/);

    expect(strike0).not.toBeNull();
    expect(strike1).not.toBeNull();
    // If both rules ever name the same keyframe, the computed animation-name never changes when
    // data-strike toggles, so CSS never restarts the animation: the arm strikes once at mount and
    // freezes in its end pose for the rest of the print stage.
    expect(strike0![1]).not.toBe(strike1![1]);
  });
});
