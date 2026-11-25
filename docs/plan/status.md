# Project Status Board

Maintained by: orchestrator (Olivia) · Last updated: 2026-11-25

## Current phase
**Phase 1 — Architecture: waiting for user approval of ADR-001.** No implementation may start
until `docs/ADR-001.md` is Accepted and the scope edits it requires are approved.

## Tasks

| Task | Title | Agent | Status | Depends on | Output / notes |
|------|-------|-------|--------|-----------|----------------|
| T-001 | v1 product backlog | product-manager (Priya) | DONE | — | `docs/plan/backlog.md`: 7 epics, 82 stories (76 Must / 4 Should / 2 Could), 20 scope questions (§9) |
| T-002 | ADR-001 stack, persistence & deployment | software-architect (Marcus) | DONE, ADR **Proposed** | — | `docs/ADR-001.md`: recommends Astro SSR + `@astrojs/netlify` + Netlify Database (Postgres) + Chart.js |
| T-003 | User decision: accept/reject ADR-001; Free vs Personal plan contingency; repo visibility | user | WAITING | T-002 | See the decisions list below |
| T-004 | Apply approved scope edits (ADR-001 §11.1) + answer backlog Q-01, Q-05, Q-07, Q-11 | product-manager | TODO (after T-003) | T-003 | Edits `docs/project-scope.md` with a changelog line |
| T-005 | Update docs/07 §7.1–7.4 per ADR-001 §11.2 | software-architect | TODO (after T-003) | T-003 | Mark the original stack as historical; don't delete it |
| T-006 | Align agent/skill references to `docs/ADR-001.md`; TypeScript tooling in skills (ADR-001 §11.3) | agent-builder (Ada) | TODO (after T-003) | T-003 | Must pass `validate-agent-team` |
| T-007 | Technical spike, ≤ 1 day (ADR-001 §12.1) | devops-engineer + backend-developer | TODO (after T-003) | T-003 | Checks DB connection, seed time, CI emulator, middleware placement; marks the ADR Implemented or revises it |
| T-008 | ADR-002 hosting & deploy pipeline | software-architect + devops-engineer | TODO | T-007 | Covers previews and the credit budget |
| T-009 | ADR-003 auth & sessions | software-architect + security-reviewer | TODO | T-003 | |
| T-010 | Phase 2 design: schema, UI spec, API contract | data-model-specialist, ux-ui-designer, backend-developer | TODO | T-004, T-007 | |

## Decisions waiting on the user
1. Accept ADR-001 (Option C) or choose another option.
2. Approve the `docs/project-scope.md` changes in ADR-001 §11.1. They move PostgreSQL and Netlify
   hosting into v1 and add acceptance criterion 10.
3. Netlify plan: stay on Free (300 credits/month, hard stop) and accept the Personal plan as a
   contingency only if usage monitoring shows the risk?
4. Confirm that the GitHub repo will be public, or deployed from a personal account (Free plan
   limitation).
5. Backlog Q-05 (verifier ≠ packer with one seeded user per role), Q-07 (fixed "as of" date for the
   demo dashboard) and Q-11 (permission matrix). Priya's proposed answers are in backlog §9.

## Phase log
- **2026-11-25 Phase 0 & 1 (planning):** T-001 and T-002 ran in parallel. Hand-offs reviewed for
  consistency: the backlog stays technology-neutral, and its blocking question Q-01 is the same
  issue ADR-001 resolves. ADR scoring arithmetic was checked. The ADR claims it could not verify are
  marked [A] and are covered by the spike (T-007).
