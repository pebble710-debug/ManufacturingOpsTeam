// KPI module entry points (kpi-spec section 11): getKpis(), getChart(). Endpoints and pages only call these.
import { getSql, type Sql } from '../db';
import {
  buildKpi, buildPareto, defaultPeriod, eachDay, formatLongDate, isValidYmd, makePeriod, previousPeriod, ratio1dp,
  weekBuckets, type Basis, type KpiDef, type KpiResult, type Period,
} from './pure';
import { cycleTimeMeasure, fpyMeasure, inventoryMeasure, onTimeMeasure, otifMeasure, pkgErrorMeasure, reworkMeasure, type ShippedRow } from './compute';
import { errorCategoryCounts, fpyCounts, inventoryCounts, loadSettings, reworkCounts, shippedRows, type KpiSettings } from './queries';
import { CYCLE_TIME_NOTE, DEFINITIONS } from './text';

export * from './pure';
export { loadSettings } from './queries';

export class KpiParamError extends Error {
  constructor(message: string, readonly fields: Record<string, string>) { super(message); }
}
export interface KpiParams { from?: string | null; to?: string | null; basis?: string | null; tolerance?: number | null; granularity?: string | null; businessToday: string }

function resolve(params: KpiParams, st: KpiSettings): { period: Period; basis: Basis; tol: number } {
  const f: Record<string, string> = {};
  const hasFrom = !!params.from, hasTo = !!params.to;
  if (hasFrom !== hasTo) f[hasFrom ? 'to' : 'from'] = 'from and to must be given together';
  if (hasFrom && !isValidYmd(params.from)) f.from = 'must be a date YYYY-MM-DD';
  if (hasTo && !isValidYmd(params.to)) f.to = 'must be a date YYYY-MM-DD';
  if (params.basis && params.basis !== 'promise' && params.basis !== 'requested') f.basis = 'must be promise or requested';
  if (params.tolerance != null && (!Number.isInteger(params.tolerance) || params.tolerance < 0 || params.tolerance > 30)) f.tolerance = 'must be a whole number from 0 to 30';
  let period = defaultPeriod(params.businessToday);
  if (Object.keys(f).length === 0 && hasFrom) {
    period = makePeriod(params.from!, params.to!);
    if (period.days < 1) f.from = 'from must not be after to';
    else if (period.days > 366) f.to = 'the period may span at most 366 days';
  }
  if (Object.keys(f).length) throw new KpiParamError('Invalid period or option', f);
  return { period, basis: (params.basis as Basis) || st.on_time_basis, tol: params.tolerance ?? st.on_time_tolerance_days };
}

const DEFS: Record<string, KpiDef> = {
  on_time_pct: { kpi_id: 1, key: 'on_time_pct', name: 'On-Time Shipment %', unit: '%', tile: true, good_direction: 'up', target_comparison: '>=' },
  otif_pct: { kpi_id: 2, key: 'otif_pct', name: 'OTIF %', unit: '%', tile: true, good_direction: 'up', target_comparison: '>=' },
  pkg_error_rate_pct: { kpi_id: 3, key: 'pkg_error_rate_pct', name: 'Packaging Error Rate %', unit: '%', tile: true, good_direction: 'down', target_comparison: '<' },
  fpy_pct: { kpi_id: 4, key: 'fpy_pct', name: 'Packaging First-Pass Yield %', unit: '%', tile: true, good_direction: 'up', target_comparison: '>=' },
  cycle_time_median_h: { kpi_id: 6, key: 'cycle_time_median_h', name: 'Shipment Cycle Time (median)', unit: 'h', tile: true, good_direction: 'down', target_comparison: '<=' },
  inventory_accuracy_pct: { kpi_id: 7, key: 'inventory_accuracy_pct', name: 'Inventory Accuracy (first count)', unit: '%', tile: true, good_direction: 'up', target_comparison: '>=' },
  rework_frequency_pct: { kpi_id: 5, key: 'rework_frequency_pct', name: 'Rework Frequency %', unit: '%', tile: false, good_direction: 'down', target_comparison: '<' },
};

