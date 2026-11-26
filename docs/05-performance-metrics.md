# 5. Performance Metrics (KPI Definitions)

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

> **v1 implementation spec:** [kpi/kpi-spec.md](kpi/kpi-spec.md) (user decisions UD-7…UD-10, 2026-11-26)

> **Rule for builders:** use these exact formulas. If a definition changes, change it here first.

## 5.1 Why definitions must be fixed in advance

- **[R]** OTD results change depending on the reference date (requested vs promised), partial
  shipment handling, tolerance window, and exclusions; every exclusion must be written into the
  definition in advance. ([SourceDay](https://sourceday.com/blog/on-time-delivery-metrics/))
- **[R]** Cycle-time metrics are only useful with consistent start/stop points; sources disagree
  on whether "order cycle time" ends at shipment or delivery.
  ([Inbound Logistics – Order cycle time](https://www.inboundlogistics.com/articles/order-cycle-time-definition-how-to-measure-tips-and-more/);
  [Celonis – Cycle time](https://www.celonis.com/blog/cycle-time-the-metric-all-businesses-should-use-to-drive-continuous-improvement))
- **[R]** A bare number rarely helps; show it against a target or history.
  ([Esri – Author effective dashboards](https://enterprise.arcgis.com/en/portal/10.6/use/author-effective-dashboards.htm))

## 5.2 v1 KPI catalogue

All KPIs are computed over a selected period (default: last 30 days) and can be trended weekly.

### KPI-1 On-Time Shipment % (primary delivery KPI)
- **[R]** basis: OTD = on-time deliveries ÷ total deliveries × 100.
  ([Tractian](https://tractian.com/en/glossary/on-time-delivery); [Klipfolio](https://www.klipfolio.com/resources/kpi-examples/ecommerce/on-time-delivery))
- **[P]** v1 formula: `shipments with ship_date ≤ promise_date ÷ shipments shipped in period × 100`
- Tolerance: 0 days (configurable). Cancelled shipments excluded. Period is by **ship date**.
- **[A]** Note: v1 measures on-time *shipment* rather than on-time *delivery* because delivered
  date is often unknown without carrier integration.
- Target **[A]**: 95 % (sources cite 96 %+ as strong; target is illustrative).

### KPI-2 OTIF % (secondary)
- **[R]** On-time **and** in full. ([SourceDay](https://sourceday.com/blog/on-time-delivery-metrics/))
- **[P]** `shipments on time AND every line qty_shipped ≥ qty_ordered ÷ shipments shipped × 100`

### KPI-3 Packaging Error Rate
- **[A]** No single standard formula found; this is a common operations convention.
- **[P]** `shipments with ≥ 1 packaging error ÷ shipments verified or shipped in period × 100`
- Also show **errors per 100 shipments** (counts multiple errors) and split **internal catch vs
  customer escape**.
- Target **[A]**: < 2 %.

### KPI-4 Packaging First-Pass Yield
- **[R]** FPY = units passing first time without rework ÷ units entering.
  ([Wikipedia – FPY](https://en.wikipedia.org/wiki/First-pass_yield))
- **[P]** `shipments passing first verification with no error ÷ shipments verified × 100`

### KPI-5 Rework Frequency & Effort
- **[R]** Rework rate (% units requiring rework) is listed as a supporting metric; no formal
  formula found. ([Umbrex – FPY](https://umbrex.com/resources/company-analysis/operations/first-pass-yield/))
- **[P]** `rework events ÷ shipments shipped × 100` and `total rework minutes` (and average minutes
  per rework event). Trend weekly.

### KPI-6 Shipment Cycle Time (hours)
- **[R]** basis: APQC pick-to-ship = hours from release-to-pick until shipped.
  ([APQC](https://www.apqc.org/resources/benchmarking/open-standards-benchmarking/measures/pick-ship-cycle-time-hours-customer))
- **[P]** `shipped_at − ready_to_pack_at` (from status history), reported as **median** and 90th
  percentile **[A]** (median resists outliers better than the mean for skewed time data).
- Optional: order-to-ship days = `ship_date − order_date`.

### KPI-7 Inventory Record Accuracy %
- **[R]** physical vs system comparison; 98–99 % cited as world-class.
  ([Tractian – Cycle count](https://tractian.com/en/glossary/cycle-count))
- **[P]** `count lines within tolerance ÷ count lines counted × 100` (hit-rate method; see
  [03-inventory-management.md](03-inventory-management.md) §3.3).
- Target **[A]**: 97 %.

### KPI-8 Dock-to-Stock Time (hours) — optional in v1
- **[R]** `Σ dock-to-stock hours ÷ number of receipts`.
  ([NetSuite](https://www.netsuite.com/portal/resource/articles/erp/order-fulfillment-kpis-metrics.shtml))
- **[P]** `putaway_at − arrived_at` per receipt.

### Supporting counts (not KPIs, but shown)
- Shipments shipped per day/week (volume) — needed to see the peak-volume effect.
- Open shipments by status; shipments past due; items on hold.
- Late shipments by reason code.
- Errors by category (Pareto).

## 5.3 KPI summary table

| ID | KPI | Unit | Good direction | Default target [A] | v1? |
|----|-----|------|---------------|-------------------|-----|
| 1 | On-time shipment | % | ↑ | 95 % | ✅ |
| 2 | OTIF | % | ↑ | 93 % | ✅ |
| 3 | Packaging error rate | % | ↓ | < 2 % | ✅ |
| 4 | Packaging FPY | % | ↑ | 98 % | ✅ |
| 5 | Rework frequency / minutes | % / min | ↓ | < 2 % | ✅ |
| 6 | Shipment cycle time | hours (median) | ↓ | 24 h | ✅ |
| 7 | Inventory accuracy | % | ↑ | 97 % | ✅ |
| 8 | Dock-to-stock | hours | ↓ | 8 h | optional |

Targets are **illustrative assumptions for demo purposes**, stored in a settings table so users can
change them.

## 5.4 Data-quality rules for KPIs

- **[P]** KPIs are computed from timestamps captured automatically at status changes, not typed-in
  times, wherever possible.
- **[P]** Each KPI tile shows its definition on hover/tap ("How is this calculated?").
- **[P]** Sample data must include enough late, erroneous and reworked shipments to make charts
  interesting (see [project-scope.md](project-scope.md)).

## Sources

See inline links; full list in [sources.md](sources.md).
