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

  it('pads the tab bar by the home-indicator inset, with a floor', () => {
    const bar = /\.tabbar\s*\{([^}]*)\}/.exec(rules('app.css'))![1];
    expect(bar).toMatch(/max\(env\(safe-area-inset-bottom\)|var\(--safe-bottom\)/);
    expect(bar).toContain('position: fixed');
  });
});
