---
name: ci-pipeline
description: Repository layout, local run scripts, GitHub Actions CI and environment-variable conventions for the ManufacturingOpsTeam dashboard. Use when setting up the project skeleton, build/test scripts, CI workflows or release steps.
user-invocable: false
---

# CI pipeline & developer experience

## Repo conventions (adapt to ADR-001)
- One command each, documented in the root README: `setup`, `dev`, `test`, `lint`, `db:reset`
  (migrate + seed), `build`.
- `.env.example` lists every variable with fake values; real `.env` is git-ignored.
- Pin runtime versions (`.nvmrc` / `.python-version`) and dependency lockfiles.

## GitHub Actions (`.github/workflows/ci.yml`)
On push and pull request:
1. Checkout, set up runtime with cache.
2. Install with lockfile (`npm ci` / `pip install -r requirements.txt`).
3. Lint & format check.
4. Unit + API tests (against a local/ephemeral DB, never production).
5. Dependency audit (fail on High/Critical).
6. Build.
7. Optional job: Playwright E2E + axe on the built app with seeded data.

## Rules
- CI must not need real secrets for tests; use generated test values.
- Never disable, skip or quarantine a failing test to get green — report it.
- Deploy is not triggered from CI to production without user approval (see `netlify-deployment`).
- Keep the pipeline under ~10 minutes; cache dependencies.
