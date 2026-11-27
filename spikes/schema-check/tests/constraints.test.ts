// SCH-10..SCH-9x: DB-level business rules from schema.md, permissions-matrix.md (R-1, R-4, R-10) and seed-plan.md.
// Every negative test asserts the database rejects the statement AND that nothing was written.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CHECK, FK, RESTRICT, UNIQUE, Ids, addHistory, expectDbError, insertLot, insertRow, loadBase, newDb, one, rows,
  shipmentDefaults, shippedDefaults,
} from './helpers';

let db: any;
let ids: Ids;
const U = (n: string) => ids.user[n];

beforeAll(async () => {
  db = await newDb();
  ids = await loadBase(db);
});

const count = async (table: string) => (await one(db, `SELECT count(*)::int AS n FROM ${table}`)).n as number;

describe('Append-only tables (R-10): UPDATE and DELETE rejected, TRUNCATE allowed', () => {
  let shipmentId: number;
  beforeAll(async () => {
    shipmentId = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9001' }));
    await addHistory(db, ids, shipmentId, [['Planned', '2026-11-01T08:00:00Z']]);
    await insertRow(db, 'audit_log', { action: 'TEST_ACTION', table_name: 'shipment', record_id: '9001' });
  });

  it('SCH-10 audit_log UPDATE / DELETE rejected', async () => {
    await expectDbError(db.query(`UPDATE audit_log SET action = 'HACKED'`), /audit_log is append-only: UPDATE rejected/, RESTRICT);
    await expectDbError(db.query(`DELETE FROM audit_log`), /audit_log is append-only: DELETE rejected/, RESTRICT);
    expect((await one(db, `SELECT action FROM audit_log`)).action).toBe('TEST_ACTION');
  });

  it('SCH-11 shipment_status_history UPDATE / DELETE rejected', async () => {
    await expectDbError(db.query(`UPDATE shipment_status_history SET note = 'x'`), /append-only/, RESTRICT);
    await expectDbError(db.query(`DELETE FROM shipment_status_history`), /append-only/, RESTRICT);
    expect(await count('shipment_status_history')).toBe(1);
  });

  it('SCH-12 shipment_verification UPDATE / DELETE rejected', async () => {
    await insertRow(db, 'shipment_verification', {
      shipment_id: shipmentId, attempt_no: 1, result: 'Pass', packer_id: U('demo.shipper1'), verified_by: U('demo.shipper2'),
      checklist: JSON.stringify({ part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'pass', packing_slip: 'pass', packaging_method: 'pass' }),
      business_date: '2026-11-01',
    });
    await expectDbError(db.query(`UPDATE shipment_verification SET result = 'Fail'`), /append-only/, RESTRICT);
    await expectDbError(db.query(`DELETE FROM shipment_verification`), /append-only/, RESTRICT);
  });

  it('SCH-13 inventory_transaction (ledger) UPDATE / DELETE rejected', async () => {
    await insertLot(db, ids, 'L2611-900', 'CRC-2041-B');
    await insertRow(db, 'inventory_transaction', {
      txn_type: 'PRODUCTION_COMPLETE', part_id: ids.part['CRC-2041-B'], location_id: ids.loc['FG-01'], lot_number: 'L2611-900',
      qty_change: 5, created_by: U('demo.receiver'),
    });
    await expectDbError(db.query(`UPDATE inventory_transaction SET qty_change = 6`), /append-only/, RESTRICT);
    await expectDbError(db.query(`DELETE FROM inventory_transaction`), /append-only/, RESTRICT);
    expect((await one(db, `SELECT sum(qty_change)::int AS n FROM inventory_transaction`)).n).toBe(5);
  });

  it('SCH-14 TRUNCATE stays allowed on append-only tables (demo reset), row triggers do not fire', async () => {
    const scratch = await newDb();
    await scratch.exec(`INSERT INTO audit_log (action) VALUES ('X1')`);
    await scratch.exec(`TRUNCATE audit_log, inventory_transaction, shipment_status_history, shipment_verification`);
    expect((await one(scratch, `SELECT count(*)::int AS n FROM audit_log`)).n).toBe(0);
  });
});

describe('No business-row delete', () => {
  it('SCH-15 DELETE on business, lookup and reference tables raises "never deleted"', async () => {
    for (const t of ['shipment', 'customer', 'supplier', 'carrier', 'part', 'location', 'reason_code', 'lot', 'app_user',
      'setting', 'packaging_error', 'rework_event', 'corrective_action', 'receipt', 'cycle_count', 'cycle_count_line', 'ref_shipment_transition']) {
      // Seed a row where the table is empty is unnecessary: BEFORE DELETE fires per row, so use tables that have rows.
      const n = await count(t);
      if (n === 0) continue; // covered by SCH-05 trigger inventory
      await expectDbError(db.query(`DELETE FROM ${t}`), /never deleted/, RESTRICT);
      expect(await count(t)).toBe(n);
    }
  });

  it('SCH-16 shipment_line can be deleted only while the shipment is Planned / Ready to Pack', async () => {
    const planned = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9010' }));
    const packing = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9011', status: 'Packing', packed_by: U('demo.shipper1') }));
    const l1 = await insertRow(db, 'shipment_line', { shipment_id: planned, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 5 });
    const l2 = await insertRow(db, 'shipment_line', { shipment_id: packing, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 5 });
    await expectDbError(db.query(`DELETE FROM shipment_line WHERE id = $1`, [l2]), /only be deleted while the shipment is Planned or Ready to Pack/, RESTRICT);
    await db.query(`DELETE FROM shipment_line WHERE id = $1`, [l1]);
    expect((await one(db, `SELECT count(*)::int AS n FROM shipment_line WHERE id IN ($1,$2)`, [l1, l2])).n).toBe(1);
  });
});