async function measures(sql: Sql, p: Period, basis: Basis, tol: number, st: KpiSettings) {
  // Sequential on purpose: one connection at a time keeps the tiny serverless pool (and the test database) predictable.
  const rows = await shippedRows(sql, p.from, p.to, basis);
  const fpy = await fpyCounts(sql, p.from, p.to);
  const rework = await reworkCounts(sql, p.from, p.to);
  const inv = await inventoryCounts(sql, p.from, p.to);
  return {
    on_time_pct: onTimeMeasure(rows, tol), otif_pct: otifMeasure(rows, tol), pkg_error_rate_pct: pkgErrorMeasure(rows), fpy_pct: fpyMeasure(fpy),
    cycle_time_median_h: cycleTimeMeasure(rows, st.targets.cycle_time), inventory_accuracy_pct: inventoryMeasure(inv), rework_frequency_pct: reworkMeasure(rework, rows.length),
  };
}

const TARGET_KEY: Record<string, keyof KpiSettings['targets']> = {
  on_time_pct: 'on_time', otif_pct: 'otif', pkg_error_rate_pct: 'pkg_error', fpy_pct: 'fpy', cycle_time_median_h: 'cycle_time', inventory_accuracy_pct: 'inventory', rework_frequency_pct: 'rework',
};

export async function getKpis(params: KpiParams, sql: Sql = getSql()) {
  const st = await loadSettings(sql);
  const { period, basis, tol } = resolve(params, st);
  const prev = previousPeriod(period);
  const cur = await measures(sql, period, basis, tol, st);
  const pre = await measures(sql, prev, basis, tol, st);
  const kpis: KpiResult[] = ['on_time_pct', 'otif_pct', 'pkg_error_rate_pct', 'fpy_pct', 'cycle_time_median_h', 'inventory_accuracy_pct', 'rework_frequency_pct'].map((k) =>
    buildKpi(DEFS[k], cur[k as keyof typeof cur], pre[k as keyof typeof pre], st.targets[TARGET_KEY[k]], DEFINITIONS[k], k === 'cycle_time_median_h' ? CYCLE_TIME_NOTE : null));
  const fixed = st.reporting_mode !== 'live';
  return {
    period, previous_period: prev, basis, tolerance_days: tol,
    reporting: { mode: fixed ? 'fixed' : 'live', reporting_date: params.businessToday,
      label: fixed ? `Reporting as of ${formatLongDate(params.businessToday)} — demonstration data` : `Live data as of ${formatLongDate(params.businessToday)}` },
    kpis,
  };
}

// ---- charts -------------------------------------------------------------------------------------
const pct1 = (v: number | null): string => (v === null ? 'no data' : `${v.toFixed(1)} %`);

function weekAgg(rows: ShippedRow[], b: { range_from: string; range_to: string }) {
  return rows.filter((r) => r.ship_date >= b.range_from && r.ship_date <= b.range_to);
}

