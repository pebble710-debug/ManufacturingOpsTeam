---
name: ci-pipeline
description: Repository layout, local run scripts, GitHub Actions CI and environment-variable conventions for the ManufacturingOpsTeam dashboard. Use when setting up the project skeleton, build/test scripts, CI workflows or release steps.
user-invocable: false
---

# CI pipeline & developer experience

Stack per ADR-001 (`docs/ADR-001.md` §5): Node.js 22.23.5 (22 LTS), npm, TypeScript, Astro, Vitest,
Playwright. Deploys happen through Netlify's Git integration, not CI.

## Repo conventions
- npm scripts, documented in the root README: `dev` (`astro dev`), `build` (`astro build`),
  `check` (`astro check`), `lint`, `test` (Vitest), `test:e2e` (Playwright), `db:reset-seed`.
  Local setup: `nvm use && npm ci && npm run dev` → `netlify database migrations apply` →
  `npm run db:reset-seed`.
- `.env.example` lists every variable with fake values; real `.env` is git-ignored.
- Pin Node in `.nvmrc` (and Netlify `NODE_VERSION`); exact dependency versions plus a committed
  `package-lock.json`. Netlify CLI is a dev dependency.

## GitHub Actions (`.github/workflows/ci.yml`)
On push and pull request:
1. Checkout; `actions/setup-node` with `node-version-file: .nvmrc` and npm cache.
2. `npm ci` (lockfile only; never `npm install` in CI).
3. `npx astro check` + `npm run lint` (incl. the `sql.unsafe` / `set:html` ban check).
4. `npm test` — Vitest unit + integration against `@netlify/database-dev` (never a deployed DB).
5. `npm audit --audit-level=high` (fail on High/Critical).
6. `npm run build`.
7. Playwright E2E (Chromium) + axe against `astro dev` with seeded test fixtures.
8. Secret scan (tool chosen in ADR-002).

## Rules
- CI must not need real secrets for tests; use generated test values.
- Never disable, skip or quarantine a failing test to get green — report it.
- CI never deploys. Netlify's Git integration deploys; production deploys (merge to `main`) need
  user approval and cost Free-plan credits (see `netlify-deployment`).
- Keep the pipeline under ~10 minutes; cache dependencies.
