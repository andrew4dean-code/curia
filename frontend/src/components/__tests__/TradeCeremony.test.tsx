import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGE_MS, TradeCeremony } from '../TradeCeremony';
import type { TicketData } from '../TradeCeremony';
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

  it('ducks the open flap under the letter, with the safe z-index as the base', () => {
    // An open flap stands up in front of the mouth. Left above the letter it hides 52px of the
    // 96px packet exactly when the letter should read as poised over the envelope; left below
    // the pocket while shutting it disappears behind the envelope front. z-index is a total
    // order, so it has to change with the pose -- and the BASE has to be the closing value, so
    // that an engine ignoring z-index in keyframes degrades to the cosmetic failure and never
    // to the flap vanishing mid-close.
    const css = readCeremonyCss();
    const base = Number(css.match(/\n\.env-flap\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const front = Number(css.match(/\n\.env-front\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const fold = Number(css.match(/\n\.fold\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const duck = Number(css.match(/@keyframes env-flap-duck\s*\{[^}]*z-index:\s*(\d+)/)![1]);
    const closed = Number(css.match(/@keyframes env-flap-close\s*\{[^}]*z-index:\s*(\d+)/)![1]);

    expect(duck).toBeLessThan(fold); // open: under the letter
    expect(closed).toBeGreaterThan(front); // closing: over the pocket
    expect(base).toBe(closed); // the fail-safe base

    // The flap's three animations must all be in ONE rule -- `animation` is a shorthand, so a
    // second rule replaces rather than adds -- and the close must be listed AFTER the duck, or
    // the duck's z-index would keep winning from 590ms on and the flap would shut behind the
    // pocket. indexOf alone is not enough to assert that: a missing duck returns -1, which is
    // "before" everything.
    const list = css.match(/\.ceremony\[data-stage='ship'\] \.env-flap \{([^}]*)\}/s)![1];
    expect(list).toMatch(/env-arrive/);
    expect(list).toMatch(/env-flap-duck/);
    expect(list).toMatch(/env-flap-close/);
    expect(list.indexOf('env-flap-duck')).toBeLessThan(list.indexOf('env-flap-close'));
  });

  it('puts preserve-3d only on HTML elements, never on SVG', () => {
    // The old .env-flap-hinge was an SVG <g> with transform-style: preserve-3d. SVG has no 3D
    // rendering context: the property does nothing there, and the <g> is clipped by the
    // viewBox besides. Any class that asks for preserve-3d has to land on an HTML element.
    const css = readCeremonyCss();
    const { container } = render(<TradeCeremony ticket={ticket} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(6000)); // through fold + envelope, so every layer exists

    const classes = new Set<string>();
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
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
});