export async function getChart(chart: string, params: KpiParams, sql: Sql = getSql()) {
  const st = await loadSettings(sql);
  const { period, basis, tol } = resolve(params, st);
  const prev = previousPeriod(period);
  if (chart === 'C1') {
    const rows = await shippedRows(sql, period.from, period.to, basis);
    const prevRows = await shippedRows(sql, prev.from, prev.to, basis);
    const series = weekBuckets(period.from, period.to).map((b) => {
      const m = onTimeMeasure(weekAgg(rows, b), tol);
      return { ...b, value: m.value_1dp, numerator: m.numerator as number, denominator: m.denominator };
    });
    const o = onTimeMeasure(rows, tol), po = onTimeMeasure(prevRows, tol);
    const withData = series.filter((s) => s.value !== null);
    const low = withData.reduce<typeof withData[number] | null>((a, s) => (a === null || (s.value as number) < (a.value as number) ? s : a), null);
    const target = st.targets.on_time;
    const rel = o.value_1dp === null || target === null ? '' : o.value_1dp >= target ? `, meeting the ${target} % target` : `, below the ${target} % target`;
    const summary = o.value_1dp === null ? 'No shipments were shipped in this period.'
      : `On-time shipment % was ${pct1(o.value_1dp)} over ${series.length} weeks${rel}; lowest week ${low!.week} at ${pct1(low!.value)}.`;
    return { chart: 'C1', period, basis, target,
      series,
      overall: { value: o.value_1dp, numerator: o.numerator, denominator: o.denominator },
      previous_overall: { value: po.value_1dp, numerator: po.numerator, denominator: po.denominator },
      summary,
      table: { columns: [{ key: 'week', label: 'ISO week' }, { key: 'range', label: 'Dates' }, { key: 'value', label: 'On time %' }, { key: 'on_time', label: 'On time' }, { key: 'shipped', label: 'Shipped' }],
        rows: series.map((s) => ({ week: s.week + (s.partial ? ' (partial)' : ''), range: `${s.range_from} to ${s.range_to}`, value: s.value, on_time: s.numerator, shipped: s.denominator })) } };
  }
  if (chart === 'C2') {
    const rows = await shippedRows(sql, period.from, period.to, basis);
    const prevRows = await shippedRows(sql, prev.from, prev.to, basis);
    const gran = params.granularity === 'week' ? 'week' : 'day';
    if (params.granularity && params.granularity !== 'day' && params.granularity !== 'week') throw new KpiParamError('Invalid option', { granularity: 'must be day or week' });
    const point = (rs: ShippedRow[]) => ({ shipments_shipped: rs.length, shipments_with_error: rs.filter((r) => r.errors > 0).length,
      packaging_error_rate_pct: ratio1dp(rs.filter((r) => r.errors > 0).length, rs.length) });
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.ship_date, (byDay.get(r.ship_date) ?? 0) + 1);
    const avg = byDay.size === 0 ? 0 : rows.length / byDay.size;
    const series = gran === 'day'
      ? eachDay(period.from, period.to).map((d) => ({ date: d, ...point(rows.filter((r) => r.ship_date === d)) }))
      : weekBuckets(period.from, period.to).map((b) => ({ ...b, ...point(weekAgg(rows, b)) }));
    const tot = (rs: ShippedRow[]) => { const w = rs.filter((r) => r.errors > 0).length; return { shipments: rs.length, shipments_with_error: w, error_rate_pct: ratio1dp(w, rs.length) }; };
    const t = tot(rows);
    const summary = t.shipments === 0 ? 'No shipments were shipped in this period.'
      : `${t.shipments} shipments shipped, ${t.shipments_with_error} with a packaging error (${pct1(t.error_rate_pct)}); ${gran === 'day' ? 'daily' : 'weekly'} view.`;
    const label = gran === 'day' ? 'Date' : 'ISO week';
    return { chart: 'C2', period, granularity: gran, suggested_granularity: avg < 5 ? 'week' : 'day', series,
      summary_totals: { ...t, previous: tot(prevRows) }, summary,
      table: { columns: [{ key: 'bucket', label }, { key: 'shipments_shipped', label: 'Shipments shipped' }, { key: 'shipments_with_error', label: 'With an error' }, { key: 'packaging_error_rate_pct', label: 'Error rate %' }],
        rows: series.map((s) => ({ bucket: 'date' in s ? s.date : s.week, shipments_shipped: s.shipments_shipped, shipments_with_error: s.shipments_with_error, packaging_error_rate_pct: s.packaging_error_rate_pct })) } };
  }
  if (chart === 'C3') {
    const cur = await errorCategoryCounts(sql, period.from, period.to);
    const pre = await errorCategoryCounts(sql, prev.from, prev.to);
    const { series, total, previous_total } = buildPareto(cur, pre);
    const summary = total === 0 ? 'No packaging errors were logged in this period.'
      : `${total} packaging errors were logged; ${series[0].category} is the largest category at ${series[0].count} (${pct1(ratio1dp(series[0].count, total))}). ${(() => { const k = series.findIndex((s) => s.cumulative_pct >= 80); return `The top ${k + 1} of ${series.length} categories make up ${pct1(ratio1dp(series.slice(0, k + 1).reduce((a, s) => a + s.count, 0), total))}.`; })()}`;
    return { chart: 'C3', period, series, total, previous_total, summary,
      table: { columns: [{ key: 'category', label: 'Category' }, { key: 'count', label: 'Errors' }, { key: 'pct', label: 'Share %' }, { key: 'cumulative_pct', label: 'Cumulative %' }, { key: 'previous_count', label: 'Previous period' }],
        rows: series.map((s) => ({ category: s.category, count: s.count, pct: ratio1dp(s.count, total), cumulative_pct: s.cumulative_pct === 100 ? 100 : ratio1dp(Math.round((s.cumulative_pct * total) / 100), total), previous_count: s.previous_count })) } };
  }
  throw new KpiParamError('Unknown chart', { chart: 'must be C1, C2 or C3' });
}

