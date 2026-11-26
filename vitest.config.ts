import { defineConfig } from 'vitest/config';

// Two projects (ADR-001 section 5 "Testing"):
//  - unit: pure functions (KPI formulas, validation, auth helpers); no database.
//  - integration: repos/services/migrations against an in-memory Postgres from
//    @netlify/database-dev (tests start it themselves; never a deployed DB).
// Playwright e2e lives in tests/e2e and is run by `npm run test:e2e`, not Vitest.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
