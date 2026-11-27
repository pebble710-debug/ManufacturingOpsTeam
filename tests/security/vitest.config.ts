import { defineConfig } from 'vitest/config';

// Security reviewer's tests (Sasha). Not yet part of the default projects in vitest.config.ts;
// Theo/Quinn: add a 'security' project (or include tests/security/** in 'integration') once SEC-01 is fixed.
export default defineConfig({
  test: {
    include: ['tests/security/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
