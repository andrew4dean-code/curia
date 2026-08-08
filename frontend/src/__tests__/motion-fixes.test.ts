import { describe, expect, it } from 'vitest';
// @ts-expect-error -- no @types/node in this project.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- no @types/node in this project.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- no @types/node in this project.
import { dirname, join } from 'node:path';

/* The animation and design pass. Every defect below shipped, and every one of them was
   invisible to this suite: jsdom computes no layout, runs no animation, resolves no
   env(), and composites no colour. So these read the stylesheets on disk and assert the
   relationships — the same tactic chrome-layout.test.ts uses, for the same reason.

   Several were found by freezing the real ceremonies frame by frame in a browser, which is
   the only way some of them are visible at all. Where a number here came off a measurement
   rather than out of the stylesheet, the comment says so. */

function css(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', 'styles', name), 'utf8');
}
/** Comments stripped: most assertions below are "this string does not appear", and the
 *  comments explaining each fix quote the very strings involved. */
const rules = (name: string) => css(name).replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (file: string, selector: string): string | null => {
  const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(rules(file));
  return m ? m[1] : null;
};
/** Brace-balanced. A lazy [\s\S]*? stops at the first `}`, which inside @keyframes is the
 *  end of the 0% block — so every one-line keyframe in this file read as its opening step
 *  alone, and an assertion about the 100% pose silently passed against nothing. */
