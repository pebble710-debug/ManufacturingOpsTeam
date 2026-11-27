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
- 2026-11-25 — T-005: user accepted ADR-001 *conditionally* (PoC T-007 must pass; Free plan only, no paid add-ons/auto credit purchases; verify account/plan before provisioning; local-first; public repo in personal account). Recorded as ADR §0 "Approval conditions" and status "Accepted — conditional…". Lessons: (1) a conditional acceptance needs an explicit revert rule (status → Proposed if the PoC fails) and a gate on feature work, not just a status label; (2) when the user sets a cost ceiling, sweep the whole ADR (fallbacks, prerequisites, risk mitigations, proposed scope text) for any option that implies spending or a new vendor account and mark it "only with explicit user approval" — they hide in risk tables; (3) when superseding a research-doc section, keep the original table verbatim under a "Historical record" heading and put the new table first, so the doc reads correctly top-down without losing traceability.
- 2026-11-25 — T-011 (PoC results folded into ADR-001 §15): (1) Pin what was *tested*, not what the ADR assumed. Astro 7.4.13 + adapter 8.2.14 replaced "Astro 5.x", and Node 22.23.5 replaced Node 24, because the PoC container only had 22 and Astro 7 needs >= 22.23.4. Node 24 waits for a passing CI job. (2) Security lesson: a framework's CSRF switch (`checkOrigin`) can cover only some content types. A forged-Origin JSON POST succeeded, so "defence in depth" wording hid a real gap. Mark each CSRF layer REQUIRED and add content-type enforcement (415) plus tests. Verify built-in protections against every content type you accept. (3) Don't adopt a vendor's convenience client blindly: `@netlify/database` `getDatabase().sql` is waddler, not postgres.js. Keep one query API so injection rules stay single. (4) Astro 7 CLI: `astro dev` daemonises, has no `astro preview` with the Netlify adapter, and does not auto-apply migrations. CI/e2e and the local quick-start must spell these steps out. (5) Status wording for a partially verified PoC: say exactly which part passed (local) and which is pending (hosted), and keep the user's conditions block untouched.
- Follow-up docs still saying Node 24 / Astro 5 (not mine to edit; route via orchestrator → agent-builder): `.claude/skills/project-context` accepted-stack table ("Node.js 24 LTS"), and `.claude/skills/ci-pipeline/SKILL.md` (grep-confirmed 2026-11-25).
- 2026-11-26 — T-016 (Phase 2 consistency review; decisions in `docs/plan/consistency-review.md`):
  (1) **Business clock:** when you pin a "fixed today", never store event *timestamps* as reporting date + real time of day. Business time of day repeats every real day, so it is not monotonic. Ordering and "end >= start" constraints then fail during ordinary multi-day use. Use real timestamps for ordering and audit, separate business *date* columns for KPI periods, and put each user-typed instant on exactly one clock. A generated column (`(ts AT TIME ZONE 'UTC')::date`, immutable in PG) keeps a derived date in sync for free.
  (2) **Hunt for "valid request → 500":** for every NOT NULL, CHECK and composite FK in the DDL, ask which endpoint fills it and what Zod allows. This review found requested_date ≥ order_date, lot ownership (nobody created `lot` rows), submitted_by/closed_at/shipped_at never set, a DB CHECK stricter than the reviewed permission matrix, and a tolerance-aware rule against a tolerance-blind CHECK.
  (3) **UI forms vs strict schemas:** with `.strict()` Zod and R-12, every UI input that has no contract field (per-item notes, "performed by" selects, a status radio on create, root cause on a create form) becomes a 400. Diff the UI field list against the request schema per screen, not just the enums.
  (4) **Progressive enhancement means two surfaces:** urlencoded form routes plus JSON API routes on one service layer, with content type allow-listed *per surface*. The 413 limit must run before middleware reads a body-borne `_csrf`. Check that the matrix tests (T-17) already presume this before choosing "fetch everywhere".
  (5) **No DDL in app runtime:** disabling triggers in a seed that also runs as the Admin reset is DDL inside a Function and breaks the owner-credential mitigation (AR-4). Deferred constraint triggers cost little at seed volume, so keep them on.
  (6) Other agents work on the same tree concurrently (Quinn's harness adapted to my DDL edits within minutes; Olivia made a WIP checkpoint commit). Make edits atomic per file with exact-match replacements, and re-run the shared harness at the end, not only my own scratch checks.
- 2026-11-27 — T-022 (ADR-003 + UD-1..UD-6 reconciliation):
  (1) **Lock rows with a column allow-list trigger:** `(to_jsonb(NEW) - allowed_cols) IS DISTINCT FROM (to_jsonb(OLD) - allowed_cols)` gives one readable rule for "terminal record, only these fields correctable". Check every write path's statement order against it. Here the ship action has to update lines before it sets the status to Shipped. Leave INSERT unguarded when the seed inserts rows in their final state.
  (2) **Moving a role off a state-changing action can break other rules.** UD-4 moved reopen to Quality/Supervisor, so "reopener = packer" stopped making sense. The fix was to clear the packer on reopen and let the re-packer claim it through start-packing. The NOT NULL `packer_id` on the verification row then backstops verify.
  (3) **Shared test harness:** new fixture business keys must not collide with existing ones in the same in-memory DB. A UNIQUE failure there cascades into unrelated assertions (SCH-65/74). Use a reserved key range per task (SH-95xx here).
  (4) Late user decisions arrive mid-task (KPI spec, matrix rows, reviewer corrections). Batch the contract edits into one scripted pass with exact-match asserts, and grep for the stale words (Delivered, Minor/Major, "verified or shipped", tolerance in the late-reason rule) at the end.
  (5) Network: docs.netlify.com does not resolve in this session. Installed package sources (node_modules schemas, adapter code) are valid [R] evidence for version-specific behaviour.
