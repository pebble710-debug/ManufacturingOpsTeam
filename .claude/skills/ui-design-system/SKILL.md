---
name: ui-design-system
description: Visual and interaction rules for the ManufacturingOpsTeam dashboard — layout, design tokens, status badges, forms, tables and KPI tiles. Use when designing screens or building UI components.
user-invocable: false
---

# UI design system (v1)

Source rules: `docs/07-software-design.md` §7.3 and `docs/08-data-model-forms-charts-reports.md`
§8.3–8.5. The UX/UI Designer owns `docs/design/ui-spec.md`; developers follow it.

## Layout
- Top bar: app name, "DEMO – FICTIONAL DATA" banner, user + role, logout.
- Left nav: Dashboard · Shipments · Quality (Errors, Rework, Corrective Actions) · Inventory
  (Receipts, On-hand, Transactions, Cycle Counts) · Reports · Admin.
- Home dashboard: KPI tile row → ≤ 6 charts (C1–C6) → "needs attention" lists.
- Responsive: usable at 1366 px laptop, 1024 px tablet landscape, and wall-screen display.

## Tokens
Define CSS custom properties (`--color-*`, `--space-*`, `--font-*`, `--radius-*`) in one file.
Support light theme at minimum; dark theme optional. Base font ≥ 16 px; touch targets ≥ 44 px.

## Status badges (text + icon + color, never color alone)
Planned · Ready to Pack · Packing · Verified · Shipped · Delivered · On Hold (warning) ·
Rework (warning) · Cancelled (muted). KPI tiles show ▲/▼ and the words "better/worse than target".

## Forms
- Logical order, labels above fields, required marker with text "(required)".
- Dropdowns for controlled values; defaults: today's date, current user.
- Inline validation messages next to the field and a summary at the top on submit.
- Destructive or status-changing actions use explicit buttons ("Mark Verified", "Ship").

## Tables
Sortable columns, filters above, pagination at 25 rows, CSV export button on reports.
Every KPI tile and chart links to its filtered table.