describe('Status transitions and history chain (contract 1.7)', () => {
  let sid: number;
  beforeAll(async () => {
    sid = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9020' }));
    await addHistory(db, ids, sid, [['Planned', '2026-11-01T08:00:00Z'], ['Ready to Pack', '2026-11-01T09:00:00Z']]);
  });
  const hist = (o: Record<string, unknown>) =>
    insertRow(db, 'shipment_status_history', { shipment_id: sid, business_date: '2026-11-01', changed_by: U('demo.shipper1'), ...o });

  it('SCH-20 invalid transition (Ready to Pack -> Shipped) rejected by FK to ref_shipment_transition', async () => {
    await expectDbError(hist({ from_status: 'Ready to Pack', to_status: 'Shipped', changed_at: '2026-11-01T10:00:00Z' }), /foreign key|violates/i, FK);
  });
  it('SCH-21 Ready to Pack -> Verified / Rework / Delivered rejected (skipping packing; Delivered removed from v1, UD-6)', async () => {
    // from_status matches the current chain tail (Ready to Pack), so only the transition table can reject these.
    await expectDbError(hist({ from_status: 'Ready to Pack', to_status: 'Verified', changed_at: '2026-11-01T10:00:00Z' }), /violates/i, FK);
    await expectDbError(hist({ from_status: 'Ready to Pack', to_status: 'Rework', changed_at: '2026-11-01T10:00:00Z' }), /violates/i, FK);
    await expectDbError(hist({ from_status: 'Ready to Pack', to_status: 'Delivered', changed_at: '2026-11-01T10:00:00Z' }), /violates/i, FK);
  });
  it('SCH-22 broken chain (from_status != previous to_status) rejected by trigger', async () => {
    await expectDbError(hist({ from_status: 'Packing', to_status: 'Verified', changed_at: '2026-11-01T10:00:00Z' }), /chain broken: expected from_status Ready to Pack, got Packing/, CHECK);
  });
  it('SCH-23 time going backwards rejected', async () => {
    await expectDbError(hist({ from_status: 'Ready to Pack', to_status: 'Packing', changed_at: '2026-11-01T08:30:00Z' }), /must not go backwards/, CHECK);
  });
  it('SCH-24 first row must have from_status NULL and to_status Planned', async () => {
    const s2 = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9021' }));
    await expectDbError(insertRow(db, 'shipment_status_history', { shipment_id: s2, from_status: 'Planned', to_status: 'Ready to Pack', changed_at: '2026-11-01T08:00:00Z', business_date: '2026-11-01', changed_by: U('demo.shipper1') }), /first status history row/, CHECK);
    await expectDbError(insertRow(db, 'shipment_status_history', { shipment_id: s2, from_status: null, to_status: 'Packing', changed_at: '2026-11-01T08:00:00Z', business_date: '2026-11-01', changed_by: U('demo.shipper1') }), /violates check constraint/, CHECK);
  });
  it('SCH-25 a valid next step is accepted (control)', async () => {
    await hist({ from_status: 'Ready to Pack', to_status: 'Packing', changed_at: '2026-11-01T10:00:00Z' });
    expect((await one(db, `SELECT count(*)::int AS n FROM shipment_status_history WHERE shipment_id = $1`, [sid])).n).toBe(3);
  });
  it('SCH-26 status outside the 8 values rejected (Delivered removed from v1, UD-6)', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9022', status: 'Delivered' })), /shipment_status_check/, CHECK);
  });
});

describe('Verifier != packer (R-1) and "no Shipped without verifier"', () => {
  const checklistPass = JSON.stringify({ part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'pass', packing_slip: 'pass', packaging_method: 'pass' });
  let sid: number;
  beforeAll(async () => {
    sid = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9030', status: 'Packing', packed_by: U('demo.shipper1') }));
  });
  const ver = (o: Record<string, unknown>) =>
    insertRow(db, 'shipment_verification', {
      shipment_id: sid, attempt_no: 1, result: 'Pass', packer_id: U('demo.shipper1'), verified_by: U('demo.shipper2'),
      checklist: checklistPass, failed_items: '{}', business_date: '2026-11-02', ...o,
    });

  it('SCH-30 shipment_verification: verified_by = packer_id rejected (all roles, incl. Supervisor)', async () => {
    await expectDbError(ver({ verified_by: U('demo.shipper1') }), /violates check constraint/, CHECK);
    await expectDbError(ver({ packer_id: U('demo.supervisor'), verified_by: U('demo.supervisor') }), /violates check constraint/, CHECK);
    expect(await count('shipment_verification')).toBe(1); // only SCH-12 row
  });
  it('SCH-31 a different Shipping / Quality / Supervisor verifier is accepted (control)', async () => {
    await ver({ attempt_no: 1, verified_by: U('demo.quality') });
    await ver({ attempt_no: 2, verified_by: U('demo.supervisor') });
    await ver({ attempt_no: 3, verified_by: U('demo.shipper2') });
  });
  it('SCH-32 shipment.verified_by = packed_by rejected (shipment_verified_chk backstop)', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, {
      shipment_no: 'SH-9031', status: 'Verified', packed_by: U('demo.shipper1'), verified_by: U('demo.shipper1'), verified_at: '2026-11-02T10:00:00Z' })),
      /shipment_verified_chk/, CHECK);
  });
  it('SCH-33 verified_by and verified_at must be set together', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9032', status: 'Verified', packed_by: U('demo.shipper1'), verified_by: U('demo.shipper2') })), /shipment_verified_chk/, CHECK);
  });
  it('SCH-34 Shipped without a verifier rejected (no un-verified shipment can be Shipped)', async () => {
    await expectDbError(insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9033', verified_by: null, verified_at: null })), /shipment_shipped_fields_chk/, CHECK);
  });
  it('SCH-35 Shipped without ship_date / shipped_at / carrier / packages / weight rejected; ship fields rejected on non-Shipped', async () => {
    for (const col of ['ship_date', 'shipped_at', 'carrier_id', 'packages_count', 'total_weight_lb']) {
      await expectDbError(insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9034', [col]: null })), /shipment_shipped_fields_chk/, CHECK);
    }
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9035', status: 'Packing', packed_by: U('demo.shipper1'), ship_date: '2026-11-05' })), /shipment_shipped_fields_chk/, CHECK);
  });
  it('SCH-36 a fully verified Shipped shipment is accepted (control)', async () => {
    await insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9036' }));
  });
  it('SCH-37 verification result consistency: Pass needs empty failed_items; Fail needs items; items subset; 7 checklist keys', async () => {
    await expectDbError(ver({ attempt_no: 9, result: 'Pass', failed_items: '{labels}' }), /violates check constraint/, CHECK);
    await expectDbError(ver({ attempt_no: 9, result: 'Fail', failed_items: '{}' }), /violates check constraint/, CHECK);
    await expectDbError(ver({ attempt_no: 9, result: 'Fail', failed_items: '{colour}' }), /violates check constraint/, CHECK);
    await expectDbError(ver({ attempt_no: 9, checklist: JSON.stringify({ part_number: 'pass' }) }), /violates check constraint/, CHECK);
    await expectDbError(ver({ attempt_no: 9, checklist: '[]' }), /violates check constraint/, CHECK);
    await ver({ attempt_no: 9, result: 'Fail', failed_items: '{labels,coc}' }); // control
  });
  it('SCH-38 duplicate attempt_no for one shipment rejected', async () => {
    await expectDbError(ver({ attempt_no: 1, verified_by: U('demo.quality') }), /duplicate key|unique/i, UNIQUE);
  });
});

