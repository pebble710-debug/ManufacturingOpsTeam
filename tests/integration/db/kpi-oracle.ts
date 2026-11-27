// schema.md section 8 oracle queries (the same SQL the hand fixtures were verified with), run against the seed.
import type { Sql } from '../../../src/lib/db';

export const KPI_ORACLE_WINDOWS = [
  { name: 'default_window_2026-10-27_to_2026-11-25', from: '2026-10-27', to: '2026-11-25' },
  { name: 'previous_period_2026-09-27_to_2026-10-26', from: '2026-09-27', to: '2026-10-26' },
  { name: 'six_months_2026-05-26_to_2026-11-25', from: '2026-05-26', to: '2026-11-25' },
] as const;

export async function kpiOracle(sql: Sql, from: string, to: string): Promise<Record<string, unknown>> {
  const [d] = await sql`
    SELECT COUNT(*)::int AS shipped,
      round(100.0 * COUNT(*) FILTER (WHERE days_late_vs_promise <= 0) / NULLIF(COUNT(*), 0), 1)::float AS on_time_pct,
      round(100.0 * COUNT(*) FILTER (WHERE days_late_vs_promise <= 0 AND in_full) / NULLIF(COUNT(*), 0), 1)::float AS otif_pct,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY cycle_hours)::numeric, 2)::float AS median_cycle_h,
      round(percentile_cont(0.9) WITHIN GROUP (ORDER BY cycle_hours)::numeric, 2)::float AS p90_cycle_h
      FROM v_shipment_delivery WHERE ship_date BETWEEN ${from}::date AND ${to}::date`;
  const [k3] = await sql`
    SELECT COUNT(*)::int AS denominator,
           COUNT(*) FILTER (WHERE COALESCE(ec.errors, 0) > 0)::int AS shipments_with_error,
           COALESCE(SUM(ec.errors), 0)::int AS errors,
           COALESCE(SUM(ec.internal), 0)::int AS internal_catches,
           COALESCE(SUM(ec.escape), 0)::int AS customer_escapes
      FROM shipment s
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship' OR e.packaging_related) AS errors,
               COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship') AS internal,
               COUNT(*) FILTER (WHERE e.detected_stage = 'After ship' AND e.packaging_related) AS escape
          FROM packaging_error e WHERE e.shipment_id = s.id) ec ON true
     WHERE s.status = 'Shipped' AND s.ship_date BETWEEN ${from}::date AND ${to}::date`;
  const [k4] = await sql`
    SELECT COUNT(*)::int AS verified,
           COUNT(*) FILTER (WHERE v.result = 'Pass' AND COALESCE(ec.errors, 0) = 0)::int AS first_pass_no_error
      FROM shipment_verification v
      JOIN shipment s ON s.id = v.shipment_id AND s.status <> 'Cancelled'
      LEFT JOIN LATERAL (SELECT COUNT(*) AS errors FROM packaging_error e
                          WHERE e.shipment_id = s.id AND (e.detected_stage = 'Before ship' OR e.packaging_related)) ec ON true
     WHERE v.attempt_no = 1 AND v.business_date BETWEEN ${from}::date AND ${to}::date`;
  const [k5] = await sql`
    SELECT COUNT(*)::int AS rework_events, COALESCE(SUM(minutes), 0)::int AS total_minutes, round(AVG(minutes), 2)::float AS avg_minutes
      FROM rework_event WHERE completed_business_date BETWEEN ${from}::date AND ${to}::date`;
  const [k7] = await sql`
    SELECT COUNT(*)::int AS lines,
           round(100.0 * COUNT(*) FILTER (WHERE l.first_in_tolerance) / NULLIF(COUNT(*), 0), 1)::float AS accuracy_first_count_pct,
           round(100.0 * COUNT(*) FILTER (WHERE l.final_in_tolerance) / NULLIF(COUNT(*), 0), 1)::float AS accuracy_after_recount_pct,
           COALESCE(SUM(abs(l.variance_qty)), 0)::int AS absolute_variance_units
      FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
     WHERE c.status = 'Approved' AND c.approved_business_date BETWEEN ${from}::date AND ${to}::date AND l.counted_qty IS NOT NULL`;
  const d3 = k3 as { denominator: number; shipments_with_error: number; errors: number };
  const d4 = k4 as { verified: number; first_pass_no_error: number };
  const d5 = k5 as { rework_events: number };
  const dd = d as { shipped: number };
  return {
    ...d,
    kpi3_error_rate_pct: d3.denominator ? Math.round((1000 * d3.shipments_with_error) / d3.denominator) / 10 : null,
    kpi3_errors_per_100: d3.denominator ? Math.round((1000 * d3.errors) / d3.denominator) / 10 : null,
    ...k3,
    kpi4_fpy_pct: d4.verified ? Math.round((1000 * d4.first_pass_no_error) / d4.verified) / 10 : null,
    ...k4,
    kpi5_rework_freq_pct: dd.shipped ? Math.round((1000 * d5.rework_events) / dd.shipped) / 10 : null,
    ...k5,
    ...k7,
  };
}
