// Fixture A (kpi-spec 13.1): KPI-1, KPI-2, KPI-6, chart C1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from '../../helpers/testdb';
import { getChart, getKpis } from '../../../src/lib/kpi';
import { percentileCont } from '../../../src/lib/kpi/pure';
import { addShipment, load } from './fixtures';

let db: Awaited<ReturnType<typeof startTestDb>>;
const kpi = async (from: string, to: string, extra: Record<string, unknown> = {}) => {
  const d = await getKpis({ from, to, businessToday: '2026-11-25', ...extra }, db.sql);
  return Object.fromEntries(d.kpis.map((k) => [k.key, k]));
};

beforeAll(async () => {
  db = await startTestDb();
  await load(db.sql, async (tx) => {
    await addShipment(tx, { no: 'SH-1001', promise: '2026-11-03', ship: '2026-11-03', readyAt: '2026-11-03T02:00:00Z', shippedAt: '2026-11-03T12:00:00Z', lines: [[10, 10]] });
    await addShipment(tx, { no: 'SH-1002', promise: '2026-11-03', ship: '2026-11-04', readyAt: '2026-11-03T08:00:00Z', shippedAt: '2026-11-04T14:00:00Z', lines: [[5, 5]] });
    await addShipment(tx, { no: 'SH-1003', promise: '2026-11-10', ship: '2026-11-05', readyAt: '2026-11-04T12:00:00Z', shippedAt: '2026-11-05T08:00:00Z', lines: [[10, 8]] });
    await addShipment(tx, { no: 'SH-1004', promise: '2026-11-10', cancelled: true });
    await addShipment(tx, { no: 'SH-1005', promise: '2026-11-30', ship: '2026-11-30', readyAt: '2026-11-30T00:00:00Z', shippedAt: '2026-11-30T12:00:00Z', lines: [[1, 1]] });
    await addShipment(tx, { no: 'SH-1006', promise: '2026-11-30', ship: '2026-12-01', readyAt: '2026-12-01T00:00:00Z', shippedAt: '2026-12-01T12:00:00Z', lines: [[1, 1]] });
  });
}, 90_000);
afterAll(async () => { await db?.stop(); });

