# Project Status Board

Maintained by: orchestrator (Olivia) · Last updated: 2026-11-26

## Current phase
**Phase 2 (Design) and local technical verification are COMPLETE. Waiting for the user's review
and go-ahead before Phase 3 (Foundation) implementation.**
Architecture verdict (T-016): **Ready with conditions** (see `docs/plan/consistency-review.md`).
QA verdict (T-017): **GO** at the planning gate (see `docs/qa/test-report-2026-11-26.md`).
Nothing has been provisioned or deployed on Netlify. No purchases or plan changes.

## Tasks

| Task | Title | Agent | Status | Output |
|------|-------|-------|--------|--------|
| T-001 | v1 product backlog | product-manager | DONE | `docs/plan/backlog.md` |
| T-002 | ADR-001 stack decision | software-architect | DONE | `docs/ADR-001.md` |
| T-003 | User decision on ADR-001 | user | DONE (conditional approval 2026-11-25) | — |
| T-004 | Scope update, V1-CORE cut, permissions draft | product-manager | DONE | `docs/project-scope.md`, backlog Release labels (40 core cards + 26 merged, 18 deferred), `docs/plan/permissions-matrix.md` |
| T-005 | ADR-001 conditional acceptance; docs/07 superseded | software-architect | DONE | `docs/ADR-001.md` §0, `docs/07-software-design.md` §7.1 |
| T-006 | Fix ADR refs and tooling in agents/skills | agent-builder | DONE | `.claude/`, `CLAUDE.md`, `docs/software-team.md` |
| T-007 | Local proof of concept | devops-engineer | DONE (local PASS; hosted checks pending) | `docs/poc/poc-report.md`, `spikes/poc-astro-netlify-db/` |
| T-011 | Fold PoC results into ADR-001 | software-architect | DONE | `docs/ADR-001.md` §15 |
| T-012 | Schema, migrations plan, seed plan | data-model-specialist | DONE | `docs/data-model/` |
| T-013 | UI specification | ux-ui-designer | DONE (rev 2) | `docs/design/ui-spec.md` |
| T-014 | API contract | backend-developer | DONE (draft 2) | `docs/api/contract.md` |
| T-015 | Permissions review, security plan, threat model | security-reviewer | DONE | `docs/plan/permissions-matrix.md` (REVIEWED), `docs/security/` |
| T-016 | Architecture consistency review | software-architect | DONE (Ready with conditions) | `docs/plan/consistency-review.md` |
| T-017 | Planning-phase tests | qa-tester | DONE (GO) | `spikes/schema-check/`, `docs/qa/` |
| T-008 | ADR-002 hosting & deploy pipeline | software-architect + devops-engineer | TODO | Required before any deploy |
| T-009 | ADR-003 auth, sessions, CSRF/form model | software-architect + security-reviewer | TODO | Required before auth work (batch B1) |
| T-018 | Hosted PoC on the user's Netlify Free account | devops-engineer | BLOCKED (user account check + go-ahead) | PoC report §6 checklist |
| T-019 | Product confirmations (P-1, P-2, reopen/contain rows, notes after ship, US-012, severity wording) | product-manager + user | TODO | See consistency-review open items |
| T-020 | KPI method choices (KPI-7 headline, KPI-3 anchor, FPY with customer errors, P90, payload shapes) | dashboard-analytics-developer | TODO | Required before batch B5 |

## Latest verification (2026-11-26, re-run by orchestrator)
| Check | Result |
|-------|--------|
| `python3 .claude/skills/validate-agent-team/validate.py` | PASS, 0 warnings (12 agents, 19 skills) |
| `claude plugin validate .claude/agents` | Validation passed |
| Schema harness `spikes/schema-check` (`npm test`) | 82/82 passed |
| PoC `spikes/poc-astro-netlify-db` (`npm test`) | 17/17 passed |
| PoC `npx astro check` | 0 errors |
| PoC `npm audit --audit-level=high` | exit 0 (10 moderate, accepted and tracked) |

## Phase log
- **2026-11-25 Phase 0–1:** backlog and ADR-001; user conditionally approved ADR-001 with Free-plan
  and no-purchase conditions.
- **2026-11-25 Phase 1 follow-up:** scope updated; V1-CORE defined; agents/skills aligned; local
  PoC passed.
- **2026-11-25/26 Phase 2:** interrupted by the usage limit; resumed without repeating finished work.
  Schema, API contract, UI spec and security plan completed and reconciled (18 decisions in
  consistency-review.md); schema harness 82/82.
