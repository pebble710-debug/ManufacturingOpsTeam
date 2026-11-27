import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receive, setupEnv, shipmentBody, type Env } from './helpers';

const PASS = { part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'pass', packing_slip: 'pass', coc: 'pass', packaging_method: 'pass' };
let env: Env;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => env?.stop());

const onHand = async (lot: string, loc?: string) => {
  const r = await env.as('viewer').get(`/api/v1/inventory/on-hand?lot_number=${lot}${loc ? `&location_id=${env.ids[loc]}` : ''}`);
  return r.body.data.reduce((a: number, x: any) => a + x.qty_on_hand, 0) as number;
};

async function shipOne(lot: string, qty: number, customer = env.ids.cust, po = 'PO-S') {
  const s1 = env.as('shipper1');
  const c = await s1.post('/api/v1/shipments', shipmentBody(env, { customer_id: customer, customer_po: po, lines: [{ part_id: env.ids.partA, qty_ordered: qty, lot_number: lot }] }));
  const n = c.body.data.shipment_no;
  await s1.post(`/api/v1/shipments/${n}/actions/mark-ready`);
  await s1.post(`/api/v1/shipments/${n}/actions/start-packing`);
  const v = await env.as('quality').post(`/api/v1/shipments/${n}/actions/verify`, { checklist: PASS });
  const ship = await s1.post(`/api/v1/shipments/${n}/actions/ship`, {
    carrier_id: env.ids.carrier, tracking_number: 'SLP1112223334', packages_count: 1, total_weight_lb: 3,
    lines: [{ line_id: v.body.data.lines[0].id, qty_shipped: qty, lot_number: lot, location_id: env.ids.stk }],
  });
  expect(ship.status).toBe(200);
  return { n, id: c.body.data.id as number };
}

