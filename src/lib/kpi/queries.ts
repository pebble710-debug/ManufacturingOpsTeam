// KPI module, SQL part (spec section 3 definitions). Dates are returned as text, counts as integers.
import type { Sql } from '../db';
import type { Basis } from './pure';
import type { CountLineAgg, FpyCounts, InventoryCounts, ReworkCounts, ShippedRow } from './compute';

export interface KpiSettings {
  reporting_mode: string; on_time_basis: Basis; on_time_tolerance_days: number;
  targets: Record<'on_time' | 'otif' | 'pkg_error' | 'fpy' | 'rework' | 'cycle_time' | 'inventory', number | null>;
}

export async function loadSettings(sql: Sql): Promise<KpiSettings> {
  const rows = await sql<{ key: string; value: string }[]>`SELECT key, value FROM setting`;
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number | null): number | null => {
    const v = m.get(k);
    return v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v);
  };
  return {
    reporting_mode: m.get('reporting_mode') ?? 'fixed',
    on_time_basis: m.get('on_time_basis') === 'requested' ? 'requested' : 'promise',
    on_time_tolerance_days: num('on_time_tolerance_days', 0) ?? 0,
    targets: {
      on_time: num('target_on_time_pct', 95), otif: num('target_otif_pct', 93), pkg_error: num('target_pkg_error_rate_pct', 2),
      fpy: num('target_fpy_pct', 98), rework: num('target_rework_freq_pct', 2), cycle_time: num('target_cycle_time_h', 24),
      inventory: num('target_inventory_accuracy_pct', 97),
    },
  };
}

/** Shipped shipments with ship_date in [from, to] and their per-shipment facts (KPI-1, 2, 3, 5 denominator, 6, C1, C2). */
export async function shippedRows(sql: Sql, from: string, to: string, basis: Basis): Promise<ShippedRow[]> {
  const basisDate = basis === 'promise' ? sql`s.promise_date` : sql`s.requested_date`;
  const rows = await sql<ShippedRow[]>`
    SELECT to_char(s.ship_date, 'YYYY-MM-DD') AS ship_date,
           (s.ship_date - ${basisDate})::int AS days_late,
           NOT EXISTS (SELECT 1 FROM shipment_line l WHERE l.shipment_id = s.id AND COALESCE(l.qty_shipped, 0) < l.qty_ordered) AS in_full,
           (EXTRACT(EPOCH FROM (s.shipped_at - rtp.at)) / 3600.0)::double precision AS cycle_hours,
           COALESCE(ec.errors, 0)::int AS errors, COALESCE(ec.internal, 0)::int AS internal,
           COALESCE(ec.escape, 0)::int AS escape, COALESCE(ec.excluded, 0)::int AS excluded
      FROM shipment s
      LEFT JOIN LATERAL (SELECT MIN(h.changed_at) AS at FROM shipment_status_history h
                          WHERE h.shipment_id = s.id AND h.to_status = 'Ready to Pack') rtp ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship' OR e.packaging_related) AS errors,
               COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship') AS internal,
               COUNT(*) FILTER (WHERE e.detected_stage = 'After ship' AND e.packaging_related) AS escape,
               COUNT(*) FILTER (WHERE e.detected_stage = 'After ship' AND NOT e.packaging_related) AS excluded
          FROM packaging_error e WHERE e.shipment_id = s.id) ec ON true
     WHERE s.status = 'Shipped' AND s.ship_date BETWEEN ${from}::date AND ${to}::date
     ORDER BY s.ship_date, s.id`;
  return rows.map((r) => ({ ...r, cycle_hours: r.cycle_hours === null ? null : Number(r.cycle_hours) }));
}

export async function fpyCounts(sql: Sql, from: string, to: string): Promise<FpyCounts> {
  const [r] = await sql<FpyCounts[]>`
    SELECT COUNT(*)::int AS denominator,
           COUNT(*) FILTER (WHERE v.result = 'Pass' AND COALESCE(ec.errors, 0) = 0)::int AS numerator,
           COUNT(*) FILTER (WHERE v.result = 'Fail')::int AS first_attempt_failed,
           COUNT(*) FILTER (WHERE v.result = 'Pass' AND COALESCE(ec.errors, 0) > 0)::int AS passed_but_errored,
           COUNT(*) FILTER (WHERE v.result = 'Pass' AND COALESCE(ec.errors, 0) > 0 AND COALESCE(ec.before, 0) = 0)::int AS escape_failures
      FROM shipment_verification v
      JOIN shipment s ON s.id = v.shipment_id AND s.status <> 'Cancelled'
      LEFT JOIN LATERAL (SELECT COUNT(*) AS errors, COUNT(*) FILTER (WHERE e.detected_stage = 'Before ship') AS before
                           FROM packaging_error e
                          WHERE e.shipment_id = s.id AND (e.detected_stage = 'Before ship' OR e.packaging_related)) ec ON true
     WHERE v.attempt_no = 1 AND v.business_date BETWEEN ${from}::date AND ${to}::date`;
  return r;
}

export async function reworkCounts(sql: Sql, from: string, to: string): Promise<ReworkCounts> {
  const [r] = await sql<ReworkCounts[]>`
    SELECT COUNT(*)::int AS events, COALESCE(SUM(r.minutes), 0)::int AS total_minutes
      FROM rework_event r JOIN shipment s ON s.id = r.shipment_id AND s.status <> 'Cancelled'
     WHERE r.completed_business_date BETWEEN ${from}::date AND ${to}::date`;
  return r;
}

export async function inventoryCounts(sql: Sql, from: string, to: string): Promise<InventoryCounts> {
  const rows = await sql<{ abc_class: 'A' | 'B' | 'C'; denominator: number; first_ok: number; final_ok: number; abs_variance: number }[]>`
    SELECT l.abc_class, COUNT(*)::int AS denominator,
           COUNT(*) FILTER (WHERE l.first_in_tolerance)::int AS first_ok,
           COUNT(*) FILTER (WHERE l.final_in_tolerance)::int AS final_ok,
           COALESCE(SUM(abs(l.variance_qty)), 0)::int AS abs_variance
      FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
     WHERE c.status = 'Approved' AND c.approved_business_date BETWEEN ${from}::date AND ${to}::date AND l.counted_qty IS NOT NULL
     GROUP BY l.abc_class`;
  const out: InventoryCounts = { denominator: 0, first_ok: 0, final_ok: 0, abs_variance: 0, by_class: { A: { first_ok: 0, denominator: 0 }, B: { first_ok: 0, denominator: 0 }, C: { first_ok: 0, denominator: 0 } } } satisfies CountLineAgg & { by_class: unknown };
  for (const r of rows) {
    out.denominator += r.denominator; out.first_ok += r.first_ok; out.final_ok += r.final_ok; out.abs_variance += r.abs_variance;
    out.by_class[r.abc_class] = { first_ok: r.first_ok, denominator: r.denominator };
  }
  return out;
}

/** C3: countable errors on non-cancelled shipments by UTC date of detected_at. */
export async function errorCategoryCounts(sql: Sql, from: string, to: string): Promise<Record<string, number>> {
  const rows = await sql<{ category: string; count: number }[]>`
    SELECT e.category, COUNT(*)::int AS count
      FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id AND s.status <> 'Cancelled'
     WHERE (e.detected_stage = 'Before ship' OR e.packaging_related)
       AND (e.detected_at AT TIME ZONE 'UTC')::date BETWEEN ${from}::date AND ${to}::date
     GROUP BY e.category`;
  return Object.fromEntries(rows.map((r) => [r.category, r.count]));
}
