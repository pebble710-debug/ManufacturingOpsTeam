// Fixture B (kpi-spec 13.2): KPI-3, KPI-4, KPI-5, charts C2 and C3.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from '../../helpers/testdb';
import { getChart, getKpis } from '../../../src/lib/kpi';
import { addError, addRework, addShipment, addVerification, load } from './fixtures';

let db: Awaited<ReturnType<typeof startTestDb>>;
let err2004 = 0;
const P = { from: '2026-11-01', to: '2026-11-30', businessToday: '2026-11-25' };
const kpi = async (from = P.from, to = P.to) => {
  const d = await getKpis({ from, to, businessToday: P.businessToday }, db.sql);
  return Object.fromEntries(d.kpis.map((k) => [k.key, k]));
};
const ship = (no: string, d: string) => ({ no, promise: d, ship: d, readyAt: `${d}T01:00:00Z`, shippedAt: `${d}T09:00:00Z` });

beforeAll(async () => {
  db = await startTestDb();
  await load(db.sql, async (tx) => {
    const s1 = await addShipment(tx, ship('SH-2001', '2026-11-05')); await addVerification(tx, s1, 'Pass', '2026-11-04');
    const s2 = await addShipment(tx, ship('SH-2002', '2026-11-06')); await addVerification(tx, s2, 'Pass', '2026-11-05');
    const s3 = await addShipment(tx, ship('SH-2003', '2026-11-08')); await addVerification(tx, s3, 'Fail', '2026-11-07');
    const e3 = await addError(tx, s3, { stage: 'Before ship', category: 'Incorrect label', detectedAt: '2026-11-07T11:00:00Z' });
    await addRework(tx, e3, s3, '2026-11-07T12:00:00Z', '2026-11-07T12:30:00Z');
    const s4 = await addShipment(tx, ship('SH-2004', '2026-11-10')); await addVerification(tx, s4, 'Pass', '2026-11-09');
    err2004 = await addError(tx, s4, { stage: 'After ship', category: 'Paperwork', detectedAt: '2026-11-14T09:00:00Z' });
    const s5 = await addShipment(tx, { no: 'SH-2005', promise: '2026-11-12', cancelled: true }); await addVerification(tx, s5, 'Fail', '2026-11-08');
    const e5 = await addError(tx, s5, { stage: 'Before ship', category: 'Damage', detectedAt: '2026-11-08T09:00:00Z' });
    await addRework(tx, e5, s5, '2026-11-09T08:00:00Z', '2026-11-09T09:00:00Z');
    const s6 = await addShipment(tx, ship('SH-2006', '2026-11-13')); await addVerification(tx, s6, 'Fail', '2026-11-12');
    const e6 = await addError(tx, s6, { stage: 'Before ship', category: 'Wrong quantity', detectedAt: '2026-11-12T11:00:00Z' });
    await addRework(tx, e6, s6, '2026-11-13T08:00:00Z', '2026-11-13T08:45:00Z');
    await addRework(tx, e6, s6, '2026-11-13T09:00:00Z', '2026-11-13T09:20:00Z');
    const s7 = await addShipment(tx, ship('SH-2007', '2026-12-01')); await addVerification(tx, s7, 'Pass', '2026-11-30');
  });
}, 90_000);
afterAll(async () => { await db?.stop(); });

