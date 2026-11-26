# KPI Specification — Version 1 (V1-CORE)

**Task:** T-023 · **Owner:** Kenji (dashboard-analytics-developer) · **Date:** 2026-11-26 · **Status:** DRAFT for review by Priya (scope), Marcus (contract edits 11.3, schema changes section 12), Dana (fixtures, schema flag), Quinn (test expectations)
**Inputs:** [05-performance-metrics.md](../05-performance-metrics.md), [plan/build-plan.md](../plan/build-plan.md) (UD-7 to UD-10), [data-model/schema.md](../data-model/schema.md) sections 3, 4, 8, [data-model/seed-plan.md](../data-model/seed-plan.md) sections 10-11, [api/contract.md](../api/contract.md) section 9, [plan/consistency-review.md](../plan/consistency-review.md) D-1.
Tags: **[R]** researched, **[A]** assumption, **[P]** proposed, **[UD]** user decision (binding).

This file is the **implementation spec** for the single KPI module `src/lib/kpi/`. `docs/05` keeps the definitions and rationale; where this file is more precise or differs (marked **Δ05**), this file wins for v1 and `docs/05` carries a pointer to it. Nobody else implements KPI math: charts, tiles, reports (`on_time`, `days_late` in R1) and the needs-attention lists call the module.

## 1. Rules that apply to every KPI

