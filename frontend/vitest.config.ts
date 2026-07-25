import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true, // required for @testing-library/react auto-cleanup between tests
    setupFiles: ['./src/test/setup.ts'],
  },
});
