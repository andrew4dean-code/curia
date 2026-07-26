import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGE_MS, TYPE_CHAR_MS, TYPE_START_MS, TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';
import { PRESS_HOME_X, PRESS_OVERHANG, tiltForChar } from '../Press';
// @ts-expect-error -- no @types/node in this project; read the raw CSS source directly so the
// test sees the real rules on disk, bypassing Vitest's mocked CSS-import handling (which returns
// '' for .css imports under jsdom by default, so a normal `import` here would prove nothing).
import { readFileSync } from 'node:fs';

const ticket: TicketData = { no: 47, title: 'TRADE TICKET', symbol: 'TQQQ', lines: ['BUY 400 TQQQ', '@ $72.00'] };

// Read the CSS straight off disk (not via a bundled import) so these pin the actual rules that
// ship, not a jsdom-mocked stand-in. jsdom computes no animation and no layout, so this whole
// class of bug -- a transform that is never transitioned, a perspective on the wrong element,
// preserve-3d on an SVG node -- is otherwise invisible to every test in this file.
function readCeremonyCss(): string {
  const testFilePath = new URL(import.meta.url).pathname;
  const cssPath = testFilePath.replace(/components\/__tests__\/TradeCeremony\.test\.tsx$/, 'styles/ceremony.css');
  return readFileSync(cssPath, 'utf8');
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
// a real width and lays the line out the way a monospace face would -- the PITCH LIVES ONLY
// HERE. The component must never know it; it has to read the column back out of the DOM,
// because Space Mono is a Google-hosted webfont on an offline-first PWA and the first cold run
// gets whatever the fallback face's advance happens to be. .tl-strike is the cell occupied by
// the glyph just struck; .print-column is the zero-width anchor sitting after it.
const FAKE_LEFT = 46;
const FAKE_PITCH = 8.4;

function fakeRect(left: number, width: number): DOMRect {
  return { x: left, y: 0, left, right: left + width, top: 0, bottom: 0, width, height: 0, toJSON: () => ({}) } as DOMRect;
}

function stubLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('ceremony-scene')) return fakeRect(0, 290);
    const typed = this.closest('.ticket-line')?.querySelector('.tl-ink')?.textContent?.length ?? 0;
    if (this.classList.contains('tl-strike')) return fakeRect(FAKE_LEFT + (typed - 1) * FAKE_PITCH, FAKE_PITCH);
    if (this.classList.contains('print-column')) return fakeRect(FAKE_LEFT + typed * FAKE_PITCH, 0);
    return fakeRect(0, 0);
  });
}

