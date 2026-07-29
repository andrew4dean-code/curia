import { readFileSync } from 'node:fs';

// A URL, not a path string: readFileSync decodes it, so this still resolves from a
// checkout whose directory contains a space.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Compile-time constants injected into the app.
 *
 *  Shared by vite.config.ts (the build) and vitest.config.ts (the tests) because they
 *  were previously declared separately in each, and a constant that exists in the build
 *  but not under test fails at the assertion rather than at the config — which is a long
 *  way from the mistake. One object, imported twice.
 */
export const buildDefines: Record<string, string> = {
  __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
  __APP_VERSION__: JSON.stringify(pkg.version),
};
