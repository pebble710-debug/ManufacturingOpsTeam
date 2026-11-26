# Version 1 Build Plan

Owner: orchestrator (Olivia) · Started: 2026-11-26 · The user approved building Version 1.

## User decisions (2026-11-26), binding on every agent
| # | Decision | Reconciled by |
|---|----------|---------------|
| UD-1 | A late-shipment reason is required whenever ship_date > promise_date, **regardless of tolerance**. Tolerance affects KPI-1 only. | Marcus (contract, schema), Priya (backlog) |
| UD-2 | A user may **not approve a cycle count they performed (entered/recounted any line) or submitted**. | Marcus, Dana, Priya |
| UD-3 | **Shipped** (and Cancelled) shipments are **locked** against direct edits. Corrections go through an audited correction action (Supervisor; reason required; audit row with old→new). No notes editing after ship except via correction. | Marcus, Priya |
| UD-4 | **Reopen** (Rework→Packing) and **contain** (packaging error) are allowed for **Supervisor and Quality**, enforced server-side. | Priya (matrix), Marcus (contract) |
| UD-5 | Packaging-error severity = **Low, Medium, High, Critical**. | Marcus, Dana, Maya |
| UD-6 | **Delivered** status is removed from v1 (no carrier integration). | Marcus, Dana, Priya |
| UD-7 | **First-count** inventory accuracy is the primary KPI-7 metric (after-recount may be shown as secondary). | Kenji |
| UD-8 | Packaging error rate uses the **actual ship date** as the reporting basis; formula documented and tested. | Kenji |
| UD-9 | **Customer-found** packaging errors count against first-pass yield when they relate to the original packaging process. | Kenji |
| UD-10 | One consistent, documented **P90** method (percentile_cont, linear interpolation) everywhere. | Kenji |

Also required: a **Resources** page linked from the header or footer, listing official
documentation (Astro, Netlify, PostgreSQL, Chart.js, OWASP, WCAG), the GitHub repository
(https://github.com/pebble710-debug/ManufacturingOpsTeam), and the project research docs.

## Directory ownership (avoid collisions when agents work in parallel)
| Area | Owner |
|------|-------|
| `package.json`, lockfile, `astro.config.mjs`, `tsconfig.json`, `netlify.toml`, `.nvmrc`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/`, `scripts/migrate.ts`, `docs/adr/ADR-002-*` | devops-engineer (Theo) |
| `netlify/database/migrations/**`, `src/lib/db.ts`, `src/lib/seed/**`, `scripts/reset-seed.ts`, `tests/integration/db/**`, `spikes/schema-check` | data-model-specialist (Dana) |
| `src/middleware.ts`, `src/lib/auth/**`, `src/lib/http/**`, `src/lib/validation/**`, `src/lib/repos/**`, `src/lib/services/**`, `src/lib/audit.ts`, `src/pages/api/v1/**` (except kpis), `tests/integration/api/**`, `tests/unit/services/**` | backend-developer (Diego) |
| `src/layouts/**`, `src/components/**` (except `dashboard/`), `src/pages/**` (except `api/` and `dashboard`), page form handlers | frontend-developer (Felix) |
| `src/lib/kpi/**`, `src/components/dashboard/**`, `src/pages/dashboard.astro`, `src/scripts/charts.ts`, `src/pages/api/v1/kpis/**`, `tests/unit/kpi/**`, `docs/kpi/` | dashboard-analytics-developer (Kenji) |
| `src/styles/**`, `docs/design/**` | ux-ui-designer (Maya) |
| `tests/e2e/**`, `docs/qa/**` | qa-tester (Quinn) |
| `docs/security/**`, `tests/security/**` | security-reviewer (Sasha) |
| `docs/adr/ADR-003-*`, `docs/plan/consistency-review.md`, cross-doc reconciliation edits | software-architect (Marcus) |
| `docs/project-scope.md`, `docs/plan/backlog.md`, `docs/plan/permissions-matrix.md`, `docs/plan/resources.md`, `docs/plan/demo-script.md` | product-manager (Priya) |

Shared contracts: `docs/api/contract.md` (service and API shapes), `docs/data-model/schema.md`
(tables), `docs/design/ui-spec.md` (screens). Change the contract first, then the code. If you
need a change in someone else's area, say so in your hand-off; don't edit it.

## Waves
| Wave | Work | Depends on |
|------|------|-----------|
| W1 | Priya: decisions → backlog/scope/matrix, Resources content · Marcus: ADR-003 draft + decisions → contract/schema docs · Kenji: KPI spec (UD-7..10) · Theo: ADR-002 + app skeleton + CI · Maya: CSS tokens/components stylesheet | — |
| W1.5 | Sasha: review ADR-002, ADR-003 and decision edits | W1 |
| W2 | Dana: migration file, db client, seed, db tests · Diego: auth/session/CSRF/middleware/permissions + services + API · Kenji: KPI module + tests · Felix: layout, shell, login, Resources, shared components | W1, ADR-003 accepted |
| W3 | Felix: domain pages and forms · Kenji: dashboard page + charts · Diego: remaining services/fixes | W2 |
| W4 | Quinn: E2E + acceptance + accessibility · Sasha: security review · Theo: CI green, build check | W3 |
| W5 | Fixes · Marcus: integration review · Olivia: final checks, report | W4 |

Rules: local only, with no Netlify provisioning or deploys, no purchases and fictional data only.
Commit tested work to `main` as each wave completes.
