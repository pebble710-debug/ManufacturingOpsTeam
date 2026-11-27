// KPI module, aggregation over row arrays (pure; spec sections 4-9). Rows come from queries.ts.
import { percentileCont, ratio1dp, ratioValue, round1, type KpiMeasure } from './pure';

export interface ShippedRow {
  ship_date: string; days_late: number; in_full: boolean; cycle_hours: number | null;
  errors: number; internal: number; escape: number; excluded: number;
}
export interface FpyCounts { denominator: number; numerator: number; first_attempt_failed: number; passed_but_errored: number; escape_failures: number }
export interface ReworkCounts { events: number; total_minutes: number }
export interface CountLineAgg { denominator: number; first_ok: number; final_ok: number; abs_variance: number }
export interface InventoryCounts extends CountLineAgg { by_class: Record<'A' | 'B' | 'C', { first_ok: number; denominator: number }> }

const ratio = (num: number, den: number): KpiMeasure => ({ value: ratioValue(num, den), value_1dp: ratio1dp(num, den), numerator: num, denominator: den, extra: {} });

export function onTimeMeasure(rows: ShippedRow[], tol: number): KpiMeasure {
  const num = rows.filter((r) => r.days_late <= tol).length;
  return { ...ratio(num, rows.length), extra: { tolerance_days: tol, late_count: rows.length - num } };
}
export function otifMeasure(rows: ShippedRow[], tol: number): KpiMeasure {
  const num = rows.filter((r) => r.days_late <= tol && r.in_full).length;
  const full = rows.filter((r) => r.in_full).length;
  return { ...ratio(num, rows.length), extra: { in_full_pct: ratioValue(full, rows.length), short_shipments: rows.length - full } };
}
export function pkgErrorMeasure(rows: ShippedRow[]): KpiMeasure {
  const num = rows.filter((r) => r.errors > 0).length;
  const errors = rows.reduce((s, r) => s + r.errors, 0);
  return {
    ...ratio(num, rows.length),
    extra: {
      errors_per_100_shipments: ratioValue(errors, rows.length), errors_per_100_shipments_1dp: ratio1dp(errors, rows.length),
      errors, shipments_with_error: num,
      internal_catches: rows.reduce((s, r) => s + r.internal, 0), customer_escapes: rows.reduce((s, r) => s + r.escape, 0),
      excluded_errors: rows.reduce((s, r) => s + r.excluded, 0),
    },
  };
}
export function fpyMeasure(c: FpyCounts): KpiMeasure {
  return { ...ratio(c.numerator, c.denominator), extra: { first_attempt_failed: c.first_attempt_failed, passed_but_errored: c.passed_but_errored, escape_failures: c.escape_failures } };
}
export function reworkMeasure(r: ReworkCounts, shipped: number): KpiMeasure {
  return {
    ...ratio(r.events, shipped),
    extra: { rework_events: r.events, total_rework_minutes: r.total_minutes, avg_rework_minutes: r.events === 0 ? null : Math.round((r.total_minutes / r.events) * 100) / 100 },
  };
}
export function cycleTimeMeasure(rows: ShippedRow[], targetH: number | null): KpiMeasure {
  const hrs = rows.map((r) => r.cycle_hours).filter((h): h is number => h !== null);
  const median = percentileCont(hrs, 0.5);
  const p90 = percentileCont(hrs, 0.9);
  return {
    value: median, value_1dp: median === null ? null : round1(median), numerator: null, denominator: hrs.length,
    extra: {
      p90_h: p90, p90_h_1dp: p90 === null ? null : round1(p90), shipments_measured: hrs.length,
      within_target_pct: targetH === null ? null : ratio1dp(hrs.filter((h) => h <= targetH).length, hrs.length),
    },
  };
}
export function inventoryMeasure(c: InventoryCounts): KpiMeasure {
  const by: Record<string, unknown> = {};
  for (const k of ['A', 'B', 'C'] as const) by[k] = { value: ratio1dp(c.by_class[k].first_ok, c.by_class[k].denominator), numerator: c.by_class[k].first_ok, denominator: c.by_class[k].denominator };
  return {
    ...ratio(c.first_ok, c.denominator),
    extra: { after_recount_pct: ratio1dp(c.final_ok, c.denominator), absolute_variance_units: c.abs_variance, lines_counted: c.denominator, by_class: by },
  };
}
