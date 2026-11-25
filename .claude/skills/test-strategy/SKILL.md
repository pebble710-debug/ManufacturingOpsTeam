---
name: test-strategy
description: Test pyramid, required test suites, fixtures and the QA report format for the ManufacturingOpsTeam dashboard, mapped to the v1 acceptance criteria. Use when writing, running or reporting tests.
user-invocable: false
---

# Test strategy (v1)

Tooling per ADR-001 (`docs/ADR-001.md` §5):
- **Vitest** — unit tests (KPI formulas vs hand-calculated fixtures, Zod validation, auth helpers)
  and integration tests (repos, transactions, append-only triggers) against a real in-memory
  Postgres from **`@netlify/database-dev`** with migrations applied via `applyMigrations()`.
- **Playwright** (Chromium) — end-to-end acceptance flows. `webServer` starts `astro dev` (emulates
  Netlify DB), then `npm run db:reset-seed` with the small test-fixture profile. Fallback if the
  emulator will not run headless in CI: start `@netlify/database-dev` in global setup and point
  `NETLIFY_DB_URL` at it. Chromium is pre-installed in cloud sessions; pass `--trace off`.
- Static checks: `astro check` + lint. Tests never touch a deployed Netlify database (credits and
  data); everything runs locally or in CI.
- Seed and fixtures use the fixed demo reporting date, so date-relative KPIs are deterministic.

## Required suites
| Suite | Covers | Owner |
|-------|--------|-------|
| KPI unit tests | every formula in `kpi-definitions`, hand-calculated fixtures and edge cases | dashboard-analytics-developer writes, qa-tester reviews |
| Domain/service tests | status transitions, verification checklist enforcement, ledger math, cycle-count tolerance | backend-developer |
| API tests | contract shapes, validation errors, **403 for each forbidden role/action** | backend-developer + qa-tester |
| Data tests | migrations from empty, seed determinism & consistency, lot trace | data-model-specialist |
| E2E (Playwright) | the scope §5 demo flow: create → pack/verify → fail → error → rework → ship → KPIs change | qa-tester |
| Accessibility | axe-core on dashboard, shipment form, list pages | qa-tester |

## Acceptance traceability
Maintain `docs/qa/acceptance-matrix.md`: each scope §5 criterion (1–9) → test IDs → last result.

## Bug report format
```
BUG-<nnn> [Critical|High|Medium|Low] <title>
Steps to reproduce / Expected / Actual / Evidence (output, screenshot) / Suspected area & owner
```

## QA report (end of phase)
Totals passed/failed/skipped with the exact command, acceptance matrix status, open bugs by
severity, and a clear GO / NO-GO recommendation. Never mark a failing test as passing; never
skip or delete a test to get green.
