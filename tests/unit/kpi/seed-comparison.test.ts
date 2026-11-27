// KPI module versus the pinned seed values (seed-plan 10.1, oracle queries in tests/integration/db/kpi-oracle.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from '../../helpers/testdb';
import { resetAndSeed } from '../../../src/lib/seed/index';
import { getKpis } from '../../../src/lib/kpi';
import { kpiOracle } from '../../integration/db/kpi-oracle';

let db: Awaited<ReturnType<typeof startTestDb>>;
type K = Awaited<ReturnType<typeof getKpis>>['kpis'][number];
const by = (ks: K[]) => Object.fromEntries(ks.map((k) => [k.key, k]));

beforeAll(async () => {
  db = await startTestDb();
  await resetAndSeed(db.sql, { remote: false, scryptParams: { log2N: 10, r: 8, p: 1 } });
}, 120_000);
afterAll(async () => { await db?.stop(); });

describe('seed data, default window 2026-10-27..2026-11-25', () => {
  it('current and previous period match the pinned table', async () => {
    const d = await getKpis({ businessToday: '2026-11-25' }, db.sql);
    expect(d.period).toMatchObject({ from: '2026-10-27', to: '2026-11-25' });
    const c = by(d.kpis);
    expect(c.on_time_pct).toMatchObject({ value_1dp: 84.2, denominator: 76 });
    expect(c.otif_pct.value_1dp).toBe(81.6);
    expect(c.pkg_error_rate_pct).toMatchObject({ value_1dp: 11.8, numerator: 9, denominator: 76 });
    expect(c.pkg_error_rate_pct.extra).toMatchObject({ errors_per_100_shipments_1dp: 11.8, internal_catches: 8, customer_escapes: 1 });
    expect(c.fpy_pct).toMatchObject({ value_1dp: 86.3, numerator: 69, denominator: 80 });
    expect(c.rework_frequency_pct).toMatchObject({ value_1dp: 13.2 });
    expect(c.rework_frequency_pct.extra).toMatchObject({ rework_events: 10, total_rework_minutes: 439, avg_rework_minutes: 43.9 });
    expect(c.cycle_time_median_h.value).toBeCloseTo(27.58, 2);
    expect(c.cycle_time_median_h.extra.p90_h as number).toBeCloseTo(84.39, 2);
    expect(c.inventory_accuracy_pct).toMatchObject({ value_1dp: 88.2, numerator: 15, denominator: 17 });
    expect(c.inventory_accuracy_pct.extra).toMatchObject({ after_recount_pct: 94.1, absolute_variance_units: 7 });

    const p = by((await getKpis({ from: d.previous_period.from, to: d.previous_period.to, businessToday: '2026-11-25' }, db.sql)).kpis);
    expect(p.on_time_pct).toMatchObject({ value_1dp: 86.8, denominator: 38 });
    expect(p.otif_pct.value_1dp).toBe(86.8);
    expect(p.pkg_error_rate_pct).toMatchObject({ value_1dp: 5.3, numerator: 2 });
    expect(p.fpy_pct).toMatchObject({ value_1dp: 94.7, numerator: 36, denominator: 38 });
    expect(p.rework_frequency_pct.extra).toMatchObject({ rework_events: 3, total_rework_minutes: 91, avg_rework_minutes: 30.33 });
    expect(p.cycle_time_median_h.value).toBeCloseTo(19.48, 2);
    expect(p.cycle_time_median_h.extra.p90_h as number).toBeCloseTo(68.03, 2);
    expect(p.inventory_accuracy_pct).toMatchObject({ value_1dp: 100, denominator: 34 });
    expect(p.inventory_accuracy_pct.extra).toMatchObject({ after_recount_pct: 100, absolute_variance_units: 49 });
    // the tile deltas come from the previous period
    expect(c.on_time_pct).toMatchObject({ trend: 'Down', change_assessment: 'Worse' });
  });

  it('tiles equal the oracle queries (default window)', async () => {
    const o = await kpiOracle(db.sql, '2026-10-27', '2026-11-25') as Record<string, any>;
    const c = by((await getKpis({ businessToday: '2026-11-25' }, db.sql)).kpis);
    expect(c.on_time_pct.value_1dp).toBe(o.on_time_pct);
    expect(c.otif_pct.value_1dp).toBe(o.otif_pct);
    expect(c.cycle_time_median_h.value).toBeCloseTo(o.median_cycle_h, 2);
  });
});
