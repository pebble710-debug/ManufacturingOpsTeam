# Software Team — AI Agent Roster

**Created:** 2026-11-25 · **Project:** Manufacturing Shipping & Inventory Operations Dashboard
(educational prototype) · **Platform:** Claude Code project subagents (`.claude/agents/`) and
project skills (`.claude/skills/`)

Formats follow the official Claude Code docs, reviewed 2026-11-25:
[Subagents](https://code.claude.com/docs/en/sub-agents) · [Skills](https://code.claude.com/docs/en/skills).

## 1. Roster

| # | Agent (`name`) | Person | Model | Color | Core responsibility |
|---|----------------|--------|-------|-------|--------------------|
| 1 | `orchestrator` | Olivia | opus | purple | Plans the SDLC, assigns tasks, manages dependencies and gates, integrates results |
| 2 | `product-manager` | Priya | sonnet | blue | Backlog, user stories, acceptance criteria, scope guard (v1 vs v2), demo script |
| 3 | `software-architect` | Marcus | opus | orange | ADRs (ADR-001 at `docs/ADR-001.md`, later in `docs/adr/`); Netlify stack evaluation; module boundaries; design reviews |
| 4 | `ux-ui-designer` | Maya | sonnet | pink | UI spec, wireframes, design tokens, form flows, accessibility |
| 5 | `frontend-developer` | Felix | sonnet | cyan | Pages, forms F1–F10, tables, reports UI, client validation |
| 6 | `backend-developer` | Diego | sonnet | green | API contract, business rules, auth & roles, workflows, ledger postings, audit log |
| 7 | `data-model-specialist` | Dana | sonnet | yellow | Schema, migrations, append-only ledger, lot trace, deterministic fictional seed data |
| 8 | `dashboard-analytics-developer` | Kenji | sonnet | blue | Single KPI module, KPI tiles, charts C1–C6, analytics reports |
| 9 | `qa-tester` | Quinn | sonnet | red | Test plan, E2E/API/KPI/accessibility tests, acceptance matrix, GO/NO-GO |
| 10 | `security-reviewer` | Sasha | opus | red | OWASP 2025 review, dependency/secret checks, data-policy check, release sign-off |
| 11 | `devops-engineer` | Theo | sonnet | green | Repo skeleton, scripts, CI, Netlify config & deploy, env vars, rollback |
| 12 | `agent-builder` | Ada | opus | purple | Creates/improves agents & skills, keeps roster docs and validation passing |

No extra specialist was added. A manufacturing-domain role is covered by the Product Manager
(requirements) plus the research docs; a technical writer role is covered by each agent's
docs deliverables. The Agent Builder can add one later if a repeated need appears.

### Model assignment rationale
- **opus** (4 agents) — open-ended reasoning where mistakes are costly: cross-team coordination
  (Orchestrator), stack/persistence evaluation (Architect), security judgment (Security
  Reviewer), designing other agents (Agent Builder).
- **sonnet** (8 agents) — well-specified implementation, design, test and pipeline work guided by
  ADRs, specs and skills.
- **haiku** — not assigned in v1; no agent has a narrow, high-volume, low-risk job. The Agent
  Builder may introduce one (e.g., a doc-link checker) if needed.

## 2. Skills

All skills are project skills in `.claude/skills/<skill-name>/SKILL.md`, preloaded into agents
via the `skills:` frontmatter field (full content injected at start-up). Background skills set
`user-invocable: false`.

### Shared skills
| Skill | Purpose | Used by |
|-------|---------|---------|
| `project-context` | v1 rules, docs map, team, knowledge folders | all 12 |
| `fictional-data-guardrails` | Fictional cast, ID formats, no real systems/data | 11 (all except agent-builder) |
| `handoff-protocol` | Task intake, BLOCKED rule, standard hand-off report | all 12 |
| `definition-of-done` | Feature completion checklist | orchestrator, product-manager, frontend, backend, data-model, dashboard, qa, devops |
| `kpi-definitions` | Exact KPI formulas, targets, edge cases | product-manager, backend, data-model, dashboard, qa |
| `security-review-checklist` | OWASP 2025-mapped controls, severity, report format | software-architect, backend, security-reviewer, devops |
| `accessibility-check` | WCAG 2.2 AA checklist | ux-ui-designer, frontend, dashboard, qa |
| `api-contract` | Endpoint conventions, contract template | software-architect, frontend, backend, dashboard |
| `netlify-deployment` | Netlify constraints & deploy checklist | software-architect, security-reviewer, devops |
| `schema-and-seed-data` | Schema rules, ledger, seed generator rules | software-architect, backend, data-model |
| `ui-design-system` | Layout, tokens, badges, forms, tables | ux-ui-designer, frontend |
| `dashboard-charts` | KPI tiles, charts C1–C6, chart rules | ux-ui-designer, dashboard |
| `validate-agent-team` | Validator script for agents/skills/roster | orchestrator, agent-builder |

### Role-specific skills
| Skill | Purpose | Used by |
|-------|---------|---------|
| `sdlc-orchestration` | Phases, gates, dependency rules, delegation template, status board | orchestrator |
| `user-stories` | Story format, traceability, scope-change procedure | product-manager |
| `architecture-decision-records` | ADR template, criteria, ADR-001 summary (decided) | software-architect |
| `test-strategy` | Test suites, acceptance matrix, bug/QA report formats | qa-tester |
| `ci-pipeline` | Scripts, GitHub Actions, env conventions | devops-engineer |
| `agent-authoring` | Official formats, model/tool rules, roster update steps | agent-builder |

**Total: 19 skills** (13 shared, 6 role-specific).

## 3. Agent preloaded skills

| Agent | Skills |
|-------|--------|
| orchestrator | project-context, fictional-data-guardrails, handoff-protocol, sdlc-orchestration, definition-of-done, validate-agent-team |
| product-manager | project-context, fictional-data-guardrails, handoff-protocol, user-stories, kpi-definitions, definition-of-done |
| software-architect | project-context, fictional-data-guardrails, handoff-protocol, architecture-decision-records, netlify-deployment, api-contract, schema-and-seed-data, security-review-checklist |
| ux-ui-designer | project-context, fictional-data-guardrails, handoff-protocol, ui-design-system, accessibility-check, dashboard-charts |
| frontend-developer | project-context, fictional-data-guardrails, handoff-protocol, ui-design-system, accessibility-check, api-contract, definition-of-done |
| backend-developer | project-context, fictional-data-guardrails, handoff-protocol, api-contract, schema-and-seed-data, security-review-checklist, kpi-definitions, definition-of-done |
| data-model-specialist | project-context, fictional-data-guardrails, handoff-protocol, schema-and-seed-data, kpi-definitions, definition-of-done |
| dashboard-analytics-developer | project-context, fictional-data-guardrails, handoff-protocol, kpi-definitions, dashboard-charts, api-contract, accessibility-check, definition-of-done |
| qa-tester | project-context, fictional-data-guardrails, handoff-protocol, test-strategy, kpi-definitions, accessibility-check, definition-of-done |
| security-reviewer | project-context, fictional-data-guardrails, handoff-protocol, security-review-checklist, netlify-deployment |
| devops-engineer | project-context, fictional-data-guardrails, handoff-protocol, ci-pipeline, netlify-deployment, security-review-checklist, definition-of-done |
| agent-builder | project-context, handoff-protocol, agent-authoring, validate-agent-team |

## 4. Responsibilities, deliverables and collaboration

| Agent | Key deliverables | Works with | Must not |
|-------|-----------------|-----------|----------|
| orchestrator | `docs/plan/status.md`, phase summaries, release report | everyone | Write feature code; push to `main`/deploy without user approval |
| product-manager | `docs/plan/backlog.md`, `docs/plan/demo-script.md`, acceptance notes | orchestrator, qa, all devs | Choose tech; edit scope without user approval |
| software-architect | `docs/ADR-001.md`, `docs/adr/ADR-002…005`, `docs/architecture.md` | devops, security, data-model, backend | Let full implementation start before the ADR-001 PoC passes and the user gives the go-ahead |
| ux-ui-designer | `docs/design/ui-spec.md`, mockups, UX reviews | frontend, dashboard, product-manager | Write production code; use color alone for meaning |
| frontend-developer | Pages, forms, tables, front-end tests | ux, backend, dashboard | Call undocumented endpoints; implement KPI math |
| backend-developer | API, `docs/api/contract.md`, auth/roles, tests | data-model, frontend, dashboard, security | Change schema ad hoc; reinterpret KPIs |
| data-model-specialist | `docs/data-model/schema.md`, migrations, seed, fixtures | architect, backend, dashboard, qa | Use non-fictional data |
| dashboard-analytics-developer | KPI module + tests, dashboard, charts | backend, ux, frontend, qa | Duplicate KPI formulas outside the module |
| qa-tester | Tests, `docs/qa/acceptance-matrix.md`, test reports, bugs | all devs, product-manager | Skip/weaken tests; change feature code |
| security-reviewer | `docs/security/review-*.md`, threat model, sign-off | architect, backend, devops | Rewrite features; print secrets |
| devops-engineer | Scripts, CI, `netlify.toml`, deploy & rollback docs | architect, security, qa | Commit secrets; deploy without GO + approval |
| agent-builder | Agent/skill files, roster updates, validator output, changelog | orchestrator | Weaken project rules; grow the team without need |

### Workflow (from `sdlc-orchestration`)
`0 Plan (Priya)` → `1 Architecture: ADR-001 gate (Marcus + Theo, Sasha)` →
`2 Design (Dana schema · Maya UI spec · Diego API contract)` →
`3 Foundation (Theo skeleton/CI · Dana migrations/seed · Diego auth)` →
`4 Features (shipments → quality → inventory → KPIs → dashboard → reports)` →
`5 Verify (Quinn tests · Sasha review)` → `6 Release (Theo, after user approval)`.

## 5. Knowledge folders
Each agent has `knowledge/<agent-name>/README.md` describing what durable information it keeps
(lessons, evidence, checklists). See [`knowledge/README.md`](../knowledge/README.md).

## 6. Architecture decision (ADR-001)
`docs/07-software-design.md` §7.1 originally proposed Flask + SQLite + Chart.js, and
`docs/project-scope.md` §4 deferred PostgreSQL and cloud hosting to v2 (historical). The new
requirement was **Netlify compatibility**: Netlify Functions do not run Python and are ephemeral,
so SQLite cannot persist there. **ADR-001 (`docs/ADR-001.md`) resolved this** and was accepted
conditionally by the user on 2026-11-25, pending the §12.1 proof of concept:

- TypeScript, Astro SSR + `@astrojs/netlify`, Netlify Database (Postgres) via postgres.js,
  native forward-only SQL migrations, Zod, scrypt + DB-backed sessions, Chart.js from npm,
  Vitest + Playwright, `npm audit`, GitHub Actions.
- Netlify **Free plan only** (300 credits/month, hard stop); no upgrades or purchases without
  explicit user approval; local-first development.
- No full application implementation until the PoC passes and the user gives the go-ahead.
- Later ADRs (ADR-002 onward) live in `docs/adr/`. Scope changes go through the Product Manager
  and the user.

## 7. Validation
Run `python3 .claude/skills/validate-agent-team/validate.py` from the repo root (and optionally
`claude plugin validate .claude/agents`). See `CLAUDE.md` for the latest result.
