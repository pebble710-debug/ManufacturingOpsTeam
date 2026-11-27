// Presentation helpers for tiles (no KPI math: values and rounding come from src/lib/kpi).
import type { KpiResult } from '../../lib/kpi';

const trim = (n: number, dp: number) => n.toFixed(dp);
export function unitText(k: Pick<KpiResult, 'unit'>): string { return k.unit === '%' ? '%' : 'h'; }

/** Delta wording: "Up 1.1 pts vs previous period (better)". Uses the 1-dp values already computed by the module. */
export function deltaText(k: KpiResult): string {
  if (k.trend === null || k.delta === null) return k.value === null ? '' : 'No previous data to compare';
  const unit = k.unit === '%' ? 'pts' : 'h';
  const amt = trim(Math.abs(Math.round(k.delta * 10) / 10), 1);
  const word = k.change_assessment === 'Better' ? 'better' : k.change_assessment === 'Worse' ? 'worse' : 'unchanged';
  if (k.trend === 'Flat') return `Unchanged vs previous period`;
  return `${k.trend} ${amt} ${unit} vs previous period (${word})`;
}
export function targetText(k: KpiResult): string {
  if (k.target === null) return 'No target set';
  const cmp = k.target_comparison === '>=' ? `${k.target} ${unitText(k)} or higher` : k.target_comparison === '<' ? `below ${k.target} ${unitText(k)}` : `${k.target} ${unitText(k)} or lower`;
  return `Target: ${cmp}`;
}
export function subLine(k: KpiResult): string {
  const e = k.extra as Record<string, any>;
  switch (k.key) {
    case 'on_time_pct': return `${k.numerator} of ${k.denominator} shipments on time`;
    case 'otif_pct': return `${k.numerator} of ${k.denominator} shipments on time and complete`;
    case 'pkg_error_rate_pct': return `${e.shipments_with_error} of ${k.denominator} shipments had an error · ${e.errors_per_100_shipments_1dp ?? 0} errors per 100 shipments`;
    case 'fpy_pct': return `${k.numerator} of ${k.denominator} shipments passed first check with no error`;
    case 'cycle_time_median_h': return `9 in 10 shipments within ${e.p90_h_1dp} h · ${e.shipments_measured} shipments`;
    case 'inventory_accuracy_pct': return `${k.numerator} of ${k.denominator} count lines correct on first count · ${e.after_recount_pct ?? 'no data'} % after recount`;
    default: return '';
  }
}