// the carriage offset and the per-line feed, straight off the group that carries them
function carrier(container: HTMLElement): { dx: number; feed: number } {
  const m = container.querySelector('.press-carrier')!.getAttribute('transform')!
    .match(/translate\((-?[\d.]+),\s*(-?[\d.]+)\)/)!;
  return { dx: Number(m[1]), feed: Number(m[2]) };
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

  it('clips the arm so it can never cross the ticket, and fades the shaft out before the cut', () => {
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    expect(arm.getAttribute('clip-path')).toMatch(/press-clip/);
    expect(container.querySelector('#press-clip')).not.toBeNull();

    // The clip alone ends the bar in a hard horizontal cut across the ticket, which is the
    // thing that reads as a stick. The shaft fades out above that edge instead -- and the fade
    // must FINISH before the cut, or the guillotine line is still there at reduced opacity.
    const shaft = container.querySelector('.press-shaft')!;
    expect(shaft.getAttribute('mask')).toMatch(/arm-fade/);
    const fadeEnd = Number(container.querySelector('#arm-fade-g')!.getAttribute('y2'));
    const band = container.querySelector('#press-clip rect')!;
    const bandBottom = Number(band.getAttribute('y')) + Number(band.getAttribute('height'));
    // the fade is authored in the carrier's local space (line 0 here, so the two agree)
    expect(fadeEnd).toBeLessThan(bandBottom);
  });

  it('lands the head on the live print column, and keeps it inside the clip band on the third line', () => {
    // REWRITTEN. The original only checked y: it was the regression test for strikeY moving with
    // the line index while the head's `y` stayed hard-coded, which clipped the head away entirely
    // on line three. Both halves of registration are asserted now, because the arm used to strike
    // at a FIXED x while .ticket-line is centre-aligned and grows rightward -- the hammer never
    // landed where the letter appeared. The x assertions are the new half; the y assertions are
    // the original ones, kept verbatim in intent and re-pointed at .press-carrier (the head's
    // parent is now the per-character tilt group, so the feed offset is read one level up).
    stubLayout();
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TYPE_START_MS));
    // 25 beats finish line one and 21 finish line two (their line breaks cost nothing), so beat
    // 48 is the second character of the third line -- comfortably inside line index 2 and well
    // within the print stage's typing window (600ms-4200ms for this fixture).
    for (let i = 0; i < 48; i++) {
      act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    }
    expect(inked(container)[2]).toBe('AC');

    // x: the head's centre sits on the centre of the cell the letter just landed in -- the
    // second cell of the line here, i.e. FAKE_LEFT + 1.5 advances -- in scene pixels. Measuring
    // the anchor AFTER the ink instead would put it half a character to the right of the letter
    // it had just struck, for the whole beat that letter was on screen.
    const { dx, feed } = carrier(container);
    const headSceneX = PRESS_HOME_X + dx - PRESS_OVERHANG;
    expect(headSceneX).toBeCloseTo(FAKE_LEFT + 1.5 * FAKE_PITCH, 1);

    // and it TRACKS: one more character moves the carriage by exactly one measured advance,
    // which the component never knew and could not have hardcoded.
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
    expect(inked(container)[2]).toBe('ACC');
    expect(carrier(container).dx - dx).toBeCloseTo(FAKE_PITCH, 2);

    // y: unchanged from the original assertion.
    const head = container.querySelector('.press-head')!;
    const headY = Number(head.getAttribute('y')) + feed;
    const headHeight = Number(head.getAttribute('height'));

    const clipRect = container.querySelector('#press-clip rect')!;
    const clipY = Number(clipRect.getAttribute('y'));
    const clipHeight = Number(clipRect.getAttribute('height'));

    // 24px per line, not the 27px line pitch: the page itself rolls up 3px at every line
    // break (`--feed * -3px` in ceremony.css), so line n is painted 3n above where it is laid
    // out. Striking at the full pitch left the head 6px low by the third line.
    expect(feed).toBe(2 * 24);
    expect(headY).toBeGreaterThanOrEqual(clipY);
    expect(headY + headHeight).toBeLessThanOrEqual(clipY + clipHeight);
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
    // the line, which would change the width after all
    expect(readCeremonyCss()).toMatch(/\.ticket-line\s*\{[^}]*white-space:\s*pre-wrap/);
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

  it('does not swing at a page with nothing on it yet', () => {
    // The arm is on screen from the first frame -- the machine is there before the paper is --
    // but the print stage opens with the ticket still flying up into the platen, and a strike
    // then is a strike at nothing. data-strike="idle" matches neither strike rule, so the bar
    // just sits at rest until there is a character to hit.
    const { container } = render(<TradeCeremony ticket={longTicket} onDone={vi.fn()} />);
    const arm = container.querySelector('.press-arm')!;
    expect(arm.getAttribute('data-strike')).toBe('idle');
    act(() => vi.advanceTimersByTime(TYPE_START_MS + TYPE_CHAR_MS));
    expect(arm.getAttribute('data-strike')).toBe('1');

    // and the parked pose has to BE the rest pose, or the first strike starts with a jump --
    // the same defect as the old press-hit-a/press-hit-b handover, just at the top of the stage.
    const css = readCeremonyCss();
    const base = css.match(/\n\.press-arm\s*\{[^}]*transform:\s*([^;]+);/)![1].trim();
    const rest = css
      .match(/@keyframes press-hit-a\s*\{([^@]*?)\n\}/)![1]
      .match(/0%\s*\{\s*transform:\s*([^;]+);/)![1]
      .trim();
    expect(base).toBe(rest);
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

    // Sample data-strike after every character tick. 60 beats stays inside this fixture's 66, so
    // every sample below is a beat that really printed something. If the attribute only ever
    // flipped once (or never) this would regress to "strikes once at mount, then freezes" — the
    // bug that shipped silently before — and if it flipped every third beat it would be the
    // rejected design.
    const samples: string[] = [];
    for (let i = 0; i < 60; i++) {
      act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
      samples.push(arm.getAttribute('data-strike')!);
    }

    const seen = new Set(samples);
    expect(seen.has('0')).toBe(true);
    expect(seen.has('1')).toBe(true);

    const flips = samples.slice(1).filter((value, i) => value !== samples[i]).length;
    expect(flips).toBe(samples.length - 1); // one restart per glyph, no exceptions
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

  it('declares the perspective on .envelope-stack, with no filter anywhere on it', () => {
    // perspective used to sit on .ceremony, where it applied to .ceremony-scene -- an element
    // with no 3D transform -- and so never reached the flap, leaving the rotation flat. And
    // .env-art carried filter: drop-shadow(), a grouping property that FLATTENS 3D subtrees:
    // even a correctly placed perspective would have been destroyed by it.
    const css = readCeremonyCss();
    const stack = css.match(/\.envelope-stack\s*\{([^}]*)\}/);
    expect(stack).not.toBeNull();
    expect(stack![1]).toMatch(/perspective:\s*\d+px/);
    expect(stack![1]).not.toMatch(/filter/);
    // nothing between the stack and the flap may reintroduce it either -- .env-flap is a direct
    // child, so the only other candidate is the flap itself.
    const flap = css.match(/\n\.env-flap\s*\{([^}]*)\}/);
    expect(flap).not.toBeNull();
    expect(flap![1]).not.toMatch(/filter/);
  });

  it("rests the flap in the OPEN pose and closes it away from the viewer", () => {
    // Rest must be rotateX(0deg) = open. Open costing no transform is what lets the ship stage
    // hold the closed pose by carrying the same animation rule through, instead of pinning a
    // second transform on .env-flap-hinge the way the old build did.
    const css = readCeremonyCss();
    const flap = css.match(/\n\.env-flap\s*\{([^}]*)\}/)![1];
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
    const third = Number(css.match(/\.ticket-wrap \.ticket\s*\{[^}]*min-height:\s*(\d+)px/)![1]) / 3;
    const packetBottom = third * 2;

    const kf = (name: string) => keyframes(css, name);
    const steps = (body: string) =>
      Array.from(body.matchAll(/([\d.]+)%\s*\{([^}]*)/g)).map((m) => ({ pct: Number(m[1]), body: m[2] }));
    const dur = (name: string) => Number(css.match(new RegExp(`animation: ${name} (\\.\\d+)s`))![1]) * 1000;

    const arrive = steps(kf('env-arrive'));
    const insert = steps(kf('packet-insert'));
    const rise = Number(arrive[0].body.match(/translateY\((\d+)px\)/)![1]);
    const home = arrive.slice(1).find((s) => /translateY\(0\)/.test(s.body))!;
    const hoverStep = insert.find((s) => /translateY\(-\d+px\)/.test(s.body))!;
    const hover = Number(hoverStep.body.match(/translateY\((-\d+)px\)/)![1]);

    // 1. THE HOVER POSE CLEARS THE APEX, not the throat. Clearing the throat is what the old
    //    -36px did, and the throat is 70px below the apex -- which is exactly how the letter
    //    came to be sitting on top of the whole lid.
    expect(packetBottom + hover).toBeLessThanOrEqual(apex);

    // 2. AND IT CLEARS IT AT EVERY FRAME OF THE ARRIVAL, not just at the end. The envelope
    //    rises by `rise` while the letter lifts by `-hover` over the same span; the gap
    //      apex + rise*(1-p) - (packetBottom + hover*p)
    //    is independent of p only when rise === -hover, so assert that identity rather than
    //    sampling a few p and hoping. With it, no easing and no frame rate can produce an
    //    overlap. (Measured in headless Chrome: a constant 2px, t = 0..170.)
    expect(rise).toBe(-hover);
    expect(apex + rise - packetBottom).toBeGreaterThan(0);

    // 3. the two segments have to END AT THE SAME INSTANT and share the same easing, or the
    //    identity above holds only at the endpoints and sags in between.
    expect((home.pct / 100) * dur('env-arrive')).toBeCloseTo((hoverStep.pct / 100) * dur('packet-insert'), 0);
    const ease = /animation-timing-function:\s*([^;]+);/;
    expect(arrive[0].body.match(ease)![1].trim()).toBe(insert[0].body.match(ease)![1].trim());

    // 4. the envelope is never painted without its lid: the flap shares the arrival, and the
    //    arrival no longer opens at opacity 0 (which left t=0 with no envelope in it at all).
    expect(arrive[0].body).toMatch(/opacity:\s*1/);
    const shipFlap = css.match(/\.ceremony\[data-stage='ship'\] \.env-flap \{([^}]*)\}/s)![1];
    expect(shipFlap).toMatch(/env-arrive/);
    expect(shipFlap).toMatch(/env-flap-close/);

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
    expect(css).toMatch(/@keyframes mouth-shut/);
    const shut = css.match(/animation: mouth-shut (\.\d+)s (\.\d+)s/)!;
    const close = css.match(/animation:[^;]*env-flap-close (\.\d+)s (\.\d+)s/)!;
    expect(shut[1]).toBe(close[1]); // same duration
    expect(shut[2]).toBe(close[2]); // and the same clock as the flap it belongs to
    expect(container.querySelector('.env-cavity')).not.toBeNull();
    expect(container.querySelector('.env-backpanel')).not.toBeNull();
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
    const insert = css.match(/@keyframes packet-insert\s*\{([^@]*?)\n\}/s)![1];
    const rest = Number(insert.match(/100%\s*\{[^}]*translateY\((-?\d+)px\)/)![1]);
    const mouth = Number(insert.match(/28\.8%\s*\{[^}]*translateY\((-?\d+)px\)/)![1]);
    // packet is scene 96..192; throat is scene 158. Resting top = 96 + rest must clear it.
    expect(96 + rest).toBeGreaterThan(158);
    expect(rest - mouth).toBeGreaterThan(90); // a real slide, not a nudge
  });

  it('stamps the seal strictly after the flap has stopped moving', () => {
    // seal-stamp-env used to fire at .6s while env-flap-close ran to .72s: 120ms of the seal
    // pressing into a flap that was still swinging.
    const css = readCeremonyCss();
    const flapClose = css.match(/animation:[^;]*env-flap-close (\.\d+)s (\.\d+)s/)!;
    const flapEnd = Number(flapClose[1]) + Number(flapClose[2]);
    const sealStart = Number(css.match(/animation: seal-stamp-env \.\d+s (\.\d+)s/)![1]);
    expect(sealStart).toBeGreaterThanOrEqual(flapEnd);
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

  it('draws a machine wider than the paper: platen knobs and a rail that overhang the card', () => {
    // "The typewriter stick still looks fake." A bare tapered shaft behind a card is a stick; a
    // platen with end knobs and a rail running past both edges of the paper is a machine. The
    // silhouette is the deliverable here, not typehead detail.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);

    const sceneW = Number(css.match(/\.ceremony-scene\s*\{[^}]*width:\s*(\d+)px/)![1]);
    const bleed = Number(css.match(/\n\.press\s*\{[^}]*left:\s*-(\d+)px/)![1]);
    const viewW = Number(container.querySelector('.press')!.getAttribute('viewBox')!.split(' ')[2]);
    // one user unit must stay one CSS pixel, or every measured y in Press.tsx is void
    expect(viewW).toBe(sceneW + bleed * 2);
    expect(bleed).toBe(PRESS_OVERHANG);

    // both knobs, and both of them project past the card
    const knobs = Array.from(container.querySelectorAll('.press-knob'));
    expect(knobs).toHaveLength(2);
    const edges = knobs.map((k) => {
      const c = k.querySelector('circle')!;
      const cx = Number(c.getAttribute('cx'));
      const r = Number(c.getAttribute('r'));
      return [cx - r - bleed, cx + r - bleed]; // in scene pixels
    });
    expect(Math.min(...edges.map((e) => e[0]))).toBeLessThan(0);
    expect(Math.max(...edges.map((e) => e[1]))).toBeGreaterThan(sceneW);

    // the rail runs the full width, also past the card, and carries two margin stops
    const rail = container.querySelector('.press-rail rect')!;
    expect(Number(rail.getAttribute('x')) - bleed).toBeLessThan(0);
    expect(Number(rail.getAttribute('x')) + Number(rail.getAttribute('width')) - bleed).toBeGreaterThan(sceneW);
    expect(container.querySelectorAll('.press-stop')).toHaveLength(2);

    // and the nip, the shadow where the sheet passes under the roller
    expect(container.querySelector('.press-nip')).not.toBeNull();
  });
});
