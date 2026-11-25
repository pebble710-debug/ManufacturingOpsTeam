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
3. **Netlify-compatible, simple architecture.** The Software Architect's ADRs in `docs/adr/`
   decide the stack. Do not implement anything until ADR-001 (stack & persistence) is accepted.
   Do **not** assume SQLite will persist inside Netlify Functions.
4. **One source of truth for KPIs:** formulas in `docs/05-performance-metrics.md`, implemented in
   one KPI module (see `kpi-definitions` skill).
5. **Research tags:** when writing docs, keep the [R] researched / [A] assumption / [P] proposed
   convention from `docs/README.md`.
6. **Do not edit the research docs `docs/01-*` … `docs/08-*`, `docs/sources.md`** except to fix a
   confirmed error, and say so in the commit message.

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
| `docs/07-software-design.md` | Security checklist, roles, UX rules (stack section superseded by ADR-001) |
| `docs/08-data-model-forms-charts-reports.md` | Tables, fields, forms F1–F10, charts C1–C6, reports R1–R8 |
| `docs/software-team.md` | Team roster, models, skills, responsibilities |
| `docs/adr/` | Architecture Decision Records (created by the Software Architect) |
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
