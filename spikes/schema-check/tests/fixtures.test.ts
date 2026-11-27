// SCH-A/B/C: seed-plan.md section 11 hand-calculated fixtures run through the KPI oracle queries of
// schema.md section 8 and the lot-trace queries of schema.md section 5. Both query sets are EXTRACTED from the
// documents at run time, so a change to a doc query is tested, not a stale copy.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Ids, addHistory, docFile, insertLot, insertRow, loadBase, newDb, one, rows, shipmentDefaults, shippedDefaults, sqlBlocks, statements,
} from './helpers';

const schemaMd = docFile('data-model', 'schema.md');
const kpiQueries = statements(sqlBlocks(schemaMd, /^## 8\./)[0]);
const traceQueries = statements(sqlBlocks(schemaMd, /^## 5\./)[0]);
const pick = (qs: string[], re: RegExp) => {
  const m = qs.filter((q) => re.test(q));
  if (m.length !== 1) throw new Error(`expected exactly one doc query matching ${re}, got ${m.length}`);
  return m[0];
};
const Q = {
  delivery: pick(kpiQueries, /percentile_cont\(0\.5\)/),
  kpi3: pick(kpiQueries, /denominator_kpi3/),
  kpi4: pick(kpiQueries, /first_pass_no_error/),
  rework: pick(kpiQueries, /FROM rework_event/),
  accuracy: pick(kpiQueries, /accuracy_first_count_pct/),
  onHand: pick(traceQueries, /FROM v_on_hand_detail/),
  backward: pick(traceQueries, /FROM receipt r JOIN supplier/),
  inHouse: pick(traceQueries, /PRODUCTION_COMPLETE' ORDER BY/),
  forward: pick(traceQueries, /t\.txn_type = 'SHIP' AND t\.lot_number/),
  movements: pick(traceQueries, /All movements|reason_code rc ON rc\.id/),
  recon: pick(traceQueries, /received_total/),
};
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

describe('doc query extraction', () => {
  it('SCH-A00 all oracle queries were found in schema.md sections 5 and 8', () => {
    expect(Object.keys(Q).length).toBe(11);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fixture A: delivery KPIs (KPI-1, KPI-2, KPI-6), tolerance 0, basis promise', () => {
  let db: any;
  beforeAll(async () => {
    db = await newDb();
    const ids = await loadBase(db);
    type Def = { no: string; promise: string; rtp: string; shipped: string; lines: [number, number, string?][]; };
    const defs: Def[] = [
      { no: 'SH-1001', promise: '2026-11-03', rtp: '2026-11-03T02:00:00Z', shipped: '2026-11-03T12:00:00Z', lines: [[10, 10]] },
      { no: 'SH-1002', promise: '2026-11-03', rtp: '2026-11-03T08:00:00Z', shipped: '2026-11-04T14:00:00Z', lines: [[10, 10]] },
      { no: 'SH-1003', promise: '2026-11-10', rtp: '2026-11-04T12:00:00Z', shipped: '2026-11-05T08:00:00Z', lines: [[10, 10], [10, 8, 'Short 2: demo']] },
      { no: 'SH-1005', promise: '2026-11-30', rtp: '2026-11-30T00:00:00Z', shipped: '2026-11-30T12:00:00Z', lines: [[5, 5]] },
      { no: 'SH-1006', promise: '2026-11-30', rtp: '2026-11-30T20:00:00Z', shipped: '2026-12-01T08:00:00Z', lines: [[5, 5]] },
    ];
    const hr = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600_000).toISOString();
    for (const d of defs) {
      const shipDate = d.shipped.slice(0, 10);
      const sid = await insertRow(db, 'shipment', shippedDefaults(ids, {
        shipment_no: d.no, promise_date: d.promise, requested_date: d.promise, order_date: '2026-10-28',
        ship_date: shipDate, shipped_at: d.shipped, verified_at: hr(d.rtp, 2),
        late_reason_id: shipDate > d.promise ? ids.reason.CARRIER_LATE : null,
      }));
      let n = 1;
      for (const [o, s, note] of d.lines) {
        await insertRow(db, 'shipment_line', { shipment_id: sid, line_no: n++, part_id: ids.part['CRC-2041-B'], qty_ordered: o, qty_shipped: s, short_note: note ?? null });
      }
      await addHistory(db, ids, sid, [['Planned', hr(d.rtp, -1)], ['Ready to Pack', d.rtp], ['Packing', hr(d.rtp, 1)], ['Verified', hr(d.rtp, 2)], ['Shipped', d.shipped]]);
    }
    // SH-1004: Cancelled on 11-04 (excluded from every KPI)
    const c = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-1004', status: 'Cancelled', promise_date: '2026-11-10', requested_date: '2026-11-10' }));
    await addHistory(db, ids, c, [['Planned', '2026-11-04T10:00:00Z'], ['Ready to Pack', '2026-11-04T11:00:00Z'], ['Cancelled', '2026-11-04T12:00:00Z']]);
  });
  const kpi = async (from: string, to: string, tol = 0) => {
    const r = await one(db, Q.delivery, [from, to, tol]);
    return { shipped: num(r.shipped), onTime: num(r.on_time_pct), otif: num(r.otif_pct), median: num(r.median_cycle_h), p90: num(r.p90_cycle_h) };
  };

  it('SCH-A01 period 11-01..11-30: shipped 4, KPI-1 75.0, KPI-2 50.0, median 16 h, P90 27.0 h', async () => {
    expect(await kpi('2026-11-01', '2026-11-30')).toEqual({ shipped: 4, onTime: 75.0, otif: 50.0, median: 16, p90: 27 });
  });
  it('SCH-A02 all on time (11-03..11-03) -> 100.0 %', async () => {
    const r = await kpi('2026-11-03', '2026-11-03');
    expect([r.shipped, r.onTime, r.otif]).toEqual([1, 100.0, 100.0]);
  });
  it('SCH-A03 none on time (11-04..11-04) -> 0.0 %, not null', async () => {
    const r = await kpi('2026-11-04', '2026-11-04');
    expect([r.shipped, r.onTime, r.otif]).toEqual([1, 0.0, 0.0]);
  });
  it('SCH-A04 empty period (11-15..11-20) -> null, never 0 or 100 (division by zero)', async () => {
    expect(await kpi('2026-11-15', '2026-11-20')).toEqual({ shipped: 0, onTime: null, otif: null, median: null, p90: null });
  });
  it('SCH-A05 boundary: last day inclusive (11-30..11-30 has SH-1005), next day (12-01..12-01) holds only the late SH-1006', async () => {
    expect((await kpi('2026-11-30', '2026-11-30')).shipped).toBe(1);
    const next = await kpi('2026-12-01', '2026-12-01');
    expect([next.shipped, next.onTime]).toEqual([1, 0.0]);
  });
  it('SCH-A06 partial shipment (SH-1003) counts on time but not in full; cancelled SH-1004 is in no row', async () => {
    const r = await one(db, `SELECT in_full, days_late_vs_promise FROM v_shipment_delivery WHERE shipment_no='SH-1003'`);
    expect(r.in_full).toBe(false);
    expect(Number(r.days_late_vs_promise)).toBeLessThan(0);
    expect((await rows(db, `SELECT 1 FROM v_shipment_delivery WHERE shipment_no='SH-1004'`)).length).toBe(0);
    expect((await rows(db, `SELECT 1 FROM v_shipment_quality WHERE shipment_no='SH-1004'`)).length).toBe(0);
  });
  it('SCH-A07 tolerance parameter: tolerance 1 day makes SH-1002 (1 day late) on time -> KPI-1 100.0', async () => {
    expect((await kpi('2026-11-01', '2026-11-30', 1)).onTime).toBe(100.0);
  });
  it('SCH-A08 cycle time is measured from the FIRST Ready to Pack row (append-only history)', async () => {
    const r = await rows(db, `SELECT shipment_no, cycle_hours FROM v_shipment_delivery ORDER BY shipment_no`);
    expect(r.map((x) => [x.shipment_no, Number(x.cycle_hours)])).toEqual([
      ['SH-1001', 10], ['SH-1002', 30], ['SH-1003', 20], ['SH-1005', 12], ['SH-1006', 12]]);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fixture B: packaging KPIs (KPI-3, KPI-4, KPI-5), period 2026-11-01..2026-11-30', () => {
  let db: any;
  beforeAll(async () => {
    db = await newDb();
    const ids: Ids = await loadBase(db);
    const checklist = (fail: string[] = []) => JSON.stringify(Object.fromEntries(
      ['part_number', 'revision', 'quantity', 'lot', 'labels', 'packing_slip', 'packaging_method'].map((k) => [k, fail.includes(k) ? 'fail' : 'pass'])));
    const ship = async (no: string, steps: [string, string][], shippedAt: string | null) => {
      const sid = await insertRow(db, 'shipment', shippedAt
        ? shippedDefaults(ids, { shipment_no: no, ship_date: shippedAt.slice(0, 10), shipped_at: shippedAt, promise_date: '2026-11-30', requested_date: '2026-11-30', verified_at: shippedAt })
        : shipmentDefaults(ids, { shipment_no: no, status: 'Cancelled', promise_date: '2026-11-30', requested_date: '2026-11-30' }));
      await addHistory(db, ids, sid, steps);
      return sid;
    };
    const verify = (sid: number, attempt: number, result: 'Pass' | 'Fail', at: string, failed: string[] = []) =>
      insertRow(db, 'shipment_verification', {
        shipment_id: sid, attempt_no: attempt, result, packer_id: ids.user['demo.shipper1'], verified_by: ids.user['demo.shipper2'],
        checklist: checklist(failed), failed_items: `{${failed.join(',')}}`, verified_at: at, business_date: at.slice(0, 10) });
    const error = (sid: number, o: Record<string, unknown>) => insertRow(db, 'packaging_error', {
      shipment_id: sid, detected_by_role: 'Verifier', detected_stage: 'Before ship', severity: 'Low', description: 'Demo error', reported_by: ids.user['demo.quality'], ...o });
    const rework = (pe: number, sid: number, startedAt: string, minutes: number) => {
      const done = new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString();
      return insertRow(db, 'rework_event', { packaging_error_id: pe, shipment_id: sid, action: 'Relabel', started_at: startedAt, completed_at: done, performed_by: ids.user['demo.shipper1'] });
    };
    const happy = (d: string, v: string, s: string): [string, string][] => [['Planned', `${d}T07:00:00Z`], ['Ready to Pack', `${d}T08:00:00Z`], ['Packing', `${d}T09:00:00Z`], ['Verified', v], ['Shipped', s]];

    const s1 = await ship('SH-2001', happy('2026-11-04', '2026-11-05T08:00:00Z', '2026-11-05T12:00:00Z'), '2026-11-05T12:00:00Z');
    await verify(s1, 1, 'Pass', '2026-11-05T08:00:00Z');
    const s2 = await ship('SH-2002', happy('2026-11-05', '2026-11-06T08:00:00Z', '2026-11-06T12:00:00Z'), '2026-11-06T12:00:00Z');
    await verify(s2, 1, 'Pass', '2026-11-06T08:00:00Z');
    const s3 = await ship('SH-2003', [['Planned', '2026-11-07T07:00:00Z'], ['Ready to Pack', '2026-11-07T08:00:00Z'], ['Packing', '2026-11-07T09:00:00Z'], ['Rework', '2026-11-08T08:00:00Z'],
      ['Packing', '2026-11-08T09:00:00Z'], ['Verified', '2026-11-08T10:00:00Z'], ['Shipped', '2026-11-08T12:00:00Z']], '2026-11-08T12:00:00Z');
    await verify(s3, 1, 'Fail', '2026-11-08T08:00:00Z', ['labels']);
    await verify(s3, 2, 'Pass', '2026-11-08T10:00:00Z');
    const pe3 = await error(s3, { detected_at: '2026-11-08T08:00:00Z', category: 'Incorrect label', description: 'Wrong label on box' });
    await rework(pe3, s3, '2026-11-08T08:30:00Z', 30);
    const s4 = await ship('SH-2004', happy('2026-11-09', '2026-11-10T08:00:00Z', '2026-11-10T12:00:00Z'), '2026-11-10T12:00:00Z');
    await verify(s4, 1, 'Pass', '2026-11-10T08:00:00Z');
    await error(s4, { detected_at: '2026-11-14T10:00:00Z', detected_by_role: 'Customer', detected_stage: 'After ship', category: 'Wrong quantity', description: 'Customer counted 9 of 10' });
    await ship('SH-2005', [['Planned', '2026-11-09T07:00:00Z'], ['Cancelled', '2026-11-09T08:00:00Z']], null);
    const s6 = await ship('SH-2006', [['Planned', '2026-11-11T07:00:00Z'], ['Ready to Pack', '2026-11-11T08:00:00Z'], ['Packing', '2026-11-11T09:00:00Z'], ['Rework', '2026-11-12T08:00:00Z'],
      ['Packing', '2026-11-12T09:00:00Z'], ['Verified', '2026-11-13T08:00:00Z'], ['Shipped', '2026-11-13T12:00:00Z']], '2026-11-13T12:00:00Z');
    await verify(s6, 1, 'Fail', '2026-11-12T08:00:00Z', ['packing_slip']);
    await verify(s6, 2, 'Pass', '2026-11-13T08:00:00Z');
    const pe6 = await error(s6, { detected_at: '2026-11-12T08:00:00Z', category: 'Paperwork', paperwork_subtype: 'Packing slip', description: 'Slip lists wrong PO' });
    await rework(pe6, s6, '2026-11-12T08:30:00Z', 45);
    await rework(pe6, s6, '2026-11-12T10:00:00Z', 20);
  });
  const P = ['2026-11-01', '2026-11-30'];

  it('SCH-B01 KPI-3 (UD-8 ship-date basis): shipped 5, with error 3 -> 60.0 %; errors 3 -> 60.0 per 100; internal 2, escapes 1, excluded 0', async () => {
    const r = await one(db, Q.kpi3, P);
    expect(num(r.excluded_errors)).toBe(0);
    expect(num(r.denominator_kpi3)).toBe(5);
    expect(num(r.shipments_with_error)).toBe(3);
    expect(num(r.errors)).toBe(3);
    expect(num(r.internal_catches)).toBe(2);
    expect(num(r.customer_escapes)).toBe(1);
    expect((100 * num(r.shipments_with_error)!) / num(r.denominator_kpi3)!).toBeCloseTo(60.0, 5);
    expect((100 * num(r.errors)!) / num(r.denominator_kpi3)!).toBeCloseTo(60.0, 5);
  });
  it('SCH-B02 KPI-4 FPY: first pass with no error = SH-2001, SH-2002 -> 2 / 5 = 40.0 % (SH-2004 later has a customer error)', async () => {
    const r = await one(db, Q.kpi4, P);
    expect(num(r.verified)).toBe(5);
    expect(num(r.first_pass_no_error)).toBe(2);
    expect((100 * num(r.first_pass_no_error)!) / num(r.verified)!).toBeCloseTo(40.0, 5);
    const f = await rows(db, `SELECT shipment_no, first_result FROM v_shipment_quality ORDER BY shipment_no`);
    expect(f.map((x) => [x.shipment_no, x.first_result])).toEqual([
      ['SH-2001', 'Pass'], ['SH-2002', 'Pass'], ['SH-2003', 'Fail'], ['SH-2004', 'Pass'], ['SH-2006', 'Fail']]); // SH-2005 cancelled excluded
  });
  it('SCH-B03 KPI-5: rework events 3 / shipped 5 = 60.0 %, total 95 min, average 31.67 min', async () => {
    const r = await one(db, Q.rework, P);
    expect(num(r.rework_events)).toBe(3);
    expect(num(r.total_minutes)).toBe(95);
    expect(num(r.avg_minutes)).toBeCloseTo(31.67, 2);
    const shipped = num((await one(db, `SELECT count(*) AS n FROM v_shipment_delivery WHERE ship_date BETWEEN $1 AND $2`, P)).n)!;
    expect(shipped).toBe(5);
    expect((100 * num(r.rework_events)!) / shipped).toBeCloseTo(60.0, 5);
  });
  it('SCH-B04 empty period gives NULL denominators, not 0 / 100 (KPI-3/4/5)', async () => {
    const q = await one(db, Q.kpi3, ['2026-01-01', '2026-01-31']);
    expect(num(q.denominator_kpi3)).toBe(0);
    expect(num((await one(db, Q.kpi4, ['2026-01-01', '2026-01-31'])).verified)).toBe(0);
    const w = await one(db, Q.rework, ['2026-01-01', '2026-01-31']);
    expect(num(w.rework_events)).toBe(0);
    expect(num(w.total_minutes)).toBeNull();
    expect(num(w.avg_minutes)).toBeNull();
  });
  it('SCH-B05 period anchors: KPI-4 uses the FIRST verification business date (SH-2006 failed 11-12, passed 11-13)', async () => {
    const p13 = ['2026-11-13', '2026-11-13']; // only the second attempt of SH-2006 falls here; its ship date puts it in KPI-3
    expect(num((await one(db, Q.kpi4, p13)).verified)).toBe(0);
    expect(num((await one(db, Q.kpi3, p13)).denominator_kpi3)).toBe(1);
  });
  it('SCH-B06 UD-9 flag: SH-2004 customer error marked packaging_related=false -> KPI-3 40.0 %, escapes 0, excluded 1; FPY 3/5 = 60.0 % (kpi-spec 13.2)', async () => {
    await db.query(`UPDATE packaging_error SET packaging_related=false WHERE detected_stage='After ship'`);
    try {
      const r = await one(db, Q.kpi3, P);
      expect([num(r.denominator_kpi3), num(r.shipments_with_error), num(r.errors), num(r.customer_escapes), num(r.excluded_errors)]).toEqual([5, 2, 2, 0, 1]);
      expect(num((await one(db, Q.kpi4, P)).first_pass_no_error)).toBe(3);
      const v = await one(db, `SELECT SUM(error_count)::int AS e, SUM(escape_error_count)::int AS x FROM v_shipment_quality WHERE ship_date BETWEEN $1 AND $2`, P);
      expect([v.e, v.x]).toEqual([2, 0]); // view agrees with the oracle (kpi-spec S-2)
    } finally {
      await db.query(`UPDATE packaging_error SET packaging_related=true WHERE detected_stage='After ship'`);
    }
  });
  it('SCH-B07 view v_shipment_quality gives the same error counts as the KPI-3 oracle (kpi-spec S-2)', async () => {
    const v = await one(db, `SELECT COUNT(*) FILTER (WHERE error_count > 0)::int AS w, SUM(error_count)::int AS e, SUM(internal_error_count)::int AS i, SUM(escape_error_count)::int AS x
      FROM v_shipment_quality WHERE status='Shipped' AND ship_date BETWEEN $1 AND $2`, P);
    const r = await one(db, Q.kpi3, P);
    expect([v.w, v.e, v.i, v.x]).toEqual([num(r.shipments_with_error), num(r.errors), num(r.internal_catches), num(r.customer_escapes)]);
  });
  it('SCH-B08 UD-8 two period dates: SH-2007 first-verified 11-30, shipped 12-01 -> KPI-3 Nov unchanged (5, 60.0 %), KPI-4 Nov 3/6 = 50.0 %, KPI-3 12-01 = 0/1', async () => {
    // base data is already loaded in this db: look ids up by key
    const u = async (n: string) => Number((await one(db, `SELECT id FROM app_user WHERE username=$1`, [n])).id);
    const cust = Number((await one(db, `SELECT id FROM customer WHERE code='ALDERVALE'`)).id);
    const car = Number((await one(db, `SELECT id FROM carrier WHERE name='SwiftLane Parcel'`)).id);
    const sid = await insertRow(db, 'shipment', { shipment_no: 'SH-2007', customer_id: cust, customer_po: 'PO-TEST', order_date: '2026-10-28',
      requested_date: '2026-12-01', promise_date: '2026-12-01', status: 'Shipped', ship_date: '2026-12-01', shipped_at: '2026-12-01T12:00:00Z',
      carrier_id: car, packages_count: 1, total_weight_lb: 5, packed_by: await u('demo.shipper1'), verified_by: await u('demo.shipper2'),
      verified_at: '2026-11-30T15:00:00Z', created_by: await u('demo.supervisor') });
    await insertRow(db, 'shipment_verification', { shipment_id: sid, attempt_no: 1, result: 'Pass', packer_id: await u('demo.shipper1'), verified_by: await u('demo.shipper2'),
      checklist: JSON.stringify({ part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'pass', packing_slip: 'pass', packaging_method: 'pass' }),
      failed_items: '{}', verified_at: '2026-11-30T15:00:00Z', business_date: '2026-11-30' });
    const k3 = await one(db, Q.kpi3, P);
    expect([num(k3.denominator_kpi3), num(k3.shipments_with_error)]).toEqual([5, 3]);
    const k4 = await one(db, Q.kpi4, P);
    expect([num(k4.verified), num(k4.first_pass_no_error)]).toEqual([6, 3]);
    const dec = await one(db, Q.kpi3, ['2026-12-01', '2026-12-01']);
    expect([num(dec.denominator_kpi3), num(dec.shipments_with_error)]).toEqual([1, 0]); // 0.0 %, not null
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fixture C: ledger, on-hand, lot trace, cycle count (KPI-7)', () => {
  let db: any;
  let ids: Ids;
  beforeAll(async () => {
    db = await newDb();
    ids = await loadBase(db);
    const U = (n: string) => ids.user[n];
    const P = (n: string) => ids.part[n];
    const L = (n: string) => ids.loc[n];
    for (const [lotNo, part] of [['L2611-004', 'CRC-2041-B'], ['L2611-005', 'CRC-2041-B'], ['L2611-010', 'CRC-2041-B'], ['L2611-011', 'CRC-3310-A'],
      ['L2611-012', 'CRC-4102-A'], ['L2611-013', 'CRC-5005-A'], ['L2640-001', 'CRC-5005-A']]) await insertLot(db, ids, lotNo, part);
    const receipt = async (part: string, lotNo: string, qty: number, loc: string, status: string, at: string) => {
      const rid = await insertRow(db, 'receipt', { supplier_id: ids.supplier.GRAYSTONE, supplier_po: 'PO-DEMO', part_id: P(part), qty_received: qty, lot_number: lotNo, arrived_at: at, location_id: L(loc), inspection_status: status, received_by: U('demo.receiver') });
      await insertRow(db, 'inventory_transaction', { txn_type: 'RECEIPT', part_id: P(part), location_id: L(loc), lot_number: lotNo, qty_change: qty, receipt_id: rid, txn_at: at, created_by: U('demo.receiver') });
      return rid;
    };
    await receipt('CRC-2041-B', 'L2611-004', 100, 'STK-A01', 'Accepted', '2026-11-02T08:00:00Z'); // RC-0001
    await receipt('CRC-2041-B', 'L2611-005', 50, 'HOLD-01', 'On Hold', '2026-11-02T09:00:00Z'); // RC-0002
    const shipOut = async (no: string, cust: string, qty: number, at: string) => {
      const sid = await insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: no, customer_id: ids.cust[cust], ship_date: at.slice(0, 10), shipped_at: at, verified_at: at, tracking_number: 'SLP0000000042' }));
      const lid = await insertRow(db, 'shipment_line', { shipment_id: sid, line_no: 1, part_id: P('CRC-2041-B'), qty_ordered: qty, qty_shipped: qty, lot_number: 'L2611-004', location_id: L('STK-A01') });
      await insertRow(db, 'inventory_transaction', { txn_type: 'SHIP', part_id: P('CRC-2041-B'), location_id: L('STK-A01'), lot_number: 'L2611-004', qty_change: -qty, shipment_line_id: lid, txn_at: at, created_by: U('demo.shipper1') });
    };
    await shipOut('SH-3001', 'ALDERVALE', 40, '2026-11-05T12:00:00Z');
    await shipOut('SH-3002', 'PINECREST', 25, '2026-11-06T12:00:00Z');
    await insertRow(db, 'inventory_transaction', { txn_type: 'SCRAP', part_id: P('CRC-2041-B'), location_id: L('STK-A01'), lot_number: 'L2611-004', qty_change: -5, reason_code_id: ids.reason.SCR_DMG, txn_at: '2026-11-07T12:00:00Z', created_by: U('demo.receiver') });
    const grp = '33333333-3333-4333-8333-333333333333';
    await db.query(`INSERT INTO inventory_transaction (txn_type, part_id, location_id, lot_number, qty_change, txn_group, txn_at, created_by) VALUES
      ('TRANSFER', $1, $2, 'L2611-004', -10, $5, '2026-11-08T12:00:00Z', $4), ('TRANSFER', $1, $3, 'L2611-004', 10, $5, '2026-11-08T12:00:00Z', $4)`,
      [P('CRC-2041-B'), L('STK-A01'), L('FG-01'), U('demo.receiver'), grp]);
    // in-house lot (no supplier receipt)
    await insertRow(db, 'inventory_transaction', { txn_type: 'PRODUCTION_COMPLETE', part_id: P('CRC-5005-A'), location_id: L('FG-01'), lot_number: 'L2640-001', qty_change: 12, txn_at: '2026-11-09T12:00:00Z', created_by: U('demo.receiver') });

    // Cycle count CC-0001
    const lines: [string, string, string, string, number, number, number | null, number | null][] = [
      ['CRC-2041-B', 'L2611-010', 'A', '0', 100, 96, 96, -4], ['CRC-3310-A', 'L2611-011', 'B', '2', 200, 195, 199, -1],
      ['CRC-4102-A', 'L2611-012', 'C', '5', 50, 52, null, 2], ['CRC-5005-A', 'L2611-013', 'A', '0', 40, 40, null, 0]];
    const cc = await insertRow(db, 'cycle_count', { scheduled_date: '2026-11-15', created_by: U('demo.supervisor') });
    const lineIds: number[] = [];
    for (const [part, lotNo, abc, tol, sys, counted, recount] of lines) {
      await receipt(part, lotNo, sys, 'STK-A01', 'Accepted', '2026-11-10T08:00:00Z');
      lineIds.push(await insertRow(db, 'cycle_count_line', {
        cycle_count_id: cc, part_id: P(part), location_id: L('STK-A01'), lot_number: lotNo, abc_class: abc, tolerance_pct: tol, system_qty: sys,
        counted_qty: counted, counted_by: U('demo.receiver'), counted_at: '2026-11-16T09:00:00Z',
        ...(recount !== null ? { recount_qty: recount, recounted_by: U('demo.receiver'), recounted_at: '2026-11-16T10:00:00Z' } : {}) }));
    }
    await db.query(`UPDATE cycle_count SET status='Counted', submitted_by=$1, submitted_at='2026-11-16T11:00:00Z' WHERE id=$2`, [U('demo.receiver'), cc]);
    await db.query(`UPDATE cycle_count SET status='Approved', approved_by=$1, approved_at='2026-11-17T09:00:00Z', approved_business_date='2026-11-17', approval_reason_code_id=$3 WHERE id=$2`, [U('demo.supervisor'), cc, ids.reason.CNT_VAR]);
    for (let i = 0; i < lines.length; i++) {
      const [part, lotNo, , , , , , adj] = lines[i];
      if (adj) await insertRow(db, 'inventory_transaction', { txn_type: 'ADJUST', part_id: P(part), location_id: L('STK-A01'), lot_number: lotNo, qty_change: adj, reason_code_id: ids.reason.CNT_VAR, cycle_count_line_id: lineIds[i], txn_at: '2026-11-17T09:30:00Z', created_by: U('demo.supervisor') });
    }
  });

  it('SCH-C01 running balance of lot L2611-004: 100 -> 60 -> 35 -> 30 -> (transfer) 20 / 10 (US-041)', async () => {
    const r = await rows(db, `SELECT txn_type, location_id, qty_change, sum(qty_change) OVER (ORDER BY txn_at, id)::int AS running FROM inventory_transaction WHERE lot_number='L2611-004' ORDER BY txn_at, id`);
    expect(r.map((x) => [x.txn_type, x.running])).toEqual([['RECEIPT', 100], ['SHIP', 60], ['SHIP', 35], ['SCRAP', 30], ['TRANSFER', 20], ['TRANSFER', 30]]);
    expect(r.every((x) => x.running >= 0)).toBe(true); // "stock covered the ship at ship time" (seed-plan section 9)
  });
  it('SCH-C02 on-hand view: STK-A01 20, FG-01 10 for L2611-004; HOLD-01 50 for L2611-005 is flagged on_hold', async () => {
    const r = await rows(db, Q.onHand);
    const key = (x: any) => `${x.lot_number}@${x.location_code}`;
    const m = Object.fromEntries(r.map((x) => [key(x), Number(x.qty_on_hand)]));
    expect(m['L2611-004@STK-A01']).toBe(20);
    expect(m['L2611-004@FG-01']).toBe(10);
    expect(m['L2611-005@HOLD-01']).toBe(50);
    const flags = await rows(db, `SELECT lot_number, location_code, on_hold FROM v_on_hand_detail`); // the doc query does not select on_hold
    expect(flags.find((x) => x.lot_number === 'L2611-005').on_hold).toBe(true);
    expect(flags.filter((x) => x.lot_number === 'L2611-004').every((x) => x.on_hold === false)).toBe(true);
    expect(Number(m['L2611-004@STK-A01']) + Number(m['L2611-004@FG-01'])).toBe(30);
  });
  it('SCH-C03 backward trace of L2611-004: RC-0001, Graystone Metals Supply, 100', async () => {
    const r = await rows(db, Q.backward, ['L2611-004']);
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ receipt_no: 'RC-0001', supplier: 'Graystone Metals Supply', part_number: 'CRC-2041-B', inspection_status: 'Accepted' });
    expect(Number(r[0].qty_received)).toBe(100);
  });
  it('SCH-C04 forward trace of L2611-004: SH-3001 Aldervale 40, SH-3002 Pinecrest 25 (customer shipments from the ledger)', async () => {
    const r = await rows(db, Q.forward, ['L2611-004']);
    expect(r.map((x) => [x.shipment_no, x.customer, Number(x.qty_shipped)])).toEqual([
      ['SH-3001', 'Aldervale Aerostructures', 40], ['SH-3002', 'Pinecrest Robotics', 25]]);
    expect(r.every((x) => x.status === 'Shipped')).toBe(true);
  });
  it('SCH-C05 reconciliation: received 100 = shipped 65 + scrapped 5 + on hand 30 (adjusted null)', async () => {
    const r = await one(db, Q.recon, ['L2611-004']);
    expect([num(r.received_total), num(r.shipped_total), num(r.scrapped_total), num(r.adjusted_total), num(r.on_hand_total)]).toEqual([100, 65, 5, null, 30]);
    expect(num(r.received_total)).toBe(num(r.shipped_total)! + num(r.scrapped_total)! + num(r.on_hand_total)!);
  });
  it('SCH-C06 all movements of the lot are chronological and include transfer and scrap with reason code', async () => {
    const r = await rows(db, Q.movements, ['L2611-004']);
    expect(r.map((x) => x.txn_type)).toEqual(['RECEIPT', 'SHIP', 'SHIP', 'SCRAP', 'TRANSFER', 'TRANSFER']);
    expect(r.find((x) => x.txn_type === 'SCRAP').reason_code).toBe('SCR_DMG');
  });
  it('SCH-C07 in-house lot (no supplier receipt) traces via PRODUCTION_COMPLETE; backward supplier trace is empty for it', async () => {
    expect((await rows(db, Q.backward, ['L2640-001'])).length).toBe(0);
    const r = await rows(db, Q.inHouse, ['L2640-001']);
    expect(r.length).toBe(1);
    expect(Number(r[0].qty_change)).toBe(12);
  });
  it('SCH-C08 count-line flags: tolerances A 0 %, B 2 %, C 5 % (first / final)', async () => {
    const r = await rows(db, `SELECT lot_number, first_in_tolerance AS f, final_in_tolerance AS fin, variance_qty FROM cycle_count_line ORDER BY lot_number`);
    expect(r.map((x) => [x.lot_number, x.f, x.fin, Number(x.variance_qty)])).toEqual([
      ['L2611-010', false, false, -4], ['L2611-011', false, true, -1], ['L2611-012', true, true, 2], ['L2611-013', true, true, 0]]);
  });
  it('SCH-C09 KPI-7: first-count hit rate 2/4 = 50.0 %, after recount 3/4 = 75.0 %, absolute variance 7 units', async () => {
    const r = await one(db, Q.accuracy, ['2026-11-01', '2026-11-30']);
    expect([num(r.accuracy_first_count_pct), num(r.accuracy_after_recount_pct), num(r.absolute_variance_units)]).toEqual([50.0, 75.0, 7]);
  });
  it('SCH-C10 KPI-7 empty period -> NULL, not 0 / 100 (period anchored on approved_business_date)', async () => {
    const r = await one(db, Q.accuracy, ['2026-12-01', '2026-12-31']);
    expect([num(r.accuracy_first_count_pct), num(r.accuracy_after_recount_pct)]).toEqual([null, null]);
    const edge = await one(db, Q.accuracy, ['2026-11-17', '2026-11-17']); // inclusive boundary
    expect(num(edge.accuracy_first_count_pct)).toBe(50.0);
  });
  it('SCH-C11 adjustments updated on-hand: 96, 199, 52, 40 (US-044); L4 (variance 0) has no ADJUST row', async () => {
    const r = await rows(db, `SELECT lot_number, sum(qty_change)::int AS n FROM inventory_transaction WHERE lot_number IN ('L2611-010','L2611-011','L2611-012','L2611-013') GROUP BY 1 ORDER BY 1`);
    expect(r.map((x) => [x.lot_number, x.n])).toEqual([['L2611-010', 96], ['L2611-011', 199], ['L2611-012', 52], ['L2611-013', 40]]);
    expect((await one(db, `SELECT count(*)::int AS n FROM inventory_transaction WHERE txn_type='ADJUST'`)).n).toBe(3);
  });
  it('SCH-C12 v_inventory_transaction exposes reference_type / reference_id in the contract shape (reference_id of a SHIP row is the shipment id)', async () => {
    const r = await one(db, `SELECT v.reference_type, v.reference_id::int AS rid, s.id::int AS sid FROM v_inventory_transaction v
                             JOIN shipment_line sl ON sl.id = v.shipment_line_id JOIN shipment s ON s.id = sl.shipment_id WHERE s.shipment_no='SH-3001'`);
    expect(r.reference_type).toBe('shipment');
    expect(r.rid).toBe(r.sid);
    const t = await rows(db, `SELECT DISTINCT reference_type FROM v_inventory_transaction ORDER BY 1`);
    expect(t.map((x) => x.reference_type)).toEqual(['cycle_count', 'manual', 'receipt', 'shipment']);
  });
});
