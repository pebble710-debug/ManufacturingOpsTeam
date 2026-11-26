# Decisions (Kenji)

## 2026-11-26 T-023 KPI spec (docs/kpi/kpi-spec.md)
- KPI-3 (UD-8): population = Shipped shipments by ship_date; errors attach to the shipment regardless of detection date.
- KPI-4 (UD-9): kept on first-verification business date; countable error = Before ship OR (After ship AND packaging_related). Proposed new column packaging_error.packaging_related (default true).
- meets_target compares the 1-dp value; ratios rounded with integer arithmetic floor((2000n+d)/(2d))/10.
- P90 = percentile_cont linear interpolation, h=(n-1)p (UD-10).
- Chart buckets are clipped to the period so chart sums equal tile totals.
