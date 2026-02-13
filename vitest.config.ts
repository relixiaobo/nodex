import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/vitest/**/*.test.ts'],
    setupFiles: ['tests/vitest/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});