const keyframes = (file: string, name: string): string => {
  const src = rules(file);
  const at = src.search(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
};

/* ---- sRGB relative luminance and WCAG contrast, so colour claims are computed here
       rather than asserted from a comment. ---- */
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** `over` composited onto `under` at alpha. */
const over = (under: string, rgb: [number, number, number], alpha: number): string => {
  const u = hex(under);
  const mix = rgb.map((c, i) => Math.round(alpha * c + (1 - alpha) * u[i]));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
};

const PARCHMENT = '#E7DDC4';
const VEIL_RGB: [number, number, number] = [31, 27, 18];

describe('the scrim every ceremony sits on', () => {
  it('is declared once, as a token, and read by every keyframe that paints it', () => {
    expect(rules('curia-tokens.css')).toMatch(/--veil:\s*rgba\(31,\s*27,\s*18,\s*\.\d+\)/);
    for (const name of ['ceremony-in', 'dim-out', 'xc-veil']) {
      const body = keyframes('ceremony.css', name);
      expect(body, `${name} must read the token`).toMatch(/var\(--veil(-0)?\)/);
      expect(body, `${name} still hardcodes the scrim`).not.toMatch(/rgba\(31,\s*27,\s*18/);
    }
  });

  it('is dark enough that parchment text on it clears AA', () => {
    const alpha = Number(/--veil:\s*rgba\(31,\s*27,\s*18,\s*(\.\d+)\)/.exec(rules('curia-tokens.css'))![1]);
    // The ceremony covers the app, and the app is parchment.
    const backdrop = over(PARCHMENT, VEIL_RGB, alpha);
    expect(
      contrast(PARCHMENT, backdrop),
      'at .55 this composited to a mid grey where nothing read: parchment was 3.5:1 and the ' +
        'ink-coloured lines the assignment ceremony writes on it were 1.37:1 and 1.77:1',
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('never puts a paper ink on the scrim, which is what made the kept figure invisible', () => {
    for (const selector of ['.xc-verdict', '.xc-filed']) {
      const body = rule('ceremony.css', selector)!;
      expect(body, `${selector} sits directly on the veil and must be coloured for it`)
        .toMatch(/color:\s*var\(--parchment\)/);
    }
    // The one figure this ceremony exists to report.
    expect(rule('ceremony.css', '.xc-kept'), 'var(--stamp) is maroon on the assign tone — a paper ink')
      .not.toMatch(/var\(--stamp\)/);
  });
});

describe('the assignment ceremony files its certificate', () => {
  it('travels far enough to get behind the sleeve', () => {
    const win = rule('ceremony.css', '.xc-window')!;
    const top = Number(/top:\s*(\d+)px/.exec(win)![1]);
    const height = Number(/height:\s*(\d+)px/.exec(win)![1]);
    const bottomInset = Number(/clip-path:\s*inset\(\s*0\s+\S+\s+(\d+)px/.exec(win)![1]);
    const travel = Number(/100%\s*\{\s*transform:\s*translateY\((\d+)px\)/.exec(keyframes('ceremony.css', 'xc-file'))![1]);
    // The card starts at the window's own top, so reaching the clipped floor IS the travel.
    expect(travel, 'at 96px the card stopped with 74 of its 132px still above the sleeve')
      .toBe(height - bottomInset);
    expect(top + height - bottomInset).toBe(Number(/top:\s*(\d+)px/.exec(rule('ceremony.css', '.xc-sleeve')!)![1]));
  });

  it('does not guillotine the card that is leaving', () => {
    const m = /clip-path:\s*inset\(\s*0\s+(-?[\d.]+\w*)\s+\d+px\s+(-?[\d.]+\w*)\s*\)/.exec(rule('ceremony.css', '.xc-window')!);
    expect(m, '.xc-window must name all four offsets').not.toBeNull();
    for (const side of [m![1], m![2]]) expect(parseFloat(side)).toBeLessThanOrEqual(0);
  });

  it('leaves with its scrim rather than standing over the live app', () => {
    expect(rule('ceremony.css', '.exchange-stage'), 'the stage must fade out').toBeTruthy();
    expect(rules('ceremony.css')).toMatch(/\.exchange-stage\s*\{\s*animation:\s*xc-exit/);
  });
});

describe('the verdict stamp cannot reach the figure under it', () => {
  const stamp = () => rule('ceremony.css', '.settle-stamp')!;

  it('stays on one line whatever the word is', () => {
    expect(stamp(), 'BOUGHT BACK wraps without this, and the second line lands on the P/L')
      .toMatch(/white-space:\s*nowrap/);
  });

  it('sets its own line-height rather than inheriting 1.5 from the body', () => {
    expect(stamp()).toMatch(/line-height:\s*1\b/);
  });

  /* The berth is sized for the rotated box, so the box has to actually fit it. Georgia Bold
     is the measurement that matters: it is the declared fallback and therefore what paints
     on every cold start of an offline-first PWA, before Playfair is fetched.
     Widths measured in headless Chrome at 30px/.05em: BOUGHT BACK 260.4, CALLED AWAY 257.0,
     ASSIGNED 183.1, EXPIRED 161.3. They scale linearly with font-size. */
  const WIDEST_AT_30 = 260.4;

  it('fits the widest word it can print inside its own box', () => {
    const size = Number(/font-size:\s*(\d+)px/.exec(stamp())![1]);
    const width = Number(/width:\s*(\d+)px/.exec(stamp())![1]);
    const border = Number(/border:\s*(\d+)px/.exec(stamp())![1]);
    expect(WIDEST_AT_30 * (size / 30)).toBeLessThanOrEqual(width - border * 2);
  });

  it('fits the berth once rotated', () => {
    const size = Number(/font-size:\s*(\d+)px/.exec(stamp())![1]);
    const width = Number(/width:\s*(\d+)px/.exec(stamp())![1]);
    const border = Number(/border:\s*(\d+)px/.exec(stamp())![1]);
    const padding = Number(/padding:\s*(\d+)px/.exec(stamp())![1]);
    const deg = Number(/rotate\(-(\d+)deg\)/.exec(stamp())![1]);
    const boxH = size + padding * 2 + border * 2; // line-height 1, asserted above
    const rad = (deg * Math.PI) / 180;
    const rotatedH = width * Math.sin(rad) + boxH * Math.cos(rad);
    const berth = Number(/height:\s*(\d+)px/.exec(rule('ceremony.css', '.settle-stamp-berth')!)![1]);
    expect(rotatedH, 'the stamp overflows its berth and spills onto the figure').toBeLessThanOrEqual(berth);
  });
});

describe('a ceremony counts at its own pace', () => {
  it('pins --roll-scale, so the landing wind cannot outlive the overlay', () => {
    expect(rule('ceremony.css', '.ceremony'), 'a settle inside a landing window ran a 2200ms count at 3960ms in a 3160ms overlay')
      .toMatch(/--roll-scale:\s*1\b/);
  });
});

describe('the wheel crest', () => {
  it('gives each ring its own circumference', () => {
    const rim = rule('ceremony.css', '.crest-rim')!;
    const inner = rule('ceremony.css', '.crest-inner')!;
    const dash = (b: string) => Number(/stroke-dasharray:\s*(\d+)/.exec(b)![1]);
    expect(dash(rim)).not.toBe(dash(inner));
    // r=80 and r=62 in WheelCeremony.tsx. A shared 520 let the smaller ring close at 75% of
    // its run while the larger needed 96.7% of its, so the inner finished first.
    expect(dash(rim)).toBeGreaterThanOrEqual(Math.ceil(2 * Math.PI * 80));
    expect(dash(inner)).toBeGreaterThanOrEqual(Math.ceil(2 * Math.PI * 62));
    expect(dash(rim) - 2 * Math.PI * 80).toBeLessThan(2);
    expect(dash(inner) - 2 * Math.PI * 62).toBeLessThan(2);
  });

  it('reserves both caption lines, so a wrap mid-type cannot move the crest', () => {
    const em = Number(/min-height:\s*([\d.]+)em/.exec(rule('ceremony.css', '.crest-caption')!)![1]);
    expect(em, 'a completion caption wraps to two lines partway through typing').toBeGreaterThanOrEqual(2.8);
  });

  it('anchors the COMPLETED banner to the crest, not to a box the caption resizes', () => {
    expect(rule('ceremony.css', '.crest-banner'), 'a percentage here moves with the P/L string length')
      .toMatch(/top:\s*\d+px/);
  });
});

describe('the trade ceremony', () => {
  it('folds both panels toward the viewer, not behind the sheet', () => {
    // .fold-p2 hinges at its top (origin 50% 0%) with its body below, so folding toward you
    // is POSITIVE; .fold-p0 hinges at its bottom with its body above, so it is negative.
    expect(keyframes('ceremony.css', 'fold-up')).toMatch(/rotateX\(180deg\)/);
    expect(keyframes('ceremony.css', 'fold-down')).toMatch(/rotateX\(-180deg\)/);
  });

  it('starts the envelope off-frame at any height, not just on a 667px phone', () => {
    const first = /0%\s*\{[^}]*translateY\(([^)]*\)?[^)]*)\)/.exec(keyframes('ceremony.css', 'env-arrive'))![1];
    expect(first, 'a fixed px start is only off-frame on the one device it was measured on')
      .toMatch(/vh/);
  });

  it('hides the sheet it is feeding instead of hanging it under the machine', () => {
    expect(rules('ceremony.css')).toMatch(/\[data-stage='print'\]\s*\.ceremony-scene\s*\{\s*clip-path:/);
    // Scoped to print ON PURPOSE — the envelope's run-up starts far below the scene.
    expect(rules('ceremony.css')).not.toMatch(/^\.ceremony-scene\s*\{[^}]*clip-path/m);
  });
});

describe('everyday chrome', () => {
  it('sizes only the hero figure at 44px, not everything inside the hero', () => {
    expect(rules('app.css'), 'as a descendant selector this also caught the unrealized figure')
      .toMatch(/\.hero\s*>\s*\.odo\s*\{/);
  });

  it('measures the app in dvh everywhere, including the first screen', () => {
    expect(rule('app.css', '.gate')).toMatch(/min-height:\s*100dvh/);
    expect(rules('app.css')).not.toMatch(/100vh/);
  });

  it('clips the month board rather than letting it drag the page sideways', () => {
    // clip and NOT hidden: hidden would make .board-head-sticky stick to the shell.
    expect(rule('app.css', '.shell')).toMatch(/overflow-x:\s*clip/);
  });

  it('sticks the month header below the status bar', () => {
    expect(rule('app.css', '.board-head-sticky')).toMatch(/top:\s*env\(safe-area-inset-top\)/);
  });

  it('gives the ledger row actions a real tap target', () => {
    const body = rule('app.css', '.row-action')!;
    const pad = Number(/padding:\s*(\d+)px/.exec(body)![1]);
    const size = Number(/font-size:\s*(\d+)px/.exec(body)![1]);
    // The line box, not the glyph: body line-height is 1.5 and nothing here overrides it.
    expect(pad * 2 + size * 1.5, 'the delete action was 23.5px tall, beside Edit').toBeGreaterThanOrEqual(44);
  });

  it('breathes the TO DO pill without dimming its text under AA', () => {
    expect(keyframes('app.css', 'todo-breathe'), 'fading the pill took maroon on parchment to 3.4:1')
      .not.toMatch(/opacity/);
  });

  it('keeps the offline banner above AA — it is the message saying your figures are stale', () => {
    const bg = /background:\s*(#[0-9A-Fa-f]{6})/.exec(rule('app.css', '.offline')!)![1];
    expect(contrast('#2E2820', bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('drops the card ornament when the card folds away from under it', () => {
    expect(rules('app.css'), 'four 78px corners on a 72.5px card become one tangle')
      .toMatch(/\.wheel-card\.folded\s+\.card-filigree\s*\{\s*display:\s*none/);
  });

  /* Both of these were comments describing machinery that had been deliberately removed —
     nothing rendered wrong, but the next reader is invited to restore something a test then
     fails them for. The invariant is that the code still does not do it, and that the prose
     no longer says it does. */
  it('no longer documents SVG attributes that were deliberately removed', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const filigree = readFileSync(join(here, '..', 'components', 'CardFiligree.tsx'), 'utf8');
    expect(filigree, 'the ornament keeps fixed-square corners instead').not.toMatch(/preserveAspectRatio|vector-effect/);
    expect(css('app.css'), 'the comment must not present them as present tense')
      .not.toMatch(/preserveAspectRatio="none" stretches/);
    expect(css('curia-tokens.css'), 'the .odo comment described a ch reservation that was removed on purpose')
      .not.toMatch(/min-width is set in ch/);
  });
});