describe('fixture A', () => {
  it('November: KPI-1 75.0, KPI-2 50.0, median 16, P90 27', async () => {
    const k = await kpi('2026-11-01', '2026-11-30');
    expect(k.on_time_pct).toMatchObject({ value_1dp: 75, numerator: 3, denominator: 4, meets_target: false });
    expect(k.on_time_pct.extra).toMatchObject({ late_count: 1, tolerance_days: 0 });
    expect(k.otif_pct).toMatchObject({ value_1dp: 50, numerator: 2, denominator: 4 });
    expect(k.cycle_time_median_h.value).toBeCloseTo(16, 9);
    expect(k.cycle_time_median_h.extra.p90_h).toBeCloseTo(27, 9);
    expect(k.cycle_time_median_h).toMatchObject({ denominator: 4, numerator: null, meets_target: true });
    expect(k.cycle_time_median_h.extra.within_target_pct).toBe(75);
    expect(k.cycle_time_median_h.note).toBeTruthy();
  });
  it('SQL percentile_cont agrees with the TypeScript function (UD-10)', async () => {
    const [r] = await db.sql<{ med: number; p90: number }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY h)::float8 AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY h)::float8 AS p90 FROM (VALUES (10.0::float8),(12),(20),(30)) t(h)`;
    expect(r.med).toBeCloseTo(percentileCont([10, 12, 20, 30], 0.5)!, 9);
    expect(r.p90).toBeCloseTo(percentileCont([10, 12, 20, 30], 0.9)!, 9);
  });
  it('all on time (11-03)', async () => {
    const k = await kpi('2026-11-03', '2026-11-03');
    expect([k.on_time_pct.value_1dp, k.otif_pct.value_1dp, k.cycle_time_median_h.value]).toEqual([100, 100, 10]);
  });
  it('none on time (11-04)', async () => {
    const k = await kpi('2026-11-04', '2026-11-04');
    expect([k.on_time_pct.value_1dp, k.otif_pct.value_1dp, k.cycle_time_median_h.value]).toEqual([0, 0, 30]);
  });
  it('empty period gives null and zero denominator, previous null too', async () => {
    const k = await kpi('2026-11-15', '2026-11-20');
    for (const key of ['on_time_pct', 'otif_pct', 'cycle_time_median_h']) expect(k[key]).toMatchObject({ value: null, value_1dp: null, denominator: 0, meets_target: null, trend: null, delta: null });
  });
  it('boundaries: inclusive upper day, exclusive next day', async () => {
    expect((await kpi('2026-11-30', '2026-11-30')).on_time_pct).toMatchObject({ denominator: 1, value_1dp: 100 });
    expect((await kpi('2026-12-01', '2026-12-01')).on_time_pct).toMatchObject({ denominator: 1, value_1dp: 0 });
    expect((await kpi('2026-12-01', '2026-12-01')).cycle_time_median_h.value).toBe(12);
  });
  it('tolerance 1 day: KPI-1 100.0, KPI-2 75.0', async () => {
    const k = await kpi('2026-11-01', '2026-11-30', { tolerance: 1 });
    expect(k.on_time_pct.value_1dp).toBe(100); expect(k.otif_pct.value_1dp).toBe(75);
  });
  it('requested basis follows requested_date', async () => {
    const k = await kpi('2026-11-01', '2026-11-30', { basis: 'requested' });
    expect(k.on_time_pct.value_1dp).toBe(75);
  });
  it('previous period without data has null deltas', async () => {
    const k = await kpi('2026-11-01', '2026-11-30');
    expect(k.on_time_pct).toMatchObject({ previous_value: null, delta: null, trend: null, change_assessment: null });
  });
  it('C1 weekly buckets sum to the tile (66.7 and 100.0)', async () => {
    const c = await getChart('C1', { from: '2026-11-01', to: '2026-11-30', businessToday: '2026-11-25' }, db.sql) as any;
    expect(c.series.map((s: any) => s.value)).toEqual([null, 66.7, null, null, null, 100]);
    expect(c.series.reduce((a: number, s: any) => a + s.numerator, 0)).toBe(c.overall.numerator);
    expect(c.series.reduce((a: number, s: any) => a + s.denominator, 0)).toBe(c.overall.denominator);
    expect(c.overall).toMatchObject({ value: 75, numerator: 3, denominator: 4 });
    expect(c.series[0]).toMatchObject({ partial: true, week: '2026-W44' });
    expect(c.summary).toContain('75.0 %'); expect(c.summary).toContain('lowest week 2026-W45 at 66.7 %');
    expect(c.table.rows).toHaveLength(6);
  });
  it('rejects bad parameters with field errors', async () => {
    await expect(getKpis({ from: '2026-11-30', to: '2026-11-01', businessToday: '2026-11-25' }, db.sql)).rejects.toMatchObject({ fields: { from: expect.any(String) } });
    await expect(getKpis({ from: '2026-11-30', businessToday: '2026-11-25' }, db.sql)).rejects.toMatchObject({ fields: { to: expect.any(String) } });
    await expect(getKpis({ from: '2025-01-01', to: '2026-11-30', businessToday: '2026-11-25' }, db.sql)).rejects.toMatchObject({ fields: { to: expect.any(String) } });
  });
  it('defaults to 30 days ending at the reporting date', async () => {
    const d = await getKpis({ businessToday: '2026-11-25' }, db.sql);
    expect(d.period).toEqual({ from: '2026-10-27', to: '2026-11-25', days: 30 });
    expect(d.reporting.label).toBe('Reporting as of 25 Nov 2026 — demonstration data');
    expect(d.kpis.map((k) => k.key)).toEqual(['on_time_pct', 'otif_pct', 'pkg_error_rate_pct', 'fpy_pct', 'cycle_time_median_h', 'inventory_accuracy_pct', 'rework_frequency_pct']);
  });
});
