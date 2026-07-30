import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetOdometerMemory } from '../components/Odometer';
import { resetDialMemory } from '../components/WheelDial';
import { resetQuotePull } from '../lib/quotePull';

// Odometers remember the figure they were left showing, so that returning to a tab counts
// rather than prints. That registry is module state, and module state outlives a test:
// without this, one test's closing figure becomes the next test's starting point and
// counts appear in tests that never set one up.
// The quote pull's throttle is the same shape of module state: one test's pull would
// otherwise sit on the clock for the next test's, and the second App to render in a file
// would silently skip the fetch the test was watching for.
beforeEach(() => {
  resetOdometerMemory();
  resetDialMemory();
  resetQuotePull();
});
