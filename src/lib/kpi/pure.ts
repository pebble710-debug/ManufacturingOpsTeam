// KPI module, pure part (docs/kpi/kpi-spec.md sections 1, 8, 10, 14).
// No database, no clock, no settings: everything is an argument. All KPI math lives in src/lib/kpi/.

export type Basis = 'promise' | 'requested';
export type GoodDirection = 'up' | 'down';
export type Comparison = '>=' | '<' | '<=';
export type Trend = 'Up' | 'Down' | 'Flat';
export type Assessment = 'Better' | 'Worse' | 'Same';

// ---- dates (UTC, YYYY-MM-DD strings) ---------------------------------------------------------
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = YMD.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const toMs = (ymd: string): number => {
  const m = YMD.exec(ymd)!;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
};
export function fmtYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(ymd: string, n: number): string {
  return fmtYmd(toMs(ymd) + n * 86_400_000);
}
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((toMs(toYmd) - toMs(fromYmd)) / 86_400_000);
}
/** Monday = 1 ... Sunday = 7. */
export function isoWeekday(ymd: string): number {
  const d = new Date(toMs(ymd)).getUTCDay();
  return d === 0 ? 7 : d;
}
export function isoWeekLabel(ymd: string): string {
  const thursday = addDays(ymd, 4 - isoWeekday(ymd));
  const year = +thursday.slice(0, 4);
  const doy = daysBetween(`${year}-01-01`, thursday) + 1;
  return `${year}-W${String(Math.floor((doy - 1) / 7) + 1).padStart(2, '0')}`;
}
export function mondayOf(ymd: string): string {
  return addDays(ymd, 1 - isoWeekday(ymd));
}

export interface Period { from: string; to: string; days: number }
export function makePeriod(from: string, to: string): Period {
  return { from, to, days: daysBetween(from, to) + 1 };
}
/** G-1: default = 30 days ending on business_today. */
export function defaultPeriod(businessToday: string): Period {
  return makePeriod(addDays(businessToday, -29), businessToday);
}
/** G-2 */
export function previousPeriod(p: Period): Period {
  return makePeriod(addDays(p.from, -p.days), addDays(p.from, -1));
}

export interface WeekBucket {
  week: string; week_start: string; week_end: string; partial: boolean; range_from: string; range_to: string;
}
/** Every ISO week overlapping [from, to], clipped ranges for the filter links (spec 10.1). */
export function weekBuckets(from: string, to: string): WeekBucket[] {
  const out: WeekBucket[] = [];
  for (let start = mondayOf(from); start <= to; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const rf = start < from ? from : start;
    const rt = end > to ? to : end;
    out.push({ week: isoWeekLabel(start), week_start: start, week_end: end, partial: rf !== start || rt !== end, range_from: rf, range_to: rt });
  }
  return out;
}
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
/** "2026-11-25" -> "25 Nov 2026" (UTC). */
export function formatLongDate(ymd: string): string {
  return new Date(toMs(ymd)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---- numbers ----------------------------------------------------------------------------------
/** G-5: round half up to 1 dp for non-ratio values (non-negative). */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
/** G-5: ratio in integer arithmetic, floor((2000n + d) / (2d)) / 10; null when d = 0 (G-4). */
export function ratio1dp(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.floor((2000 * num + den) / (2 * den)) / 10;
}
export function ratioValue(num: number, den: number): number | null {
  return den === 0 ? null : (100 * num) / den;
}
/** UD-10: percentile_cont, linear interpolation, h = (n - 1) p. Never nearest rank. */
export function percentileCont(values: readonly number[], p: number): number | null {
  const n = values.length;
  if (n === 0) return null;
  const x = [...values].sort((a, b) => a - b);
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return x[lo] + (h - lo) * (x[hi] - x[lo]);
}

// ---- shipment rules ---------------------------------------------------------------------------
/** Integer days; may be negative. Dates are YYYY-MM-DD. */
export function daysLate(shipDate: string, basisDate: string): number {
  return daysBetween(basisDate, shipDate);
}
export function isOnTime(shipDate: string, basisDate: string, toleranceDays = 0): boolean {
  return daysLate(shipDate, basisDate) <= toleranceDays;
}
/** UD-9: Before ship always counts; After ship counts when packaging related. */
export function isCountableError(e: { detected_stage: string; packaging_related: boolean }): boolean {
  return e.detected_stage === 'Before ship' || (e.detected_stage === 'After ship' && e.packaging_related);
}

// ---- comparison and trend ---------------------------------------------------------------------
export function compareTarget(value1dp: number | null, target: number | null, cmp: Comparison): boolean | null {
  if (value1dp === null || target === null) return null;
  if (cmp === '>=') return value1dp >= target;
  if (cmp === '<') return value1dp < target;
  return value1dp <= target;
}
export function trendOf(delta: number | null): Trend | null {
  if (delta === null) return null;
  const r = Math.round(Math.abs(delta) * 10);
  if (r === 0) return 'Flat';
  return delta > 0 ? 'Up' : 'Down';
}
export function assess(trend: Trend | null, good: GoodDirection): Assessment | null {
  if (trend === null) return null;
  if (trend === 'Flat') return 'Same';
  return (trend === 'Up') === (good === 'up') ? 'Better' : 'Worse';
}

export interface KpiDef {
  kpi_id: number; key: string; name: string; unit: '%' | 'h'; tile: boolean;
  good_direction: GoodDirection; target_comparison: Comparison;
}
export interface KpiMeasure { value: number | null; value_1dp: number | null; numerator: number | null; denominator: number; extra: Record<string, unknown> }
export interface KpiResult extends KpiDef {
  value: number | null; value_1dp: number | null; previous_value: number | null; previous_value_1dp: number | null;
  delta: number | null; trend: Trend | null; change_assessment: Assessment | null;
  target: number | null; meets_target: boolean | null;
  numerator: number | null; denominator: number; extra: Record<string, unknown>;
  definition: string; note: string | null;
}
export function buildKpi(def: KpiDef, cur: KpiMeasure, prev: KpiMeasure, target: number | null, definition: string, note: string | null = null): KpiResult {
  const delta = cur.value !== null && prev.value !== null ? cur.value - prev.value : null;
  const trend = trendOf(delta);
  return {
    ...def,
    value: cur.value, value_1dp: cur.value_1dp,
    previous_value: prev.value, previous_value_1dp: prev.value_1dp,
    delta, trend, change_assessment: assess(trend, def.good_direction),
    target, meets_target: compareTarget(cur.value_1dp, target, def.target_comparison),
    numerator: cur.numerator, denominator: cur.denominator, extra: cur.extra, definition, note,
  };
}

// ---- Pareto (C3) -------------------------------------------------------------------------------
export interface ParetoPoint { category: string; count: number; pct: number; cumulative_pct: number; previous_count: number }
/** Sorted by count desc, ties by category asc; zero counts omitted; cumulative in integer arithmetic. */
export function buildPareto(counts: Record<string, number>, previous: Record<string, number>): { series: ParetoPoint[]; total: number; previous_total: number } {
  const entries = Object.entries(counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'));
  const total = entries.reduce((s, [, c]) => s + c, 0);
  let run = 0;
  const series = entries.map(([category, count]) => {
    run += count;
    return { category, count, pct: (100 * count) / total, cumulative_pct: run === total ? 100 : (100 * run) / total, previous_count: previous[category] ?? 0 };
  });
  return { series, total, previous_total: Object.values(previous).reduce((s, c) => s + c, 0) };
}
