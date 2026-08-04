import { describe, expect, it } from 'vitest';
// @ts-expect-error -- no @types/node in this project.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- no @types/node in this project.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- no @types/node in this project.
import { dirname, join } from 'node:path';

/* The app chrome — the fixed tab bar and the space the shell reserves for it — is
   invisible to every other test in this suite. jsdom computes no layout, and
   env(safe-area-inset-*) resolves to 0 in any desktop browser, so the one configuration
   that matters (a real phone, where the inset is ~34px) is the one configuration nothing
   exercises. These read the stylesheets on disk and assert the relationships directly.

   Both of the defects below shipped and survived: a .tabbar rule that was silently
   overridden by a second one, and a bottom padding hardcoded to a height that is not
   fixed. */

function css(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', 'styles', name), 'utf8');
}
/** Rules with comments stripped — several assertions below are "this does not appear
 *  anywhere", and the comments explaining the fixes mention the very strings involved. */
const rules = (name: string) => css(name).replace(/\/\*[\s\S]*?\*\//g, '');

describe('app chrome layout', () => {
  it('styles .tabbar in exactly one stylesheet', () => {
    const files = ['app.css', 'curia-tokens.css', 'ceremony.css'];
    const owners = files.filter((f) => /^\.tabbar\s*\{/m.test(rules(f)));
    expect(owners, `.tabbar is declared in ${owners.join(' and ')} — the later import wins silently`).toEqual(['app.css']);
  });

  it('defines --safe-bottom as the home-indicator inset with a floor', () => {
    // The inset is referenced through this variable now, so the variable is the thing
    // that has to be right — every assertion below leans on it.
    expect(rules('app.css')).toMatch(/--safe-bottom:\s*max\(env\(safe-area-inset-bottom\)\s*,\s*\d+px\)/);
  });

  it('reserves bottom space that tracks the tab bar instead of a fixed height', () => {
    const shell = /\.shell\s*\{([^}]*)\}/.exec(rules('app.css'));
    expect(shell, '.shell rule not found').not.toBeNull();
    const decl = shell![1];
    // The reserved space must move with the same inset the bar itself pads by — directly
    // or through --safe-bottom, which the test above pins to that inset.
    expect(decl, '.shell must reserve space using the home-indicator inset').toMatch(
      /safe-area-inset-bottom|var\(--safe-bottom\)/,
    );
    // A bare 3-digit px bottom padding is the hardcoded-height bug returning.
    expect(/padding:[^;]*\s\d{3}px\s*;/.test(decl), '.shell bottom padding is a fixed px height again').toBe(false);
  });

  /* The bottom padding cleared the tab bar and nothing else, but the FAB floats a further
     92px above the bar. At full scroll the button sat on top of the last row of every
     scrolling tab — it covered the last holding's P/L by 56x13px, and scrolling could not
     free it, because that was the end of the document. Both must be derived from the same
     two variables so the floor cannot be left behind when the button moves. */
  it('reserves enough bottom space to clear the FAB, not just the tab bar', () => {
    const app = rules('app.css');
    const shell = /\.shell\s*\{([^}]*)\}/.exec(app)![1];
    const fab = /\.fab\s*\{([^}]*)\}/.exec(app)![1];
    for (const v of ['--fab-lift', '--fab-size']) {
      expect(shell, `.shell must reserve space in terms of ${v}`).toContain(`var(${v})`);
    }
    expect(fab, '.fab must be positioned from --fab-lift').toContain('var(--fab-lift)');
    expect(fab, '.fab must be sized from --fab-size').toContain('var(--fab-size)');
  });

  it('keeps every tab at least a screenful tall', () => {
    // Short tabs that cannot scroll leave the iOS toolbar expanded, which changes the
    // safe-area inset and makes the bar read a different height there than elsewhere.
    const shell = /\.shell\s*\{([^}]*)\}/.exec(rules('app.css'))![1];
    expect(shell).toMatch(/min-height:\s*100dvh/);
  });

  /* iOS Safari zooms the entire page in when a control whose text is under 16px takes
     focus, and it does not zoom back out — the sheet ends up hanging off the side of the
     screen with the keyboard up. Nothing catches this: it builds, it types, it passes
     every jsdom test, and it is invisible in any desktop browser. It has already shipped
     once, on the paste textarea. */
  it('never lets a focusable field drop below the 16px iOS zoom floor', () => {
    const offenders: string[] = [];
    // Every stylesheet, not just the one that got it wrong last time.
    for (const file of ['app.css', 'curia-tokens.css', 'ceremony.css', '../index.css']) {
      for (const m of rules(file).matchAll(/([^{}]*(?:input|textarea|select)[^{}]*)\{([^}]*)\}/g)) {
        const size = /font-size:\s*([\d.]+)px/.exec(m[2]);
        if (size && Number(size[1]) < 16) offenders.push(`${file}: ${m[1].trim()} -> ${size[1]}px`);
      }
    }
    expect(
      offenders,
      `these fields will make iOS zoom the page on focus:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  /* Two animations on one element that touch the same property is a silent bug, and it has
     now shipped twice: `xc-sleeve-in ... both, xc-sleeve-take ... both` both animated
     transform, and because `both` fills BACKWARDS through a delay, the later name in the list
     was already emitting its 0% keyframe from frame one — so the sleeve's entrance never
     rendered at all. Nothing catches this. It builds, it passes every jsdom test, and in a
     browser it just looks like the animation was never written.

     So: for every rule declaring more than one animation, intersect the properties their
     keyframes actually touch. Any overlap is a defect — split them onto separate elements,
     or fold them into one keyframe timeline. */
  it('never puts two animations that touch the same property on one element', () => {
    const offenders: string[] = [];
    for (const file of ['app.css', 'curia-tokens.css', 'ceremony.css']) {
      const css = rules(file);

      /* Brace-counting, not a regex. Keyframes nest, and this file writes them both as one
         line and across many — a `[\s\S]*?\n\}` pattern silently skips every single-line
         block, which is most of them. A guard that quietly matches nothing is worse than no
         guard: the first version of this test passed against the very defect it was written
         for, which is the whole lesson of the review that produced it. */
      const propsOf = new Map<string, Set<string>>();
      const kfRe = /@keyframes\s+([\w-]+)\s*\{/g;
      let kf: RegExpExecArray | null;
      while ((kf = kfRe.exec(css))) {
        let depth = 1;
        let i = kf.index + kf[0].length;
        for (; i < css.length && depth > 0; i++) {
          if (css[i] === '{') depth++;
          else if (css[i] === '}') depth--;
        }
        const body = css.slice(kf.index + kf[0].length, i - 1);
        const props = new Set<string>();
        for (const decl of body.matchAll(/([a-z-]+)\s*:/g)) {
          if (decl[1] !== 'animation-timing-function') props.add(decl[1]);
        }
        propsOf.set(kf[1], props);
      }
      // Strip the keyframe blocks so their inner `from {}` / `50% {}` are not read as rules.
      const flat = css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

      for (const r of flat.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selector = r[1].trim();
        if (selector.startsWith('@') || selector.startsWith('%') || /^\d/.test(selector)) continue;
        const decl = /(?:^|[;\s])animation:\s*([^;]+)/.exec(r[2]);
        if (!decl || decl[1].split(',').length < 2) continue;
        /* Sharing a property is not by itself a bug — two animations that hand off cleanly
           are fine, and the envelope throat does exactly that on purpose. What breaks is the
           LATER one being able to emit while the earlier one is still working, because the
           later name wins any property they share. That happens when their active windows
           overlap, or when the later one fills BACKWARDS (both/backwards) across a delay
           that starts after the earlier one — which is the .xc-sleeve bug: a 2.62s delay
           with `both` was already painting its 0% keyframe at frame one. `forwards` alone
           emits nothing before it starts and is safe. */
        const parts = decl[1].split(',').map((part) => {
          const toks = part.trim().split(/\s+/);
          const name = toks.find((t) => propsOf.has(t));
          const times = toks.filter((t) => /^-?[\d.]+m?s$/.test(t)).map((t) => (t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000));
          const fill = toks.find((t) => ['none', 'forwards', 'backwards', 'both'].includes(t)) ?? 'none';
          return { name, dur: times[0] ?? 0, delay: times[1] ?? 0, fill };
        });
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i];
            const b = parts[j];
            if (!a.name || !b.name) continue;
            const shared = [...(propsOf.get(a.name) ?? [])].filter((p) => propsOf.get(b.name!)?.has(p));
            if (!shared.length) continue;
            const overlap = b.delay < a.delay + a.dur && a.delay < b.delay + b.dur;
            const masksBackwards = (b.fill === 'both' || b.fill === 'backwards') && b.delay > a.delay;
            if (overlap || masksBackwards) {
              offenders.push(
                `${file}: ${selector} — ${b.name} (${b.fill}, ${b.delay}ms) ${masksBackwards ? 'fills backwards over' : 'overlaps'} ` +
                  `${a.name} (${a.delay}ms), and both animate ${shared.join(', ')}`,
              );
            }
          }
        }
      }
    }
    expect(
      offenders,
      `the later animation in the list wins these properties, including backwards through its ` +
        `own delay, so the earlier one silently never renders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('pads the tab bar by the home-indicator inset, with a floor', () => {
    const bar = /\.tabbar\s*\{([^}]*)\}/.exec(rules('app.css'))![1];
    expect(bar).toMatch(/max\(env\(safe-area-inset-bottom\)|var\(--safe-bottom\)/);
    expect(bar).toContain('position: fixed');
  });
});