describe('fixture B', () => {
  it('KPI-3: 3 of 5 = 60.0, errors per 100 = 60.0, 2 internal / 1 escape (SH-2005 cancelled, SH-2007 ships in December)', async () => {
    const k = (await kpi()).pkg_error_rate_pct;
    expect(k).toMatchObject({ value_1dp: 60, numerator: 3, denominator: 5, meets_target: false });
    expect(k.extra).toMatchObject({ errors_per_100_shipments: 60, errors: 3, shipments_with_error: 3, internal_catches: 2, customer_escapes: 1, excluded_errors: 0 });
  });
  it('KPI-4: 3 of 6 = 50.0 with SH-2007 first verified 11-30 (UD-8 anchor) and the customer error failing SH-2004 (UD-9)', async () => {
    const k = (await kpi()).fpy_pct;
    expect(k).toMatchObject({ numerator: 3, denominator: 6, value_1dp: 50 });
    expect(k.extra).toMatchObject({ first_attempt_failed: 2, passed_but_errored: 1, escape_failures: 1 });
  });
  it('KPI-4 for 11-01..11-29 (before SH-2007): 2 of 5 = 40.0', async () => {
    expect((await kpi('2026-11-01', '2026-11-29')).fpy_pct).toMatchObject({ numerator: 2, denominator: 5, value_1dp: 40 });
  });
  it('KPI-3 for 12-01..12-01: SH-2007 only, 0 of 1 = 0.0 (not null)', async () => {
    expect((await kpi('2026-12-01', '2026-12-01')).pkg_error_rate_pct).toMatchObject({ value: 0, numerator: 0, denominator: 1 });
  });
  it('KPI-5: 3 events, 95 min total, 31.67 average, 60.0 per 100 shipped (cancelled rework excluded)', async () => {
    const k = (await kpi()).rework_frequency_pct;
    expect(k).toMatchObject({ value_1dp: 60, numerator: 3, denominator: 5, tile: false });
    expect(k.extra).toMatchObject({ rework_events: 3, total_rework_minutes: 95, avg_rework_minutes: 31.67 });
  });
  it('empty period 11-15..11-20 gives null for KPI-3, 4, 5', async () => {
    const k = await kpi('2026-11-15', '2026-11-20');
    expect(k.pkg_error_rate_pct.value).toBeNull(); expect(k.fpy_pct.value).toBeNull(); expect(k.rework_frequency_pct.value).toBeNull();
    expect(k.pkg_error_rate_pct.extra).toMatchObject({ errors: 0, errors_per_100_shipments: null });
    expect(k.rework_frequency_pct.extra).toMatchObject({ rework_events: 0, total_rework_minutes: 0, avg_rework_minutes: null });
  });
  it('rework with no shipments in the period: value null, events still reported', async () => {
    await load(db.sql, async (tx) => {
      const [s] = await tx<{ id: number }[]>`SELECT id FROM shipment WHERE shipment_no = 'SH-2004'`;
      await addRework(tx, err2004, s.id, '2026-11-20T08:00:00Z', '2026-11-20T08:10:00Z');
    });
    const k = (await kpi('2026-11-15', '2026-11-20')).rework_frequency_pct;
    expect(k.value).toBeNull(); expect(k.extra).toMatchObject({ rework_events: 1, total_rework_minutes: 10 });
    await load(db.sql, async (tx) => { await tx`DELETE FROM rework_event WHERE completed_business_date = '2026-11-20'`; });
  });
  it('UD-9 flag: SH-2004 error packaging_related=false leaves KPI-3 40.0 and KPI-4 4 of 6', async () => {
    await load(db.sql, async (tx) => { await tx`UPDATE packaging_error SET packaging_related = false WHERE id = ${err2004}`; });
    const k = await kpi();
    expect(k.pkg_error_rate_pct).toMatchObject({ value_1dp: 40, numerator: 2, denominator: 5 });
    expect(k.pkg_error_rate_pct.extra).toMatchObject({ errors_per_100_shipments: 40, customer_escapes: 0, excluded_errors: 1 });
    expect(k.fpy_pct).toMatchObject({ numerator: 4, denominator: 6 });
    await load(db.sql, async (tx) => { await tx`UPDATE packaging_error SET packaging_related = true WHERE id = ${err2004}`; });
  });
  it('late customer error (detected after the period) still counts against the November shipment (G-10)', async () => {
    await load(db.sql, async (tx) => { await tx`UPDATE packaging_error SET detected_at = '2026-12-02T09:00:00Z' WHERE id = ${err2004}`; });
    const k = await kpi();
    expect(k.pkg_error_rate_pct).toMatchObject({ numerator: 3, denominator: 5 }); expect(k.fpy_pct).toMatchObject({ numerator: 3, denominator: 6 });
    await load(db.sql, async (tx) => { await tx`UPDATE packaging_error SET detected_at = '2026-11-14T09:00:00Z' WHERE id = ${err2004}`; });
  });
  it('C2 by day: rates per shipping day, gaps elsewhere, suggests week', async () => {
    const c = await getChart('C2', { ...P, granularity: 'day' }, db.sql) as any;
    const by = Object.fromEntries(c.series.map((s: any) => [s.date, s]));
    expect(c.series).toHaveLength(30);
    expect([by['2026-11-05'], by['2026-11-06'], by['2026-11-08'], by['2026-11-10'], by['2026-11-13']].map((s) => [s.shipments_shipped, s.packaging_error_rate_pct]))
      .toEqual([[1, 0], [1, 0], [1, 100], [1, 100], [1, 100]]);
    expect(by['2026-11-07']).toMatchObject({ shipments_shipped: 0, packaging_error_rate_pct: null });
    expect(c.suggested_granularity).toBe('week');
    expect(c.summary_totals).toMatchObject({ shipments: 5, shipments_with_error: 3, error_rate_pct: 60 });
  });
  it('C2 by week: W45 33.3 and W46 100.0, sums equal the KPI-3 tile', async () => {
    const c = await getChart('C2', { ...P, granularity: 'week' }, db.sql) as any;
    const by = Object.fromEntries(c.series.map((s: any) => [s.week, s]));
    expect(by['2026-W45']).toMatchObject({ shipments_shipped: 3, shipments_with_error: 1, packaging_error_rate_pct: 33.3 });
    expect(by['2026-W46']).toMatchObject({ shipments_shipped: 2, shipments_with_error: 2, packaging_error_rate_pct: 100 });
    for (const w of ['2026-W44', '2026-W47', '2026-W48', '2026-W49']) expect(by[w].packaging_error_rate_pct).toBeNull();
    expect(c.series.reduce((a: number, s: any) => a + s.shipments_shipped, 0)).toBe(5);
    expect(c.series.reduce((a: number, s: any) => a + s.shipments_with_error, 0)).toBe(3);
  });
  it('C3: 3 countable errors by detection date, ties by category, cumulative 33.3/66.7/100; cancelled error excluded', async () => {
    const c = await getChart('C3', P, db.sql) as any;
    expect(c.series.map((s: any) => [s.category, s.count])).toEqual([['Incorrect label', 1], ['Paperwork', 1], ['Wrong quantity', 1]]);
    expect(c.series.map((s: any) => Math.round(s.cumulative_pct * 10) / 10)).toEqual([33.3, 66.7, 100]);
    expect(c.series[2].cumulative_pct).toBe(100); expect(c.total).toBe(3);
    expect(c.table.rows.map((r: any) => r.cumulative_pct)).toEqual([33.3, 66.7, 100]);
  });
  it('C3 empty period', async () => {
    const c = await getChart('C3', { from: '2026-11-15', to: '2026-11-20', businessToday: P.businessToday }, db.sql) as any;
    expect(c).toMatchObject({ series: [], total: 0, summary: 'No packaging errors were logged in this period.' });
  });
});
