import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EJECT_MS, SEAL_FLOOR_MS, STAGE_MS, TYPE_CHAR_MS, TYPE_START_MS, TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';
import { NIP_Y, PRESS_HOME_X, PRESS_OVERHANG, PRESS_VIEW_H, tiltForChar } from '../Press';
// @ts-expect-error -- no @types/node in this project; read the raw CSS source directly so the
// test sees the real rules on disk, bypassing Vitest's mocked CSS-import handling (which returns
// '' for .css imports under jsdom by default, so a normal `import` here would prove nothing).
import { readFileSync } from 'node:fs';
// @ts-expect-error -- no @types/node in this project.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- no @types/node in this project.
import { dirname, join } from 'node:path';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

// Read the CSS straight off disk (not via a bundled import) so these pin the actual rules that
// ship, not a jsdom-mocked stand-in. jsdom computes no animation and no layout, so this whole
// class of bug -- a transform that is never transitioned, a perspective on the wrong element,
// preserve-3d on an SVG node -- is otherwise invisible to every test in this file.
// fileURLToPath, never new URL(...).pathname: a URL path is percent-encoded, so any checkout
// whose path contains a space (the local clone lives under ".../Desktop/Claude Work/") hands
// readFileSync a literal "Claude%20Work" and every assertion in this file dies on ENOENT. The
// suite passed in CI on nothing more than the absence of a space in the runner's path.
function readCeremonyCss(): string {
  // .../src/components/__tests__ -> .../src/styles/ceremony.css
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', 'styles', 'ceremony.css'), 'utf8');
}

// The rules with the comments taken out. Several assertions below are of the form "this name
// does not appear anywhere" -- and this file explains at length why the names it deleted were
// deleted, so a prose mention would fail them. Strip the prose and they assert what they mean.
function readCeremonyRules(): string {
  return readCeremonyCss().replace(/\/\*[\s\S]*?\*\//g, '');
}

// One @keyframes block, braces balanced one level deep, so it reads a block written on a single
// line exactly as well as one spread over five. The `[^@]*?\n\}` form used elsewhere in this file
// silently matches nothing when a block has no newline before its closing brace.
function keyframes(css: string, name: string): string {
  return css.match(new RegExp(`@keyframes ${name}\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`))![1];
}

// Long enough to walk through many strike cycles. There is one strike per PRINTED character
// now (the old STRIKE_EVERY(3) let two of every three glyphs appear with no strike at all), so
// the flip period is TYPE_CHAR_MS, one beat. Newlines cost no beat, so this fixture is 66 beats
// (25 + 21 + 20 glyphs, the two line breaks free), which keeps typing entirely inside the print
// stage's typing window (600ms-4200ms) and the stage never advances out from under the sampling
// loops below.
const longTicket: TicketData = {
  no: 91,
  title: 'TRADE TICKET',
  symbol: 'NVDA',
  lines: ['SELL 500 NVDA CALLS LIMIT', 'STRIKE 120 EXP FRIDAY', 'ACCOUNT REF 55210-TQ'],
};

// What is actually struck on each line: the ghost span beside it holds the REST of the line,
// laid out but not painted, so the line box never changes width. Text queries would match the
// ghost too, so every assertion about "what has been typed so far" reads the ink span.
function inked(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.tl-ink')).map((n) => n.textContent ?? '');
}

// jsdom has no layout: every getBoundingClientRect is 0, so the component's own guard keeps the
// bar parked on the centre line and registration would be untestable. This stub gives the scene
// a real box and lays the lines out the way a real face would -- the PITCH AND THE HEADER HEIGHT
// LIVE ONLY HERE. The component must never know either; it has to read both back out of the DOM,
// because Playfair Display and Space Mono are Google-hosted webfonts on an offline-first PWA and
// the first cold run gets whatever the fallback faces measure. .tl-strike is the cell occupied by
// the glyph just struck; .print-column is the zero-width anchor sitting after it.
const FAKE_LEFT = 46;
const FAKE_PITCH = 8.4;
// The vertical half of the same idea, and the numbers are the ones headless Chrome actually
// reports for this stylesheet at 375x667 with the Georgia/monospace fallbacks: 2px dashed
// border + 22px padding above a 38.5px head block (19.5 line box + 8 padding + 1 rule + 10
// margin), then 27px per line. So line n's block box bottoms out 89.5 + 27n below the sheet's
// own top edge. A WRAPPED head is one whole line box taller.
const FAKE_PAD_TOP = 24;
const FAKE_HEAD_H = 38.5;
const FAKE_HEAD_WRAPPED = FAKE_HEAD_H + 19.5;
const FAKE_LINE_PITCH = 27;
const SCENE_H = 288;
// how far line n's box bottoms out below the sheet's own top edge -- the ONLY vertical fact in
// the whole model, and the component is not allowed to know it: it reads it off the DOM.
const dropFor = (n: number, headHeight = FAKE_HEAD_H) =>
  FAKE_PAD_TOP + headHeight + (n + 1) * FAKE_LINE_PITCH;

function fakeRect(left: number, width: number, top = 0, bottom = 0): DOMRect {
  return {
    x: left, y: top, left, right: left + width, top, bottom, width, height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

// The sheet's box is reported with top 0 and the line boxes at their LAID-OUT offsets, with no
// feed term anywhere -- which is exactly the shape of the real thing. The component computes
// the feed as `line.bottom - sheet.top`, a difference between two boxes on the same transformed
// element, so the transform cancels and the number it gets back is pure layout. (jsdom applies
// no transforms at all, so that cancellation is proved in a browser, not here; what this stub
// pins is that the component asks layout the right question.)
function stubLayout(headHeight = FAKE_HEAD_H) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('ceremony-scene')) return fakeRect(0, 290, 0, SCENE_H);
    if (this.classList.contains('ticket')) return fakeRect(0, 290, 0, SCENE_H);
    const lineEl = this.closest('.ticket-line');
    if (!lineEl) return fakeRect(0, 0);
    const lines = Array.from(lineEl.parentElement!.querySelectorAll('.ticket-line'));
    const bottom = dropFor(lines.indexOf(lineEl), headHeight);
    const top = bottom - FAKE_LINE_PITCH;
    if (lineEl === this) return fakeRect(20, 250, top, bottom);
    const typed = lineEl.querySelector('.tl-ink')?.textContent?.length ?? 0;
    if (this.classList.contains('tl-strike')) {
      return fakeRect(FAKE_LEFT + (typed - 1) * FAKE_PITCH, FAKE_PITCH, top, bottom);
    }
    if (this.classList.contains('print-column')) return fakeRect(FAKE_LEFT + typed * FAKE_PITCH, 0, top, bottom);
    return fakeRect(0, 0);
  });
}

// every glyph of a ticket, newlines costing nothing -- i.e. the number of beats it takes to type
const beatsFor = (t: TicketData) => t.lines.join('').length;

// The carriage offset, and the arm's VERTICAL term beside it -- which must be zero on every
// line, forever. That second number is the whole flip in one place.
function carrier(container: HTMLElement): { dx: number; dy: number } {
  const m = container.querySelector('.press-carrier')!.getAttribute('transform')!
    .match(/translate\((-?[\d.]+),\s*(-?[\d.]+)\)/)!;
  return { dx: Number(m[1]), dy: Number(m[2]) };
}

// how far down the sheet is sitting, in scene pixels, straight off the inline custom property
function sheetFeed(container: HTMLElement): number {
  const style = (container.querySelector('.ticket-wrap .ticket') as HTMLElement).style;
  return Number(style.getPropertyValue('--sheet').replace('px', ''));
}

// where the line currently being typed bottoms out, IN SCENE PIXELS: the sheet's own offset
// plus the line's offset within the sheet. This is the strike point, and invariant 1 is that it
// is the same number for every line index.
const strikeY = (container: HTMLElement, line: number, headHeight = FAKE_HEAD_H) =>
  sheetFeed(container) + dropFor(line, headHeight);

