# Lessons (Kenji)

## 2026-11-27 T-031 KPI module
- postgres.js 4: no `sql.array()`; pass JS arrays with `::text[]`, use `tx.json(obj)` for jsonb. Bigint/count -> cast `::int`; dates -> `to_char(...)` text.
- The test DB (database-dev) misbehaves with concurrent queries on the pool: keep KPI queries sequential (no Promise.all).
- Fixtures: `SET LOCAL session_replication_role = replica` inside `sql.begin` bypasses triggers/FKs but keeps CHECKs; see tests/unit/kpi/fixtures.ts.
- Per-shipment rows are fetched once (`shippedRows`) and KPI-1/2/3/6, C1, C2 are aggregated in TS from them, so tiles and charts cannot disagree.
