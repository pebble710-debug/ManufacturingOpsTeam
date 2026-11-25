---
name: sdlc-orchestration
description: Lifecycle phases, dependency graph, quality gates and delegation templates the Orchestrator uses to plan and run the ManufacturingOpsTeam build. Use when planning, assigning, sequencing or integrating work across the agent team.
user-invocable: false
---

# SDLC orchestration playbook

## Phases and gates

| Phase | Lead agent(s) | Output | Gate to pass before next phase |
|-------|--------------|--------|-------------------------------|
| 0 Plan | product-manager | `docs/plan/backlog.md` (stories + acceptance criteria) | User stories cover every v1 item in `docs/project-scope.md` §3 |
| 1 Architecture | software-architect (+ devops-engineer, security-reviewer consulted) | `docs/ADR-001.md` (stack & persistence); ADR-002+ in `docs/adr/` | ADR-001 **Accepted** (done: conditional on the §12.1 PoC); PoC passes and user gives the go-ahead before Phase 3 |
| 2 Design | data-model-specialist, ux-ui-designer, backend-developer (API contract) | `docs/data-model/schema.md`, `docs/design/ui-spec.md`, `docs/api/contract.md` | Architect reviews for consistency with ADRs |
| 3 Foundation | devops-engineer, data-model-specialist, backend-developer | repo skeleton, CI, schema/migrations, seed script, auth & roles | CI green; seed runs in one command |
| 4 Features | backend, frontend, dashboard-analytics developers | shipments → quality → inventory → KPIs → dashboard → reports (scope §6 order) | Each feature meets `definition-of-done` |
| 5 Verify | qa-tester, security-reviewer | test report, security report | No open Critical/High findings; acceptance criteria scope §5 all pass |
| 6 Release | devops-engineer | Netlify deploy (or documented fallback per ADR-002), demo script | User approval before pushing to `main` / production deploy |

## Dependency rules
- No full implementation until ADR-001's PoC passes and the user gives the go-ahead; only the
  §12.1 PoC spike may run before that (locally first).
- Netlify Free plan only: no upgrades, paid add-ons or purchases without explicit user approval.
- Frontend and dashboard work starts only when the API contract for that area exists.
- KPI module before dashboard charts; seed data before QA of charts.
- Security review before any deploy.

## Delegation brief template

```
Task: T-<nnn> <title>
Agent: <agent-name>
Goal: <one sentence>
Inputs: <docs, ADRs, files, prior hand-offs>
Acceptance criteria: <bullets>
Constraints: v1 scope only; fictional data; follow ADRs; branch <name>
Depends on: T-<ids>   Blocks: T-<ids>
Report using handoff-protocol.
```

## Tracking
Keep `docs/plan/status.md` as a table: Task · Agent · Status (TODO/IN PROGRESS/BLOCKED/DONE) ·
Depends on · Notes. Update it after every hand-off.

## Integration
After each phase: read all hand-offs, resolve conflicts (escalate scope conflicts to
product-manager, technical conflicts to software-architect), run the test suite, and write a short
phase summary to `docs/plan/status.md`.

## When to call agent-builder
A recurring task with no owner, an agent repeatedly going out of role, or a missing skill.