describe('Other shipment / line / error CHECKs', () => {
  it('SCH-40 hold fields set together exactly when On Hold', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9040', status: 'On Hold' })), /shipment_hold_chk/, CHECK);
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9041', held_from_status: 'Packing' })), /shipment_hold_chk/, CHECK);
    await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9042', status: 'On Hold', held_from_status: 'Packing', hold_reason_id: ids.reason.QUALITY_HOLD, hold_owner_dept: 'Quality' }));
  });
  it('SCH-41 status Rework requires rework_origin', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9043', status: 'Rework' })), /shipment_rework_chk/, CHECK);
  });
  it('SCH-42 late shipment needs a late reason; late reason only on Shipped; on-time needs none', async () => {
    await expectDbError(insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9044', promise_date: '2026-11-04', ship_date: '2026-11-05' })), /shipment_late_reason_chk/, CHECK);
    await insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9045', promise_date: '2026-11-04', ship_date: '2026-11-05', late_reason_id: ids.reason.CARRIER_LATE }));
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9046', late_reason_id: ids.reason.CARRIER_LATE })), /shipment_late_reason_chk/, CHECK);
  });
  it('SCH-43 promise/requested date before order date rejected', async () => {
    await expectDbError(insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9047', promise_date: '2026-10-01' })), /shipment_dates_chk/, CHECK);
  });
  it('SCH-44 short line (qty_shipped < qty_ordered) requires a note (US-021)', async () => {
    const s = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9048' }));
    await expectDbError(insertRow(db, 'shipment_line', { shipment_id: s, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 10, qty_shipped: 8 }), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'shipment_line', { shipment_id: s, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 10, qty_shipped: 8, short_note: '   ' }), /violates check constraint/, CHECK);
    await insertRow(db, 'shipment_line', { shipment_id: s, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 10, qty_shipped: 8, short_note: 'Short 2: demo' });
  });
  it('SCH-45 packaging_error rules: Paperwork subtype iff Paperwork; Customer only After ship; After ship only Quality/Customer', async () => {
    const s = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9049' }));
    const e = (o: Record<string, unknown>) => insertRow(db, 'packaging_error', {
      shipment_id: s, detected_at: '2026-11-02T10:00:00Z', detected_by_role: 'Verifier', detected_stage: 'Before ship',
      category: 'Wrong part', severity: 'Low', description: 'Demo error', reported_by: U('demo.quality'), ...o });
    await expectDbError(e({ category: 'Paperwork' }), /violates check constraint/, CHECK);
    await expectDbError(e({ paperwork_subtype: 'BOL' }), /violates check constraint/, CHECK);
    await expectDbError(e({ detected_by_role: 'Customer' }), /violates check constraint/, CHECK);
    await expectDbError(e({ detected_stage: 'After ship', detected_by_role: 'Packer' }), /violates check constraint/, CHECK);
    await expectDbError(e({ status: 'Closed' }), /violates check constraint/, CHECK); // closed_at iff Closed
    await expectDbError(e({ detected_stage: 'After ship', detected_by_role: 'Customer', rework_episode: 1 }), /violates check constraint/, CHECK);
    await e({ detected_stage: 'After ship', detected_by_role: 'Customer' }); // control
    await e({ category: 'Paperwork', paperwork_subtype: 'Packing slip' }); // control
  });
  it('SCH-46 rework_event: composite FK keeps shipment and error consistent; completed_at >= started_at; minutes and completed_business_date generated', async () => {
    const s1 = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9050' }));
    const s2 = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9051' }));
    const pe = await insertRow(db, 'packaging_error', { shipment_id: s1, detected_at: '2026-11-02T10:00:00Z', detected_by_role: 'Verifier', detected_stage: 'Before ship', category: 'Wrong part', severity: 'Low', description: 'd', reported_by: U('demo.quality') });
    const ev = (o: Record<string, unknown>) => insertRow(db, 'rework_event', { packaging_error_id: pe, shipment_id: s1, action: 'Relabel', started_at: '2026-11-02T10:00:00Z', performed_by: U('demo.shipper1'), ...o });
    await expectDbError(ev({ shipment_id: s2 }), /violates foreign key/, FK);
    await expectDbError(ev({ completed_at: '2026-11-02T09:00:00Z' }), /violates check constraint/, CHECK);
    // D-1 (migrations-plan 2, T-016): completed_business_date is GENERATED from completed_at, so the app must not supply it.
    await expectDbError(ev({ completed_at: '2026-11-02T10:30:00Z', completed_business_date: '2026-11-02' }), /cannot insert a non-DEFAULT value into column "completed_business_date"/);
    const id = await ev({ completed_at: '2026-11-02T10:30:59Z' });
    const done = await one(db, `SELECT minutes, completed_business_date::text AS d FROM rework_event WHERE id = $1`, [id]);
    expect(done.minutes).toBe(30);
    expect(done.d).toBe('2026-11-02');
    const late = await ev({ completed_at: '2026-11-02T23:59:59Z' });
    expect((await one(db, `SELECT completed_business_date::text AS d FROM rework_event WHERE id = $1`, [late])).d).toBe('2026-11-02'); // UTC date, not session time zone
    const open = await ev({});
    const o = await one(db, `SELECT minutes, completed_business_date FROM rework_event WHERE id = $1`, [open]);
    expect([o.minutes, o.completed_business_date]).toEqual([null, null]);
  });
});

