---
name: schema-and-seed-data
description: Rules for the ManufacturingOpsTeam relational schema, migrations, append-only inventory ledger, lot traceability and the deterministic fictional seed-data generator. Use when designing tables, writing migrations, or generating demo/test data.
user-invocable: false
---

# Schema & seed data

Starting point: `docs/08-data-model-forms-charts-reports.md` §8.1–8.2 (tables & fields) and
`docs/project-scope.md` §3.6 (sample-data volumes). Database engine is set by ADR-001.
The Data Model Specialist owns `docs/data-model/schema.md` and the migrations.

## Schema rules
- Every table: integer/UUID PK, `created_at`, `created_by`, `updated_at` where mutable.
- Foreign keys enforced; unique business keys (`shipment_no`, `part_number`, …).
- Check constraints: quantities > 0 where required; status values from enumerations.
- `inventory_transaction` is **append-only** (no update/delete at app and, where possible, DB level).
- On-hand = `SUM(qty_change)` grouped by part/location/lot — a view, not a stored column.
- Status history and audit log tables are append-only.
- Soft delete (`archived_at`) for shipments, errors, receipts; never hard delete business records.
- Migrations are versioned and reversible; one command creates the schema from empty.
- Write SQL portable to the ADR-001 engine; avoid engine-specific features unless the ADR allows.

## Seed generator rules
- Deterministic (fixed seed), idempotent: `reset + seed` rebuilds the demo DB in one command.
- Volumes and distributions from scope §3.6: ~300 shipments over 6 months with a 3–4 week peak at
  ≈2× volume and higher error/late rates; errors ≈6–8 % (labels & paperwork largest); late ≈8–12 %;
  ~150 receipts (≈5 % On Hold); ~12 cycle counts (~200 lines, accuracy ≈95–98 %, worse for C).
- Data must be internally consistent: shipments only ship lots that were received and are on hand;
  status history timestamps are in order; rework only after an error.
- Include named "demo story" records (e.g., SH-1042 paperwork revision error from `docs/06` §6.3)
  so the demo script can point at them.
- Separate small, hand-checkable fixtures for unit tests (not the big seed).
- Fictional names only — see `fictional-data-guardrails`.
