---
name: project-context
description: Shared project briefing for every ManufacturingOpsTeam agent. Use at the start of any task on the Manufacturing Shipping & Inventory Operations Dashboard to load the v1 scope, the docs map, the team roster and the non-negotiable project rules.
user-invocable: false
---

# Project context — Manufacturing Shipping & Inventory Operations Dashboard

Educational prototype for a graduate AI class, built by a team of Claude Code subagents.
The fictional company is **Cobalt Ridge Components, Inc.** (Riverton plant).

## Non-negotiable rules

1. **Scope contract:** `docs/project-scope.md` defines version 1. Anything listed under
   "Out of scope / postponed to version 2" is not built in v1. A scope change needs an explicit,
   committed edit to `docs/project-scope.md` approved by the Product Manager and the user.
2. **Fictional data only.** Follow the `fictional-data-guardrails` skill. Never connect to a real
   ERP, MES, carrier or aerospace system. Never use real customer, employer or proprietary data.
3. **Architecture per ADR-001.** ADR-001 (stack, persistence & deployment) lives at
   **`docs/ADR-001.md`** and is **accepted conditionally** pending the §12.1 proof of concept.
   No full application implementation until the PoC passes and the user gives the go-ahead.
   Later ADRs (ADR-002 onward) live in `docs/adr/ADR-<nnn>-<slug>.md`. SQLite is not used:
   Netlify Functions are ephemeral and do not run Python.
4. **One source of truth for KPIs:** formulas in `docs/05-performance-metrics.md`, implemented in
   one KPI module (see `kpi-definitions` skill).
5. **Research tags:** when writing docs, keep the [R] researched / [A] assumption / [P] proposed
   convention from `docs/README.md`.
6. **Do not edit the research docs `docs/01-*` … `docs/08-*`, `docs/sources.md`** except to fix a
   confirmed error, and say so in the commit message.
7. **Netlify Free plan only** (300 credits/month, hard stop; all projects pause when exhausted).
   No plan upgrades, paid add-ons, auto-purchase of credits or any purchase without explicit user
   approval. Work **local-first**; see `netlify-deployment`.

## Accepted stack (ADR-001 §5, summary)

| Concern | Choice |
|---------|--------|
| Language / runtime | TypeScript (strict), Node.js 24 LTS (`.nvmrc`) |
| App | Astro SSR (`output: 'server'`) + `@astrojs/netlify`; pages + `/api/v1/*` endpoints run as Netlify Functions; one Netlify site |
| Database | Netlify Database (managed Postgres) everywhere; local emulator via `astro dev` / `netlify dev`; `@netlify/database-dev` in tests |
| Data access | postgres.js tagged templates in `src/lib/db.ts` + `src/lib/repos/`; no ORM; `sql.unsafe` banned |
| Migrations | Native Netlify SQL migrations in `netlify/database/migrations/`, forward-only (expand/contract) |
| Validation | Zod (via `astro/zod`) |
| Auth | `node:crypto` scrypt; DB-backed sessions; Astro `checkOrigin` + synchronizer CSRF token (ADR-003 finalizes) |
| Charts | Chart.js 4.x bundled from npm |
| Tests / checks | Vitest (unit + integration), Playwright (e2e), `astro check`, `npm audit --audit-level=high` |
| CI / deploy | GitHub Actions for checks; Netlify Git integration deploys (production only with user approval) |
| Seed | Deterministic TS generator; `npm run db:reset-seed`; Admin-only env-gated demo reset |

## User decisions (2026-11-25)
- ADR-001 Option C accepted conditionally, pending the PoC (ADR-001 §12.1).
- Netlify **Free plan** only; no purchases or upgrades without explicit approval.
- The GitHub repo is **public** (Free plan does not support org-owned private repos for contributors).
- **Verifier ≠ packer** is always enforced server-side; **Quality and Supervisor** users are
  allowed to verify. Seed 7 fictional demo users (incl. two Shipping users) per `docs/plan/permissions-matrix.md` §4.
- A **fixed demo reporting date** anchors the seed and the dashboard's "today" (reproducible KPIs).
- Application roles: **Admin, Supervisor, Shipping, Receiving, Quality**.

## Docs map

| File | Use it for |
|------|-----------|
| `docs/project-scope.md` | What v1 includes, acceptance criteria, sample-data plan, v2 backlog, build order |
| `docs/01-outgoing-shipment-tracking.md` | Shipment dates, carriers, tracking, status lifecycle |
| `docs/02-packaging-quality.md` | Error taxonomy, rework, mistake-proofing checklist |
| `docs/03-inventory-management.md` | Receiving, transaction ledger, cycle counts, lot trace |
| `docs/04-shipping-workflows-coordination.md` | Workflow, RACI, daily rhythm |
| `docs/05-performance-metrics.md` | KPI formulas and targets |
| `docs/06-lean-six-sigma.md` | Root cause (6 M), 5 Whys, DMAIC, corrective action |
| `docs/07-software-design.md` | Security checklist, roles, UX rules (§7.1 stack superseded by ADR-001) |
| `docs/ADR-001.md` | **ADR-001** stack, persistence & deployment (accepted conditionally, pending PoC) |
| `docs/08-data-model-forms-charts-reports.md` | Tables, fields, forms F1–F10, charts C1–C6, reports R1–R8 |
| `docs/software-team.md` | Team roster, models, skills, responsibilities |
| `docs/adr/` | Later ADRs (ADR-002 onward), created by the Software Architect |
| `docs/plan/` | Backlog, user stories, iteration plans (Product Manager / Orchestrator) |

## Team (subagent name → person)

orchestrator (Olivia) · product-manager (Priya) · software-architect (Marcus) ·
ux-ui-designer (Maya) · frontend-developer (Felix) · backend-developer (Diego) ·
data-model-specialist (Dana) · dashboard-analytics-developer (Kenji) · qa-tester (Quinn) ·
security-reviewer (Sasha) · devops-engineer (Theo) · agent-builder (Ada)

## Knowledge folders

Each agent owns `knowledge/<agent-name>/`. Read your own folder at the start of a task, and
append durable lessons, decisions and checklists there at the end. Read other agents' folders
when you depend on their work; do not edit them.
