---
name: kpi-definitions
description: Exact v1 KPI formulas, targets and edge-case rules for the Manufacturing Shipping & Inventory dashboard. Use when implementing, testing, charting or reviewing any metric such as on-time shipment, OTIF, packaging error rate, FPY, rework, cycle time or inventory accuracy.
user-invocable: false
---

# KPI definitions (v1)

Authoritative source: **`docs/kpi/kpi-spec.md`** (v1 spec with user decisions UD-7…UD-10), which
refines `docs/05-performance-metrics.md`. If this skill and the spec disagree, the
spec wins — report the mismatch to the Orchestrator.

## Rules
- All KPI math lives in **one module** (e.g., `kpi` service). Charts, tiles, reports and tests
  call it; nobody re-implements a formula elsewhere.
- Period filter is inclusive and applied to the date named below. Default period: last 30 days.
- Division by zero returns `null` ("no data"), never 0 % or 100 %.
- Cancelled shipments are excluded from every shipment KPI.
- Percentages are returned as numbers with one decimal place for display; keep full precision
  internally.

| ID | KPI | Formula | Period date | Target (demo) |
|----|-----|---------|-------------|---------------|
| 1 | On-time shipment % | shipments with `ship_date ≤ promise_date` ÷ shipments shipped × 100 (tolerance 0 days, configurable; toggle to `requested_date`) | ship_date | 95 % |
| 2 | OTIF % | on time AND every line `qty_shipped ≥ qty_ordered` ÷ shipments shipped × 100 | ship_date | 93 % |
| 3 | Packaging error rate % | **Shipped** shipments with ≥ 1 *countable* packaging error ÷ shipments Shipped × 100 (UD-8: actual ship_date basis; countable = Before-ship, or After-ship with `packaging_related = true`, UD-9); also errors per 100 shipments; internal vs customer split | ship_date | < 2 % |
| 4 | Packaging FPY % | shipments passing first verification with no countable error (customer-found packaging-related errors count against FPY, UD-9) ÷ shipments verified × 100 | first verification business date | 98 % |
| 5 | Rework frequency | rework events ÷ shipments shipped × 100; plus total and average rework minutes | rework completed_at | < 2 % |
| 6 | Shipment cycle time | `shipped_at − ready_to_pack_at` from status history; **median and P90 both `percentile_cont` (linear interpolation, h=(n−1)p) in SQL and TS (UD-10)** | ship_date | 24 h |
| 7 | Inventory accuracy % | **first-count** lines within tolerance ÷ lines counted × 100 (UD-7, primary; after-recount shown as secondary); tolerance A 0 %, B ±2 %, C ±5 % | count approved business date | 97 % |
| 8 | Dock-to-stock (optional) | mean of `putaway_at − arrived_at` hours | arrived_at | 8 h |

Targets live in the `setting` table and are editable by a Supervisor.

## Testing requirement
Each KPI needs unit tests with a hand-calculated fixture, including: empty period, all on time,
none on time, a cancelled shipment, a partial shipment, and a boundary date.
