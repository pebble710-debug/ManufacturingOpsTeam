// Fixture C (kpi-spec 13.3): KPI-7 first-count accuracy (UD-7).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from '../../helpers/testdb';
import { getKpis } from '../../../src/lib/kpi';
import { addCount, load } from './fixtures';

let db: Awaited<ReturnType<typeof startTestDb>>;
const inv = async (from: string, to: string) => (await getKpis({ from, to, businessToday: '2026-11-25' }, db.sql)).kpis.find((k) => k.key === 'inventory_accuracy_pct')!;

beforeAll(async () => {
  db = await startTestDb();
  await load(db.sql, async (tx) => {
    await addCount(tx, { status: 'Approved', approved: '2026-11-10', lines: [
      { cls: 'A', tol: 0, system: 100, counted: 96, recount: 96 },
      { cls: 'B', tol: 2, system: 200, counted: 195, recount: 199 },
      { cls: 'C', tol: 5, system: 50, counted: 52 },
      { cls: 'A', tol: 0, system: 40, counted: 40 },
    ] });
    await addCount(tx, { status: 'Counted', lines: [{ cls: 'A', tol: 0, system: 10, counted: 0 }] });
  });
}, 90_000);
afterAll(async () => { await db?.stop(); });

describe('fixture C', () => {
  it('first count 50.0, after recount 75.0, variance 7, by class A 50 / B 0 / C 100', async () => {
    const k = await inv('2026-11-01', '2026-11-30');
    expect(k).toMatchObject({ value_1dp: 50, numerator: 2, denominator: 4, meets_target: false });
    expect(k.extra).toMatchObject({ after_recount_pct: 75, absolute_variance_units: 7, lines_counted: 4 });
    expect(k.extra.by_class).toEqual({ A: { value: 50, numerator: 1, denominator: 2 }, B: { value: 0, numerator: 0, denominator: 1 }, C: { value: 100, numerator: 1, denominator: 1 } });
  });
  it('period boundaries: approved on first day counts, next day does not', async () => {
    expect((await inv('2026-11-10', '2026-11-20')).denominator).toBe(4);
    expect((await inv('2026-11-11', '2026-11-20')).denominator).toBe(0);
    expect((await inv('2026-11-01', '2026-11-09')).value).toBeNull();
  });
  it('unapproved counts are excluded; empty period is null for both metrics', async () => {
    const k = await inv('2026-11-11', '2026-11-30');
    expect(k).toMatchObject({ value: null, denominator: 0 }); expect(k.extra).toMatchObject({ after_recount_pct: null, absolute_variance_units: 0 });
    expect(k.extra.by_class).toMatchObject({ A: { value: null, numerator: 0, denominator: 0 } });
  });
  it('zero system quantity: counted 0 hits, counted 3 misses', async () => {
    await load(db.sql, async (tx) => { await addCount(tx, { status: 'Approved', approved: '2026-12-05', lines: [{ cls: 'C', tol: 5, system: 0, counted: 0 }, { cls: 'C', tol: 5, system: 0, counted: 3 }] }); });
    expect(await inv('2026-12-05', '2026-12-05')).toMatchObject({ numerator: 1, denominator: 2, value_1dp: 50 });
  });
});
