/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // CesiumJS ships as one large chunk; it is lazy-loaded (src/app/App.tsx), so the first paint
    // does not wait for it. Raise the warning threshold to that chunk's size instead of hiding it.
    chunkSizeWarningLimit: 6000,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    // The App tests wait up to 5 s for the lazy-loaded globe (tests/setup.ts); on a busy laptop the
    // first, cold load can take that long, so a test needs more than Vitest's default 5 s in all.
    testTimeout: 20_000,
    // The App test files import the globe stand-in in a beforeAll hook; with the whole suite
    // running at once that first import can take over Vitest's default 10 s hook limit.
    hookTimeout: 30_000,
  },
});
