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

## Evidence log — ADR-001 (T-002), verified 2026-11-25

Retrieved via Firecrawl scrape (direct WebFetch to docs.netlify.com / www.netlify.com is blocked
by this environment's proxy — use `mcp__Firecrawl__firecrawl_scrape` on the `.md` doc URLs).
- [R] Functions languages: TypeScript, JavaScript, Go only (get-started page facet switcher). Python = build image only.
- [R] Limits: sync 60 s, scheduled 30 s, background 15 min, 1024 MB default, 6 MB buffered payload, Node 24 fallback.
- [R] Netlify Database: `@netlify/database` (`getDatabase().sql`, `getConnectionString()`), env `NETLIFY_DB_URL`;
  works with `pg`, `postgres`, Drizzle (`drizzle-orm/netlify-db`, beta tag recommended).
- [R] Migrations: `netlify/database/migrations/NNNN_slug/migration.sql`, auto-applied before publish; forward-only; previews get DB branches copied from prod.
- [R] Local: `netlify dev` or Vite plugin / Astro ≥5.12 `astro dev` emulate the DB; `netlify database migrations apply|status|connect|reset`; `@netlify/database-dev` = in-memory Postgres for tests. CLI ≥ 26.
- [R] Billing: credit-based plans only; Free = 300 credits/month HARD limit, projects PAUSED when exhausted;
  prod deploy 15 credits; DB compute 10 credits/CU-hour (Free max 1 CU, 5-min sleep, 48 CU-h cap); fn compute 10/GB-h; 2 credits/10k requests.
- [R] Free plan: org-owned private repos not supported for contributors.
- [R] Astro `security.checkOrigin` default true; adapter `middlewareMode: 'edge'` is opt-in. Past checkOrigin bypass advisory GHSA-c4pw-33h3-35xw → pin patched version + own CSRF token.

## Lessons
- 2026-11-25 — ADR-001: user asked for `docs/ADR-001.md`, but CLAUDE.md/skills reference `docs/adr/ADR-001-stack-and-persistence.md` → flagged path mismatch to orchestrator. Lesson: check gate-file paths in CLAUDE.md when a user overrides a deliverable path.
- 2026-11-25 — Rejected options (do not re-litigate without new evidence): Flask/Python on Netlify Functions (no runtime); SQLite on Functions (ephemeral); Netlify Blobs as primary store (KV, no joins/transactions); static read-only snapshot (no persistent writes) — fallback only.
