import { defineConfig, devices } from '@playwright/test';

// E2E runs against `astro dev` (the Netlify adapter has no `astro preview`; ADR-001 D5).
// Astro 7 daemonises `astro dev` when it detects an AI agent / non-interactive caller; `--ignore-lock`
// forces a one-off FOREGROUND server that Playwright can own and kill (verified with Astro 7.4.13).
// The webServer command also applies migrations and the small-fixture seed once the emulator is up:
//   1. start `astro dev` in the foreground (emulator writes .netlify/state.json)
//   2. wait for the port; then globalSetup (tests/e2e/global-setup.ts, owned by Quinn) may run
//      `npm run db:migrate` and `npm run db:reset-seed`.
// Chromium is pre-installed in this environment; do NOT run `playwright install` here.
// CI installs the browser itself (see .github/workflows/ci.yml).
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx astro dev --ignore-lock --port ${PORT}`,
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
