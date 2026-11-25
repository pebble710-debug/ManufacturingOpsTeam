---
name: architecture-decision-records
description: How to evaluate technology options and record Architecture Decision Records (ADRs) for the ManufacturingOpsTeam prototype; ADR-001 (stack & persistence, docs/ADR-001.md) is decided, so use the template for ADR-002 onward. Use when making or reviewing any stack, hosting, persistence or structural decision.
user-invocable: false
---

# Architecture Decision Records

**ADR-001 lives at `docs/ADR-001.md`** (user-chosen path; do not move it). Store **later ADRs
(ADR-002 onward)** in `docs/adr/ADR-<nnn>-<slug>.md`.
Status: Proposed → Accepted | Rejected | Superseded. Implementation may only rely on **Accepted**
ADRs. A conditional acceptance (e.g., pending a proof of concept) allows only the named PoC work
until the user gives the go-ahead.

## Template

```
# ADR-<nnn>: <title>
Status: Proposed | Accepted (date, approved by) | Superseded by ADR-<x>
Date: YYYY-MM-DD   Author: software-architect (Marcus)
## Context            (requirements, constraints, docs refs)
## Options considered (≥ 2; each with pros, cons, risks, effort)
## Evaluation         (scored table against the criteria below)
## Decision
## Consequences       (what changes in docs/07, scope, team tasks)
## Evidence           (links with access date; mark [R]/[A])
```

## Evaluation criteria (weight)
1. Works on **Netlify** with persistent shared data (high)
2. Simplicity for a small AI agent team / class timeline (high)
3. Supports v1 scope §3 incl. roles, audit log, ledger, reports (high)
4. Security posture per `docs/07-software-design.md` §7.2 (medium)
5. Local dev + automated tests easy (medium)
6. Cost: free tier sufficient for a demo (medium)

## ADR-001 — decided (historical summary)
`docs/ADR-001.md`, accepted conditionally by the user (2026-11-25) pending the §12.1 PoC.
It evaluated the original Flask + SQLite proposal against Netlify (Python is not a Functions
runtime; SQLite would not persist in ephemeral functions) and chose **Option C**: TypeScript,
Astro SSR + `@astrojs/netlify`, Netlify Database (Postgres) via postgres.js, native forward-only
SQL migrations, Zod, scrypt + DB-backed sessions, Chart.js from npm, Vitest + Playwright,
`npm audit`, GitHub Actions, Netlify Free plan. New ADRs must stay consistent with it or
explicitly supersede it (with user approval).

## Every new ADR must also
- Respect the Netlify **Free plan** budget (300 credits/month, hard stop); never assume a paid
  upgrade or add-on — list it as an option needing user approval.
- Prefer local-first verification; cite current docs with access dates.

## Expected follow-up ADRs (in `docs/adr/`, see `docs/ADR-001.md` §13)
ADR-002 hosting & deploy pipeline (with devops-engineer) · ADR-003 auth & sessions (with
security-reviewer) · ADR-004 front-end approach · ADR-005 (candidate) data access & migration
conventions (with data-model-specialist).