describe('T-022 user decisions: severity (UD-5), packaging_related (UD-9), locked shipments (UD-3)', () => {
  const errRow = (sid: number, o: Record<string, unknown> = {}) => insertRow(db, 'packaging_error', {
    shipment_id: sid, detected_at: '2026-11-02T10:00:00Z', detected_by_role: 'Verifier', detected_stage: 'Before ship',
    category: 'Wrong part', severity: 'Low', description: 'Demo error', reported_by: U('demo.quality'), ...o });

  it('SCH-47 severity is exactly Low / Medium / High / Critical (UD-5); Minor and Major are rejected', async () => {
    const s = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9060' }));
    for (const sev of ['Low', 'Medium', 'High', 'Critical']) await errRow(s, { severity: sev });
    for (const sev of ['Minor', 'Major', 'low', '']) {
      await expectDbError(errRow(s, { severity: sev }), /packaging_error_severity_check/, CHECK);
    }
    expect((await one(db, `SELECT count(*)::int AS n FROM packaging_error WHERE shipment_id=$1`, [s])).n).toBe(4);
  });
  it('SCH-48 packaging_related defaults to true; false only for an After-ship error (UD-9, kpi-spec S-1)', async () => {
    const s = await insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9061' }));
    const d = await errRow(s);
    expect((await one(db, `SELECT packaging_related FROM packaging_error WHERE id=$1`, [d])).packaging_related).toBe(true);
    await expectDbError(errRow(s, { packaging_related: false }), /packaging_error_related_chk/, CHECK);
    await expectDbError(db.query(`UPDATE packaging_error SET packaging_related=false WHERE id=$1`, [d]), /packaging_error_related_chk/, CHECK);
    await expectDbError(errRow(s, { packaging_related: null }), /null value/);
    const a = await errRow(s, { detected_stage: 'After ship', detected_by_role: 'Customer', packaging_related: false }); // control
    await db.query(`UPDATE packaging_error SET packaging_related=true WHERE id=$1`, [a]); // can be switched back
  });

  describe('Locked Shipped / Cancelled shipments (UD-3, matrix R-14; only the E-53 correctable columns change)', () => {
    let shipped: number;
    let cancelled: number;
    let line: number;
    beforeAll(async () => {
      await insertLot(db, ids, 'L2611-950', 'CRC-2041-B');
      shipped = await insertRow(db, 'shipment', shippedDefaults(ids, { shipment_no: 'SH-9070', tracking_number: 'SLP000000000001', notes: 'n' }));
      line = await insertRow(db, 'shipment_line', { shipment_id: shipped, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 10, qty_shipped: 9, short_note: 'Short 1', lot_number: 'L2611-950', location_id: ids.loc['STK-A01'] });
      cancelled = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9071', status: 'Cancelled', notes: 'c' }));
    });
    const val = async (id: number, col: string) => (await one(db, `SELECT ${col} AS v FROM shipment WHERE id=$1`, [id])).v;

    it('SCH-90 status of a Shipped or Cancelled shipment is terminal (no Shipped -> Cancelled, no Cancelled -> Planned)', async () => {
      await expectDbError(db.query(`UPDATE shipment SET status='Cancelled', ship_date=NULL, shipped_at=NULL WHERE id=$1`, [shipped]), /locked: its status cannot change/, RESTRICT);
      await expectDbError(db.query(`UPDATE shipment SET status='Planned' WHERE id=$1`, [cancelled]), /locked: its status cannot change/, RESTRICT);
      expect([await val(shipped, 'status'), await val(cancelled, 'status')]).toEqual(['Shipped', 'Cancelled']);
    });
    it('SCH-91 non-correctable columns are refused (customer, order date, packer, verifier, shipped_at, rework fields)', async () => {
      const bad: [string, unknown][] = [['customer_id', ids.cust.PINECREST], ['order_date', '2026-10-27'], ['packed_by', U('demo.supervisor')],
        ['verified_by', U('demo.quality')], ['shipped_at', '2026-11-05T13:00:00Z'], ['rework_episode', 3], ['created_by', U('demo.shipper1')]];
      for (const [col, v] of bad) {
        await expectDbError(db.query(`UPDATE shipment SET ${col}=$1 WHERE id=$2`, [v, shipped]), /locked: only correctable fields may change/, RESTRICT);
      }
      await expectDbError(db.query(`UPDATE shipment SET customer_id=$1 WHERE id=$2`, [ids.cust.PINECREST, cancelled]), /locked/, RESTRICT);
      expect(Number(await val(shipped, 'customer_id'))).toBe(ids.cust.ALDERVALE);
    });
    it('SCH-92 correctable columns can change (correction action): tracking, carrier, packages, weight, notes, doc flags, PO, dates', async () => {
      await db.query(`UPDATE shipment SET tracking_number='SLP000000000002', carrier_id=$1, packages_count=2, total_weight_lb=11.25,
        notes='corrected', doc_bol=true, customer_po='PO-FIXED', service_level='Ground', promise_date='2026-11-06' WHERE id=$2`, [ids.carrier['SwiftLane Parcel'], shipped]);
      expect([await val(shipped, 'tracking_number'), await val(shipped, 'notes'), await val(shipped, 'packages_count')]).toEqual(['SLP000000000002', 'corrected', 2]);
      await db.query(`UPDATE shipment SET notes='corrected too' WHERE id=$1`, [cancelled]);
      // the other CHECKs still apply to a corrected row: making it late without a late reason is refused (UD-1)
      await expectDbError(db.query(`UPDATE shipment SET promise_date='2026-11-04' WHERE id=$1`, [shipped]), /shipment_late_reason_chk/, CHECK);
      await db.query(`UPDATE shipment SET promise_date='2026-11-04', late_reason_id=$1 WHERE id=$2`, [ids.reason.CARRIER_LATE, shipped]);
      // ship fields stay impossible on a Cancelled shipment
      await expectDbError(db.query(`UPDATE shipment SET ship_date='2026-11-05' WHERE id=$1`, [cancelled]), /shipment_shipped_fields_chk/, CHECK);
    });
    it('SCH-93 lines of a locked shipment: only short_note may change; quantity, lot, location, part refused; open shipment lines stay editable', async () => {
      for (const [col, v] of [['qty_shipped', 10], ['qty_ordered', 9], ['location_id', ids.loc['FG-01']], ['lot_number', null]] as [string, unknown][]) {
        await expectDbError(db.query(`UPDATE shipment_line SET ${col}=$1 WHERE id=$2`, [v, line]), /locked shipment: only short_note may change/, RESTRICT);
      }
      await db.query(`UPDATE shipment_line SET short_note='Short 1: corrected' WHERE id=$1`, [line]);
      const open = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9072' }));
      const ol = await insertRow(db, 'shipment_line', { shipment_id: open, line_no: 1, part_id: ids.part['CRC-2041-B'], qty_ordered: 10 });
      await db.query(`UPDATE shipment_line SET qty_ordered=12 WHERE id=$1`, [ol]); // control: not locked
      await db.query(`UPDATE shipment SET customer_po='PO-OPEN-EDIT' WHERE id=$1`, [open]); // control: not locked
    });
  });
});

