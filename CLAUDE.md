# CLAUDE.md — ManufacturingOpsTeam

This repository builds the **Manufacturing Shipping & Inventory Operations Dashboard**, an
educational prototype for a graduate AI class, using a team of specialized Claude Code subagents.
All companies, customers, parts and records are **fictional** (fictional manufacturer: Cobalt
Ridge Components, Inc.).

## Ground rules for every session and agent
1. **Version 1 scope is a contract:** `docs/project-scope.md`. v2 items (§4) are not built.
2. **Fictional data only.** No real ERP/MES/carrier/aerospace connections, no confidential or
   proprietary information, no compliance claims.
3. **Architecture gate:** ADR-001 (stack, persistence & deployment) is at `docs/ADR-001.md` and is
   **Accepted conditionally**, pending the §12.1 proof of concept (PoC). No full application
   implementation until the PoC passes and the user gives the go-ahead. Accepted stack: TypeScript,
   Astro SSR + `@astrojs/netlify`, Netlify Database (Postgres) via postgres.js, native forward-only
   SQL migrations, Zod, scrypt + DB-backed sessions, Chart.js (npm), Vitest + Playwright,
   `npm audit`, GitHub Actions. SQLite is not used (Netlify Functions are ephemeral). Later ADRs
   (ADR-002+) live in `docs/adr/ADR-<nnn>-<slug>.md`.
4. **One KPI module** implementing `docs/05-performance-metrics.md`.
5. **Research docs** `docs/01`–`docs/08`, `docs/sources.md` are reference material — don't rewrite them.
6. Push to `main` or deploy to production only with explicit user approval.
7. **Netlify Free plan only** (300 credits/month, hard stop — all projects pause when exhausted).
   No plan upgrades, paid add-ons, auto-recharge or any purchase without explicit user approval.
   Develop and test locally first; keep production deploys and preview builds to a minimum.

## The team

| Agent | Person | Model | Role |
|-------|--------|-------|------|
| `orchestrator` | Olivia | opus | Coordinates the lifecycle, assigns work, manages dependencies, integrates results |
| `product-manager` | Priya | sonnet | Backlog, user stories, acceptance criteria, scope guard |
| `software-architect` | Marcus | opus | Stack evaluation (Netlify), ADRs, design reviews |
| `ux-ui-designer` | Maya | sonnet | UI spec, wireframes, accessibility |
| `frontend-developer` | Felix | sonnet | Pages, forms, tables, reports UI |
| `backend-developer` | Diego | sonnet | API contract, business rules, auth/roles, ledger postings |
| `data-model-specialist` | Dana | sonnet | Schema, migrations, lot trace, fictional seed data |
| `dashboard-analytics-developer` | Kenji | sonnet | KPI module, KPI tiles, charts |
| `qa-tester` | Quinn | sonnet | Tests, acceptance matrix, GO/NO-GO |
| `security-reviewer` | Sasha | opus | OWASP review, secrets/dependencies, release sign-off |
| `devops-engineer` | Theo | sonnet | Scripts, CI, Netlify deploy |
| `agent-builder` | Ada | opus | Creates/improves agents and skills; runs validation |

Full roster, skills and responsibilities: [`docs/software-team.md`](docs/software-team.md).

## How the agents collaborate
- **Olivia (orchestrator)** owns the plan in `docs/plan/status.md` and delegates tasks with a
  brief (task ID, inputs, acceptance criteria, dependencies). Agents return a standard hand-off
  report (`handoff-protocol` skill): status, files changed, how to verify, decisions, risks.
- Lifecycle and gates (`sdlc-orchestration` skill): Plan → Architecture (ADR-001 gate) → Design
  (schema, UI spec, API contract) → Foundation (skeleton, CI, migrations, seed, auth) → Features →
  Verify (QA + security) → Release.
- Upstream artifacts are contracts: ADRs (`docs/ADR-001.md`, later ones in `docs/adr/`), schema (`docs/data-model/`), API contract
  (`docs/api/`), UI spec (`docs/design/`). Agents report **BLOCKED** rather than inventing a
  missing upstream decision.
- Conflicts: scope → Priya (and the user); technical → Marcus; Olivia integrates.
- Each agent keeps durable lessons in `knowledge/<agent-name>/`.
- Shared skills live in `.claude/skills/` and are preloaded via each agent's `skills:` list.

## How to ask the orchestrator to build software
Interactive session — mention the agent:

```text
@orchestrator Run Phase 2 design (schema, UI spec, API contract) per docs/ADR-001.md and the PoC from ADR-001 §12.1 locally first. Stop for my approval before any full implementation.
```

Run the orchestrator as the main session agent (it can then delegate to the whole team):

```bash
claude --agent orchestrator
```

Later, after the PoC passes and you give the go-ahead:

```text
@orchestrator The ADR-001 PoC passed. Build version 1 per docs/project-scope.md on a feature branch, phase by phase, and report after each phase with test results.
```

Useful single-agent requests: `@software-architect review ADR-001 options`,
`@qa-tester run the acceptance matrix`, `@agent-builder add a skill for <need>`.

## Changing the team
Ask `@agent-builder`. It follows the `agent-authoring` skill, updates this file and
`docs/software-team.md`, and must pass:

```bash
python3 .claude/skills/validate-agent-team/validate.py
```

## Repository map
- `docs/` — research (01–08, sources), `project-scope.md`, `software-team.md`, `ADR-001.md`,
  `plan/`; later `adr/` (ADR-002+), `design/`, `api/`, `data-model/`, `qa/`, `security/`
- `.claude/agents/` — 12 subagents · `.claude/skills/` — 19 skills
- `knowledge/` — one folder per agent

## Status
**Phase 2 design and local technical verification complete (2026-11-26); waiting for the user's
review and go-ahead before full implementation.** ADR-001 (`docs/ADR-001.md`) is accepted
conditionally; the local PoC passed, while hosted Netlify verification awaits the user's account
check. Architecture verdict: Ready with conditions (`docs/plan/consistency-review.md`). Plan and
task status: `docs/plan/status.md`.
