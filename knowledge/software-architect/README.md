# Knowledge — Software Architect (Marcus)

Owner agent: `software-architect` (`.claude/agents/software-architect.md`)

This folder is Marcus's durable working memory for the ManufacturingOpsTeam project. Marcus
reads it at the start of each task and appends to it at the end (see the `handoff-protocol`
skill). Other agents may read it; only `software-architect` (or `agent-builder` when restructuring) edits it.

## What belongs here
- Evidence gathered for ADRs (links + access dates, [R]/[A] tags)
- Platform constraints (Netlify Functions, Netlify Database, Blobs) as verified
- Rejected options and why, so they are not re-litigated
- Review notes on schema / API / UI consistency

## What does not belong here
- Final decisions (those are ADRs in `docs/adr/`)
- Real customer, employer, supplier or proprietary information (see `fictional-data-guardrails`)
- Chat transcripts or large logs — summarize the lesson instead

## Suggested files
- `lessons.md` — short dated entries: *context → what happened → lesson*
- `decisions.md` — decisions within this role's authority, with doc references
- `checklists.md` — role-specific checklists that proved useful

## Primary references
- `docs/project-scope.md` (version 1 contract)
- `docs/software-team.md` (roster and responsibilities)
- `docs/README.md` (research index)

## Seed notes for ADR-001 (gathered 2026-11-25 — re-verify)

- [R] Netlify Functions run on demand in an **ephemeral** runtime environment
  ([Netlify Functions overview](https://docs.netlify.com/build/functions/overview/)) — a SQLite
  file written by a function cannot be relied on to persist or be shared.
- [R] Netlify Database (serverless Postgres built on Neon) is generally available since
  2026-04-28; use `@netlify/database`; the beta `@netlify/neon` is deprecated
  ([changelog](https://www.netlify.com/changelog/2026-04-28-netlify-database/)).
- [R] Netlify Blobs is key/value object storage; Netlify guidance puts dynamic structured data in
  the database ([data & storage overview](https://docs.netlify.com/build/data-and-storage/overview/)).
- [A] Python/Flask is not assumed to be a supported Netlify Functions runtime — **verify**.
- Conflict to resolve: `docs/project-scope.md` §4 defers "PostgreSQL, Docker deployment, cloud
  hosting" to v2, while the user now requires Netlify compatibility. ADR-001 must propose the
  scope edit; Priya + user approve it.
