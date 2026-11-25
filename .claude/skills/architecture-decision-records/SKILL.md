---
name: architecture-decision-records
description: How to evaluate technology options and record Architecture Decision Records (ADRs) for the ManufacturingOpsTeam prototype, including the required ADR-001 evaluation of the proposed Flask, SQLite and Chart.js stack against Netlify deployment. Use when making or reviewing any stack, hosting, persistence or structural decision.
user-invocable: false
---

# Architecture Decision Records

Store ADRs in `docs/adr/ADR-<nnn>-<slug>.md`. Status: Proposed → Accepted | Rejected | Superseded.
Implementation may only rely on **Accepted** ADRs.

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

## ADR-001 must answer (stack & persistence)
- Does Netlify Functions natively support the proposed **Python/Flask** runtime? Verify in current
  Netlify docs; do not assume.
- Netlify Functions run in an **ephemeral** environment — any file written there (e.g., a
  SQLite file) cannot be relied on to persist or be shared between invocations. What is the
  persistent store instead? Candidates to evaluate: Netlify Database (managed Postgres), an
  external Postgres free tier, Netlify Blobs (object/key-value — check fitness for relational
  data), or a read-only SQLite demo snapshot.
- Is **Chart.js** still the right charting choice (static CDN/npm, accessible fallbacks)?
- Which option keeps local dev simple (e.g., SQLite locally vs Postgres everywhere) without
  creating two diverging SQL dialects?
- What changes to `docs/07-software-design.md` §7.1 and `docs/project-scope.md` §4 (which lists
  "PostgreSQL, Docker deployment, cloud hosting" as v2) are needed? Scope edits go through the
  Product Manager and user approval.

## Other expected ADRs
ADR-002 hosting & deploy pipeline (with devops-engineer) · ADR-003 auth/session approach (with
security-reviewer) · ADR-004 frontend approach (server-rendered vs static + API).
