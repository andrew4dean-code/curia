import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetOdometerMemory } from '../components/Odometer';

// Odometers remember the figure they were left showing, so that returning to a tab counts
// rather than prints. That registry is module state, and module state outlives a test:
// without this, one test's closing figure becomes the next test's starting point and
// counts appear in tests that never set one up.
beforeEach(() => {
  resetOdometerMemory();
});