describe('receipts, ledger and R-7 stock moves', () => {
  it('receipt: Accepted posts RECEIPT; On Hold goes to the Hold location; Rejected posts nothing; Shipping gets 403', async () => {
    await receive(env, 'partA', 'L2611-004', 100);
    expect(await onHand('L2611-004')).toBe(100);
    const hold = await env.as('receiver').post('/api/v1/receipts', { supplier_id: env.ids.sup, supplier_po: 'PO-2', part_id: env.ids.partA, qty_received: 20, lot_number: 'l2611-005', inspection_status: 'On Hold' });
    expect(hold.status).toBe(201);
    expect(hold.body.data.location.type).toBe('Hold');
    expect(hold.body.data.lot_number).toBe('L2611-005');
    const rej = await env.as('receiver').post('/api/v1/receipts', { supplier_id: env.ids.sup, supplier_po: 'PO-3', part_id: env.ids.partA, qty_received: 7, lot_number: 'L2611-006', inspection_status: 'Rejected' });
    expect(rej.status).toBe(201);
    expect(rej.body.data.transaction_id).toBeNull();
    expect(await onHand('L2611-006')).toBe(0);
    expect((await env.as('shipper1').post('/api/v1/receipts', { supplier_id: env.ids.sup, supplier_po: 'P', part_id: env.ids.partA, qty_received: 1, lot_number: 'L2611-009', inspection_status: 'Accepted', location_id: env.ids.stk })).status).toBe(403);
    const mismatch = await env.as('receiver').post('/api/v1/receipts', { supplier_id: env.ids.sup, supplier_po: 'P', part_id: env.ids.partB, qty_received: 1, lot_number: 'L2611-004', inspection_status: 'Accepted', location_id: env.ids.stk });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('LOT_PART_MISMATCH');
    const zero = await env.as('receiver').post('/api/v1/receipts', { supplier_id: env.ids.sup, supplier_po: 'P', part_id: env.ids.partA, qty_received: 0, lot_number: 'L2611-009', inspection_status: 'Accepted', location_id: env.ids.stk });
    expect(zero.status).toBe(422);
  });

  it('ledger is append-only through the API and via DB triggers', async () => {
    expect((await env.as('supervisor').patch('/api/v1/inventory-transactions/1')).status).toBe(404);
    expect((await env.as('supervisor').call('DELETE', '/api/v1/inventory-transactions')).status).toBe(405);
    await expect(env.sql`UPDATE inventory_transaction SET qty_change = 5 WHERE id = (SELECT min(id) FROM inventory_transaction)`).rejects.toThrow(/append-only/);
  });

  it('transfer posts two legs; R-7: Receiving cannot release from Hold, Quality can; Quality cannot do production complete', async () => {
    const t = await env.as('receiver').post('/api/v1/inventory-transactions', { txn_type: 'TRANSFER', part_id: env.ids.partA, lot_number: 'L2611-004', from_location_id: env.ids.stk, to_location_id: env.ids.fg, qty: 10 });
    expect(t.status).toBe(201);
    expect(t.body.data.transactions).toHaveLength(2);
    expect(t.body.data.transactions[0].transfer_group).toBe(t.body.data.transactions[1].transfer_group);
    expect(await onHand('L2611-004', 'stk')).toBe(90);
    expect(await onHand('L2611-004', 'fg')).toBe(10);
    const move = { txn_type: 'TRANSFER', part_id: env.ids.partA, lot_number: 'L2611-005', from_location_id: env.ids.hold, to_location_id: env.ids.stk, qty: 20 };
    const denied = await env.as('receiver').post('/api/v1/inventory-transactions', move);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_HOLD_RELEASE');
    expect(await onHand('L2611-005', 'hold')).toBe(20);
    const q = await env.as('quality').post('/api/v1/inventory-transactions', move);
    expect(q.status).toBe(201);
    expect(await onHand('L2611-005', 'stk')).toBe(20);
    const nonHold = await env.as('quality').post('/api/v1/inventory-transactions', { txn_type: 'PRODUCTION_COMPLETE', part_id: env.ids.partA, lot_number: 'L2612-001', location_id: env.ids.fg, qty: 5 });
    expect(nonHold.status).toBe(403);
    expect(nonHold.body.error.code).toBe('FORBIDDEN_NON_HOLD_TXN');
    expect((await env.as('shipper1').post('/api/v1/inventory-transactions', move)).status).toBe(403);
    const prod = await env.as('receiver').post('/api/v1/inventory-transactions', { txn_type: 'PRODUCTION_COMPLETE', part_id: env.ids.partA, lot_number: 'L2612-001', location_id: env.ids.fg, qty: 5 });
    expect(prod.status).toBe(201);
  });

  it('insufficient stock is 409 and posts nothing; scrap needs a scrap reason; ADJUST by hand is 422', async () => {
    const before = await onHand('L2611-004');
    const over = await env.as('supervisor').post('/api/v1/inventory-transactions', { txn_type: 'TRANSFER', part_id: env.ids.partA, lot_number: 'L2611-004', from_location_id: env.ids.stk, to_location_id: env.ids.fg, qty: 5000 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(over.body.error.details.available).toBe(90);
    expect(await onHand('L2611-004')).toBe(before);
    const badReason = await env.as('supervisor').post('/api/v1/inventory-transactions', { txn_type: 'SCRAP', part_id: env.ids.partA, lot_number: 'L2611-004', location_id: env.ids.stk, qty: 1, reason_code_id: env.ids.late });
    expect(badReason.status).toBe(422);
    const scrap = await env.as('supervisor').post('/api/v1/inventory-transactions', { txn_type: 'SCRAP', part_id: env.ids.partA, lot_number: 'L2611-004', location_id: env.ids.stk, qty: 2, reason_code_id: env.ids.scrap });
    expect(scrap.status).toBe(201);
    const adj = await env.as('supervisor').post('/api/v1/inventory-transactions', { txn_type: 'ADJUST', part_id: env.ids.partA, lot_number: 'L2611-004', location_id: env.ids.stk, qty: 2 });
    expect(adj.status).toBe(422);
  });

  it('lot trace is 200 with found:false for unknown lots and lists receipt, movements and shipments', async () => {
    const none = await env.as('viewer').get('/api/v1/lot-trace/L9999-999');
    expect(none.status).toBe(200);
    expect(none.body.data.found).toBe(false);
    expect((await env.as('viewer').get('/api/v1/lot-trace/x')).status).toBe(422);
    const s = await shipOne('L2611-004', 4);
    const t = await env.as('viewer').get('/api/v1/lot-trace/l2611-004');
    expect(t.body.data.backward[0].receipt_no).toMatch(/^RC-/);
    expect(t.body.data.forward.map((f: any) => f.shipment_no)).toContain(s.n);
    expect(t.body.data.summary.shipped_total).toBe(4);
    expect(t.body.data.summary.on_hand_total).toBe(await onHand('L2611-004'));
  });
});

describe('cycle counts: blind count, recount, approval -> ADJUST (R-3, R-4, UD-2)', () => {
  let countNo = '';
  let lineIds: number[] = [];
  it('Supervisor creates; others 403; Open count hides system quantity from every role', async () => {
    expect((await env.as('receiver').post('/api/v1/cycle-counts', { abc_class: 'A' })).status).toBe(403);
    expect((await env.as('supervisor').post('/api/v1/cycle-counts', {})).status).toBe(422);
    const c = await env.as('supervisor').post('/api/v1/cycle-counts', { abc_class: 'A' });
    expect(c.status).toBe(201);
    countNo = c.body.data.count_no;
    const d = await env.as('supervisor').get(`/api/v1/cycle-counts/${countNo}`);
    lineIds = d.body.data.lines.map((l: any) => l.id);
    expect(d.body.data.lines.length).toBeGreaterThan(0);
    for (const role of ['supervisor', 'admin', 'receiver']) {
      const x = await env.as(role).get(`/api/v1/cycle-counts/${countNo}`);
      expect(JSON.stringify(x.body)).not.toContain('system_qty');
    }
  });
  it('first count is kept; out-of-tolerance needs a recount before submit', async () => {
    const rc = env.as('receiver');
    const sysQtyRow = (await env.sql`SELECT id::int AS id, system_qty FROM cycle_count_line WHERE cycle_count_id = (SELECT id FROM cycle_count WHERE count_no = ${countNo}) ORDER BY id`) as any[];
    lineIds = sysQtyRow.map((r) => r.id);
    const entries = sysQtyRow.map((r, i) => ({ line_id: r.id, counted_qty: i === 0 ? r.system_qty - 4 : r.system_qty }));
    expect((await env.as('shipper1').post(`/api/v1/cycle-counts/${countNo}/entries`, { entries })).status).toBe(403);
    expect((await rc.post(`/api/v1/cycle-counts/${countNo}/entries`, { entries: [{ line_id: lineIds[0], counted_qty: -1 }] })).status).toBe(422);
    const ok = await rc.post(`/api/v1/cycle-counts/${countNo}/entries`, { entries });
    expect(ok.status).toBe(200);
    expect(ok.body.data.lines[0].recount_required).toBe(true);
    expect(JSON.stringify(ok.body)).not.toContain('system_qty');
    expect((await rc.post(`/api/v1/cycle-counts/${countNo}/entries`, { entries: [{ line_id: lineIds[0], counted_qty: 1 }] })).body.error.code).toBe('ALREADY_COUNTED');
    const early = await rc.post(`/api/v1/cycle-counts/${countNo}/actions/submit`);
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('COUNT_INCOMPLETE');
    expect(early.body.error.details.line_ids).toEqual([lineIds[0]]);
    const first = sysQtyRow[0];
    expect((await rc.post(`/api/v1/cycle-counts/${countNo}/entries`, { entries: [{ line_id: lineIds[0], recount_qty: first.system_qty - 4 }] })).status).toBe(200);
    expect((await rc.post(`/api/v1/cycle-counts/${countNo}/actions/submit`)).status).toBe(200);
    expect((await rc.post(`/api/v1/cycle-counts/${countNo}/entries`, { entries: [{ line_id: lineIds[0], recount_qty: 1 }] })).body.error.code).toBe('INVALID_COUNT_STATE');
  });
  it('Counted count: Supervisor sees variance, Quality does not; only a Supervisor can approve; reason required', async () => {
    const sup = await env.as('supervisor').get(`/api/v1/cycle-counts/${countNo}`);
    const l0 = sup.body.data.lines.find((l: any) => l.id === lineIds[0]);
    expect(l0.system_qty).toBeGreaterThan(0);
    expect(l0.variance).toBe(-4);
    expect(sup.body.data.can_approve).toBe(true);
    expect(JSON.stringify((await env.as('quality').get(`/api/v1/cycle-counts/${countNo}`)).body)).not.toContain('system_qty');
    for (const role of ['shipper1', 'receiver', 'quality', 'admin', 'viewer']) expect((await env.as(role).post(`/api/v1/cycle-counts/${countNo}/actions/approve`, {})).status).toBe(403);
    const noReason = await env.as('supervisor').post(`/api/v1/cycle-counts/${countNo}/actions/approve`, {});
    expect(noReason.status).toBe(422);
  });
  it('approval posts one ADJUST per variance line, once (AC-5)', async () => {
    const before = await onHand('L2611-004', 'stk');
    const ok = await env.as('supervisor').post(`/api/v1/cycle-counts/${countNo}/actions/approve`, { reason_code_id: env.ids.adjust });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('Approved');
    expect(ok.body.data.adjustments).toHaveLength(1);
    expect(ok.body.data.adjustments[0].qty_change).toBe(-4);
    expect(await onHand('L2611-004', 'stk')).toBe(before - 4);
    const again = await env.as('supervisor').post(`/api/v1/cycle-counts/${countNo}/actions/approve`, { reason_code_id: env.ids.adjust });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPROVED');
    expect(await onHand('L2611-004', 'stk')).toBe(before - 4);
    expect(Number((await env.sql`SELECT count(*)::int AS n FROM inventory_transaction WHERE txn_type = 'ADJUST'`)[0].n)).toBe(1);
  });
  it('approver is not the counter (403 APPROVER_SAME_AS_COUNTER) nor the submitter (APPROVER_SAME_AS_SUBMITTER)', async () => {
    const mk = async () => (await env.as('supervisor').post('/api/v1/cycle-counts', { abc_class: 'A' })).body.data.count_no as string;
    const rowsOf = async (no: string) => (await env.sql`SELECT id::int AS id, system_qty FROM cycle_count_line WHERE cycle_count_id = (SELECT id FROM cycle_count WHERE count_no = ${no})`) as any[];
    const a = await mk();
    const sup = env.as('supervisor');
    await sup.post(`/api/v1/cycle-counts/${a}/entries`, { entries: (await rowsOf(a)).map((r) => ({ line_id: r.id, counted_qty: r.system_qty })) });
    await sup.post(`/api/v1/cycle-counts/${a}/actions/submit`);
    const denied = await sup.post(`/api/v1/cycle-counts/${a}/actions/approve`, {});
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('APPROVER_SAME_AS_COUNTER');
    const b = await mk();
    await env.as('receiver').post(`/api/v1/cycle-counts/${b}/entries`, { entries: (await rowsOf(b)).map((r) => ({ line_id: r.id, counted_qty: r.system_qty })) });
    await sup.post(`/api/v1/cycle-counts/${b}/actions/submit`);
    const sub = await sup.post(`/api/v1/cycle-counts/${b}/actions/approve`, {});
    expect(sub.status).toBe(403);
    expect(sub.body.error.code).toBe('APPROVER_SAME_AS_SUBMITTER');
    expect((await sup.get(`/api/v1/cycle-counts/${b}`)).body.data.can_approve).toBe(false);
    expect(Number((await env.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'ACCESS_DENIED' AND changes->>'code' LIKE 'APPROVER_SAME_AS_%'`)[0].n)).toBe(2);
  });
});

describe('packaging errors, rework, corrective actions (R-8, UD-4, UD-9)', () => {
  let shipped: { n: string; id: number };
  let errNo = '';
  it('Shipping cannot log after-ship errors (403); Quality can, with packaging_related=false needing a reason', async () => {
    shipped = await shipOne('L2611-004', 2, env.ids.cust, 'PO-Q');
    const body = { shipment_id: shipped.id, detected_by_role: 'Customer', detected_stage: 'After ship', category: 'Wrong part', severity: 'High', description: 'Customer received rev A' };
    const denied = await env.as('shipper1').post('/api/v1/packaging-errors', body);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_AFTER_SHIP_ERROR');
    const beforeOnShipped = await env.as('quality').post('/api/v1/packaging-errors', { ...body, detected_by_role: 'Verifier', detected_stage: 'Before ship' });
    expect(beforeOnShipped.status).toBe(409);
    expect(beforeOnShipped.body.error.code).toBe('STAGE_STATUS_MISMATCH');
    const noReason = await env.as('quality').post('/api/v1/packaging-errors', { ...body, packaging_related: false });
    expect(noReason.status).toBe(422);
    const ok = await env.as('quality').post('/api/v1/packaging-errors', body);
    expect(ok.status).toBe(201);
    errNo = ok.body.data.error_no;
    expect(ok.body.data.packaging_related).toBe(true);
    expect((await env.as('viewer').get(`/api/v1/shipments/${shipped.n}`)).body.data.status).toBe('Shipped');
    const paper = await env.as('quality').post('/api/v1/packaging-errors', { ...body, category: 'Paperwork' });
    expect(paper.body.error.fields.paperwork_subtype).toBeDefined();
  });
  it('contain is Quality/Supervisor only; close needs a root cause; closed errors are read-only', async () => {
    expect((await env.as('shipper1').post(`/api/v1/packaging-errors/${errNo}/actions/contain`, {})).status).toBe(403);
    expect((await env.as('shipper1').patch(`/api/v1/packaging-errors/${errNo}`, { root_cause_category: 'Method' })).status).toBe(403);
    expect((await env.as('quality').post(`/api/v1/packaging-errors/${errNo}/actions/contain`, {})).body.data.status).toBe('Contained');
    expect((await env.as('quality').post(`/api/v1/packaging-errors/${errNo}/actions/contain`, {})).status).toBe(409);
    const noCause = await env.as('quality').post(`/api/v1/packaging-errors/${errNo}/actions/close`, {});
    expect(noCause.status).toBe(409);
    expect(noCause.body.error.code).toBe('CLOSE_PRECONDITION_FAILED');
    expect(noCause.body.error.details.missing).toEqual(['root_cause']);
    const ca = await env.as('quality').post('/api/v1/corrective-actions', { error_no: errNo, action_description: 'Add rev check to the pack station', owner_id: env.users.supervisor.id, due_date: '2026-12-15' });
    expect(ca.status).toBe(201);
    expect((await env.as('shipper1').post('/api/v1/corrective-actions', { packaging_error_id: 1, action_description: 'x', owner_id: 1, due_date: '2026-12-15' })).status).toBe(403);
    expect((await env.as('quality').patch(`/api/v1/corrective-actions/${ca.body.data.id}`, { status: 'In Progress' })).body.data.status).toBe('In Progress');
    expect((await env.as('quality').patch(`/api/v1/corrective-actions/${ca.body.data.id}`, { status: 'Open' })).status).toBe(422);
    await env.as('quality').patch(`/api/v1/packaging-errors/${errNo}`, { root_cause_category: 'Method', root_cause_note: 'Why 1..5' });
    const closed = await env.as('quality').post(`/api/v1/packaging-errors/${errNo}/actions/close`, {});
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('Closed');
    expect((await env.as('quality').patch(`/api/v1/packaging-errors/${errNo}`, { root_cause_note: 'again' })).body.error.code).toBe('ERROR_CLOSED');
    const done = await env.as('quality').patch(`/api/v1/corrective-actions/${ca.body.data.id}`, { status: 'Closed' });
    expect(done.status).toBe(200); // a closed ERROR does not freeze its corrective actions
    expect((await env.as('quality').patch(`/api/v1/corrective-actions/${ca.body.data.id}`, { action_description: 'late edit' })).body.error.code).toBe('ACTION_CLOSED');
  });
});

describe('lookups, settings, reports, audit log', () => {
  it('lookups: Admin/Supervisor manage; duplicate 409; part rules 422; inactive refs 422; identity locked once used', async () => {
    expect((await env.as('shipper1').post('/api/v1/lookups/parts', {})).status).toBe(403);
    expect((await env.as('viewer').get('/api/v1/lookups/parts')).body.data.length).toBe(2);
    expect((await env.as('viewer').get('/api/v1/lookups/users')).body.data[0]).not.toHaveProperty('username');
    const bad = await env.as('admin').post('/api/v1/lookups/parts', { part_number: 'crc-5000-c', revision: 'B', abc_class: 'A' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.part_number).toBeDefined();
    const part = await env.as('admin').post('/api/v1/lookups/parts', { part_number: 'crc-5000-c', revision: 'c', abc_class: 'B', description: 'Plate' });
    expect(part.status).toBe(201);
    expect(part.body.data.part_number).toBe('CRC-5000-C');
    const dup = await env.as('supervisor').post('/api/v1/lookups/parts', { part_number: 'CRC-5000-C', revision: 'C', abc_class: 'B' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
    expect((await env.as('admin').patch(`/api/v1/lookups/parts/${part.body.data.id}`, { part_number: 'CRC-5001-C' })).status).toBe(200); // unreferenced: identity may change
    expect((await env.as('admin').patch(`/api/v1/lookups/parts/${env.ids.partA}`, { revision: 'Z', part_number: 'CRC-2041-Z' })).body.error.code).toBe('LOOKUP_IN_USE');
    const off = await env.as('admin').patch(`/api/v1/lookups/parts/${part.body.data.id}`, { active: false });
    expect(off.body.data.active).toBe(false);
    const ship = await env.as('shipper1').post('/api/v1/shipments', shipmentBody(env, { lines: [{ part_id: part.body.data.id, qty_ordered: 1 }] }));
    expect(ship.status).toBe(422);
    expect(ship.body.error.code).toBe('INACTIVE_REFERENCE');
    expect((await env.as('viewer').get('/api/v1/lookups/parts')).body.data.some((p: any) => p.id === part.body.data.id)).toBe(false);
    expect((await env.as('viewer').get('/api/v1/lookups/parts?active=all')).body.data.some((p: any) => p.id === part.body.data.id)).toBe(true);
  });

  it('settings: targets validated and audited old->new; reporting date is Admin-only', async () => {
    const ok = await env.as('supervisor').patch('/api/v1/settings/targets', { target_on_time_pct: 90, on_time_basis: 'requested' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.targets.on_time_pct).toBe(90);
    expect(ok.body.data.on_time_basis).toBe('requested');
    expect((await env.as('supervisor').patch('/api/v1/settings/targets', { target_on_time_pct: 101 })).status).toBe(422);
    expect((await env.as('supervisor').patch('/api/v1/settings/targets', { nonsense: 1 })).status).toBe(422);
    expect((await env.as('supervisor').patch('/api/v1/settings/targets', { target_on_time_pct: 'x' })).status).toBe(422);
    expect((await env.as('shipper1').patch('/api/v1/settings/targets', { target_on_time_pct: 80 })).status).toBe(403);
    await env.as('supervisor').patch('/api/v1/settings/targets', { target_on_time_pct: 95, on_time_basis: 'promise' });
    const a = await env.sql`SELECT changes FROM audit_log WHERE action = 'SETTINGS_TARGETS_UPDATE' ORDER BY id LIMIT 1`;
    expect(a[0].changes.target_on_time_pct).toEqual(['95', '90']);
    expect((await env.as('supervisor').patch('/api/v1/settings/reporting', { mode: 'live' })).status).toBe(403);
    expect((await env.as('admin').patch('/api/v1/settings/reporting', { mode: 'fixed' })).status).toBe(422);
    expect((await env.as('admin').patch('/api/v1/settings/reporting', { mode: 'fixed', reporting_date: '2026-02-30' })).status).toBe(422);
    const set = await env.as('admin').patch('/api/v1/settings/reporting', { mode: 'fixed', reporting_date: '2026-11-26' });
    expect(set.body.data.reporting.label).toBe('Reporting date: 26 Nov 2026 (fixed demo date)');
    await env.as('admin').patch('/api/v1/settings/reporting', { mode: 'fixed', reporting_date: '2026-11-25' });
    expect((await env.as('viewer').get('/api/v1/settings')).body.data.reporting.business_today).toBe('2026-11-25');
  });

  it('reports R1/R3/R4/R7: JSON totals equal rows; CSV guards formula injection; unknown id 404', async () => {
    const evil = await env.as('supervisor').post('/api/v1/lookups/customers', { code: 'EVIL', name: '=HYPERLINK("http://x.example","a")' });
    expect(evil.status).toBe(201);
    await shipOne('L2611-005', 1, evil.body.data.id, 'PO-CSV');
    const r1 = await env.as('viewer').get('/api/v1/reports/R1');
    expect(r1.status).toBe(200);
    expect(r1.body.totals.row_count).toBe(r1.body.total);
    expect(r1.body.columns.map((c: any) => c.key)).toContain('on_time');
    const csv = await env.as('viewer').get('/api/v1/reports/R1?format=csv');
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toMatch(/^attachment; filename="R1-shipment-log_2026-11-25\.csv"$/);
    expect(csv.text.split('\r\n')[0]).toBe('Shipment,Customer,Customer PO,Promise date,Ship date,Carrier,Tracking number,Status,On time,Days late');
    expect(csv.text).toContain(`"'=HYPERLINK(""http://x.example"",""a"")"`);
    const r3 = await env.as('viewer').get('/api/v1/reports/R3');
    expect(r3.body.totals.error_count).toBe(r3.body.total);
    const r4 = await env.as('viewer').get('/api/v1/reports/R4');
    expect(r4.body.totals.row_count).toBe(r4.body.total);
    expect((await env.as('viewer').get('/api/v1/reports/R7')).status).toBe(422);
    const r7 = await env.as('viewer').get('/api/v1/reports/R7?lot_number=L2611-004&format=csv');
    expect(r7.status).toBe(200);
    expect(r7.text.split('\r\n')[0]).toBe('Section,Date,Document,Party,Part number,Location,Transaction,Quantity,Carrier,Tracking number');
    expect((await env.as('viewer').get('/api/v1/reports/R2')).status).toBe(404);
    expect((await env.as('viewer').get('/api/v1/reports/R1?format=xml')).status).toBe(422);
    expect((await env.as('viewer').get('/api/v1/reports/R1?bogus=1')).status).toBe(422);
    const empty = await env.as('viewer').get('/api/v1/reports/R7?lot_number=L0000-000&format=csv');
    expect(empty.text.split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('audit log: Admin only, filterable by business key, append-only', async () => {
    expect((await env.as('supervisor').get('/api/v1/admin/audit-log')).status).toBe(403);
    expect((await env.as('viewer').get('/api/v1/admin/audit-log')).status).toBe(403);
    const all = await env.as('admin').get('/api/v1/admin/audit-log?page_size=5');
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(5);
    expect(all.body.total).toBeGreaterThan(20);
    const n = (await env.sql`SELECT shipment_no FROM shipment ORDER BY id LIMIT 1`)[0].shipment_no;
    const one = await env.as('admin').get(`/api/v1/admin/audit-log?record_id=${n}`);
    expect(one.body.data.length).toBeGreaterThan(0);
    expect(one.body.data.every((r: any) => r.table_name === 'shipment')).toBe(true);
    const denied = await env.as('admin').get('/api/v1/admin/audit-log?action=ACCESS_DENIED');
    expect(denied.body.data[0].changes).toHaveProperty('code');
    expect(JSON.stringify(all.body)).not.toMatch(/password|csrf_token|token_hash/i);
    await expect(env.sql`DELETE FROM audit_log`).rejects.toThrow(/append-only/);
  });

  it('shipment list filters, paging and sorting are allow-listed', async () => {
    const r = await env.as('viewer').get('/api/v1/shipments?status=Shipped&page_size=2&sort=-shipment_no');
    expect(r.body.data.length).toBeLessThanOrEqual(2);
    expect(r.body.page_size).toBe(2);
    expect(r.body.total).toBeGreaterThan(0);
    expect((await env.as('viewer').get('/api/v1/shipments?sort=password')).status).toBe(422);
    expect((await env.as('viewer').get('/api/v1/shipments?page_size=500')).status).toBe(422);
    expect((await env.as('viewer').get("/api/v1/shipments?q=%27%3B+DROP+TABLE+shipment%3B--")).status).toBe(200);
    expect((await env.as('viewer').get('/api/v1/shipments?status=Bogus')).status).toBe(422);
  });
});
