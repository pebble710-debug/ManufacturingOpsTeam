---
name: dashboard-charts
description: Specifications for the ManufacturingOpsTeam home dashboard — KPI tiles, charts C1–C6, needs-attention lists and filters — with charting rules for accessible, glanceable visuals. Use when building or reviewing the dashboard, charts or KPI tiles.
user-invocable: false
---

# Dashboard & charts

Specs: `docs/08-data-model-forms-charts-reports.md` §8.4; formulas: `kpi-definitions` skill;
UX rules: `docs/07-software-design.md` §7.3. Charting library per ADR-001 (Chart.js proposed).

## KPI tiles (row 1)
On-Time Shipment % · OTIF % · Packaging Error Rate % · Packaging FPY % · Median Shipment Cycle
Time (h) · Inventory Accuracy %. Each tile: value, target, Δ vs previous equal-length period,
▲/▼ with words ("better/worse than target"), "How is this calculated?" tooltip, click-through.
"No data" when the KPI returns null.

## Charts (≤ 6)
| # | Chart | Type |
|---|-------|------|
| C1 | On-time shipment % by week vs target | line + dashed target line |
| C2 | Shipments per day vs packaging error rate | bars + line, dual axis clearly labelled |
| C3 | Packaging errors by category | Pareto: sorted bars + cumulative % line |
| C4 | Late shipments by reason | horizontal bars, sorted |
| C5 | Rework events & minutes by week | bars |
| C6 | Inventory accuracy by ABC class vs target | bars + target marker |

## Rules
- One consistent categorical palette; target lines neutral and dashed; never red/green as the only
  distinction. Validate contrast ≥ 3:1 for marks.
- Axes start at zero for bars; label units; readable at wall-screen distance.
- Every chart: title phrased as the question it answers, a one-line text summary, and a
  "view data" table alternative.
- Charts consume `/api/v1/kpis` and report endpoints — no KPI math in chart code.
- Filters: date range, customer, carrier — applied to tiles, charts and lists together.
- Needs-attention lists: overdue/due-in-3-days not Ready · On Hold (reason, owner dept) · open errors
  & overdue corrective actions · cycle counts awaiting approval.