// the pivot the bar swings about, off the inline transform-origin
function pivot(container: HTMLElement): { x: number; y: number } {
  const m = (container.querySelector('.press-arm') as SVGGElement).style.transformOrigin.match(
    /(-?[\d.]+)px\s+(-?[\d.]+)px/,
  )!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

describe('TradeCeremony', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('types the ticket like a press and advances through the stages', () => {
    const onDone = vi.fn();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={onDone} />);
    expect(screen.getByText(/TRADE TICKET Nº 47/)).toBeInTheDocument();
    // the trade lines hammer out one character at a time. REWRITTEN from screen.getByText: both
    // lines are now split into an ink span and a hidden ghost span holding the rest of the line
    // (that is what stops a centred line sliding left as it grows), so a text query would match
    // the ghost before a single character had been struck. Reading the ink is strictly more
    // precise -- it asserts what is actually printed, not what is merely reserved.
    expect(inked(container)).toEqual(['', '']);
    act(() => vi.advanceTimersByTime(400));
    expect(inked(container)).toEqual(['', '']); // typing hasn't started yet
    // ...while the full text is already laid out, unpainted, holding the line width
    expect(container.querySelector('.ticket-line')!.textContent).toBe('BUY 400 TQQQ');
    act(() => vi.advanceTimersByTime(2000));
    expect(inked(container)).toEqual(['BUY 400 TQQQ', '@ $72.00']);
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

  it('has NO clip and NO mask on the arm: nothing is authored above the nip in the first place', () => {
    // REWRITTEN, AND IT NOW ASSERTS THE OPPOSITE OF WHAT IT USED TO. The old test pinned a clip
    // band and a fade mask -- the machinery that existed only because the machine was upside
    // down: the platen sat at the TOP and the sheet hung DOWN from it, so the arm had to reach
    // up across the printed page to get anywhere near the strike point, and then be cut and
    // faded to hide the fact. What that produced was a severed dark stub floating in mid-page
    // attached to nothing, which the owner rejected three times.
    // The platen is at the BOTTOM now. The page is above the nip, the arm is below it, and the
    // two cannot meet -- so there is nothing to hide and no clip to hide it with. A clip
    // reappearing here means the geometry has gone wrong again.
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const press = container.querySelector('.press')!;
    expect(press.querySelector('clipPath')).toBeNull();
    expect(press.querySelector('mask')).toBeNull();
    for (const el of press.querySelectorAll('*')) {
      expect(el.getAttribute('clip-path')).toBeNull();
      expect(el.getAttribute('mask')).toBeNull();
    }
    expect(readCeremonyRules()).not.toMatch(/press-clip|arm-fade/);
  });

  it('authors every part of the press at or below the nip, so the arm can never paint on the page', () => {
    // INVARIANT 2, pinned structurally. svg y 0 IS the nip (see .press { top } and NIP_Y), so
    // "no part of the press is ever painted above the nip" reduces to two facts: nothing is
    // drawn at a negative y, and the swing only ever moves the arm DOWN from its authored pose.
    // Measured in headless Chrome to confirm the arithmetic: the arm's bounding box tops out at
    // scene y 170.89 at full contact with the largest tilt (8 degrees) against a nip at 170.
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const press = container.querySelector('.press')!;
    expect(press.getAttribute('viewBox')).toBe(`0 0 350 ${PRESS_VIEW_H}`);

    // the head is the topmost thing the press draws, and it is held clear of the nip by more
    // than the tilt can lift a corner: 16/2 * sin(8deg) = 1.11px
    const head = container.querySelector('.press-head')!;
    const headTop = Number(head.getAttribute('y'));
    const lift = (Number(head.getAttribute('width')) / 2) * Math.sin((8 * Math.PI) / 180);
    expect(headTop).toBeGreaterThan(lift);
    // and 8 degrees really is the most any character can ask for
    let worst = 0;
    for (let code = 32; code < 127; code++) worst = Math.max(worst, Math.abs(tiltForChar(String.fromCharCode(code))));
    expect(worst).toBe(8);

    // nothing else in the drawing reaches above y = 0 either. Circles are checked as cy - r.
    for (const el of press.querySelectorAll('rect, circle')) {
      const y = el.tagName === 'circle'
        ? Number(el.getAttribute('cy')) - Number(el.getAttribute('r'))
        : Number(el.getAttribute('y'));
      expect(y).toBeGreaterThanOrEqual(0);
    }

    // and the swing never lifts it: every keyframe pose is a translateY DOWN from contact.
    const body = keyframes(readCeremonyCss(), 'press-hit-a');
    const ys = Array.from(body.matchAll(/translateY\((-?[\d.]+)px\)/g)).map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(3);
    expect(Math.min(...ys)).toBe(0); // contact is the highest pose there is
    expect(Math.max(...ys)).toBeGreaterThan(40); // and rest is a long way down inside the basket
  });

  it('reaches the machine at both ends of the swing, so it is never a stub floating in mid-air', () => {
    // INVARIANT 3, and THE defect the owner rejected three times. The arm is drawn on top of an
    // opaque machine body that covers the whole viewBox from the nip down, so "visually
    // continuous with the machine" is the statement that the arm's own extent lies inside the
    // body's -- at contact AND at rest. Rest is the deeper of the two: the base transform drops
    // the arm 56px, and the shaft's base has to still be behind the front shell after that.
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const bodyRect = container.querySelector('.press-body rect')!;
    const bodyTop = Number(bodyRect.getAttribute('y'));
    const bodyBottom = bodyTop + Number(bodyRect.getAttribute('height'));

    // the shaft runs from under the head down to the pivot
    const shaft = container.querySelector('.press-shaft')!.getAttribute('d')!;
    const shaftYs = Array.from(shaft.matchAll(/[ML][\d.]+ ([\d.]+)/g)).map((m) => Number(m[1]));
    const shaftBase = Math.max(...shaftYs);

    const css = readCeremonyCss();
    const rest = Number(
      css.match(/\n\.press-arm \{[^}]*transform:[^;]*translateY\(([\d.]+)px\)/)![1],
    );
    // at rest the base is pushed further down still, and it must not come out below the machine
    expect(shaftBase + rest).toBeLessThanOrEqual(bodyBottom);
    // ...and it must be behind the front shell rather than standing on open machine
    const front = container.querySelector('.press-front-face')!.getAttribute('d')!;
    const shellTop = Number(front.match(/Q-?[\d.]+ ([\d.]+)/)![1]);
    expect(shaftBase).toBeGreaterThan(shellTop);
    // at contact the head's top is inside the platen's band, which is the top of the machine
    const platen = container.querySelector('.press-platen rect')!;
    const platenTop = Number(platen.getAttribute('y'));
    const platenBottom = platenTop + Number(platen.getAttribute('height'));
    const headTop = Number(container.querySelector('.press-head')!.getAttribute('y'));
    expect(headTop).toBeGreaterThanOrEqual(platenTop);
    expect(headTop).toBeLessThan(platenBottom);
  });

  it('THE STRIKE Y IS THE SAME ON EVERY LINE: the sheet ratchets to the nip, the bar does not move', () => {
    // INVARIANT 1, and the reason the whole machine was turned the right way up. The press used
    // to carry the register: the arm, its clip band and its pivot were all pushed down 24px per
    // line to chase the text, and every one of those three had to agree with the sheet's own
    // 3px-per-line roll or the hammer landed off the glyph. It is the sheet that moves now. The
    // bar has no vertical term at all, and the line being typed is brought TO it.
    stubLayout();
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS));

    // line 0 -- one beat in, so there is a struck glyph to measure the column off
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[0]).toBe('S');
    const line0 = { strike: strikeY(container, 0), dy: carrier(container).dy, feed: sheetFeed(container) };

    // line 1 -- 25 beats finish line one (its line break costs no beat), one more starts line two
    for (let i = 0; i < 26; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[1]).toBe('ST');
    const line1 = { strike: strikeY(container, 1), dy: carrier(container).dy, feed: sheetFeed(container) };

    // line 2
    for (let i = 0; i < 21; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[2]).toBe('AC');
    expect(inked(container)[1]).toBe(longTicket.lines[1]); // line one really did finish
    const line2 = { strike: strikeY(container, 2), dy: carrier(container).dy, feed: sheetFeed(container) };

    // ONE NUMBER, THREE LINES. Break it by giving the arm a per-line offset again, or by making
    // the feed anything other than one full line pitch, and all three of these diverge.
    expect(line0.strike).toBeCloseTo(NIP_Y, 5);
    expect(line1.strike).toBeCloseTo(NIP_Y, 5);
    expect(line2.strike).toBeCloseTo(NIP_Y, 5);

    // the arm carries no vertical term on any of them
    expect([line0.dy, line1.dy, line2.dy]).toEqual([0, 0, 0]);

    // and the sheet stepped by EXACTLY ONE LINE PITCH each time -- a ratchet, not a 3px roll
    // against a 27px pitch, which is what the two halves of the old model disagreed by.
    expect(line0.feed - line1.feed).toBeCloseTo(FAKE_LINE_PITCH, 5);
    expect(line1.feed - line2.feed).toBeCloseTo(FAKE_LINE_PITCH, 5);
  });

  it('lands the head on the live print column, and tracks it character by character', () => {
    // The horizontal half of registration, unchanged by the flip and unchanged here: the arm
    // used to strike at a FIXED x while .ticket-line is centre-aligned and grows rightward, so
    // the hammer never landed where the letter appeared. Space Mono is a Google-hosted webfont
    // on an offline-first PWA, so a hardcoded character pitch is wrong on every cold start.
    stubLayout();
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS));
    for (let i = 0; i < 48; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[2]).toBe('AC');

    // the head's centre sits on the centre of the cell the letter just landed in -- the second
    // cell of the line here, i.e. FAKE_LEFT + 1.5 advances -- in scene pixels. Measuring the
    // anchor AFTER the ink instead would put it half a character right of the letter it had
    // just struck, for the whole beat that letter was on screen.
    const { dx } = carrier(container);
    expect(PRESS_HOME_X + dx - PRESS_OVERHANG).toBeCloseTo(FAKE_LEFT + 1.5 * FAKE_PITCH, 1);

    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[2]).toBe('ACC');
    expect(carrier(container).dx - dx).toBeCloseTo(FAKE_PITCH, 2);
  });

  it('absorbs a header that WRAPS into the sheet feed, without moving the strike point at all', () => {
    // REWRITTEN AGAINST THE NEW MODEL. The defect this used to guard was real: the press
    // computed its strike line as 96 + 24, which assumed .ticket-head was one 22.5px line box,
    // and every ticket title wrapped to two lines in Georgia Bold -- the declared fallback in
    // --font-display, and therefore the FIRST PAINT of every ceremony, since Playfair Display
    // is fetched from Google Fonts with display=swap. The head came out a whole line box taller,
    // every .ticket-line moved down, the clip band stayed put, and the shaft drew straight
    // through the printed line.
    // With the machine the right way up that class of failure cannot express itself: a taller
    // header pushes the line further down THE SHEET, and the feed simply carries the sheet less
    // far up. The strike point is a fixed scene y either way. So this now asserts the stronger
    // statement -- the register does not move, and the feed is what changed.
    function registerWithHead(headHeight: number) {
      stubLayout(headHeight);
      const { container, unmount } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
      act(() => vi.advanceTimersByTime(TYPE_START_MS));
      for (let i = 0; i < 48; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
      expect(inked(container)[2]).toBe('AC'); // line index 2, the worst case for register
      const out = { strike: strikeY(container, 2, headHeight), feed: sheetFeed(container) };
      unmount();
      vi.restoreAllMocks();
      return out;
    }

    const flat = registerWithHead(FAKE_HEAD_H);
    const wrapped = registerWithHead(FAKE_HEAD_WRAPPED);

    // the strike point is the nip, in both layouts, to the pixel
    expect(flat.strike).toBeCloseTo(NIP_Y, 5);
    expect(wrapped.strike).toBeCloseTo(NIP_Y, 5);
    // and the whole extra line the wrapped header ate came out of the FEED, not the register
    expect(flat.feed - wrapped.feed).toBeCloseTo(FAKE_HEAD_WRAPPED - FAKE_HEAD_H, 5);
  });

  it('does not let the ticket header wrap in the first place', () => {
    // The other end of the same defect, and the one no jsdom test can see for itself: the wrap
    // is invisible in the DOM. Measured in headless Chrome, Georgia Bold, 250px content box:
    //     15px / .06em    TRADE 257.6   OPTION 266.3   CLOSED 289.8   -- all three wrap
    //     13px / .02em    TRADE 209.8   OPTION 216.7   CLOSED 236.1   -- none wrap, 246.0 with
    //                                                                    a three-digit number
    // `nowrap` is the structural guarantee behind that arithmetic: a longer title than Georgia
    // was measured at now bleeds a couple of px into the 20px padding instead of taking a second
    // line and moving every line of the ticket out from under the press.
    const head = readCeremonyCss().match(/\n\.ticket-head\s*\{([^}]*)\}/)![1];
    expect(head).toMatch(/white-space:\s*nowrap/);
    expect(Number(head.match(/font-size:\s*([\d.]+)px/)![1])).toBeLessThanOrEqual(13);
    expect(Number(head.match(/letter-spacing:\s*([\d.]*)em/)![1])).toBeLessThanOrEqual(0.02);
  });

  it('cannot wrap a ticket line either, and so cannot void the line pitch below it', () => {
    // .ticket-line carried `pre-wrap`, which preserves the spaces the ink/ghost join needs but
    // still breaks the line. Measured: the box is 250px and at 14px mono with the inherited
    // letter-spacing of .01em the advance is 8.54-8.57px, so 29 characters fit and 30 do not.
    // "TQQQ $107.5 CALL · exp Aug 29" is 29 and fits at 248.5px; "GOOGL $107.5 CALL · exp Aug 29"
    // is 30 and wraps at 257.1px -- any five-letter ticker with a fractional strike, which
    // OptionSellSheet emits routinely. Rendered with the fallback face that line came out 48px
    // tall instead of 27 and pushed the line below it 21px down. `pre` keeps the space handling
    // and forbids the break.
    const line = readCeremonyCss().match(/\n\.ticket-line\s*\{([^}]*)\}/)![1];
    expect(line).toMatch(/white-space:\s*pre\s*[;}]/);
    expect(line).not.toMatch(/pre-wrap|pre-line|normal/);
  });

  it('swings the bar about a pivot whose height is a CONSTANT, so the lever cannot change length', () => {
    // REWRITTEN. Press.tsx set transform-origin to `${PRESS_HOME_X + dx}px ${PIVOT_Y}px` -- x
    // tracked the carriage, y was a constant 258 -- while the carrier translated by
    // (dx, armOffset). The pivot stayed put as the head went down the page and THE LEVER
    // SHORTENED: 136px on line 0, 112 on line 1, 88 on line 2, so identical swing keyframes drew
    // a 35% smaller arc by line three. The fix at the time was to make the pivot ride the line
    // too. The fix now is that NOTHING rides the line: the head does not move down the page, so
    // the pivot has nothing to follow and the lever is one length by construction.
    stubLayout();
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS));
    const first = pivot(container);

    for (let i = 0; i < 47; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[2]).toBe('AC'); // two lines further down the sheet
    const third = pivot(container);

    expect(third.y).toBe(first.y); // the pivot did not move at all
    expect(third.x).not.toBe(first.x); // ...while the carriage plainly did
    // the lever: pivot to head, the same on both
    const headY = Number(container.querySelector('.press-head')!.getAttribute('y'));
    expect(third.y - headY).toBe(first.y - headY);
  });

  it('ratchets the sheet feed instead of easing it under the strike', () => {
    // `.ticket` rolled up 3px per line under `transition: transform .13s steps(2, end)` while the
    // press jumped its whole line offset inside the React commit. Scrubbed in headless Chrome:
    // steps(2, end) holds the OLD position for 0-64ms and the halfway one for 65-129ms, so at a
    // 48ms beat the first THREE strikes of every line after the first landed on paper that was
    // 3px or 1.5px out -- and a box read in a layout effect reports the pre-transition value, so
    // it made the measured register stale as well. A platen ratchets; it does not ease.
    // The rule is scoped to .ticket-wrap now, so the settle ceremony's .settle-ticket (which
    // shares the .ticket class and has no wrapper) keeps its own transform.
    const rules = readCeremonyRules();
    const feed = rules.match(/\.ticket-wrap \.ticket \{([^}]*translateY[^}]*)\}/)![1];
    expect(feed).toMatch(/transform:\s*translateY\(var\(--sheet/);
    expect(feed).not.toMatch(/transition/);
    // and the 3px-per-line roll it replaces is gone outright, not left beside it
    expect(rules).not.toMatch(/--feed/);
  });

  it('parks the bar on the centre line until something has actually been measured', () => {
    // No stubLayout here: every box is zero-sized, as it would be before first layout. The
    // component must not divide by that or treat it as a real column of x=0 -- it falls back to
    // the scene's centre, which is where the shaft is authored.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS * 4));
    expect(carrier(container).dx).toBe(0);
  });

  it('holds every line at its final width from the first frame', () => {
    // .ticket-line is centre-aligned, so a line that grew a character at a time slid LEFT under
    // the hammer as it went. Paper cannot do that. Each line renders its typed part and a ghost
    // holding the rest -- laid out, not painted -- so the line box is full width before the first
    // character is struck and the centring has nothing left to re-centre.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const lines = () => Array.from(container.querySelectorAll('.ticket-line'));

    for (const ms of [0, TYPE_START_MS, TYPE_CHAR_MS * 9, TYPE_CHAR_MS * 30]) {
      act(() => vi.advanceTimersByTime(ms));
      // the full line is present in the layout at every instant, however little of it is inked
      expect(lines().map((l) => l.textContent)).toEqual(longTicket.lines);
    }
    const ghosts = container.querySelectorAll('.tl-ghost');
    expect(ghosts).toHaveLength(longTicket.lines.length);
    expect((ghosts[0] as HTMLElement).style.visibility).toBe('hidden');

    // and the join between ink and ghost must not collapse a run of spaces as it moves through
    // the line, which would change the width after all. `pre`, not `pre-wrap` -- see the
    // no-wrap test below for the 30-character line that made the difference.
    expect(readCeremonyCss()).toMatch(/\.ticket-line\s*\{[^}]*white-space:\s*pre\s*[;}]/);
  });

  it('costs no beat to return the carriage', () => {
    // '\n' prints nothing. If it ate a tick, every line break inserted a silent gap and pushed
    // the strike for the first letter of the next line one beat late -- a phase shift the eye
    // reads as the machine losing its rhythm.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS));
    for (let i = 0; i < 25; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[0]).toBe('SELL 500 NVDA CALLS LIMIT'); // 25 glyphs, 25 beats
    expect(inked(container)[1]).toBe('');

    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS)); // beat 26
    expect(inked(container)[1]).toBe('S'); // a glyph, not a swallowed newline
    expect(container.querySelector('.press-arm')!.getAttribute('data-strike')).toBe('0'); // beat 26 of 26

    // and the strike keeps alternating straight across the break rather than repeating itself
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(container.querySelector('.press-arm')!.getAttribute('data-strike')).toBe('1');
  });

  it('parks the bar at rest INSIDE the machine before typing starts, never lit and motionless in mid-air', () => {
    // INVARIANT 5, and it was measured broken in the live app: `.press-arm` declared opacity 0
    // with `.ceremony[data-typing='yes'] .press-arm { opacity: 1 }` on top -- and data-typing is
    // 'yes' from ceremony MOUNT, so what actually shipped was a fully lit bar with
    // `animation: none` hanging over an empty page for the whole 600ms pre-roll. A stick, parked
    // in the air, before a single character had been typed.
    // The bar is a part of the machine now: always visible, at rest down in the basket, painted
    // on an opaque body. So the fix is asserted at both ends -- nothing gates its visibility,
    // and its resting pose is a long way below the nip.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    expect(arm.getAttribute('data-strike')).toBe('idle'); // matches neither strike rule
    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS));
    expect(arm.getAttribute('data-strike')).toBe('1');

    const css = readCeremonyCss();
    const base = css.match(/\n\.press-arm \{([^}]*)\}/)![1];
    expect(base).not.toMatch(/opacity/); // nothing to fade in, nothing to be caught half-faded
    expect(readCeremonyRules()).not.toMatch(/\[data-typing='yes'\] \.press-arm \{[^}]*opacity/);

    // rest is deep in the basket: below the platen, which is the top 46px of the machine
    const restDrop = Number(base.match(/translateY\(([\d.]+)px\)/)![1]);
    const platen = container.querySelector('.press-platen rect')!;
    const platenBottom = Number(platen.getAttribute('y')) + Number(platen.getAttribute('height'));
    const headTop = Number(container.querySelector('.press-head')!.getAttribute('y'));
    expect(headTop + restDrop).toBeGreaterThan(platenBottom);

    // and the parked pose has to BE the rest pose, or the first strike starts with a jump --
    // the same defect as the old press-hit-a/press-hit-b handover, just at the top of the stage.
    const rest = keyframes(css, 'press-hit-a').match(/0%\s*\{\s*transform:\s*([^;]+);/)![1].trim();
    expect(base.match(/transform:\s*([^;]+);/)![1].trim()).toBe(rest);
  });

  it('pins the nip: the CSS top, the TS constant and the viewBox are one coordinate system', () => {
    // svg y 0 has to BE the nip, or every "nothing above the nip" statement in this file is
    // about a different line than the one the sheet is registered to. Three things have to
    // agree: .press { top } in the stylesheet, NIP_Y in Press.tsx (which the feed is computed
    // from), and a viewBox that is 1:1 with CSS pixels in BOTH axes so a user unit is a pixel.
    const css = readCeremonyCss();
    const press = css.match(/\n\.press \{([^}]*)\}/)![1];
    expect(Number(press.match(/top:\s*(-?[\d.]+)px/)![1])).toBe(NIP_Y);
    expect(Number(press.match(/height:\s*([\d.]+)px/)![1])).toBe(PRESS_VIEW_H);
    const bleed = Number(press.match(/left:\s*-([\d.]+)px/)![1]);
    expect(bleed).toBe(PRESS_OVERHANG);
    const sceneW = Number(css.match(/\.ceremony-scene \{[^}]*width:\s*(\d+)px/)![1]);
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const viewBox = container.querySelector('.press')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(viewBox[2]).toBe(sceneW + bleed * 2);
    expect(viewBox[3]).toBe(PRESS_VIEW_H);

    // THE MACHINE HAS TO BE TALL ENOUGH TO HIDE THE WRAPPED PART OF THE SHEET. There is no clip
    // on the paper -- the body is simply opaque over it -- so the drawing must reach from the
    // nip down past the sheet's own bottom edge at the moment line 0 is at the nip. That is
    // (sheet height - line 0's drop) below the nip, and it does not depend on NIP_Y: moving the
    // nip moves the sheet with it. Measured in Chrome: 288 - 89.5 = 198.5px.
    const sheetH = Number(css.match(/\.ticket-wrap \.ticket \{[^}]*min-height:\s*(\d+)px/)![1]);
    expect(PRESS_VIEW_H).toBeGreaterThanOrEqual(sheetH - dropFor(0));
  });

  it('gives the same letter the same face every time it is struck', () => {
    // The face used to come from the beat's parity (press-hit-a leaned one way, press-hit-b the
    // other), so the SAME letter presented a different slug depending on where in the line it
    // fell. That is arbitrariness by construction. The tilt is a function of the character now.
    expect(tiltForChar('A')).toBe(tiltForChar('A'));
    expect(tiltForChar('A')).not.toBe(tiltForChar('B'));
    expect(Math.abs(tiltForChar('A'))).toBeGreaterThanOrEqual(4); // never 0: every letter shows a face
    expect(Math.abs(tiltForChar('Z'))).toBeLessThanOrEqual(8);

    // and it rotates about the head's own contact point, so a tilt can never move the print
    // position off the column the carriage just measured.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS));
    const tilt = container.querySelector('.press-tilt')!.getAttribute('transform')!;
    const [, deg, cx, cy] = tilt.match(/rotate\((-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)!;
    const head = container.querySelector('.press-head')!;
    expect(Number(deg)).toBe(tiltForChar('S')); // first glyph of longTicket
    expect(Number(cx)).toBe(Number(head.getAttribute('x')) + Number(head.getAttribute('width')) / 2);
    expect(Number(cy)).toBe(Number(head.getAttribute('y')));
  });

  it('the fold stage builds three panels', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(4300));
    expect(container.querySelectorAll('.fold-panel')).toHaveLength(3);
    vi.useRealTimers();
  });

  it('gives each folding panel a shading overlay and a contact shadow', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(4300); });
    expect(container.querySelectorAll('.fold-shade').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.fold-contact')).not.toBeNull();
    vi.useRealTimers();
  });

  it('gives the folding panels a paper edge without colliding with the existing crease ::after', () => {
    vi.useFakeTimers();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(4300); });
    // .fold-panel::after already carries the crease highlight (see ceremony.css). The paper-edge
    // hairline must be a real element rather than a second ::after rule on .fold-p0/.fold-p2 -- two
    // same-specificity rules on one pseudo-element collide, and the later one silently drops the
    // earlier rule's `background`, which would erase the crease highlight this task must not touch.
    expect(container.querySelectorAll('.fold-edge').length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('does not let a second rule collide with .fold-panel::after, and lights both folding panels bright at their crease', () => {
    const css = readCeremonyCss();

    // Only one rule may declare a `background` on .fold-panel/.fold-p0/.fold-p2's ::after. A
    // second one at equal specificity would silently overwrite the crease highlight's gradient.
    const afterBackgroundRules = css.match(/\.fold-(?:panel|p0|p2)::after\s*\{[^}]*background/g) ?? [];
    expect(afterBackgroundRules.length).toBe(1);

    // .fold-shade's gradient is bright at its own local top, dark at its own local bottom.
    // .fold-p2's crease is at ITS top (transform-origin 50% 0%), so it must stay unflipped to be
    // bright at the crease. .fold-p0's crease is at ITS bottom (transform-origin 50% 100%), the
    // opposite corner, so .fold-p0 is the one that needs the vertical flip -- flipping .fold-p2
    // instead (an easy first-pass mistake) would leave both panels bright at the free edge and
    // dark at the crease.
    expect(css).toMatch(/\.fold-p0 \.fold-shade\s*\{\s*transform:\s*scaleY\(-1\)/);
    expect(css).not.toMatch(/\.fold-p2 \.fold-shade\s*\{\s*transform:\s*scaleY\(-1\)/);
  });

  it('the arm actually restrikes: data-strike flips on every single glyph, not every third one', () => {
    // REWRITTEN, and strengthened. The header used to read "STRIKE_EVERY(3) * TYPE_CHAR_MS(48) =
    // 144ms per flip", which encoded the defect: at one strike per three characters, two of every
    // three glyphs appeared with no strike at all. That is the single largest reason the machine
    // read as random. The period is one beat now, so the assertion is no longer "it flips more
    // than twice" but "it flips EVERY time" -- a strike that skips a glyph fails here.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    act(() => vi.advanceTimersByTime(TYPE_START_MS));

    // Sample data-strike after every character tick, AND GO ALL THE WAY TO THE END. This used to
    // stop at 60 of the fixture's 66 beats, six short -- which is exactly why it never saw that
    // the LAST glyph of every ticket printed with no strike at all. The typing flag is sampled
    // beside it now, because the strike rules in ceremony.css are gated on it
    // (`.ceremony[data-typing='yes'] .press-arm[data-strike='0']`): a flip that happens while
    // data-typing is 'no' matches nothing and animates nothing.
    const total = beatsFor(longTicket); // 66 glyphs; the two newlines cost no beat
    const samples: string[] = [];
    const typingAt: string[] = [];
    for (let i = 0; i < total; i++) {
      act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
      samples.push(arm.getAttribute('data-strike')!);
      typingAt.push(container.querySelector('[data-typing]')!.getAttribute('data-typing')!);
    }
    expect(inked(container)).toEqual(longTicket.lines); // every glyph really was printed

    const seen = new Set(samples);
    expect(seen.has('0')).toBe(true);
    expect(seen.has('1')).toBe(true);

    const flips = samples.slice(1).filter((value, i) => value !== samples[i]).length;
    expect(flips).toBe(samples.length - 1); // one restart per glyph, no exceptions
    // and every one of those beats is a beat the strike rule actually matches on
    expect(new Set(typingAt)).toEqual(new Set(['yes']));
  });

  it('strikes the LAST glyph before anything fades, and only then lets the arm go', () => {
    // THE DEFECT THIS PINS, and nothing anywhere asserted data-typing before. `typing` was
    // `stage === 'print' && typedCount < fullText.length`, which goes false on the SAME render
    // that prints the final character. Rendered in Chrome at that beat: data-typing="no",
    // .press-arm computed opacity 0 (mid-fade), no .tl-strike element at all, and the carriage's
    // transform-origin identical to the previous beat's -- so the most-watched glyph of the
    // stage materialised out of nowhere under a motionless, dissolving hammer parked one
    // character to its left. The flag is stage-gated with a one-beat grace now.
    stubLayout();
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const root = container.querySelector('[data-stage]')!;
    const arm = container.querySelector('.press-arm')!;
    const total = beatsFor(longTicket);

    act(() => vi.advanceTimersByTime(TYPE_START_MS));
    for (let i = 0; i < total - 1; i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    const penultimate = { strike: arm.getAttribute('data-strike'), dx: carrier(container).dx };
    expect(inked(container)[2]).toBe('ACCOUNT REF 55210-T');

    // the beat that prints the final character
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)).toEqual(longTicket.lines);
    expect(root.getAttribute('data-typing')).toBe('yes'); // the arm is still lit
    expect(arm.getAttribute('data-strike')).not.toBe(penultimate.strike); // and it restrikes
    const struck = container.querySelector('.tl-strike');
    expect(struck).not.toBeNull(); // the glyph is still wrapped, so it can be measured
    expect(struck!.textContent).toBe('Q');
    // and the carriage got all the way to it, instead of freezing one cell behind
    expect(carrier(container).dx - penultimate.dx).toBeCloseTo(FAKE_PITCH, 2);

    // ONE BEAT LATER -- not before -- the machine lets go
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(root.getAttribute('data-typing')).toBe('no');
    expect(container.querySelector('.tl-strike')).toBeNull();
    expect(inked(container)).toEqual(longTicket.lines); // nothing was un-printed by the release

    // the grace is bounded by the stage, not just by the text: once the ticket is folding there
    // is no page to strike whatever the typing clock says.
    const elapsed = TYPE_START_MS + (total + 1) * TYPE_CHAR_MS;
    act(() => vi.advanceTimersByTime(STAGE_MS[0][1] - elapsed + 1));
    expect(root.getAttribute('data-stage')).toBe('fold');
    expect(root.getAttribute('data-typing')).toBe('no');
  });

  it('gates only the STRIKE on data-typing, never the arm itself', () => {
    // The visibility and the strike used to hang off the same flag, which is why the flag going
    // false one beat early took the arm, the swing and the carriage with it in one go -- and why
    // the arm was a lit stick for the whole pre-roll. The strike still needs the gate (a swing
    // at a page with nothing on it is a swing at nothing); the arm does not.
    const rules = readCeremonyRules();
    expect(rules).toMatch(/\.ceremony\[data-typing='yes'\] \.press-arm\[data-strike='0'\]/);
    expect(rules).toMatch(/\.ceremony\[data-typing='yes'\] \.press-arm\[data-strike='1'\]/);
    expect(rules).not.toMatch(/\.ceremony\[data-typing='yes'\] \.press-arm \{/);
  });

  it('rolls the sheet clear of the machine and leaves it exactly where the fold expects it', () => {
    // INVARIANT 4, AND THE HANDOFF. .fold is inset:0 over the scene and its panels are thirds of
    // it, so the fold stage draws the page at its LAID-OUT position -- translateY(0). The sheet
    // spends the whole print stage displaced downward (that displacement is what puts each line
    // on the nip), so something has to put it back, and that something is the eject: one roll of
    // the platen the instant the last character is struck. If it did not happen, the page would
    // jump by a whole feed at 4200ms as the fold took over.
    stubLayout();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const root = container.querySelector('[data-stage]')!;
    const sheet = container.querySelector('.ticket-wrap .ticket') as HTMLElement;

    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS));
    expect(root.getAttribute('data-print')).toBe('type');
    expect(sheetFeed(container)).toBeGreaterThan(0); // down inside the press, line 0 at the nip

    // Type it out ONE BEAT PER act(), because that is what a browser does. Advancing the whole
    // run inside a single act() lets React batch every tick into one render, so the sheet never
    // visits the intermediate lines at all -- which is a fair model of a dropped frame but not
    // of normal playback, and it is not what is being tested here.
    for (let i = 1; i < beatsFor(ticket); i++) act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)).toEqual(ticket.lines);
    const lastLine = sheetFeed(container);
    expect(lastLine).toBeCloseTo(NIP_Y - dropFor(ticket.lines.length - 1), 5);

    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS)); // the grace beat: the platen lets go
    expect(root.getAttribute('data-print')).toBe('eject');
    expect(sheetFeed(container)).toBe(0);
    // ...starting from exactly where the sheet was on the previous painted frame, so the
    // roll-out has no jump in it. Both come off the same `feed` state, so --sheet-from is the
    // previous --sheet by construction, however the beats happen to batch.
    expect(Number(sheet.style.getPropertyValue('--sheet-from').replace('px', ''))).toBeCloseTo(lastLine, 5);

    // on to the fold boundary: TYPE_START_MS plus one beat per glyph plus the grace beat is
    // where we are now, so run out the rest of the 4200ms print stage and one tick over.
    const elapsed = TYPE_START_MS + (beatsFor(ticket) + 1) * TYPE_CHAR_MS;
    act(() => vi.advanceTimersByTime(STAGE_MS[0][1] - elapsed + 1));
    expect(root.getAttribute('data-stage')).toBe('fold');
    expect(root.getAttribute('data-print')).toBe('clear');
    expect(sheetFeed(container)).toBe(0); // still home when the fold panels take over

    // and the press goes with it: the machine cannot still be lying over the bottom third of
    // the page when the seal presses into it.
    const rules = readCeremonyRules();
    expect(rules).toMatch(/\[data-print='eject'\] \.press,\s*\.ceremony\[data-print='clear'\] \.press \{ animation: press-withdraw/);
    const withdraw = keyframes(readCeremonyCss(), 'press-withdraw');
    const drop = Number(withdraw.match(/100%\s*\{[^}]*translateY\(([\d.]+)px\)/)![1]);
    const sheetH = Number(readCeremonyCss().match(/\.ticket-wrap \.ticket \{[^}]*min-height:\s*(\d+)px/)![1]);
    expect(NIP_Y + drop).toBeGreaterThan(sheetH); // the nip ends up below the page entirely
  });

  it('stamps the seal AFTER the final character, on the longest ticket as well as the shortest', () => {
    // INVARIANT 6, and it was measured wrong before: the seal carried a hardcoded 3.72s delay,
    // tuned against a two-line trade, while a full three-line option ticket types until ~3720ms.
    // On those the wax pressed onto the page before its own last glyph. Both the eject and the
    // seal hang off printDone now, so the ordering is structural rather than arithmetic.
    for (const fixture of [ticket, longTicket]) {
      const { container, unmount } = render(<TradeCeremony ticket={fixture} onDone={vi.fn()} />);
      const root = container.querySelector('[data-stage]')!;
      // one beat short of the end: the last character is not down yet
      act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS * beatsFor(fixture)));
      expect(inked(container)).toEqual(fixture.lines);
      expect(root.getAttribute('data-print')).not.toBe('clear');

      act(() => vi.advanceTimersByTime(TYPE_CHAR_MS)); // the grace beat releases the sheet
      expect(root.getAttribute('data-print')).toBe('eject');
      act(() => vi.advanceTimersByTime(SEAL_FLOOR_MS)); // ...and well past any floor
      expect(root.getAttribute('data-print')).toBe('clear');
      unmount();
    }

    // the wax is bound to that state, not to a stopwatch
    const rules = readCeremonyRules();
    expect(rules).toMatch(/\.ceremony\[data-print='clear'\] \.ticket-seal \{ animation: seal-stamp/);
    expect(rules).not.toMatch(/\[data-stage='print'\] \.ticket-seal/);
    // and the eject is never instant: the platen has to be seen to turn
    expect(EJECT_MS).toBeGreaterThan(100);
  });

  // REWRITTEN from 'draws an envelope with four distinct flaps'. That test asserted the
  // rejected structure: four SVG <path class="env-flap"> siblings, one of them (.env-flap-top)
  // the hinged flap. It passed while the ceremony was broken, because the defect was that the
  // hinged flap was an SVG <g> mirrored ABOVE y=0 inside viewBox="0 0 290 170" -- SVG's default
  // overflow:hidden clipped it, so the OPEN flap was never painted at all. Counting SVG paths
  // could never have caught that. The assertions below are the same count of checks, aimed at
  // the structure that actually makes the fold work.
  it('builds the envelope as an HTML flap over a two-layer SVG body that can swallow the letter', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);

    // 1. The flap is an HTML element, not SVG. This is the whole fix for the clipping bug.
    const flap = container.querySelector('.env-flap')!;
    expect(flap).not.toBeNull();
    expect(flap.namespaceURI).toBe('http://www.w3.org/1999/xhtml');

    // 2. Two faces, so there is something to see from both sides of the rotation.
    expect(container.querySelectorAll('.env-flap-face')).toHaveLength(2);
    expect(container.querySelector('.env-flap-in')).not.toBeNull();
    expect(container.querySelector('.env-flap-out')).not.toBeNull();

    // 3. The body is TWO layers, back and front, so the letter can be sandwiched between them.
    //    One SVG could not do it: the letter is a DOM element that lives outside the drawing.
    expect(container.querySelector('.env-back')).not.toBeNull();
    expect(container.querySelector('.env-front')).not.toBeNull();

    // 4. The pocket occluder is painted BEFORE the decorative glued flaps, so occlusion cannot
    //    leak through a seam between them.
    const front = container.querySelector('.env-front')!;
    const painted = Array.from(front.querySelectorAll('.env-pocket, .env-glue'));
    expect(painted.length).toBeGreaterThan(1);
    expect(painted[0].classList.contains('env-pocket')).toBe(true);

    // 5. The travelling cast shadow, without which a rotateX reads as a vertical squash.
    expect(container.querySelector('.env-flap-shadow')).not.toBeNull();
  });

  it('fits the folded packet to the pocket interior exactly', () => {
    // The arithmetic that killed the previous two rounds. The packet is one third of the
    // ticket, because .fold is inset:0 over a scene whose height IS the ticket's; the pocket
    // interior is throat..floor. If those two numbers disagree the letter cannot go in, and
    // nothing in the rendered DOM makes the mismatch visible until you scrub the animation.
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const css = readCeremonyCss();

    const minHeight = css.match(/\.ticket-wrap \.ticket\s*\{[^}]*min-height:\s*(\d+)px/);
    expect(minHeight).not.toBeNull();
    const packet = Number(minHeight![1]) / 3;

    // read the throat and the floor off the real path the component ships
    const d = container.querySelector('.env-pocket')!.getAttribute('d')!;
    const throat = Number(d.match(/^M0 (\d+)/)![1]);
    const floor = Number(d.match(/V(\d+)/)![1]);

    expect(throat).toBe(62);
    expect(floor).toBe(158);
    expect(packet).toBe(floor - throat);

    // and it must be scoped so the settle ceremony's .settle-ticket keeps its own height
    expect(css).not.toMatch(/^\.ticket\s*\{[^}]*min-height/m);
  });

  it('opens the flap 3D context ABOVE the paper that turns, so the faces accumulate the rotation', () => {
    // THE SEALED ENVELOPE WAS SHADED BACKWARDS FOR THE WHOLE SHIP STAGE, and the cause was one
    // tier of DOM. `perspective` does not make a 3D rendering context; `transform-style:
    // preserve-3d` does. .envelope-stack was flat, so .env-flap's preserve-3d STARTED a context
    // rather than extending one -- which made the flap that context's ROOT, and a root's own
    // transform is not part of what its descendants accumulate. Both faces were evaluated in a
    // frame that never turned: the inner face was front-facing forever, the outer face
    // back-facing forever. Measured in headless Chrome with a tint pass: the outer face painted
    // 0px at EVERY frame from t=0 to t=1100, and at the sealed pose the flap showed the inner
    // face upside down -- rgb(202,187,146) at the hinge against rgb(228,217,190) for the pocket
    // beneath it, i.e. a dark band across the top of the final held image.
    // The rotation now lives one tier down, inside the context, exactly as .fold > .fold-panel
    // > .fold-face has always had it. After the fix the same pass reads inner 7693 / outer 0
    // while open and inner 0 / outer 7686 once sealed, and the hinge is rgb(242,235,217).
    const css = readCeremonyCss();
    const rules = readCeremonyRules();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);

    // WHICH ELEMENT ROTATES IS READ OFF THE STYLESHEET, not assumed here: whatever rule applies
    // env-flap-close names it, and the assertions below follow that element wherever it moves.
    const closeRule = rules.match(/([^{}\n]*\.env-flap[\w-]*)\s*\{[^}]*animation:[^;]*env-flap-close/)!;
    expect(closeRule).not.toBeNull();
    const turning = closeRule[1].trim().split(/\s+/).pop()!; // e.g. '.env-flap-panel'
    const paperEl = container.querySelector(turning)!;
    expect(paperEl).not.toBeNull();

    // 1. THE THING THAT TURNS MUST NOT BE THE ROOT OF ITS OWN CONTEXT. Its parent has to be the
    //    element that declares preserve-3d, or the rotation is invisible to the faces again.
    const parent = paperEl.parentElement!;
    const opensContext = Array.from(parent.classList).some((c) =>
      new RegExp(`\\n\\.${c}\\s*\\{[^}]*transform-style:\\s*preserve-3d`).test(css),
    );
    // spelled out rather than a bare boolean so a failure names the element that was found
    // sitting at the root of its own context
    const parentDesc = `.${Array.from(parent.classList).join('.')}`;
    expect(`${turning} inside ${parentDesc}: preserve-3d=${opensContext}`)
      .toBe(`${turning} inside ${parentDesc}: preserve-3d=true`);
    // and the paper itself keeps preserve-3d, so the two faces extend that same context
    const paper = css.match(new RegExp(`\\n\\${turning}\\s*\\{([^}]*)\\}`))![1];
    expect(paper).toMatch(/transform-style:\s*preserve-3d/);

    // 2. BOTH FACES HANG OFF THE PAPER, not off the mount: a face outside the rotating element
    //    accumulates nothing no matter how the context is arranged.
    const faces = Array.from(container.querySelectorAll('.env-flap-face'));
    expect(faces).toHaveLength(2);
    for (const f of faces) expect(f.parentElement).toBe(paperEl);

    // 3. THE MOUNT OPENS THE CONTEXT BUT IS NOT THE CAMERA. Every tier from the paper up to the
    //    first FLAT ancestor is preserve-3d, so the paper is not flattened until .envelope-stack
    //    -- which is where the perspective must therefore live, and where it has always lived.
    //    Deleting it from there on the theory that it reached nothing that rotates moved 20029
    //    fold-stage pixels in headless Chrome (.fold is preserve-3d too and is projected by the
    //    same camera); adding a SECOND perspective on the mount would compose with it and change
    //    the projection the flap has always had.
    const mount = css.match(/\n\.env-flap\s*\{([^}]*)\}/)![1];
    expect(mount).toMatch(/transform-style:\s*preserve-3d/);
    expect(mount).not.toMatch(/perspective/);
    const stack = css.match(/\.envelope-stack\s*\{([^}]*)\}/)![1];
    expect(stack).toMatch(/perspective:\s*\d+px/);
    expect(stack).toMatch(/perspective-origin:\s*50% 140px/); // scene 140 = flap top 88 + height 52 = the hinge
    expect(stack).not.toMatch(/transform-style:\s*preserve-3d/); // flat, so .fold and .env-flap each own a context

    // 4. NO GROUPING PROPERTY ANYWHERE ON THE CHAIN. filter (and friends) flatten a 3D subtree,
    //    which is what destroyed the rotation even where the perspective was right.
    expect(stack).not.toMatch(/filter/);
    expect(mount).not.toMatch(/filter/);
    expect(paper).not.toMatch(/filter/);
  });

  it('puts the LIT face outside and the shaded face inside, and cuts them as mirror images', () => {
    // Which gradient goes on which face was untested, and swapping the two left all 229 tests
    // green -- while making the sealed envelope's lid the gummed inside of the paper, shaded
    // dark exactly where the outside should be catching the light. (That is also the pose the
    // ceremony HOLDS: the flap is shut from ~690ms of the envelope stage until the packet ships,
    // and it is the last thing the eye is on.) The rule is physical, so it can be asserted as
    // one: .env-flap-out is the face turned to the room, .env-flap-in is the one that goes down
    // onto the pocket, and paper facing a light source is lighter at every point than paper
    // facing away from it.
    const css = readCeremonyCss();
    const stops = (cls: string) => {
      const rule = css.match(new RegExp(`\\n\\.${cls}\\s*\\{([^}]*)\\}`))![1];
      const grad = rule.match(/background:\s*linear-gradient\(([^)]*)\)/)![1];
      return Array.from(grad.matchAll(/#([0-9A-Fa-f]{6})\s+([\d.]+)%/g)).map((m) => ({
        lum: parseInt(m[1].slice(0, 2), 16) + parseInt(m[1].slice(2, 4), 16) + parseInt(m[1].slice(4, 6), 16),
        at: Number(m[2]),
      }));
    };
    const outer = stops('env-flap-out');
    const inner = stops('env-flap-in');
    expect(outer).toHaveLength(3);
    expect(inner).toHaveLength(3);
    // The two gradients do not share stop POSITIONS (58% against 62%), so comparing them
    // stop-by-stop would compare different points on the paper. Interpolate instead and compare
    // the same y on both faces.
    const lumAt = (g: typeof outer, y: number) => {
      const hi = g.findIndex((s) => s.at >= y);
      if (hi <= 0) return g[0].lum;
      const a = g[hi - 1];
      const b = g[hi];
      return a.lum + ((b.lum - a.lum) * (y - a.at)) / (b.at - a.at);
    };
    for (const y of [0, 10, 25, 40, 50, 58, 62, 75, 90, 100]) {
      const o = Math.round(lumAt(outer, y));
      const i = Math.round(lumAt(inner, y));
      expect(`at ${y}%: outer ${o} vs inner ${i} -> outer lighter? ${o > i}`)
        .toBe(`at ${y}%: outer ${o} vs inner ${i} -> outer lighter? true`);
    }

    // and the two clips are mirror images about the horizontal: the outer face is rotated 180deg
    // about X, so a triangle drawn apex-up on it has to be authored apex-DOWN or the paper has
    // two different silhouettes depending on which side of it you are looking at.
    const clip = (cls: string) =>
      css.match(new RegExp(`\\n\\.${cls}\\s*\\{[^}]*[^-]clip-path:\\s*polygon\\(([^)]*)\\)`))![1]
        .split(',').map((p) => p.trim().split(/\s+/).map((v) => Number(v.replace('%', ''))));
    const mirror = clip('env-flap-in').map(([x, y]) => `${x} ${100 - y}`).sort();
    expect(clip('env-flap-out').map(([x, y]) => `${x} ${y}`).sort()).toEqual(mirror);
  });

  it("rests the flap in the OPEN pose and closes it away from the viewer", () => {
    // Rest must be rotateX(0deg) = open. Open costing no transform is what lets the ship stage
    // hold the closed pose by carrying the same animation rule through, instead of pinning a
    // second transform on .env-flap-hinge the way the old build did.
    const css = readCeremonyCss();
    const flap = css.match(/\n\.env-flap-panel\s*\{([^}]*)\}/)![1];
    expect(flap).toMatch(/transform:\s*rotateX\(0deg\)/);
    expect(flap).toMatch(/transform-origin:\s*50% 100%/);

    // and the close runs 0deg -> -180deg (with an overshoot), not the old 180deg -> 0deg
    const close = css.match(/@keyframes env-flap-close\s*\{([^@]*?)\n\}/s)![1];
    expect(close).toMatch(/0%\s*\{[^}]*rotateX\(0deg\)/);
    expect(close).toMatch(/100%\s*\{[^}]*rotateX\(-180deg\)/);
    expect(close).toMatch(/rotateX\(-187deg\)/);

    // the ship-stage pin is gone: there is nothing left to pin a closed flap to
    expect(css).not.toMatch(/env-flap-hinge/);
  });

  it('holds the open flap clear of the letter for every frame of the arrival, and never behind it', () => {
    // REWRITTEN, and it now asserts the opposite of what it used to. The old test pinned
    // `duck < fold` -- the flap ducked BELOW the letter while open -- and that assertion was
    // the defect. Rendered in headless Chrome at t=170 the top painter at the flap's own apex
    // was .fold-p0: the mouth pose put the packet at scene 60..156, a band that strictly
    // CONTAINS the flap's 88..140, so ducking the lid buried it under an opaque 290x96 letter.
    // The envelope had no lid at all until ~310ms into an 1100ms stage. A test that pins the
    // cause of a defect is worse than no test, so this one pins the fix instead: the letter and
    // the lid never occupy the same band, at any frame, and no rule may put the lid behind.
    const css = readCeremonyCss();

    const flapRule = css.match(/\n\.env-flap\s*\{([^}]*)\}/)![1];
    const apex = Number(flapRule.match(/top:\s*(\d+)px/)![1]); // scene 88: the open flap's tip
    // the packet is the middle third of the ticket, so scene [h, 2h] with h = min-height / 3
    const sceneH = Number(css.match(/\.ticket-wrap \.ticket\s*\{[^}]*min-height:\s*(\d+)px/)![1]);
    const packetBottom = (sceneH / 3) * 2;

    const kf = (name: string) => keyframes(css, name);
    const steps = (body: string) =>
      Array.from(body.matchAll(/([\d.]+)%\s*\{([^}]*)/g)).map((m) => ({ pct: Number(m[1]), body: m[2] }));
    // duration AND delay, in ms. Both matter now: the two animations start at different instants
    // and neither of them starts when the envelope stage does, so a percentage on its own says
    // nothing about when a keyframe actually happens.
    const clock = (name: string) => {
      const m = css.match(new RegExp(`animation:[^;]*\\b${name} ([\\d.]+)s ([\\d.]+)s`))!;
      return { dur: Number(m[1]) * 1000, delay: Number(m[2]) * 1000 };
    };
    const at = (name: string, pct: number) => {
      const c = clock(name);
      return c.delay + (pct / 100) * c.dur;
    };
    const yOf = (body: string) => Number(body.match(/translateY\((-?[\d.]+)px?\)/)![1]);
    const ease = (body: string) => body.match(/animation-timing-function:\s*([^;]+);/)![1].trim();

    const arrive = steps(kf('env-arrive'));
    const insert = steps(kf('packet-insert'));
    /* The arrival's start is VIEWPORT-RELATIVE, so it has no px value until you name a
     *  screen. It used to be a flat 420px, measured against the 667 below — and being
     *  off-frame costs about H/2 + 62, so on every phone taller than ~716 the envelope
     *  started ON SCREEN: a strip of it appeared out of nothing at the print-to-fold seam
     *  and sat motionless for 1150ms. Checked at three heights now, not one. */
    const startAt = (H: number) => {
      const m = arrive[0].body.match(/translateY\(calc\(([\d.]+)vh\s*\+\s*([\d.]+)px\)\)/);
      expect(m, 'the arrival has to start off-frame at ANY height, so its start must be in vh').not.toBeNull();
      return (Number(m![1]) / 100) * H + Number(m![2]);
    };
    const meetStep = arrive.slice(1).find((s) => yOf(s.body) > 0)!;           // the hand-over
    const meet = yOf(meetStep.body);
    const homeStep = arrive.slice(1).find((s) => /translateY\(0\)/.test(s.body))!;
    const hoverStep = insert.find((s) => /translateY\(-[\d.]+px\)/.test(s.body))!;
    const hover = yOf(hoverStep.body);

    // 1. THE ARRIVAL STARTS OFF-FRAME, body and shadow both. Not at opacity 0 (an envelope that
    //    fades up out of nothing) and not at a partial offset that leaves it fully on screen at
    //    the first frame (measured: 44296 px, 17.7% of the screen, changing at one stage
    //    boundary, and 54841 on the frame after it). The viewport height is the one number here
    //    that is not in the stylesheet: 375x667 is the target device, and headless Chrome puts
    //    the 288-tall scene's top edge at 189.5 in it, which is (667-288)/2.
    const artTop = Number(css.match(/\n\.env-art\s*\{[^}]*top:\s*(\d+)px/)![1]);
    // and the drop-shadow travels with it: a 28px blur offset 14px down reaches 14px ABOVE the
    // element's own top edge, so the start has to clear the picture by that much as well.
    const shadow = css.match(/\n\.env-back\s*\{[^}]*drop-shadow\(0 (\d+)px (\d+)px/)!;
    // 667 is the old target device; 852 and 932 are the phones this actually shipped to.
    for (const VIEWPORT_H of [667, 852, 932]) {
      const bottomOfPicture = VIEWPORT_H - (VIEWPORT_H - sceneH) / 2; // in scene coordinates
      const start = startAt(VIEWPORT_H);
      expect(artTop + start, `envelope must start off-frame at ${VIEWPORT_H}px tall`).toBeGreaterThanOrEqual(bottomOfPicture);
      expect(
        artTop + start + Number(shadow[1]) - Number(shadow[2]),
        `its shadow must start off-frame too at ${VIEWPORT_H}px tall`,
      ).toBeGreaterThanOrEqual(bottomOfPicture);
      // 2. THE RUN-UP CANNOT REACH THE LETTER, at any of them.
      expect(apex + start - packetBottom, `run-up clears the letter at ${VIEWPORT_H}px tall`).toBeGreaterThan(0);
    }

    // 2. THE RUN-UP CANNOT REACH THE LETTER. The letter does not move at all until the envelope
    //    has come up to `meet`, so this whole segment is one object moving under one monotone
    //    (linear) easing and the two endpoints settle it: the flap's apex ends 2px below the
    //    letter's bottom edge.
    expect(ease(arrive[0].body)).toBe('linear');
    expect(apex + meet - packetBottom).toBeGreaterThan(0);
    expect(at('packet-insert', 0)).toBeCloseTo(at('env-arrive', meetStep.pct), 0);

    // 3. THE HOVER POSE CLEARS THE APEX, not the throat. Clearing the throat is what the old
    //    -36px did, and the throat is 70px below the apex -- which is exactly how the letter
    //    came to be sitting on top of the whole lid.
    expect(packetBottom + hover).toBeLessThanOrEqual(apex);

    // 4. AND THE COUPLED SEGMENT CLEARS IT AT EVERY FRAME, not just at the ends. The envelope
    //    covers its last `meet` px while the letter lifts by `-hover`; the gap
    //      apex + meet*(1-p) - (packetBottom + hover*p)
    //    is independent of p only when meet === -hover, so assert that identity rather than
    //    sampling a few p and hoping. With it, no easing and no frame rate can produce an
    //    overlap. (Measured in headless Chrome: exactly 2.00px at fold 1580/1600/1620/1650/
    //    1680/1700/1720/1740.)
    expect(meet).toBe(-hover);
    // 5. the two segments have to START AND END AT THE SAME INSTANTS and share the same easing,
    //    or the identity above holds only at the endpoints and sags in between. Absolute ms, not
    //    percentages: the two animations have different durations AND different delays.
    expect(at('env-arrive', homeStep.pct)).toBeCloseTo(at('packet-insert', hoverStep.pct), 0);
    expect(ease(meetStep.body)).toBe(ease(insert[0].body));

    // 6. THE HOLD IS REAL AND IT IS LONG ENOUGH TO SEE. The letter hangs above an open flap: two
    //    consecutive packet-insert steps at the SAME translateY, at least 120ms apart. Without
    //    this the hover pose could be a corner the letter turns rather than a beat it holds --
    //    and nothing else in this file would notice (the shipped 50.8% step could be moved to
    //    30.0%, cutting the hold from 130ms to 40ms, with all 229 tests still passing).
    const heldFrom = insert.indexOf(hoverStep);
    const nextStep = insert[heldFrom + 1];
    expect(yOf(nextStep.body)).toBe(hover); // still at the hover pose
    const holdMs = at('packet-insert', nextStep.pct) - at('packet-insert', hoverStep.pct);
    expect(holdMs).toBeGreaterThanOrEqual(120);

    // 7. EVERY ONE OF THESE ANIMATIONS IS DECLARED FOR THE FOLD STAGE TOO. An animation starts
    //    when its element first matches, so this is what lets the arrival begin before the
    //    envelope stage does -- and every delay above is on that one clock. Drop the fold
    //    selector and env-arrive's 1150ms delay would land almost the whole arrival past the end
    //    of the 1100ms stage it is supposed to open.
    for (const name of ['env-arrive', 'packet-insert', 'env-flap-close', 'mouth-shut',
                        'flap-shadow-sweep', 'seal-stamp-env']) {
      const rule = readCeremonyRules().match(new RegExp(`([^{}]*)\\{[^}]*animation:[^;]*\\b${name} `))!;
      expect(`${name}: ${/\[data-stage='fold'\]/.test(rule[1])}`).toBe(`${name}: true`);
    }

    // 8. the envelope is never painted without its lid: the flap shares the arrival, and the
    //    arrival no longer opens at opacity 0 (which left t=0 with no envelope in it at all).
    expect(arrive[0].body).toMatch(/opacity:\s*1/);
    // Both halves of the flap must survive the stage change into 'ship' -- the mount carries the
    // arrival, the paper inside it carries the close, and each has to be re-declared for 'ship'
    // with an identical value or the animation restarts and the pose is lost.
    const shipFlap = css.match(/\.ceremony\[data-stage='ship'\] \.env-flap \{([^}]*)\}/s)![1];
    expect(shipFlap).toMatch(/env-arrive/);
    const shipPaper = css.match(/\.ceremony\[data-stage='ship'\] \.env-flap-panel \{([^}]*)\}/s)![1];
    expect(shipPaper).toMatch(/env-flap-close/);

    // 5. NO Z-ORDER RULE MAY PUT THE LID BEHIND THE LETTER, at any frame. The duck is gone
    //    outright, and every z-index the flap can take stays above .fold's.
    expect(readCeremonyRules()).not.toMatch(/env-flap-duck/);
    const fold = Number(css.match(/\n\.fold\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const front = Number(css.match(/\n\.env-front\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const base = Number(flapRule.match(/z-index:\s*(\d+)/)![1]);
    expect(base).toBeGreaterThan(fold); // never behind the letter
    expect(base).toBeGreaterThan(front); // still over the pocket while shutting
    for (const name of ['env-arrive', 'env-flap-close']) {
      for (const m of kf(name).matchAll(/z-index:\s*(\d+)/g)) {
        expect(Number(m[1])).toBeGreaterThan(fold);
      }
    }
  });

  it('folds the panels in FRONT of the middle one, and turns a blank back to the viewer', () => {
    // The tri-fold never closed over anything. @keyframes fold-up ended
    // `rotateX(-180deg) translateZ(1px)` and fold-down `rotateX(180deg) translateZ(2px)`, but a
    // transform list applies as R.T, so the translateZ is spent in the ROTATED frame and a local
    // +Z lands at global -Z. Measured in Chrome: .fold-p0 z=-2, .fold-p2 z=-1, .fold-p1 z=0 --
    // both folded panels BEHIND the untransformed middle one, which therefore painted in front
    // and posted a sheet of readable ticket text with a crease slicing a line of type.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(4300)); // into the fold stage, so the panels exist

    // where a keyframe's end pose actually puts the panel: cos(180deg) is -1, so a positive
    // translateZ after a half turn is a NEGATIVE global depth.
    function endDepth(name: string): number {
      const end = keyframes(css, name).match(/100%\s*\{([^}]*)/)![1];
      const deg = Number(end.match(/rotateX\((-?[\d.]+)deg\)/)![1]);
      const z = Number(end.match(/translateZ\((-?[\d.]+)px\)/)![1]);
      return z * Math.cos((deg * Math.PI) / 180);
    }
    const p2 = endDepth('fold-up'); // the bottom panel, folded up first
    const p0 = endDepth('fold-down'); // the top panel, folded down over it
    expect(p2).toBeGreaterThan(0); // in front of the middle panel, which never moves off 0
    expect(p0).toBeGreaterThan(p2); // and the last panel to fold is the outermost one

    // the contact shadow lies ON the middle panel, so it has to be in front of that panel's own
    // face and behind the panel casting it -- at depth 0 it fell behind the face and vanished.
    const faceZ = Number(css.match(/\.fold-face-front\s*\{[^}]*translateZ\((-?[\d.]*\.?\d+)px\)/)![1]);
    const contact = Number(keyframes(css, 'contact-drop').match(/translateZ\((-?[\d.]+)px\)/)![1]);
    expect(contact).toBeGreaterThan(faceZ);
    expect(contact).toBeLessThan(p2);

    // CORRECTING THE SIGN IS NOT ENOUGH ON ITS OWN -- it renders the printed face seen from
    // behind, i.e. mirrored, upside-down type. Each folding panel needs a real, blank back.
    const backs = container.querySelectorAll('.fold-face-back');
    expect(backs).toHaveLength(2); // p0 and p2; p1 never turns over
    for (const back of backs) {
      expect(back.textContent).toBe(''); // no type on the reverse of a folded letter
      expect(back.querySelector('.fold-inner')).toBeNull();
      expect(back.querySelector('.fold-back-shade')).not.toBeNull(); // blank, but not featureless
    }

    // and the back face's own flip must seat it BEHIND its front face, or the two are coplanar
    // and which one you see is left entirely to backface-visibility with nothing underneath.
    const backRule = css.match(/\.fold-face-back\s*\{([^}]*)\}/)![1];
    const bDeg = Number(backRule.match(/rotate[XY]\((-?[\d.]+)deg\)/)![1]);
    const bZ = Number(backRule.match(/translateZ\((-?[\d.]*\.?\d+)px\)/)![1]);
    expect(bZ * Math.cos((bDeg * Math.PI) / 180)).toBeLessThan(faceZ);

    // THE FLIP MUST NOT LIVE ON A FLATTENING ANCESTOR. .fold-panel used to carry
    // `overflow: hidden`, which forces transform-style back to flat -- that is why the stated
    // fail-safe (backface-visibility on .fold-inner) never fired once: .fold-inner had no
    // rotation of its own left to have a backface culled. The clip belongs on the faces.
    const panel = css.match(/\n\.fold-panel\s*\{([^}]*)\}/)![1];
    expect(panel).toMatch(/transform-style:\s*preserve-3d/);
    expect(panel).not.toMatch(/overflow/);
    expect(css).toMatch(/\.fold-face\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.fold-face\s*\{[^}]*backface-visibility:\s*hidden/);
  });

  it('lids the mouth at the corners: the front shoulders meet the closed flap edge exactly', () => {
    // The band between the hinge and the throat is the mouth, and the closed flap is a triangle
    // based on the hinge -- so outside its slope the two top corners were lidded by NOTHING and
    // showed the cavity behind. Sampled at t=900 in Chrome: rgb(117,107,82) against rgb(226,216,189)
    // for the pocket 14px below. A >100-level hole at each corner, held through the seal beat and
    // the whole 1100ms ship stage -- the final image of the ceremony.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);

    const flapRule = css.match(/\n\.env-flap\s*\{([^}]*)\}/)![1];
    const hinge = Number(flapRule.match(/top:\s*(\d+)px/)![1]) + Number(flapRule.match(/height:\s*(\d+)px/)![1]);
    const flapH = Number(flapRule.match(/height:\s*(\d+)px/)![1]);
    // the flap and the SVG layers are both inset by the same bleed, so they share an x axis
    const bleed = Number(css.match(/\n\.env-art\s*\{[^}]*left:\s*(-?\d+)px/)![1]);
    expect(Number(flapRule.match(/left:\s*(-?\d+)px/)![1])).toBe(bleed);
    const sceneW = Number(css.match(/\.ceremony-scene\s*\{[^}]*width:\s*(\d+)px/)![1]);
    const boxW = sceneW - bleed * 2; // 300 user units, one per pixel

    // where the closed flap's left edge has got to by the throat: it runs from the hinge to the
    // tip in flapH of drop, covering half the box in x.
    const pocket = container.querySelector('.env-pocket')!.getAttribute('d')!;
    const throat = Number(pocket.match(/^M0 (\d+)/)![1]);
    const hingeY = hinge - Number(css.match(/\n\.env-art\s*\{[^}]*top:\s*(\d+)px/)![1]); // env y 44
    const edgeAtThroat = (boxW / 2) * ((throat - hingeY) / flapH);

    const shoulders = Array.from(container.querySelectorAll('.env-shoulder')).map((s) => s.getAttribute('d')!);
    expect(shoulders).toHaveLength(2); // one at each corner, and they are part of .env-front
    expect(container.querySelector('.env-front .env-shoulder')).not.toBeNull();
    // the left shoulder runs from the hinge down to the throat at exactly the flap's edge, so
    // flap and shoulder meet along their whole length: no gap at any y in the band.
    const [, lx, ly] = shoulders[0].match(/L([\d.]+) ([\d.]+)/)!;
    expect(Number(ly)).toBe(throat);
    expect(Number(lx)).toBeCloseTo(edgeAtThroat, 0);
    expect(shoulders[0]).toMatch(new RegExp(`^M0 ${hingeY}\\b`));
    const [, rx] = shoulders[1].match(/L([\d.]+) ([\d.]+)/)!;
    expect(boxW - Number(rx)).toBeCloseTo(edgeAtThroat, 0); // mirrored

    // and the mouth's own darkness is a shadow cast by an OPENING: it goes when the flap does,
    // or the corners stay dark under paper that is now lying flat on them.
    const shut = css.match(/animation:[^;]*\bmouth-shut ([\d.]+)s ([\d.]+)s/)!;
    const close = css.match(/animation:[^;]*\benv-flap-close ([\d.]+)s ([\d.]+)s/)!;
    expect(shut[1]).toBe(close[1]); // same duration
    expect(shut[2]).toBe(close[2]); // and the same clock as the flap it belongs to
    expect(container.querySelector('.env-cavity')).not.toBeNull();
    expect(container.querySelector('.env-backpanel')).not.toBeNull();

    // AND THE KEYFRAME HAS TO ACTUALLY SHUT THE MOUTH. Everything above is about WHEN, and a
    // grep for the name plus two timing numbers is satisfied by a keyframe that does nothing at
    // all: the shipped body could be replaced with `0%,100% { opacity: 1 }` and all 229 tests
    // still passed, leaving the two dark corner wedges this whole test exists to prevent.
    const shutBody = keyframes(css, 'mouth-shut');
    const shutSteps = Array.from(shutBody.matchAll(/([\d.]+)%[^{]*\{([^}]*)\}/g))
      .map((m) => ({ pct: Number(m[1]), opacity: Number(m[2].match(/opacity:\s*([\d.]+)/)![1]) }));
    expect(shutSteps.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...shutSteps.map((s) => s.pct))).toBe(0);
    expect(Math.max(...shutSteps.map((s) => s.pct))).toBe(100);
    expect(shutSteps.find((s) => s.pct === 0)!.opacity).toBe(1);   // an open mouth is dark
    expect(shutSteps.find((s) => s.pct === 100)!.opacity).toBe(0); // a sealed one is not
  });

  it('puts preserve-3d only on HTML elements, never on SVG', () => {
    // The old .env-flap-hinge was an SVG <g> with transform-style: preserve-3d. SVG has no 3D
    // rendering context: the property does nothing there, and the <g> is clipped by the
    // viewBox besides. Any class that asks for preserve-3d has to land on an HTML element.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(6000)); // through fold + envelope, so every layer exists

    // Comments are stripped first. `[^{}]+` before a `{` swallows everything back to the
    // previous `}` -- including the comment above the rule -- so any prose that happens to
    // name a class near a preserve-3d rule was being read as part of its selector, and the
    // assertion failed on a class the rule does not select. Strip them and the test asserts
    // what it means: the classes that really ask for preserve-3d must land on HTML.
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const classes = new Set<string>();
    for (const rule of selectors.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/transform-style:\s*preserve-3d/.test(rule[2])) continue;
      for (const cls of rule[1].matchAll(/\.([A-Za-z][\w-]*)/g)) classes.add(cls[1]);
    }
    expect(classes.size).toBeGreaterThan(0); // the fold and the flap both need it

    for (const cls of classes) {
      for (const el of container.querySelectorAll(`.${cls}`)) {
        expect(`${cls}:${el.namespaceURI}`).toBe(`${cls}:http://www.w3.org/1999/xhtml`);
      }
    }
  });

  it('animates the letter into the envelope instead of teleporting and cross-fading it', () => {
    // The rejected build set `transform: rotateX(-88deg) scaleY(0.42)` on .fold with
    // `transition: opacity .3s` ONLY. The transform was never interpolated, so the letter
    // snapped into a squash and dissolved while a separate envelope faded up over it -- there
    // was no frame in which the envelope held the letter. The same .fold element must now
    // travel, under a keyframe animation.
    const css = readCeremonyCss();
    expect(css).not.toMatch(/\[data-stage='envelope'\] \.fold\s*\{/);
    expect(css).toMatch(/\[data-stage='envelope'\] \.fold,\s*\.ceremony\[data-stage='ship'\] \.fold \{ animation: packet-insert/);
    // no cross-fade: nothing in the envelope stage may fade the packet out
    expect(css).not.toMatch(/\[data-stage='(?:envelope|ship)'\] \.fold\s*\{[^}]*opacity/);

    // the packet ends below the throat, so the occluder has actually eaten it
    const insert = keyframes(css, 'packet-insert');
    const rest = Number(insert.match(/100%\s*\{[^}]*translateY\((-?[\d.]+)px\)/)![1]);
    // the hover pose, found by value rather than by a hardcoded percentage -- the percentages
    // move whenever the arrival is retimed, and a stale one would silently match nothing.
    const mouth = Math.min(
      ...Array.from(insert.matchAll(/translateY\((-?[\d.]+)px\)/g)).map((m) => Number(m[1])),
    );
    // packet is scene 96..192; throat is scene 158. Resting top = 96 + rest must clear it.
    expect(96 + rest).toBeGreaterThan(158);
    expect(rest - mouth).toBeGreaterThan(90); // a real slide, not a nudge
  });

  it('stamps the seal strictly after the flap has stopped moving', () => {
    // seal-stamp-env used to fire at .6s while env-flap-close ran to .72s: 120ms of the seal
    // pressing into a flap that was still swinging. Both are read on the same clock now (every
    // animation of this group starts at the fold stage), so the comparison is still a straight
    // one -- but the delays run past a second, so `\.\d+s` no longer matches them.
    const css = readCeremonyCss();
    const flapClose = css.match(/animation:[^;]*\benv-flap-close ([\d.]+)s ([\d.]+)s/)!;
    const flapEnd = Number(flapClose[1]) + Number(flapClose[2]);
    const sealStart = Number(css.match(/animation: seal-stamp-env [\d.]+s ([\d.]+)s/)![1]);
    expect(sealStart).toBeGreaterThanOrEqual(flapEnd);
    // and it has to finish inside the stage it belongs to, or it stamps while the envelope is
    // already flying off the top. Stage boundaries in ms, off the exported table.
    const sealDur = Number(css.match(/animation: seal-stamp-env ([\d.]+)s/)![1]);
    const foldMs = STAGE_MS.find(([s]) => s === 'fold')![1];
    const envelopeMs = STAGE_MS.find(([s]) => s === 'envelope')![1];
    expect((sealStart + sealDur) * 1000).toBeLessThanOrEqual(foldMs + envelopeMs);
  });

  it('binds data-strike=0 and data-strike=1 to two different keyframe names', () => {
    const css = readCeremonyCss();

    const strike0 = css.match(/\.press-arm\[data-strike='0'\]\s*\{\s*animation:\s*(\S+)/);
    const strike1 = css.match(/\.press-arm\[data-strike='1'\]\s*\{\s*animation:\s*(\S+)/);

    expect(strike0).not.toBeNull();
    expect(strike1).not.toBeNull();
    // If both rules ever name the same keyframe, the computed animation-name never changes when
    // data-strike toggles, so CSS never restarts the animation: the arm strikes once at mount and
    // freezes in its end pose for the rest of the print stage.
    expect(strike0![1]).not.toBe(strike1![1]);
  });

  it('makes the two strike keyframes byte-identical, so only the name differs', () => {
    // The names must differ (the test above) purely to force the restart. The BODIES must not:
    // the old pair encoded the approach angle, one leaning +9deg and the other -9deg, so the
    // arm's rest pose flipped with the beat parity and the same letter presented a different face
    // depending on where in the line it fell. Angle is a property of the character now
    // (tiltForChar in Press.tsx), and these two are one animation under two names.
    const css = readCeremonyCss();
    const a = css.match(/@keyframes press-hit-a\s*\{([^@]*?)\n\}/)![1];
    const b = css.match(/@keyframes press-hit-b\s*\{([^@]*?)\n\}/)![1];
    expect(a).toBe(b);
  });

  it('returns the bar to an identical rest, and survives being sampled at 60fps', () => {
    const css = readCeremonyCss();
    const body = css.match(/@keyframes press-hit-a\s*\{([^@]*?)\n\}/)![1];

    // 0% and 100% must be the SAME pose. They used to differ from each other AND from the next
    // strike's 0%: press-hit-a held rotate(7deg) translateY(13px) on `both` and press-hit-b began
    // at rotate(-9deg) translateY(16px), a 16-degree teleport seven times a second, with no frame
    // anywhere at which the arm was at rest. That is why the idle pose looked arbitrary.
    const rest = body.match(/0%\s*\{\s*transform:\s*([^;]+);/)![1].trim();
    const end = body.match(/100%\s*\{\s*transform:\s*([^;]+);/)![1].trim();
    expect(end).toBe(rest);
    expect(rest).not.toMatch(/rotate\(0deg\)/); // rest is a swung-back bar, not the contact pose

    // Contact is early, and it is the pose a sampled frame should MISS: at 60fps the frames land
    // near 0%, ~38% and ~76% of a 44ms strike, so what is most likely on screen is the arm at
    // rest below the line. A head parked on top of the character it just printed is worse than
    // the defect this replaces.
    const contact = Number(body.match(/(\d+)%\s*\{[^}]*rotate\(0deg\)/)![1]);
    expect(contact).toBeGreaterThanOrEqual(18);
    expect(contact).toBeLessThanOrEqual(30);

    // and the strike has to be long enough to be caught at all: >= 2.5 frames at 60fps.
    const ms = Number(css.match(/\.press-arm\[data-strike='0'\]\s*\{\s*animation:\s*press-hit-a\s+(\d+)ms/)![1]);
    expect(ms).toBeGreaterThanOrEqual(42);
  });

  it('has no second clock: the blinking caret is gone from the ticket', () => {
    // A 0.5s step-end blink against a ~48ms character beat shares no common divisor with it, so
    // it read as noise laid over the strike; and with the carriage now tracking the column it was
    // a second print-position indicator contradicting the first. The element that remains carries
    // no ink at all and exists only to be measured.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    expect(css).not.toMatch(/caret-blink/);
    expect(container.querySelector('.type-caret')).toBeNull();
    const anchor = css.match(/\.print-column\s*\{([^}]*)\}/)![1];
    expect(anchor).toMatch(/width:\s*0/);
    expect(anchor).not.toMatch(/background/);
    expect(anchor).not.toMatch(/animation/);
  });

  it('draws a machine wider than the paper, and opaque across all of it below the nip', () => {
    // "The typewriter stick still looks fake." A bare tapered shaft behind a card is a stick; a
    // platen with end knobs, a basket, a comb and keys running past both edges of the paper is a
    // machine. The silhouette is the deliverable here, not typehead detail.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const sceneW = Number(css.match(/\.ceremony-scene\s*\{[^}]*width:\s*(\d+)px/)![1]);
    const bleed = PRESS_OVERHANG;

    // both knobs, and both of them project past the card
    const knobs = Array.from(container.querySelectorAll('.press-knob'));
    expect(knobs).toHaveLength(2);
    const edges = knobs.map((k) => {
      const c = k.querySelector('circle')!;
      return [Number(c.getAttribute('cx')) - Number(c.getAttribute('r')) - bleed,
        Number(c.getAttribute('cx')) + Number(c.getAttribute('r')) - bleed];
    });
    expect(Math.min(...edges.map((e) => e[0]))).toBeLessThan(0);
    expect(Math.max(...edges.map((e) => e[1]))).toBeGreaterThan(sceneW);

    // THE BODY IS WHAT REPLACES THE CLIP. The part of the sheet still wrapped round the platen
    // has to be out of sight, and it is hidden by an opaque machine rather than by cutting the
    // paper -- so the body has to span the paper's full width, edge to edge, with no seam a
    // parchment sliver could show through. In scene pixels the paper is 0..sceneW.
    const body = container.querySelector('.press-body rect')!;
    expect(Number(body.getAttribute('x')) - bleed).toBeLessThanOrEqual(0);
    expect(Number(body.getAttribute('x')) + Number(body.getAttribute('width')) - bleed)
      .toBeGreaterThanOrEqual(sceneW);
    // the platen covers the band above the body's top edge, so the two overlap rather than meet
    const platen = container.querySelector('.press-platen rect')!;
    expect(Number(platen.getAttribute('y'))).toBe(0); // its top edge IS the nip
    const platenBottom = Number(platen.getAttribute('height'));
    expect(Number(body.getAttribute('y'))).toBeLessThan(platenBottom);
    expect(Number(platen.getAttribute('x')) - bleed).toBeLessThanOrEqual(0);
    expect(Number(platen.getAttribute('x')) + Number(platen.getAttribute('width')) - bleed)
      .toBeGreaterThanOrEqual(sceneW);

    // the furniture that makes it read as a typewriter rather than a black bar
    expect(container.querySelector('.press-nip-line')).not.toBeNull();
    expect(container.querySelector('.press-ribbon')).not.toBeNull();
    expect(container.querySelectorAll('.press-basket-bars rect').length).toBeGreaterThan(6);
    expect(container.querySelectorAll('.press-comb rect').length).toBeGreaterThan(10);
    expect(container.querySelectorAll('.press-keys circle').length).toBeGreaterThan(15);
  });

  it('feeds the sheet UP out of the machine at the start instead of flying it in from off-screen', () => {
    // The old load was `ticket-rise` from translateY(110vh) -- the page arrived from below the
    // fold of the viewport, which is not a thing paper does in a typewriter and was only ever
    // possible because the sheet hung DOWN from a platen at the top. It starts inside the
    // machine now: below the nip, hidden by the opaque body, and rolls up into position by the
    // time the first character is struck.
    const css = readCeremonyCss();
    expect(css).not.toMatch(/ticket-rise/);
    const load = css.match(/\.ceremony\[data-stage='print'\] \.ticket-wrap \{ animation: sheet-load ([\d.]+)s/)!;
    expect(Number(load[1]) * 1000).toBeLessThanOrEqual(TYPE_START_MS); // seated before typing
    const body = keyframes(css, 'sheet-load');
    const start = Number(body.match(/0%\s*\{[^}]*translateY\(([\d.]+)px\)/)![1]);
    expect(body).toMatch(/100%\s*\{[^}]*translateY\(0\)/);
    // far enough down that the sheet's top edge starts below the nip: at that instant the sheet
    // sits `feed` below home, so its top edge is at feed + start, and the nip is NIP_Y.
    expect(NIP_Y - dropFor(0) + start).toBeGreaterThan(NIP_Y);
  });
});