| # | Rule |
|---|------|
| G-1 | **Period** `[from, to]` is inclusive on **calendar dates** (UTC dates; business dates per schema section 3). Each KPI names its own **period date** below. Default period: 30 days ending on `business_today` (`from = to - 29`). The module never reads a clock: `business_today` is passed in by the caller. |
| G-2 | **Previous period** = equal-length period immediately before: `prev_to = from - 1`, `prev_from = from - days`, `days = to - from + 1`. Computed with the same definitions. |
| G-3 | **Cancelled shipments are excluded from every shipment KPI**, including their errors and rework events. |
| G-4 | **Division by zero returns `null`** ("No data"), never 0 or 100. `numerator` and `denominator` are still returned (0 / 0). |
| G-5 | **Precision:** values are computed in full precision. `value_1dp` is the display value. For ratios it is computed in **integer arithmetic**: `value_1dp = floor((2000 * num + den) / (2 * den)) / 10` (round half up, no float error; 3/4 gives 75.0, 1/3 gives 33.3). For non-ratio values (hours, minutes) `round1(x) = Math.round(x * 10) / 10` (round half up; all values are non-negative). Deltas are `value - previous_value` at full precision. Averages of minutes show 2 decimals. |
| G-6 | **meets_target** compares the **1-dp display value** with the target (so the word on the tile always matches the number printed). `null` when the value is `null`. |
| G-7 | **Trend** (`Up`/`Down`/`Flat`) is the arithmetic direction of `delta` after rounding to 1 dp (`Flat` when it rounds to 0.0); `null` if either value is `null`. **change_assessment** (`Better`/`Worse`/`Same`) combines trend with the KPI's good direction (section 2); `null` when trend is `null`. Tiles say "better" or "worse", never only an arrow. |
| G-8 | **Targets and tolerances** come from the `setting` table (keys in each KPI below), passed in by the caller. A target of `null` (unset) gives `meets_target = null`. |
| G-9 | **Percentile method (UD-10):** one method everywhere, section 8. |
| G-10 | **Restatement [A]:** KPIs are computed from the current state of the data, so a past period can change after the fact (a customer-found error logged next month lowers last month's KPI-3 and KPI-4; a corrected shipment per UD-3 changes KPI-1). This is intended and is shown in the "How is this calculated?" text of KPI-3 and KPI-4. |
| G-11 | **Basis for KPI-1 and KPI-2:** `promise` (default) or `requested`, from the `basis` query parameter else the setting `on_time_basis`. `days_late = ship_date - basis_date` (integer days, may be negative). On time means `days_late <= on_time_tolerance_days` (default 0). |

## 2. KPI summary

| KPI | `key` | Unit | Good direction | Target key | Target | Compare | Period date |
|-----|-------|------|----------------|-----------|--------|---------|-------------|
| 1 | `on_time_pct` | % | up | `target_on_time_pct` | 95 | `>=` | `shipment.ship_date` |
| 2 | `otif_pct` | % | up | `target_otif_pct` | 93 | `>=` | `shipment.ship_date` |
| 3 | `pkg_error_rate_pct` | % | down | `target_pkg_error_rate_pct` | 2 | `<` | `shipment.ship_date` (UD-8) |
| 4 | `fpy_pct` | % | up | `target_fpy_pct` | 98 | `>=` | `shipment_verification.business_date` of attempt 1 |
| 5 | `rework_frequency_pct` | % | down | `target_rework_freq_pct` | 2 | `<` | `rework_event.completed_business_date` |
| 6 | `cycle_time_median_h` | hours | down | `target_cycle_time_h` | 24 | `<=` | `shipment.ship_date` |
| 7 | `inventory_accuracy_pct` | % | up | `target_inventory_accuracy_pct` | 97 | `>=` | `cycle_count.approved_business_date` |

Tiles (row 1, in this order): 1, 2, 3, 4, 6, 7. KPI-5 has `tile: false` (shown in the error/rework report and in `extra` of the API). KPI-8 is not built (v2).

## 3. Common definitions (SQL fragments used below)

All SQL uses schema.md table and column names. They are the **reference definitions**; the module may use the helper views `v_shipment_delivery` / `v_shipment_quality` only if they return exactly these results (see section 12, S-2). Parameters: `$from`, `$to` (dates), `$basis` (`'promise'|'requested'`), `$tol` (integer days).

```sql
-- SHIPPED: the population of KPI-1, 2, 3, 5 (denominator), 6. Cancelled and open shipments are never in it.
-- (status = 'Shipped' is the only way ship_date is set, schema shipment_shipped_fields_chk)
WITH shipped AS (
  SELECT s.id, s.ship_date, s.shipped_at,
         s.ship_date - CASE $basis WHEN 'promise' THEN s.promise_date ELSE s.requested_date END AS days_late,
         NOT EXISTS (SELECT 1 FROM shipment_line l
                      WHERE l.shipment_id = s.id AND COALESCE(l.qty_shipped, 0) < l.qty_ordered) AS in_full,
         EXTRACT(EPOCH FROM (s.shipped_at - rtp.at)) / 3600.0 AS cycle_hours       -- NULL if no Ready to Pack row
    FROM shipment s
    LEFT JOIN LATERAL (SELECT MIN(changed_at) AS at FROM shipment_status_history h
                        WHERE h.shipment_id = s.id AND h.to_status = 'Ready to Pack') rtp ON true
   WHERE s.status = 'Shipped' AND s.ship_date BETWEEN $from AND $to)
```

```sql
-- COUNTABLE ERROR (UD-9, section 6): an error that counts against KPI-3, KPI-4 and chart C3
--   e.detected_stage = 'Before ship'  OR  (e.detected_stage = 'After ship' AND e.packaging_related)
-- "error_count(shipment)" = number of countable errors on the shipment, any detection date.
```

## 4. KPI-1 On-time shipment %

| Item | Definition |
|------|-----------|
| Formula | `on-time shipments ÷ shipped shipments × 100` |
| Denominator | rows of `shipped` (status Shipped, `ship_date` in period) |
| Numerator | rows of `shipped` with `days_late <= $tol` |
| Period date | `ship_date`. A shipment shipped on `to` counts, one shipped on `to + 1` does not (fixture A, SH-1005 / SH-1006). |
| Exclusions | Cancelled and any not-yet-shipped status (Planned ... Rework, On Hold). |
| Null rule | denominator 0 gives `null`. |
| Rounding | G-5 (1 dp). |
| Tolerance | `on_time_tolerance_days` (integer >= 0, default 0) applies to KPI-1 and KPI-2 only. The late-reason rule is independent of tolerance (UD-1). |
| Basis | `promise` default; `requested` toggle (G-11). A `null` basis date is impossible (both NOT NULL). |
| Target | `target_on_time_pct`, meets when `value_1dp >= target`. |
| extra | `{ "tolerance_days": 0, "late_count": 1 }` (`late_count = denominator - numerator`). |

```sql
SELECT COUNT(*) AS denominator, COUNT(*) FILTER (WHERE days_late <= $tol) AS numerator FROM shipped;
```

**Tile text.** Title "On-Time Shipment". Value "83.5 %" (or "No data for this period"). Line 2: "Target 95 % or higher · Below target" / "· Meets target". Line 3: "2.5 points worse than previous period" (or "better", "unchanged", "No previous data"). Sub-line: "28 of 274 shipped late" style: "{numerator} of {denominator} shipments on time".
**Tooltip ("How is this calculated?"):** "Shipments shipped in the period on or before their promise date, divided by all shipments shipped in the period, times 100. Basis: promise date (switchable to requested date). Tolerance: 0 days. Cancelled and unshipped shipments are not counted. The period uses the actual ship date."

## 5. KPI-2 OTIF %

| Item | Definition |
|------|-----------|
| Formula | `shipments on time AND in full ÷ shipped shipments × 100` |
| Denominator | same as KPI-1 |
| Numerator | rows of `shipped` with `days_late <= $tol AND in_full` |
| In full | **every** line has `qty_shipped >= qty_ordered` (`NULL` qty_shipped counts as 0; shipping more than ordered is still in full). A short line carries a note (US-021). Partial shipments as separate shipments do not exist in v1 (scope 7). |
| Period, exclusions, null, rounding, tolerance, basis | as KPI-1 |
| Target | `target_otif_pct`, `>=` |
| extra | `{ "in_full_pct": ..., "short_shipments": n }` (`in_full_pct` = in-full shipments ÷ shipped, same period; `null` when empty) |

```sql
SELECT COUNT(*) AS denominator, COUNT(*) FILTER (WHERE days_late <= $tol AND in_full) AS numerator FROM shipped;
```

**Tile text.** "OTIF (On Time In Full)". "{numerator} of {denominator} shipments on time and complete". **Tooltip:** "Shipments shipped on or before the promise date AND with every line shipped in full (shipped quantity at least the ordered quantity), divided by all shipments shipped in the period, times 100. A short line fails the shipment. Cancelled shipments are not counted."

## 6. KPI-3 Packaging error rate (UD-8, UD-9) and KPI-4 Packaging FPY (UD-9)

### 6.1 Which errors count (UD-9) — **proposal [P]**

A **countable error** is a `packaging_error` row on a non-cancelled shipment where:

- `detected_stage = 'Before ship'` (internal catch: always countable), **or**
- `detected_stage = 'After ship'` (customer-found / escape) **and** `packaging_related = true`.

`packaging_related` is a **new boolean column** on `packaging_error` (`NOT NULL DEFAULT true`, section 12, S-1). Rationale: the user rule is "customer-found errors count against FPY **when they relate to the original packaging process**". A category set alone cannot decide that (category `Damage` can be bad cushioning or a carrier drop; `Wrong quantity` can be a packing miscount or a customer miscount). Defaulting to `true` makes the conservative reading (it counts) the default and needs a deliberate, audited act to exclude one.

- Only **Quality** and **Supervisor** may set `packaging_related = false`, only while `detected_stage = 'After ship'` (CHECK: `packaging_related OR detected_stage = 'After ship'`), with a required `reason` in the request that is stored in the audit row (`changes: {packaging_related: [true, false], reason}`). The packer or verifier cannot clear their own errors.
- Typical `false` cases (shown as UI help text): damage proven in carrier transit, customer miscount, customer-side labelling.
- Fallback if Marcus rejects the column: no flag, **every After-ship error counts**. The module reads one function `isCountableError(e)`, so switching is a one-line change.
- **Applies uniformly** to KPI-3 (numerator and errors per 100), KPI-4 and chart C3, so the three figures always agree on what an error is. A non-countable error stays visible in the shipment, the error log and R3; it is just not scored. The count of excluded errors is shown in the KPI-3 `extra.excluded_errors`.
- Errors on cancelled shipments are not countable (G-3).

### 6.2 KPI-3 Packaging error rate % (UD-8)

| Item | Definition |
|------|-----------|
| Reporting basis (UD-8) | the shipment's **actual `ship_date`**. A shipment is in the period iff it is `Shipped` with `ship_date` in `[from, to]`. Errors **attach to the shipment** (not to the date they were detected): every countable error of an in-period shipment counts in that period, whenever it was detected (before shipping, or weeks later by the customer). |
| Denominator | rows of `shipped` (the same population as KPI-1) |
| Numerator | in-period shipments with `error_count >= 1` (**shipments with an error**, so a shipment with two errors counts once) |
| Formula | `numerator ÷ denominator × 100` |
| Errors per 100 | `Σ error_count ÷ denominator × 100` (counts multiple errors; may exceed 100 only in absurd data; `null` when empty), 1 dp (G-5 with `num = errors`) |
| Internal vs escape | `internal_catches` = countable Before-ship errors, `customer_escapes` = countable After-ship errors, both of in-period shipments (so `errors = internal_catches + customer_escapes`) |
| Not in the population | shipments verified but not yet shipped (Verified, or in Rework/On Hold); cancelled shipments. Their errors appear in KPI-3 in the period they ship. **Δ05** (docs/05 said "verified or shipped"; superseded by UD-8). |
| Null rule | denominator 0 gives `null`; `errors_per_100_shipments` also `null`; the counts are 0. |
| Target | `target_pkg_error_rate_pct`, **`<`** target (a rate equal to the target does not meet "< 2 %") |
| extra | `{ errors_per_100_shipments, errors, shipments_with_error, internal_catches, customer_escapes, excluded_errors }` (`excluded_errors` = After-ship errors of in-period shipments with `packaging_related = false`) |

```sql
-- shipped CTE of section 3, then:
SELECT COUNT(*)                                   AS denominator,
       COUNT(*) FILTER (WHERE COALESCE(ec.errors, 0) > 0) AS numerator,
       COALESCE(SUM(ec.errors), 0)                AS errors,
       COALESCE(SUM(ec.internal), 0)              AS internal_catches,
       COALESCE(SUM(ec.escape), 0)                AS customer_escapes,
       COALESCE(SUM(ec.excluded), 0)              AS excluded_errors
  FROM shipped s
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship' OR e.packaging_related) AS errors,
           COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship')                        AS internal,
           COUNT(*) FILTER (WHERE e.detected_stage = 'After ship' AND e.packaging_related)  AS escape,
           COUNT(*) FILTER (WHERE e.detected_stage = 'After ship' AND NOT e.packaging_related) AS excluded
      FROM packaging_error e WHERE e.shipment_id = s.id) ec ON true;
```

**Tile text.** "Packaging Error Rate". "{numerator} of {denominator} shipments had an error · {errors_per_100} errors per 100 shipments". Target line "Target below 2 %". **Tooltip:** "Shipments shipped in the period that had at least one packaging error, divided by shipments shipped in the period, times 100. Errors found before shipping (internal catches) and errors found by the customer after shipping (escapes, when related to our packaging process) both count against the shipment, whenever they were found, so earlier periods can change when a late error is logged. Based on the actual ship date. Cancelled shipments are not counted."

### 6.3 KPI-4 Packaging first-pass yield % (UD-9)

| Item | Definition |
|------|-----------|
| Formula | `shipments that passed first verification with no countable error ÷ shipments verified × 100` |
| Period date | **business date of the first verification attempt** (`shipment_verification.business_date` where `attempt_no = 1`), as in docs/05 and schema section 3.1. [P] Kept (not moved to ship date) because FPY measures the packing process at the moment it is first checked; a shipment is "verified" even if it is still open. |
| Denominator | non-cancelled shipments with an `attempt_no = 1` verification whose `business_date` is in the period (one row per shipment) |
| Numerator | those where the first attempt `result = 'Pass'` **and** `error_count = 0` (countable errors, **any stage, any detection date**). A customer-found, process-related error found weeks later therefore turns a past first-pass success into a failure (UD-9). A Before-ship error logged by Quality on a shipment that passed first time also fails it. |
| Null rule | denominator 0 gives `null` |
| Target | `target_fpy_pct`, `>=` |
| extra | `{ "first_attempt_failed": n, "passed_but_errored": n, "escape_failures": n }` (`escape_failures` = numerator-failures caused only by a countable After-ship error) |

```sql
SELECT COUNT(*) AS denominator,
       COUNT(*) FILTER (WHERE v.result = 'Pass' AND COALESCE(ec.errors, 0) = 0) AS numerator
  FROM shipment_verification v
  JOIN shipment s ON s.id = v.shipment_id AND s.status <> 'Cancelled'
  LEFT JOIN LATERAL (SELECT COUNT(*) AS errors FROM packaging_error e
                      WHERE e.shipment_id = s.id AND (e.detected_stage = 'Before ship' OR e.packaging_related)) ec ON true
 WHERE v.attempt_no = 1 AND v.business_date BETWEEN $from AND $to;
```

**Differences from KPI-3 (stated on the tile, avoids "why do they not add up"):** KPI-3 is by ship date and counts only shipped shipments; KPI-4 is by first-verification date and includes verified shipments that are still open (for example SH-1284 whose first attempt failed). In steady state the two move together.

**Tile text.** "Packaging First-Pass Yield". "{numerator} of {denominator} shipments passed first check with no error". **Tooltip:** "Shipments that passed their first verification and had no packaging error afterwards, divided by shipments first verified in the period, times 100. A customer-reported error caused by our packaging counts against the shipment even if it is found later, so this figure can change after the period ends. Cancelled shipments are not counted."

## 7. KPI-5 Rework frequency and effort

| Item | Definition |
|------|-----------|
| Period date | `rework_event.completed_business_date` (generated from `completed_at`, schema 4.4). Events in progress (`completed_at IS NULL`) are not counted anywhere yet (no minutes either). |
| Events | completed rework events in the period on **non-cancelled** shipments (the shipment may ship before or after the period) |
| Value | `events ÷ shipments shipped in period × 100` (denominator = KPI-1 denominator). Not capped at 100. |
| Effort | `total_rework_minutes = Σ minutes` (0 when none), `avg_rework_minutes = total ÷ events` (2 dp; `null` when no events). `minutes` is the generated whole-minute column. |
| Null rule | shipped = 0 gives `value = null` even if events exist (`extra` still reports them). |
| Target | `target_rework_freq_pct`, `<` |
| extra | `{ rework_events, total_rework_minutes, avg_rework_minutes }` |

```sql
SELECT COUNT(*) AS events, COALESCE(SUM(r.minutes), 0) AS total_minutes, ROUND(AVG(r.minutes), 2) AS avg_minutes
  FROM rework_event r JOIN shipment s ON s.id = r.shipment_id AND s.status <> 'Cancelled'
 WHERE r.completed_business_date BETWEEN $from AND $to;     -- denominator: COUNT(*) FROM shipped
```

**Tile (not on the dashboard row; shown in the error/rework report).** "Rework Frequency: {events} events per 100 shipped · {total} min total, {avg} min average". **Tooltip:** "Rework events completed in the period divided by shipments shipped in the period, times 100, plus the minutes spent (completed minus started time of each event). Events still in progress are not counted until completed."

## 8. KPI-6 Shipment cycle time (UD-10)

| Item | Definition |
|------|-----------|
| Measure | `cycle_hours = (shipped_at − first Ready to Pack changed_at)` in **hours**, fractional (not floored or rounded before aggregation). "First" = earliest `shipment_status_history` row with `to_status = 'Ready to Pack'` (a shipment sent back to Rework keeps its original start, so rework time counts). |
| Population | rows of `shipped` (`ship_date` in period) with a non-null `cycle_hours` |
| Value | **median** = `percentile_cont(0.5)`; `extra.p90_h` = `percentile_cont(0.9)` |
| Period date | `ship_date` |
| Null rule | no measurable shipment gives `null` for both. `denominator` = measured shipments; `numerator = null`. |
| Target | `target_cycle_time_h`, **`<=`** (median at or below the target) |
| extra | `{ p90_h, p90_h_1dp, shipments_measured, within_target_pct }` (`within_target_pct` = share of measured shipments with `cycle_hours <= target`, 1 dp, `null` when none) |

**Percentile method (UD-10) — one method in SQL and TypeScript.** `percentile_cont(p)` with **linear interpolation between closest ranks** (the PostgreSQL definition, Excel `PERCENTILE.INC`, NumPy default "linear"):

```
sort ascending x[0..n-1]            (n >= 1; n = 0 gives null)
h  = (n - 1) * p                    (0-based fractional rank)
lo = floor(h), hi = ceil(h)
value = x[lo] + (h - lo) * (x[hi] - x[lo])
```

Never use nearest-rank, `percentile_disc`, or "round the rank". `p = 0.5` for the median, `p = 0.9` for P90. Tests compare with `toBeCloseTo(expected, 9)`. In SQL cast `cycle_hours` to `double precision` (percentile_cont accepts `double precision` or `interval`).

Worked examples (hand calculation, each is a unit test):

| Values (h) | n | Median: h = (n-1)·0.5 | P90: h = (n-1)·0.9 |
|-----------|---|-----------------------|--------------------|
| {10, 12, 20, 30} (fixture A) | 4 | 1.5 → 12 + 0.5·(20−12) = **16** | 2.7 → x[2] + 0.7·(x[3]−x[2]) = 20 + 0.7·10 = **27.0** |
| {4, 8, 15, 16, 23} | 5 | 2.0 → **15** | 3.6 → 16 + 0.6·(23−16) = **20.2** |
| {10, 30} | 2 | 0.5 → 10 + 0.5·20 = **20** | 0.9 → 10 + 0.9·20 = **28** |
| {7} | 1 | 0 → **7** | 0 → **7** |
| {} | 0 | **null** | **null** |

**Limitation (consistency-review D-1, accepted).** KPI-6 is **real elapsed time** between two real-clock timestamps (`status_history.changed_at` and `shipment.shipped_at`, both real `now()`). Under the fixed reporting date the ship date is a business date but the cycle time is not. A seeded open shipment (Ready to Pack in November 2026) that is shipped months later by a demo user shows a very long cycle time, and it lands in the period of its business `ship_date` (the reporting date). It also includes nights and weekends (no calendar). The demo script uses a **newly created** shipment (seed-plan test 7), and tests must not pin the KPI-6 value of a seeded open shipment shipped on a later real date. The tile carries a footnote (below) and the same text is `note` in the API.

**Tile text.** "Shipment Cycle Time (median)". Value "26.4 h". Sub-line: "9 in 10 shipments within {p90_1dp} h · {shipments_measured} shipments". Target "Target 24 h or less". **Tooltip:** "Elapsed hours from first Ready to Pack to Shipped, for shipments shipped in the period. The tile shows the median (half of shipments were faster); the 90th percentile is shown beside it. This is real elapsed clock time, including nights, weekends and any rework, so in this demo a shipment left open for days and shipped later shows a long time."

## 9. KPI-7 Inventory record accuracy % (UD-7)

| Item | Definition |
|------|-----------|
| Primary metric (UD-7) | **first-count accuracy**: count lines whose **first counted** quantity is within tolerance ÷ count lines counted × 100. A recount never rescues a line from being a miss. |
| Secondary metric | **after-recount accuracy**: same with the final quantity (`COALESCE(recount_qty, counted_qty)`), shown as `extra.after_recount_pct`; not a tile. Also `absolute_variance_units = Σ |final variance_qty|`. |
| Population | lines of `cycle_count` with `status = 'Approved'` and `approved_business_date` in the period, with `counted_qty IS NOT NULL`. Unapproved counts (Open, Counted) are excluded. |
| Period date | `cycle_count.approved_business_date` |
| Tolerance | the **snapshot** on the line (`tolerance_pct`, from `tolerance_a/b/c_pct` at count creation): within tolerance iff `abs(counted − system) × 100 <= system × tolerance_pct` (generated column `first_in_tolerance`). `system = 0`: only `counted = 0` is within tolerance (0 ≤ 0); any counted quantity is a miss. |
| Null rule | no lines gives `null` (also for `after_recount_pct`); `absolute_variance_units` 0 |
| Target | `target_inventory_accuracy_pct`, `>=` |
| extra | `{ after_recount_pct, absolute_variance_units, lines_counted, by_class: { "A": {value, numerator, denominator}, "B": ..., "C": ... } }`. `by_class` uses the line's `abc_class` snapshot; classes with no lines are `{ value: null, numerator: 0, denominator: 0 }`. It feeds chart C6 (deferred) and the cycle-count report R6 (deferred); it costs nothing and is tested. |
| Not affected by | shipment filters, basis, tolerance days |

```sql
SELECT COUNT(*) AS denominator,
       COUNT(*) FILTER (WHERE l.first_in_tolerance) AS numerator,
       COUNT(*) FILTER (WHERE l.final_in_tolerance) AS after_recount_numerator,
       COALESCE(SUM(abs(l.variance_qty)), 0)        AS absolute_variance_units
  FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
 WHERE c.status = 'Approved' AND c.approved_business_date BETWEEN $from AND $to AND l.counted_qty IS NOT NULL;
-- by class: add l.abc_class to SELECT and GROUP BY
```

**Tile text.** "Inventory Accuracy (first count)". "{numerator} of {denominator} count lines correct on the first count · {after_recount_pct} % after recount". **Tooltip:** "Count lines in counts approved in the period whose first counted quantity was within tolerance of the system quantity (A items exact, B within 2 %, C within 5 %), divided by all lines counted, times 100. A recount does not turn a miss into a hit; the figure after recount is shown for information. Counts not yet approved are not included."

## 10. Chart data definitions (C1, C2, C3)

C4 to C6 are deferred (scope 3.8). Charts call the same module functions as the tiles; **a chart total must equal the corresponding tile** (test).

### 10.1 Common

- Parameters: `from`, `to` (default as G-1), `basis` (C1), `granularity` (C2). Dates and weeks are UTC.
- **ISO week** (Monday to Sunday). `week` label `IYYY-"W"IW` (for example `2026-W48`, Monday 2026-11-23). Computation (TypeScript, UTC only): `d` = date; `thursday = d + (4 - isoWeekday(d))` days (isoWeekday Monday = 1 ... Sunday = 7); ISO year = year of that Thursday; week number = `floor((dayOfYear(thursday) - 1) / 7) + 1`. Year boundary examples: 2026-12-28 (Mon) is `2026-W53` (2026 has 53 weeks because 1 January 2026 is a Thursday); 2027-01-04 is `2027-W01`; 2025-12-29 is `2026-W01`. Test those.
- **Clipping:** buckets partially outside `[from, to]` contain only shipments inside the period, so the sum of bucket numerators and denominators equals the tile (G-1). Such a bucket has `partial: true` and carries `range_from`/`range_to` (the clipped range) for the click-through filter, while `week_start`/`week_end` stay the full ISO week.
- **Gaps:** a bucket with no shipments has `value: null` (gap), never 0.
- Every response also returns `table` (the same rows, for the accessible data table) and `summary` (one-sentence text for screen readers, built by the module, for example "On-time shipment % was 83.5 % over 5 weeks, below the 95 % target; lowest week 2026-W46 at 70.0 %.").

### 10.2 C1 On-time shipment % by ISO week vs target (question: "Are we trending toward on time?")

- Buckets: every ISO week overlapping `[from, to]`, in order (also empty weeks, as gaps). Default window gives 5 buckets (2026-W44 partial to 2026-W48 partial).
- Per bucket: KPI-1 definition (G-11 basis and tolerance) over shipments with `ship_date` in the clipped week.
- `target` = `target_on_time_pct`. `overall` = the KPI-1 tile figures for the period; `previous_overall` = KPI-1 for the previous period (the previous-period comparison shown beside the chart; weekly points of the previous period are not drawn).

### 10.3 C2 Shipments per day vs packaging error rate (question: "Do errors rise when volume rises?")

- Buckets: `granularity = day`: every calendar day in `[from, to]` (weekends included, with 0 shipments); `week`: ISO weeks as C1 (clipped).
- Per bucket: `shipments_shipped` (rows of `shipped` in bucket) and `packaging_error_rate_pct` = KPI-3 definition within the bucket (shipments with a countable error ÷ shipments shipped in the bucket; `null` when `shipments_shipped = 0`); also `shipments_with_error`.
- `suggested_granularity` = `week` when the average of `shipments_shipped` over the **days with at least one shipment** is below 5, else `day` (US-057; threshold [A]). Day rates on 1 to 4 shipments jump between 0 and 100 %, so the UI starts on the suggestion and offers a switch.
- `summary_totals` = `{ shipments, shipments_with_error, error_rate_pct, previous: {...same for the previous period} }`; they equal the KPI-3 tile.

### 10.4 C3 Packaging errors by category — Pareto (question: "Which few categories cause most errors?")

- Population: **countable errors** (section 6.1) on non-cancelled shipments whose **`detected_at` UTC date is in `[from, to]`**. C3 is by detection date because the Pareto is a quality-log view ("what did we find in this period"); it therefore need not equal KPI-3's error count (ship-date based), and the chart caption says so.
- Series: one entry per category with count > 0 (zero-count categories omitted), sorted by `count` descending, **ties by category name ascending** (stable, tested). `cumulative_pct = 100 × running_count ÷ total` in integer arithmetic on the running sum; the last entry is exactly `100`. `pct` = `100 × count ÷ total`.
- `previous_count` per category = count in the previous period (0 if none) so the table can show "up / down"; categories existing only in the previous period are not listed. `total` and `previous_total`.
- Empty period: `series: []`, `total: 0`, summary "No packaging errors were logged in this period."
- Category names are the 8 values of `packaging_error.category`; `Other` is shown like any other (flag text "needs recategorising" is a UI concern).

## 11. API payloads (align with contract section 9)

The endpoints only parse parameters, call the module and shape the result (contract E-48, E-49). Customer and carrier filters are deferred (scope 3.8); `from`/`to`, `basis`, `granularity` are the only parameters.

### 11.1 `GET /api/v1/kpis`

```json
{ "data": {
  "period": { "from": "2026-10-27", "to": "2026-11-25", "days": 30 },
  "previous_period": { "from": "2026-09-27", "to": "2026-10-26", "days": 30 },
  "basis": "promise", "tolerance_days": 0,
  "reporting": { "mode": "fixed", "reporting_date": "2026-11-25", "label": "..." },
  "kpis": [
    { "kpi_id": 1, "key": "on_time_pct", "name": "On-Time Shipment %", "unit": "%", "tile": true,
      "value": 83.64963503649635, "value_1dp": 83.6, "previous_value": 94.2, "previous_value_1dp": 94.2,
      "delta": -10.55036496350365, "trend": "Down", "good_direction": "up", "change_assessment": "Worse",
      "target": 95, "target_comparison": ">=", "meets_target": false,
      "numerator": 229, "denominator": 274, "extra": { "tolerance_days": 0, "late_count": 45 },
      "definition": "<tooltip text of section 4>", "note": null } ] } }
```

- Order and keys: `on_time_pct` (1), `otif_pct` (2), `pkg_error_rate_pct` (3), `fpy_pct` (4), `cycle_time_median_h` (6), `inventory_accuracy_pct` (7), `rework_frequency_pct` (5, `tile: false`). `extra` per KPI as in sections 4 to 9.
- `value`, `delta` and the `_1dp` fields are `null` for "No data"; then `trend`, `change_assessment`, `meets_target` are `null`. `numerator`/`denominator` are always integers (KPI-6: `numerator null`, `denominator` = measured shipments).
- `definition` is the tooltip text of this spec (the module owns the strings). `note` is `null` except KPI-6 (the D-1 limitation sentence).
- Validation: `from <= to`, span at most 366 days, both or neither (422 otherwise), unchanged from E-48.
- The example numbers above are illustrative; they are not seed output.

### 11.2 `GET /api/v1/kpis/charts/{C1|C2|C3}`

```json
// C1
{ "data": { "chart": "C1", "period": {...}, "basis": "promise", "target": 95,
  "series": [ { "week": "2026-W44", "week_start": "2026-10-26", "week_end": "2026-11-01",
                "partial": true, "range_from": "2026-10-27", "range_to": "2026-11-01",
                "value": 92.3, "numerator": 12, "denominator": 13 } ],
  "overall": { "value": 83.6, "numerator": 229, "denominator": 274 },
  "previous_overall": { "value": 94.2, "numerator": 130, "denominator": 138 },
  "summary": "...", "table": { "columns": [...], "rows": [...] } } }
// C2
{ "data": { "chart": "C2", "granularity": "day", "suggested_granularity": "week",
  "series": [ { "date": "2026-11-05", "shipments_shipped": 4, "shipments_with_error": 1, "packaging_error_rate_pct": 25.0 } ],
  "summary_totals": { "shipments": 274, "shipments_with_error": 20, "error_rate_pct": 7.3, "previous": {...} },
  "summary": "...", "table": {...} } }
// (granularity = "week": series items use "week","week_start","week_end","partial","range_from","range_to" instead of "date")
// C3
{ "data": { "chart": "C3",
  "series": [ { "category": "Incorrect label", "count": 5, "pct": 50.0, "cumulative_pct": 50.0, "previous_count": 3 } ],
  "total": 10, "previous_total": 7, "summary": "...", "table": {...} } }
```

Percent values in the series are full precision numbers; the UI rounds to 1 dp. Contract §9 shapes are kept; the **additions** are listed for Marcus below.

### 11.3 Contract edits for Marcus (`docs/api/contract.md`, section 9 and packaging-error endpoints)

| # | Edit |
|---|------|
| CE-1 | E-48 per KPI: add `value_1dp`, `previous_value_1dp`, `good_direction` (`up|down`), `change_assessment` (`Better|Worse|Same|null`), `note`; add top-level `tolerance_days`, `previous_period.days`. State that `meets_target` compares the 1-dp value (G-6), that KPI-3 `<` is strict and KPI-6 `<=`, and the `extra` contents of sections 4 to 9 (KPI-3 adds `errors`, `shipments_with_error`, `excluded_errors`; KPI-7 adds `after_recount_pct`, `absolute_variance_units`, `lines_counted`, `by_class`; KPI-4 adds the three failure counts; KPI-6 `p90_h`, `p90_h_1dp`, `shipments_measured`, `within_target_pct`). |
| CE-2 | E-48 text and `docs/05`: KPI-3 population is shipped shipments by `ship_date` (UD-8); KPI-4 numerator counts countable After-ship errors (UD-9); KPI-7 value is first-count (UD-7). Remove "verified or shipped" wording wherever it appears (contract, schema.md section 8 oracle query, `kpi-definitions` skill). |
| CE-3 | E-49 C1: add `partial`, `range_from`, `range_to` per point, `overall`, `previous_overall`, `summary`, `table`. C2: add `suggested_granularity`, `shipments_with_error`, `summary_totals`, week points with `partial`/`range_*`. C3: add `pct`, `previous_count`, `previous_total`, tie rule (category ascending), countable-error population and `detected_at` basis. |
| CE-4 | Packaging-error create/update endpoints (E-18 and the update/contain endpoint of the same group): add `packaging_related` (boolean, default `true`; `false` only when `detected_stage = 'After ship'`; setting `false` allowed for Quality and Supervisor only; required `reason` string on that change, written to the audit row; 403 for others, 422 if Before ship). Return the field in the error resource and in R3. |
| CE-5 | E-50 R1: `on_time` and `days_late` come from the KPI module helper (already stated); add that the helper exports `isOnTime(shipDate, basisDate, toleranceDays)` and `daysLate(...)`. |

## 12. Schema changes required

| # | Change | Why | Owner |
|---|--------|-----|-------|
| S-1 | `packaging_error.packaging_related boolean NOT NULL DEFAULT true` with `CHECK (packaging_related OR detected_stage = 'After ship')`. Not covered by `reject_delete` or append-only triggers; updates are audited by the API. Edit goes into **migration 0001** (it has not been written yet; no expand/contract needed). | UD-9 criterion. | Dana (schema text: Marcus) |
| S-2 | Views are optional for the module. If `v_shipment_quality` is kept, its `error_count`, `internal_error_count`, `escape_error_count` must use the countable-error rule (section 3) and `v_shipment_delivery.cycle_hours` must be unrounded `double precision`. Recommended: the module uses the base-table SQL of this spec and the views serve R1 only, so the rule exists once. | avoid two copies of the rule | Dana |
| S-3 | schema.md section 8: replace the KPI-3/KPI-4 oracle query with the sections 6.2/6.3 SQL; KPI-7 oracle keeps first-count as the first column and labels it primary (UD-7). | oracle must equal the spec | Marcus |
| S-4 | Nothing else: `rework_event.completed_business_date`, `shipment_verification.business_date` (attempt 1 partial index), `cycle_count.approved_business_date`, `cycle_count_line.first_in_tolerance`/`final_in_tolerance`/`abc_class` snapshot, and the status-history index already cover every query. | | |
| S-5 | Seed: all 3 seeded After-ship errors stay `packaging_related = true` (the default), so seed-plan counts are unchanged. KPI bands in seed-plan section 10 for KPI-3 are over **shipped** shipments only (the two open Rework shipments and SH-1284/1285 errors are excluded until shipped). | | Dana |

## 13. Expected values under these rules (hand calculations, to become unit-test expectations)

All values from the small fixtures of seed-plan section 11 (period 2026-11-01 .. 2026-11-30, tolerance 0, basis promise unless stated). I recomputed each by hand.

### 13.1 Fixture A (KPI-1, KPI-2, KPI-6)

| Shipment | Promise | Ship date | days_late | On time | In full | Cycle h (ship − first Ready to Pack) |
|----------|---------|-----------|----------:|:------:|:-------:|------:|
| SH-1001 | 11-03 | 11-03 | 0 | yes | yes | 02:00 → 12:00 = 10 |
| SH-1002 | 11-03 | 11-04 | 1 | no | yes | 11-03 08:00 → 11-04 14:00 = 24 + 6 = 30 |
| SH-1003 | 11-10 | 11-05 | −5 | yes | no (8 < 10) | 11-04 12:00 → 11-05 08:00 = 20 |
| SH-1004 | | cancelled | | excluded | | |
| SH-1005 | 11-30 | 11-30 | 0 | yes | yes | 00:00 → 12:00 = 12 |
| SH-1006 | 11-30 | 12-01 | 1 | outside period | | |

| Test | Calculation | Expected |
|------|-------------|----------|
| KPI-1, 11-01..11-30 | shipped 4 (1001, 1002, 1003, 1005); on time 3 | **75.0 %** (3 / 4) |
| KPI-2 | on time and in full: 1001, 1005 | **50.0 %** (2 / 4) |
| KPI-6 median | sorted {10, 12, 20, 30}; h = 1.5 → 12 + 0.5·8 | **16 h** |
| KPI-6 P90 | h = 2.7 → 20 + 0.7·10 | **27.0 h** |
| `within_target_pct` (target 24 h) | 10, 12, 20 within; 30 not | 75.0 |
| All on time: 11-03..11-03 | SH-1001 only | KPI-1 100.0, KPI-2 100.0, median 10 |
| None on time: 11-04..11-04 | SH-1002 only (1 day late) | KPI-1 **0.0**, KPI-2 0.0, median 30 |
| Empty: 11-15..11-20 | no shipments | all `null`, denominator 0 |
| Boundary inclusive: 11-30..11-30 | SH-1005 | 1 shipment, KPI-1 100.0 |
| Boundary exclusive: 11-01..11-30 excludes SH-1006 | ship date 12-01 | not counted (denominator stays 4) |
| Boundary next day: 12-01..12-01 | SH-1006 | KPI-1 **0.0** (late), median 12 |
| Tolerance 1 day, 11-01..11-30 | SH-1002 days_late 1 ≤ 1 now on time | KPI-1 **100.0** (4 / 4), KPI-2 **75.0** (1001, 1002, 1005 = 3 / 4) |
| Previous period (10-02..10-31) | no data | `previous_value null`, `delta null`, `trend null`, `change_assessment null` |
| Cancelled | SH-1004 never in any denominator | covered by the rows above |
| Partial shipment | SH-1003 on time but not in full | KPI-1 counts it, KPI-2 does not |
| Chart C1 (11-01..11-30; 11-01 is a Sunday) | weeks: W44 (10-26..11-01, clipped to 11-01) null; W45 (11-02..11-08) 1001, 1002, 1003 → 2/3 = **66.7**; W46, W47, W48 null; W49 (11-30..12-06, clipped to 11-30) 1005 → 1/1 = **100.0** | numerators 2 + 1 = 3, denominators 3 + 1 = 4 equal the KPI-1 tile |
| Rounding check | 1/3 → (2000·1 + 3) / 6 = 333.8 → floor 333 → **33.3**; 2/3 → (4000 + 3) / 6 = 667.2 → **66.7**; 3/4 → **75.0** | G-5 |

### 13.2 Fixture B (KPI-3, KPI-4, KPI-5), ship dates SH-2001 11-05, SH-2002 11-06, SH-2003 11-08, SH-2004 11-10, SH-2006 11-13 (SH-2005 cancelled)

| Metric | Calculation | Expected |
|--------|-------------|----------|
| KPI-3 population (UD-8) | shipped in period, not cancelled: 2001, 2002, 2003, 2004, 2006 | denominator **5** |
| KPI-3 numerator | with a countable error: 2003 (Before ship), 2004 (After ship, Customer, `packaging_related` true), 2006 (one error row) | **3** → **60.0 %** |
| Errors per 100 | errors = 1 + 1 + 1 = 3 → 3 / 5 | **60.0** |
| Internal / escape | Before ship: 2003, 2006 = 2; After ship: 2004 = 1 | **2 / 1** |
| KPI-4 population | attempt-1 verifications in period, not cancelled: 2001 (Pass), 2002 (Pass), 2003 (Fail), 2004 (Pass), 2006 (Fail) | denominator **5** |
| KPI-4 numerator | Pass and no countable error: 2001, 2002 (2004 passed first time but has a countable customer-found error: UD-9) | **2** → **40.0 %** |
| KPI-4 extra | first attempt failed: 2003, 2006 = 2; passed but errored: 2004 = 1; escape failures: 2004 = 1 | 2 / 1 / 1 |
| KPI-5 | events completed in period: SH-2003 (30), SH-2006 (45 and 20) = 3; shipped 5 | **60.0 %**; total **95 min**; average 95/3 = 31.666... → **31.67 min** |
| UD-9 flag test | same data with SH-2004's error `packaging_related = false` | KPI-3 numerator 2 → **40.0 %**; errors per 100 **40.0**; escapes **0**; `excluded_errors` 1; KPI-4 numerator 2001, 2002, 2004 = 3 → **60.0 %** |
| UD-8 ship-date test (extra fixture row SH-2007: first attempt Pass on 11-30, no error, shipped 12-01) | KPI-3 11-01..11-30: not shipped in period, so denominator stays 5, **60.0 %**; KPI-4: first verified 11-30 so in period: denominator 6, numerator 3 → **50.0 %**; KPI-3 for 12-01..12-01: SH-2007 only → 0 / 1 = **0.0 %** (not `null`) | proves the two period dates |
| Late customer error test | the same SH-2004 error logged on 12-02 (after the period) | KPI-3 and KPI-4 for November are the same as above: errors attach to the shipment regardless of detection date (G-10) |
| Cancelled | SH-2005 in no denominator, no errors counted even if it had one | |
| Empty period 11-15..11-20 | no shipments, no verifications | KPI-3 `null`, KPI-4 `null`, KPI-5 `null` (events 0, total 0, avg `null`) |
| Rework with no shipments | events completed in a period with 0 shipped | KPI-5 `value null`, `extra.rework_events` still reported |
| Chart C2, day | 11-05: 1 shipment 0.0 %; 11-06: 1, 0.0 %; 11-08: 1, 100.0 %; 11-10: 1, 100.0 %; 11-13: 1, 100.0 %; every other day 0 shipments, rate `null` | `suggested_granularity = week` (average 1 per shipping day < 5) |
| Chart C2, week | W45 (11-02..11-08): 2001, 2002, 2003 → 3 shipments, 1 with error = **33.3 %**; W46 (11-09..11-15): 2004, 2006 → 2, 2 with error = **100.0 %**; W44, W47, W48, W49: 0 shipments, `null` | sums 5 and 3 equal the KPI-3 tile |
| Chart C3 | countable errors by `detected_at` in November: Incorrect label 1, Paperwork 1, Wrong quantity 1 | sorted by category (tie rule): counts 1, 1, 1; cumulative **33.3**, **66.7**, **100**; total 3 |
| C3 backlog fixture | 10 errors: 5 label, 3 paperwork, 2 other | bars 5, 3, 2; cumulative **50, 80, 100** (US-058) |

### 13.3 Fixture C (KPI-7), CC-0001 approved, tolerances A 0 %, B 2 %, C 5 %

| Line | Class | System | Counted | Test (abs diff × 100 ≤ system × tol) | First | Recount | Final |
|------|:----:|-------:|--------:|--------------------------------------|:-----:|--------:|:-----:|
| L1 | A | 100 | 96 | 4·100 = 400 ≤ 100·0 = 0? no | miss | 96 → 400 ≤ 0? no | miss |
| L2 | B | 200 | 195 | 5·100 = 500 ≤ 200·2 = 400? no | miss | 199 → 100 ≤ 400 yes | hit |
| L3 | C | 50 | 52 | 2·100 = 200 ≤ 50·5 = 250 yes | hit | | hit |
| L4 | A | 40 | 40 | 0 ≤ 0 yes | hit | | hit |

| Metric | Expected |
|--------|----------|
| KPI-7 (first count, primary) | 2 / 4 = **50.0 %** |
| `after_recount_pct` | 3 / 4 = **75.0 %** |
| `absolute_variance_units` | |−4| + |−1| + |+2| + 0 = **7** |
| `by_class` (first count) | A: L4 hit, L1 miss = 1 / 2 = **50.0**; B: 0 / 1 = **0.0**; C: 1 / 1 = **100.0** |
| Unapproved count (Open or Counted) in the period | excluded: `null` if it is the only one |
| Period | approved on the first day of the period counts; approved on `to + 1` does not |
| Zero system | line system 0, counted 0 → hit; system 0, counted 3 → miss |
| Empty period | `null` for first count and after recount; variance 0 |
| Not tested by fixture C | tile direction wording: 50.0 vs target 97 → "below target" |

### 13.4 Seed-data expectations (bands, to pin after the first generator run)

Default window 2026-10-27 .. 2026-11-25, previous 2026-09-27 .. 2026-10-26, basis promise, tolerance 0. Bands are those of seed-plan section 10 and are **not** changed by UD-7 to UD-10 except where stated; the generator is calibrated to them and the exact values are then pinned in `tests/unit/kpi` and in the hand-off comparison table (hand calculation = recount from the seed rows with the SQL of sections 3 to 9).

| KPI | Default window | Previous | Note under these rules |
|-----|---------------|----------|-----------------------|
| 1 | 80-88 % | 90-96 % | |
| 2 | 77-86 % | 88-95 % | |
| 3 | 10-16 % | 4-8 % | by ship date; open Rework shipments excluded; customer-found errors (3 in seed) attach to the shipment (S-2 shipment ship date ≥ 11-09 is in the window) |
| 4 | 80-88 % | 90-95 % | includes the 3 customer-found errors as failures when their shipment was first verified in the window; SH-1284 (open, first attempt failed) is in the denominator and fails |
| 5 | 8-14 % | 3-7 % | completed events only; SH-1285 (in progress) not counted |
| 6 | 26-34 h (median) | 18-24 h | |
| 7 | **88.2 % exact** (CC-0010: 15 of 17 lines in tolerance on first count; hand check 15/17 = 0.88235, `after_recount_pct` 16/17 = 94.1 %) | 90-100 % | UD-7 settles SQ-6: the tile is first-count (88.2), after recount (94.1) is secondary |

## 14. Module design constraints (for W2, not code)

- `src/lib/kpi/` = **pure functions** (`percentileCont`, `round1`, `ratio1dp`, `isoWeek`, `buildTrend`, `isCountableError`, `compareTarget`, chart bucketing) + **query functions** taking a postgres.js client + **assemblers** (`computeKpis`, `computeChart`). No `Date.now()`, no settings reads inside the pure part: targets, tolerance, basis and `businessToday` are arguments. No other directory contains any ratio, rounding or percentile code (CI grep for `percentile`, `* 100`).
- Unit tests use in-memory row arrays for the pure part and the fixtures of seed-plan section 11 (loaded in `@netlify/database-dev`) for the SQL part; both must give the section 13 values, and a **consistency test** compares tile totals with chart totals and with `GET /reports/R1` row counts.
- Any change to a definition changes this file and `docs/05` first (kpi-definitions rule).