describe('Identity, lookups, settings guardrails', () => {
  it('SCH-50 app_user: only @example.com emails; active user needs a password hash; username pattern; role set', async () => {
    const u = (o: Record<string, unknown>) => insertRow(db, 'app_user', { username: 'demo.extra', display_name: 'Demo Extra', role: 'Viewer', password_hash: 'scrypt$x', ...o });
    await expectDbError(u({ email: 'a@realcompany.com' }), /violates check constraint/, CHECK);
    await expectDbError(u({ password_hash: null }), /violates check constraint/, CHECK);
    await expectDbError(u({ password_hash: 'plaintext' }), /violates check constraint/, CHECK);
    await expectDbError(u({ username: 'Demo Extra' }), /violates check constraint/, CHECK);
    await expectDbError(u({ role: 'Owner' }), /violates check constraint/, CHECK);
    await u({ username: 'demo.inactive', active: false, password_hash: null }); // deployed demo.admin without DEMO_ADMIN_PASSWORD
  });
  it('SCH-51 part number must end with its revision; lot numbers upper-case', async () => {
    await expectDbError(insertRow(db, 'part', { part_number: 'CRC-7000-A', revision: 'B', abc_class: 'A' }), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'part', { part_number: 'crc-7000-a', revision: 'a', abc_class: 'A' }), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'lot', { lot_number: 'l2611-777', part_id: ids.part['CRC-2041-B'] }), /violates check constraint/, CHECK);
  });
  it('SCH-52 settings CHECKs: ranges, types, enums and impossible dates', async () => {
    const set = (k: string, v: string) => db.query(`UPDATE setting SET value = $2 WHERE key = $1`, [k, v]);
    await expectDbError(set('target_on_time_pct', '101'), /violates check constraint/, CHECK);
    await expectDbError(set('target_on_time_pct', '-1'), /violates check constraint/, CHECK);
    await expectDbError(set('target_on_time_pct', 'abc'), /violates check constraint/, CHECK);
    await expectDbError(set('on_time_tolerance_days', '31'), /violates check constraint/, CHECK);
    await expectDbError(set('target_cycle_time_h', '0'), /violates check constraint/, CHECK);
    await expectDbError(set('reporting_mode', 'whenever'), /violates check constraint/, CHECK);
    await expectDbError(set('on_time_basis', 'shipped'), /violates check constraint/, CHECK);
    await expectDbError(set('demo_read_only_mode', 'maybe'), /violates check constraint/, CHECK);
    await expectDbError(set('reporting_date', '2026-13-45'), /out of range|invalid|violates/i); // regex passes, ::date cast rejects
    await expectDbError(set('reporting_date', '1999-12-31'), /violates check constraint/, CHECK);
    await expectDbError(set('reporting_date', 'yesterday'), /violates check constraint/, CHECK);
    expect((await one(db, `SELECT value FROM setting WHERE key='reporting_date'`)).value).toBe('2026-11-25');
    await set('target_on_time_pct', '96'); // control
    await set('target_on_time_pct', '95');
  });
  it('SCH-53 set_updated_at trigger bumps updated_at on UPDATE', async () => {
    const before = await one(db, `SELECT updated_at FROM customer WHERE code='PINECREST'`);
    await new Promise((r) => setTimeout(r, 20));
    await db.query(`UPDATE customer SET ship_to_city = 'Elsewhere' WHERE code='PINECREST'`);
    const after = await one(db, `SELECT updated_at FROM customer WHERE code='PINECREST'`);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });
});

