import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receive, setupEnv, shipmentBody, type Env } from './helpers';

const PASS = { part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'pass', packing_slip: 'pass', coc: 'pass', packaging_method: 'pass' };
let env: Env;
let no = '';
let id = 0;

beforeAll(async () => {
  env = await setupEnv();
  await receive(env, 'partA', 'L2611-004', 100);
});
afterAll(async () => env?.stop());

const auditCount = async (action: string) => Number((await env.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = ${action}`)[0].n);

describe('shipment lifecycle with failed verification, rework gate and re-pack', () => {
  it('creates a Planned shipment and records history + audit', async () => {
    const r = await env.as('shipper1').post('/api/v1/shipments', shipmentBody(env));
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe('Planned');
    expect(r.body.data.shipment_no).toMatch(/^SH-\d{4}$/);
    expect(r.body.data.status_history).toHaveLength(1);
    no = r.body.data.shipment_no;
    id = r.body.data.id;
    expect(await auditCount('SHIPMENT_CREATE')).toBe(1);
  });

  it('rejects actor fields (R-12) and past-dated promise (422)', async () => {
    const bad = await env.as('shipper1').post('/api/v1/shipments', { ...shipmentBody(env), created_by: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('UNKNOWN_FIELD');
    const dates = await env.as('shipper1').post('/api/v1/shipments', shipmentBody(env, { promise_date: '2026-11-01' }));
    expect(dates.status).toBe(422);
    expect(dates.body.error.fields.promise_date).toBeDefined();
  });

  it('marks ready and starts packing (caller becomes packer)', async () => {
    const s1 = env.as('shipper1');
    expect((await s1.post(`/api/v1/shipments/${no}/actions/mark-ready`)).status).toBe(200);
    const r = await s1.post(`/api/v1/shipments/${no}/actions/start-packing`);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('Packing');
    expect(r.body.data.packed_by.id).toBe(env.users.shipper1.id);
  });

  it('refuses the packer as verifier with 403 and writes no verification row (R-1)', async () => {
    const r = await env.as('shipper1').post(`/api/v1/shipments/${no}/actions/verify`, { checklist: PASS });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('VERIFIER_SAME_AS_PACKER');
    expect(Number((await env.sql`SELECT count(*)::int AS n FROM shipment_verification`)[0].n)).toBe(0);
    expect(await auditCount('ACCESS_DENIED')).toBeGreaterThanOrEqual(1);
  });

  it('failed verification by another user moves to Rework and requires note', async () => {
    const s2 = env.as('shipper2');
    const noNote = await s2.post(`/api/v1/shipments/${no}/actions/verify`, { checklist: { ...PASS, labels: 'fail' } });
    expect(noNote.status).toBe(422);
    const incomplete = await s2.post(`/api/v1/shipments/${no}/actions/verify`, { checklist: { part_number: 'pass' } });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error.code).toBe('CHECKLIST_INCOMPLETE');
    const r = await s2.post(`/api/v1/shipments/${no}/actions/verify`, { checklist: { ...PASS, labels: 'fail' }, note: 'Label shows rev A' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('Rework');
    expect(r.body.data.rework_origin).toBe('VERIFICATION_FAILED');
    expect(r.body.data.verification.result).toBe('Fail');
  });

  it('blocks ship and reopen until an error and a completed rework exist (AC-2)', async () => {
    const ship = await env.as('shipper1').post(`/api/v1/shipments/${no}/actions/ship`, { carrier_id: env.ids.carrier, tracking_number: 'SLP123456789012', packages_count: 1, total_weight_lb: 12.5 });
    expect(ship.status).toBe(409);
    expect(ship.body.error.code).toBe('REWORK_GATE_NOT_MET');
    const reopen = await env.as('quality').post(`/api/v1/shipments/${no}/actions/reopen`);
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.details.missing).toEqual(['packaging_error', 'completed_rework']);
  });

  it('logs the error, then a completed rework; reopen is Quality/Supervisor only (UD-4)', async () => {
    const e = await env.as('shipper2').post('/api/v1/packaging-errors', {
      shipment_id: id, detected_by_role: 'Verifier', detected_stage: 'Before ship', category: 'Incorrect label', severity: 'Medium', description: 'Label shows the wrong revision',
    });
    expect(e.status).toBe(201);
    expect(e.body.data.status).toBe('Open');
    const gate = await env.as('quality').post(`/api/v1/shipments/${no}/actions/reopen`);
    expect(gate.body.error.details.missing).toEqual(['completed_rework']);
    const w = await env.as('shipper2').post('/api/v1/rework-events', { packaging_error_id: e.body.data.id, action: 'Relabel', started_at: '2026-11-24T10:00:00Z', completed_at: '2026-11-24T10:30:00Z' });
    expect(w.status).toBe(201);
    expect(w.body.data.status).toBe('Completed');
    const denied = await env.as('shipper2').post(`/api/v1/shipments/${no}/actions/reopen`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');
    const ok = await env.as('quality').post(`/api/v1/shipments/${no}/actions/reopen`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('Packing');
    expect(ok.body.data.packed_by).toBeNull();
  });

  it('needs a re-pack; the re-packer cannot verify but the earlier packer can (US-020)', async () => {
    const noPacker = await env.as('shipper1').post(`/api/v1/shipments/${no}/actions/verify`, { checklist: PASS });
    expect(noPacker.status).toBe(409);
    expect(noPacker.body.error.details.reason).toBe('no_packer');
    const repack = await env.as('shipper2').post(`/api/v1/shipments/${no}/actions/start-packing`);
    expect(repack.status).toBe(200);
    expect(repack.body.data.packed_by.id).toBe(env.users.shipper2.id);
    const self = await env.as('shipper2').post(`/api/v1/shipments/${no}/actions/verify`, { checklist: PASS });
    expect(self.status).toBe(403);
    const ok = await env.as('shipper1').post(`/api/v1/shipments/${no}/actions/verify`, { checklist: PASS });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('Verified');
    expect(ok.body.data.rework_events[0].reverified_ok).toBe(true);
  });

  it('ships: tracking required, stock checked, SHIP ledger rows, lock afterwards (UD-3)', async () => {
    const s1 = env.as('shipper1');
    const noTrack = await s1.post(`/api/v1/shipments/${no}/actions/ship`, { carrier_id: env.ids.carrier, packages_count: 1, total_weight_lb: 12.5 });
    expect(noTrack.status).toBe(422);
    expect(noTrack.body.error.fields.tracking_number).toBeDefined();
    const future = await s1.post(`/api/v1/shipments/${no}/actions/ship`, { ship_date: '2026-12-31', carrier_id: env.ids.carrier, tracking_number: 'SLP1', packages_count: 1, total_weight_lb: 1 });
    expect(future.status).toBe(422);
    const noLoc = await s1.post(`/api/v1/shipments/${no}/actions/ship`, { carrier_id: env.ids.carrier, tracking_number: 'SLP1', packages_count: 1, total_weight_lb: 1 });
    expect(noLoc.status).toBe(422); // lines have no location yet
    const ship = await s1.post(`/api/v1/shipments/${no}/actions/ship`, {
      carrier_id: env.ids.carrier, tracking_number: 'SLP123456789012', packages_count: 1, total_weight_lb: 12.5,
      lines: [{ line_id: (await env.as('shipper1').get(`/api/v1/shipments/${no}`)).body.data.lines[0].id, qty_shipped: 10, lot_number: 'L2611-004', location_id: env.ids.stk }],
    });
    expect(ship.status).toBe(200);
    expect(ship.body.data.status).toBe('Shipped');
    expect(ship.body.data.ship_date).toBe('2026-11-25');
    expect(ship.body.data.ledger).toHaveLength(1);
    const oh = await s1.get(`/api/v1/inventory/on-hand?lot_number=L2611-004`);
    expect(oh.body.data[0].qty_on_hand).toBe(90);
    expect(ship.body.data.on_time_indicator).toBe('On time');
    // locked
    const edit = await s1.patch(`/api/v1/shipments/${no}`, { notes: 'late note' });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('SHIPMENT_LOCKED');
    const again = await s1.post(`/api/v1/shipments/${no}/actions/ship`, { carrier_id: env.ids.carrier, tracking_number: 'X', packages_count: 1, total_weight_lb: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('Supervisor correction is audited old->new; others get 403; ledger fields get 422 (E-53)', async () => {
    const sup = env.as('supervisor');
    const denied = await env.as('shipper1').post(`/api/v1/shipments/${no}/actions/correct`, { reason: 'Fixing the tracking number', tracking_number: 'SLP999' });
    expect(denied.status).toBe(403);
    const forbidden = await sup.post(`/api/v1/shipments/${no}/actions/correct`, { reason: 'Fixing the quantity please', qty_shipped: 5 });
    expect(forbidden.status).toBe(422);
    expect(forbidden.body.error.code).toBe('CORRECTION_FIELD_NOT_ALLOWED');
    const noReason = await sup.post(`/api/v1/shipments/${no}/actions/correct`, { reason: 'short', tracking_number: 'SLP999' });
    expect(noReason.status).toBe(422);
    const nothing = await sup.post(`/api/v1/shipments/${no}/actions/correct`, { reason: 'No actual change here', tracking_number: 'SLP123456789012' });
    expect(nothing.status).toBe(422);
    const ok = await sup.post(`/api/v1/shipments/${no}/actions/correct`, { reason: 'Carrier keyed wrong at dock', tracking_number: 'SLP999999999999', notes: 'corrected' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.tracking_number).toBe('SLP999999999999');
    expect(ok.body.data.corrections).toHaveLength(1);
    expect(ok.body.data.corrections[0].changes.tracking_number).toEqual(['SLP123456789012', 'SLP999999999999']);
    expect(ok.body.data.corrections[0].reason).toBe('Carrier keyed wrong at dock');
    // no extra history/ledger rows
    expect(ok.body.data.status_history.map((h: any) => h.to_status).at(-1)).toBe('Shipped');
    expect(Number((await env.sql`SELECT count(*)::int AS n FROM inventory_transaction WHERE txn_type = 'SHIP'`)[0].n)).toBe(1);
  });
});

describe('ship rules: late reason (UD-1), stock, short shipment, pickup, cancel, hold, edit-after-verify', () => {
  async function toVerified(over: Record<string, unknown> = {}, lot = 'L2611-004') {
    const p = env.as('shipper1');
    const c = await p.post('/api/v1/shipments', shipmentBody(env, { lines: [{ part_id: env.ids.partA, qty_ordered: 5, lot_number: lot }], ...over }));
    expect(c.status).toBe(201);
    const n = c.body.data.shipment_no;
    await p.post(`/api/v1/shipments/${n}/actions/mark-ready`);
    await p.post(`/api/v1/shipments/${n}/actions/start-packing`);
    const v = await env.as('quality').post(`/api/v1/shipments/${n}/actions/verify`, { checklist: PASS });
    expect(v.status).toBe(200);
    return { n, lineId: v.body.data.lines[0].id as number };
  }

  it('requires a late reason whenever ship_date > promise_date, regardless of tolerance', async () => {
    const { n, lineId } = await toVerified({ promise_date: '2026-11-20' });
    const body = { carrier_id: env.ids.carrier, tracking_number: 'SLP1234', packages_count: 1, total_weight_lb: 5, lines: [{ line_id: lineId, qty_shipped: 5, lot_number: 'L2611-004', location_id: env.ids.stk }] };
    const miss = await env.as('shipper1').post(`/api/v1/shipments/${n}/actions/ship`, body);
    expect(miss.status).toBe(422);
    expect(miss.body.error.fields.late_reason_id).toBeDefined();
    const ok = await env.as('shipper1').post(`/api/v1/shipments/${n}/actions/ship`, { ...body, late_reason_id: env.ids.late });
    expect(ok.status).toBe(200);
    expect(ok.body.data.on_time_indicator).toBe('Late');
    expect(ok.body.data.late_reason.label).toBe('Carrier delay');
  });

  it('returns 409 INSUFFICIENT_STOCK and changes nothing; short shipment needs a note; pickup needs no tracking', async () => {
    const { n, lineId } = await toVerified({ lines: [{ part_id: env.ids.partA, qty_ordered: 500, lot_number: 'L2611-004' }] });
    const line = { line_id: lineId, qty_shipped: 500, lot_number: 'L2611-004', location_id: env.ids.stk };
    const base = { carrier_id: env.ids.pickup, packages_count: 1, total_weight_lb: 5 };
    const stock = await env.as('shipper1').post(`/api/v1/shipments/${n}/actions/ship`, { ...base, lines: [line] });
    expect(stock.status).toBe(409);
    expect(stock.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(stock.body.error.details.available).toBe(85);
    const noNote = await env.as('shipper1').post(`/api/v1/shipments/${n}/actions/ship`, { ...base, lines: [{ ...line, qty_shipped: 20 }] });
    expect(noNote.status).toBe(422);
    const short = await env.as('shipper1').post(`/api/v1/shipments/${n}/actions/ship`, { ...base, lines: [{ ...line, qty_shipped: 20, short_note: 'Customer accepted partial' }] });
    expect(short.status).toBe(200);
    expect((await env.as('shipper1').get('/api/v1/inventory/on-hand?lot_number=L2611-004')).body.data[0].qty_on_hand).toBe(65);
  });

  it('cancel: Shipping only early (403, R-5), Supervisor any pre-ship; hold/release (R-6)', async () => {
    const p = env.as('shipper1');
    const c = await p.post('/api/v1/shipments', shipmentBody(env));
    const n = c.body.data.shipment_no;
    await p.post(`/api/v1/shipments/${n}/actions/mark-ready`);
    await p.post(`/api/v1/shipments/${n}/actions/start-packing`);
    const late = await p.post(`/api/v1/shipments/${n}/actions/cancel`, { reason: 'Customer cancelled' });
    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe('FORBIDDEN_CANCEL_AT_STATUS');
    const hold = await p.post(`/api/v1/shipments/${n}/actions/hold`, { hold_reason_id: env.ids.holdReason, hold_owner_dept: 'Quality' });
    expect(hold.status).toBe(200);
    expect(hold.body.data.status).toBe('On Hold');
    expect((await p.post(`/api/v1/shipments/${n}/actions/release`)).status).toBe(403);
    const rel = await env.as('quality').post(`/api/v1/shipments/${n}/actions/release`);
    expect(rel.body.data.status).toBe('Packing');
    const can = await env.as('supervisor').post(`/api/v1/shipments/${n}/actions/cancel`, { reason: 'Customer cancelled the order' });
    expect(can.status).toBe(200);
    expect(can.body.data.status).toBe('Cancelled');
    expect((await env.as('supervisor').patch(`/api/v1/shipments/${n}`, { notes: 'x' })).body.error.code).toBe('SHIPMENT_LOCKED');
  });

  it('editing a Verified shipment moves it to Rework (EDITED_AFTER_VERIFY) without a gate', async () => {
    const { n, lineId } = await toVerified();
    const e = await env.as('shipper2').patch(`/api/v1/shipments/${n}`, { customer_po: 'PO-CHANGED' });
    expect(e.status).toBe(200);
    expect(e.body.data.status).toBe('Rework');
    expect(e.body.data.rework_origin).toBe('EDITED_AFTER_VERIFY');
    void lineId;
    const reopen = await env.as('supervisor').post(`/api/v1/shipments/${n}/actions/reopen`);
    expect(reopen.status).toBe(200);
  });
});
