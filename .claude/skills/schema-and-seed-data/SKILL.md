---
name: schema-and-seed-data
description: Rules for the ManufacturingOpsTeam relational schema, migrations, append-only inventory ledger, lot traceability and the deterministic fictional seed-data generator. Use when designing tables, writing migrations, or generating demo/test data.
user-invocable: false
---

# Schema & seed data

Starting point: `docs/08-data-model-forms-charts-reports.md` §8.1–8.2 (tables & fields) and
`docs/project-scope.md` §3.6 (sample-data volumes). Engine per ADR-001 (`docs/ADR-001.md` §5):
**Postgres everywhere** — Netlify Database in production/previews, the Netlify local emulator in
dev, `@netlify/database-dev` (in-memory Postgres) in tests. No SQLite, no second SQL dialect.
The Data Model Specialist owns `docs/data-model/schema.md` and the migrations.

## Schema rules
- Every table: integer/UUID PK, `created_at`, `created_by`, `updated_at` where mutable.
- All timestamps are `timestamptz`, stored in UTC.
- Foreign keys enforced; unique business keys (`shipment_no`, `part_number`, …).
- Check constraints: quantities > 0 where required; status values from enumerations.
- `inventory_transaction`, `status_history` and `audit_log` are **append-only** at app *and* DB
  level: a `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION`s (TRUNCATE stays allowed for
  the demo reset). This holds even if the app runs as the DB owner.
- On-hand = `SUM(qty_change)` grouped by part/location/lot — a view, not a stored column.
- Soft delete (`archived_at`) for shipments, errors, receipts; never hard delete business records.
- Migrations are native Netlify Database migrations: hand-written SQL in
  `netlify/database/migrations/NNNN_slug/migration.sql`, sequential numbering
  (`netlify database migrations new --scheme sequential`). Netlify applies them on every
  production deploy before publish (a failure blocks publish); preview branches get them too.
- Migrations are **versioned and forward-only**: never edit or delete an applied migration. Make
  breaking changes with **expand/contract** (add new → backfill → switch code → drop old in a later
  migration). Rollback in dev = local `netlify database reset` + re-apply; there are no down files.
- One command applies the schema from empty locally (`netlify database migrations apply`), and
  integration tests apply the same folder via `@netlify/database-dev` `applyMigrations()`.
- Plain Postgres SQL is fine (CHECK, FKs, views, triggers); keep it readable for KPI review.

## Seed generator rules
- The seed is **not a migration** (migrations run on every deploy and preview branch). It is one
  deterministic TypeScript generator in `src/lib/seed/` (in-house PRNG, fixed seed, no faker),
  run by `npm run db:reset-seed` locally and by the Admin-only, env-gated
  (`DEMO_RESET_ENABLED=true`) demo reset on the deployed site.
- Deterministic (fixed seed), idempotent: reset (`TRUNCATE … RESTART IDENTITY CASCADE`) + batched
  inserts in one transaction rebuild the demo DB; must finish well under the 60 s function limit.
- All generated dates are relative to a **fixed demo reporting date** (user decision; set in one
  constant/config, not `now()`), so KPIs, "overdue" lists and screenshots are reproducible.
- Volumes and distributions from scope §3.6: ~300 shipments over 6 months with a 3–4 week peak at
  ≈2× volume and higher error/late rates; errors ≈6–8 % (labels & paperwork largest); late ≈8–12 %;
  ~150 receipts (≈5 % On Hold); ~12 cycle counts (~200 lines, accuracy ≈95–98 %, worse for C).
- Data must be internally consistent: shipments only ship lots that were received and are on hand;
  status history timestamps are in order; rework only after an error.
- Include named "demo story" records (e.g., SH-1042 paperwork revision error from `docs/06` §6.3)
  so the demo script can point at them.
- Separate small, hand-checkable fixtures for unit tests (not the big seed).
- Fictional names only — see `fictional-data-guardrails`.