describe('Ledger integrity: lots, non-negative on-hand, balanced TRANSFER, one ADJUST per count line', () => {
  const part = () => ids.part['CRC-2041-B'];
  let receiptId: number;
  const led = (o: Record<string, unknown>) => ({
    part_id: part(), location_id: ids.loc['STK-A01'], lot_number: 'L2611-004', created_by: U('demo.receiver'), ...o });

  beforeAll(async () => {
    await insertLot(db, ids, 'L2611-004', 'CRC-2041-B');
    receiptId = await insertRow(db, 'receipt', {
      supplier_id: ids.supplier.GRAYSTONE, supplier_po: 'PO-DEMO-1', part_id: part(), qty_received: 100, lot_number: 'L2611-004',
      arrived_at: '2026-11-02T08:00:00Z', location_id: ids.loc['STK-A01'], inspection_status: 'Accepted', received_by: U('demo.receiver'),
    });
    await insertRow(db, 'inventory_transaction', led({ txn_type: 'RECEIPT', qty_change: 100, receipt_id: receiptId }));
  });
  const onHand = async (loc: string, lotNo = 'L2611-004') =>
    Number((await rows(db, `SELECT COALESCE(sum(qty_change),0)::int AS n FROM inventory_transaction WHERE lot_number=$1 AND location_id=$2`, [lotNo, ids.loc[loc]]))[0].n);

  it('SCH-60 unknown lot rejected on the ledger and on receipts; a lot cannot be used with another part', async () => {
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'PRODUCTION_COMPLETE', qty_change: 1, lot_number: 'L9999-999' })), /violates foreign key/, FK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'PRODUCTION_COMPLETE', qty_change: 1, part_id: ids.part['CRC-3310-A'] })), /violates foreign key/, FK);
    await expectDbError(insertRow(db, 'receipt', { supplier_id: ids.supplier.GRAYSTONE, supplier_po: 'P', part_id: ids.part['CRC-3310-A'], qty_received: 1, lot_number: 'L2611-004', arrived_at: '2026-11-02T08:00:00Z', location_id: ids.loc['STK-A01'], inspection_status: 'Accepted', received_by: U('demo.receiver') }), /violates foreign key/, FK);
  });
  it('SCH-61 per-type ledger CHECKs: signs, required links, reasons', async () => {
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'RECEIPT', qty_change: -1, receipt_id: receiptId })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'RECEIPT', qty_change: 1 })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'SHIP', qty_change: -1 })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'SCRAP', qty_change: -1 })), /violates check constraint/, CHECK); // reason required
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'SCRAP', qty_change: 1, reason_code_id: ids.reason.SCR_DMG })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'ADJUST', qty_change: -1, reason_code_id: ids.reason.CNT_VAR })), /violates check constraint/, CHECK); // manual ADJUST deferred (US-040)
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: -1 })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'PRODUCTION_COMPLETE', qty_change: 0 })), /violates check constraint/, CHECK);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'ISSUE', qty_change: -1 })), /violates check constraint/, CHECK); // no ISSUE type (Q-17)
  });
  it('SCH-62 non-negative on-hand: over-drawing is rejected at COMMIT and nothing is written', async () => {
    expect(await onHand('STK-A01')).toBe(100);
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'SCRAP', qty_change: -101, reason_code_id: ids.reason.SCR_DMG })), /on-hand would be negative \(-1\)/, CHECK);
    expect(await onHand('STK-A01')).toBe(100);
    await insertRow(db, 'inventory_transaction', led({ txn_type: 'SCRAP', qty_change: -100, reason_code_id: ids.reason.SCR_DMG })); // exactly zero is allowed
    expect(await onHand('STK-A01')).toBe(0);
    await insertRow(db, 'inventory_transaction', led({ txn_type: 'PRODUCTION_COMPLETE', qty_change: 100 })); // restore
    expect(await onHand('STK-A01')).toBe(100);
  });
  it('SCH-63 the check is end-state per transaction: a debit committed together with enough credit passes', async () => {
    await insertLot(db, ids, 'L2611-901', 'CRC-2041-B');
    await db.transaction(async (tx: any) => {
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'SCRAP', qty_change: -5, lot_number: 'L2611-901', reason_code_id: ids.reason.SCR_DMG }));
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'PRODUCTION_COMPLETE', qty_change: 10, lot_number: 'L2611-901' }));
    });
    expect(await onHand('STK-A01', 'L2611-901')).toBe(5);
  });
  it('SCH-64 TRANSFER must be exactly two legs summing to zero (checked at commit)', async () => {
    const g = '11111111-1111-4111-8111-111111111111';
    const leg = (loc: string, q: number, grp = g) => insertRow(db, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: q, location_id: ids.loc[loc], txn_group: grp }));
    await expectDbError(leg('STK-A01', -10), /TRANSFER group .* exactly two legs/, CHECK); // one leg
    await expectDbError(db.transaction(async (tx: any) => {
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: -10, txn_group: g }));
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: 9, location_id: ids.loc['FG-01'], txn_group: g }));
    }), /exactly two legs/, CHECK); // unbalanced
    expect(await onHand('STK-A01')).toBe(100);
    await db.transaction(async (tx: any) => { // balanced control
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: -10, txn_group: '22222222-2222-4222-8222-222222222222' }));
      await insertRow(tx, 'inventory_transaction', led({ txn_type: 'TRANSFER', qty_change: 10, location_id: ids.loc['FG-01'], txn_group: '22222222-2222-4222-8222-222222222222' }));
    });
    expect(await onHand('STK-A01')).toBe(90);
    expect(await onHand('FG-01')).toBe(10);
  });
  it('SCH-65 SHIP row must match its shipment line (same part, location, lot) and be negative', async () => {
    const s = await insertRow(db, 'shipment', shipmentDefaults(ids, { shipment_no: 'SH-9060' }));
    const line = await insertRow(db, 'shipment_line', { shipment_id: s, line_no: 1, part_id: part(), qty_ordered: 5, lot_number: 'L2611-004', location_id: ids.loc['STK-A01'] });
    await expectDbError(insertRow(db, 'inventory_transaction', led({ txn_type: 'SHIP', qty_change: -5, shipment_line_id: line, location_id: ids.loc['FG-01'] })), /violates foreign key/, FK);
    await insertRow(db, 'inventory_transaction', led({ txn_type: 'SHIP', qty_change: -5, shipment_line_id: line })); // control
    expect(await onHand('STK-A01')).toBe(85);
  });
  it('SCH-66 receipts: Rejected has no location (no on-hand); Accepted / On Hold need one', async () => {
    const r = (o: Record<string, unknown>) => insertRow(db, 'receipt', { supplier_id: ids.supplier.GRAYSTONE, supplier_po: 'PO-X', part_id: part(), qty_received: 5, lot_number: 'L2611-004', arrived_at: '2026-11-02T08:00:00Z', received_by: U('demo.receiver'), ...o });
    await expectDbError(r({ inspection_status: 'Rejected', location_id: ids.loc['HOLD-01'] }), /violates check constraint/, CHECK);
    await expectDbError(r({ inspection_status: 'Accepted' }), /violates check constraint/, CHECK);
    await r({ inspection_status: 'Rejected' }); // control
  });

  describe('Cycle counts: R-4 approver != counter, terminal Approved, one ADJUST per line', () => {
    let cc: number;
    let line1: number;
    let line2: number;
    beforeAll(async () => {
      await insertLot(db, ids, 'L2611-902', 'CRC-3310-A');
      const rc = await insertRow(db, 'receipt', { supplier_id: ids.supplier.GRAYSTONE, supplier_po: 'PO-DEMO-2', part_id: ids.part['CRC-3310-A'], qty_received: 200, lot_number: 'L2611-902', arrived_at: '2026-11-02T08:00:00Z', location_id: ids.loc['STK-A01'], inspection_status: 'Accepted', received_by: U('demo.receiver') });
      await insertRow(db, 'inventory_transaction', led({ txn_type: 'RECEIPT', part_id: ids.part['CRC-3310-A'], lot_number: 'L2611-902', qty_change: 200, receipt_id: rc }));
      cc = await insertRow(db, 'cycle_count', { scheduled_date: '2026-11-15', created_by: U('demo.supervisor') });
      line1 = await insertRow(db, 'cycle_count_line', { cycle_count_id: cc, part_id: part(), location_id: ids.loc['STK-A01'], lot_number: 'L2611-004', abc_class: 'A', tolerance_pct: 0, system_qty: 85, counted_qty: 80, counted_by: U('demo.receiver'), counted_at: '2026-11-16T09:00:00Z' });
      line2 = await insertRow(db, 'cycle_count_line', { cycle_count_id: cc, part_id: ids.part['CRC-3310-A'], location_id: ids.loc['STK-A01'], lot_number: 'L2611-902', abc_class: 'B', tolerance_pct: 2, system_qty: 200, counted_qty: 195, counted_by: U('demo.receiver'), counted_at: '2026-11-16T09:05:00Z', recount_qty: 199, recounted_by: U('demo.supervisor'), recounted_at: '2026-11-16T09:30:00Z' });
    });
    const submit = (by: string) => db.query(`UPDATE cycle_count SET status='Counted', submitted_by=$1, submitted_at='2026-11-16T10:00:00Z' WHERE id=$2`, [U(by), cc]);
    const approve = (by: string) => db.query(`UPDATE cycle_count SET status='Approved', approved_by=$1, approved_at='2026-11-17T10:00:00Z', approved_business_date='2026-11-17' WHERE id=$2`, [U(by), cc]);

    it('SCH-70 status requires its fields: Counted needs submitter; Approved needs approver and business date', async () => {
      await expectDbError(db.query(`UPDATE cycle_count SET status='Counted' WHERE id=$1`, [cc]), /violates check constraint/, CHECK);
      await expectDbError(db.query(`UPDATE cycle_count SET status='Approved', approved_by=$1 WHERE id=$2`, [U('demo.quality'), cc]), /violates check constraint/, CHECK);
    });
    it('SCH-71 R-4: the counter (here: the submitter) cannot approve; the recounting Supervisor cannot approve', async () => {
      await submit('demo.receiver');
      await expectDbError(approve('demo.receiver'), /approver must not be a counter or recounter/, CHECK); // counted line 1 and 2
      await expectDbError(approve('demo.supervisor'), /approver must not be a counter or recounter of this count \(R-4\)/, CHECK); // recounted line 2
      expect((await one(db, `SELECT status FROM cycle_count WHERE id=$1`, [cc])).status).toBe('Counted');
    });
    it('SCH-72 R-4 widened by UD-2: a Supervisor who only submitted (entered/recounted no line) may NOT approve; another Supervisor may', async () => {
      const bare = await insertRow(db, 'cycle_count', { scheduled_date: '2026-11-15', created_by: U('demo.supervisor') });
      await db.query(`UPDATE cycle_count SET status='Counted', submitted_by=$1, submitted_at='2026-11-16T10:00:00Z' WHERE id=$2`, [U('demo.supervisor'), bare]);
      await expectDbError(
        db.query(`UPDATE cycle_count SET status='Approved', approved_by=$1, approved_at='2026-11-17T10:00:00Z', approved_business_date='2026-11-17' WHERE id=$2`, [U('demo.supervisor'), bare]),
        /cycle_count_approver_not_submitter_chk/, CHECK);
      expect((await one(db, `SELECT status FROM cycle_count WHERE id=$1`, [bare])).status).toBe('Counted');
      // control: a different approver (stand-in user at DB level) is accepted
      await db.query(`UPDATE cycle_count SET status='Approved', approved_by=$1, approved_at='2026-11-17T10:00:00Z', approved_business_date='2026-11-17' WHERE id=$2`, [U('demo.quality'), bare]);
      expect((await one(db, `SELECT status FROM cycle_count WHERE id=$1`, [bare])).status).toBe('Approved');
    });
    it('SCH-73 an eligible Supervisor (a different person from every counter) approves; Approved is terminal', async () => {
      // Make the eligible approver a user who counted nothing: demo.quality is the only role-agnostic stand-in at DB level.
      await approve('demo.quality');
      expect((await one(db, `SELECT status FROM cycle_count WHERE id=$1`, [cc])).status).toBe('Approved');
      await expectDbError(db.query(`UPDATE cycle_count SET approval_note='edit' WHERE id=$1`, [cc]), /an Approved cycle count cannot be changed/, RESTRICT);
      await expectDbError(db.query(`UPDATE cycle_count SET status='Open' WHERE id=$1`, [cc]), /cannot be changed/, RESTRICT);
    });
    it('SCH-74 one ADJUST per count line: first accepted (and on-hand updated), second rejected by unique index', async () => {
      const adj = (line: number, qty: number, p: number, lotNo: string) => insertRow(db, 'inventory_transaction', led({ txn_type: 'ADJUST', qty_change: qty, part_id: p, lot_number: lotNo, reason_code_id: ids.reason.CNT_VAR, cycle_count_line_id: line }));
      await adj(line2, -1, ids.part['CRC-3310-A'], 'L2611-902');
      expect(await onHand('STK-A01', 'L2611-902')).toBe(199);
      await expectDbError(adj(line2, -1, ids.part['CRC-3310-A'], 'L2611-902'), /duplicate key|unique/i, UNIQUE);
      expect(await onHand('STK-A01', 'L2611-902')).toBe(199);
      await adj(line1, -5, part(), 'L2611-004');
      expect(await onHand('STK-A01')).toBe(80);
    });
    it('SCH-75 count-line generated columns and tolerance arithmetic (exact)', async () => {
      const r = await one(db, `SELECT final_qty, first_variance_qty, variance_qty, first_in_tolerance, final_in_tolerance FROM cycle_count_line WHERE id=$1`, [line2]);
      expect(r).toMatchObject({ final_qty: 199, first_variance_qty: -5, variance_qty: -1, first_in_tolerance: false, final_in_tolerance: true });
    });
    it('SCH-76 counted_qty and its actor columns appear together; recount requires a count', async () => {
      await expectDbError(insertRow(db, 'cycle_count_line', { cycle_count_id: cc, part_id: part(), location_id: ids.loc['FG-01'], lot_number: 'L2611-004', abc_class: 'A', tolerance_pct: 0, system_qty: 10, counted_qty: 10 }), /violates check constraint/, CHECK);
      await expectDbError(insertRow(db, 'cycle_count_line', { cycle_count_id: cc, part_id: part(), location_id: ids.loc['FG-01'], lot_number: 'L2611-004', abc_class: 'A', tolerance_pct: 0, system_qty: 10, recount_qty: 10, recounted_by: U('demo.receiver'), recounted_at: '2026-11-16T09:00:00Z' }), /violates check constraint/, CHECK);
    });
  });
});

