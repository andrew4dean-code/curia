import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { buildDefines } from './build-defines';

export default defineConfig({
  define: buildDefines,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // required for @testing-library/react auto-cleanup between tests
    setupFiles: ['./src/test/setup.ts'],
  },
});