describe('Reset behaviour (seed-plan section 12): TRUNCATE ... RESTART IDENTITY CASCADE', () => {
  it('SCH-80 numbering sequences restart (SH-1001, PE-0001, RC-0001, CC-0001) and system settings survive', async () => {
    const d = await newDb();
    const i = await loadBase(d);
    const s = await insertRow(d, 'shipment', shipmentDefaults(i));
    expect((await one(d, `SELECT shipment_no FROM shipment WHERE id=$1`, [s])).shipment_no).toBe('SH-1001');
    await insertRow(d, 'packaging_error', { shipment_id: s, detected_at: '2026-11-02T10:00:00Z', detected_by_role: 'Verifier', detected_stage: 'Before ship', category: 'Wrong part', severity: 'Low', description: 'd', reported_by: i.user['demo.quality'] });
    await insertRow(d, 'cycle_count', { scheduled_date: '2026-11-15', created_by: i.user['demo.supervisor'] });
    const saltBefore = (await one(d, `SELECT value FROM setting WHERE key='client_key_salt'`)).value;
    await d.exec(`UPDATE setting SET value='9' WHERE key='tolerance_b_pct'`);
    await d.exec(`INSERT INTO audit_log (action) VALUES ('DEMO_RESET')`);
    await d.exec(`TRUNCATE inventory_transaction, cycle_count_line, cycle_count, receipt, lot, rework_event, corrective_action, packaging_error,
      shipment_verification, shipment_status_history, shipment_line, shipment, session, login_attempt, part, location, reason_code, carrier, supplier, customer, app_user
      RESTART IDENTITY CASCADE`);
    await d.exec(`UPDATE setting SET value = default_value WHERE scope = 'config'`);
    const i2 = await loadBase(d);
    const s2 = await insertRow(d, 'shipment', shipmentDefaults(i2));
    expect((await one(d, `SELECT shipment_no FROM shipment WHERE id=$1`, [s2])).shipment_no).toBe('SH-1001');
    expect(s2).toBe(1); // identity restarted
    const pe = await insertRow(d, 'packaging_error', { shipment_id: s2, detected_at: '2026-11-02T10:00:00Z', detected_by_role: 'Verifier', detected_stage: 'Before ship', category: 'Wrong part', severity: 'Low', description: 'd', reported_by: i2.user['demo.quality'] });
    expect((await one(d, `SELECT error_no FROM packaging_error WHERE id=$1`, [pe])).error_no).toBe('PE-0001');
    const cc = await insertRow(d, 'cycle_count', { scheduled_date: '2026-11-15', created_by: i2.user['demo.supervisor'] });
    expect((await one(d, `SELECT count_no FROM cycle_count WHERE id=$1`, [cc])).count_no).toBe('CC-0001');
    expect((await one(d, `SELECT value FROM setting WHERE key='client_key_salt'`)).value).toBe(saltBefore);
    expect((await one(d, `SELECT value FROM setting WHERE key='tolerance_b_pct'`)).value).toBe('2'); // reset to default
    expect((await one(d, `SELECT count(*)::int AS n FROM audit_log WHERE action='DEMO_RESET'`)).n).toBe(1); // audit_log not truncated (DQ-1 recommendation)
    expect((await one(d, `SELECT count(*)::int AS n FROM ref_shipment_transition`)).n).toBe(23);
  });
});
