// Receipts, append-only inventory transactions, on-hand and lot trace (contract section 7; docs/03).
import { randomUUID } from 'node:crypto';
import type { Sql } from '../db';
import { audit } from '../audit';
import { getBusinessClock } from '../clock';
import { HttpError, IdentityDenied, conflict, notFound, validation } from '../http/errors';
import { decideMove } from './rules';
import { ensureLot, inTx, inactive, lockStock, onHandQty, parseRef, requireLot, type Actor } from './common';
import type { CreateReceiptInput, InventoryTxnInput } from '../validation/inventory';

type Row = Record<string, any>;
const FIVE_MIN = 5 * 60 * 1000;

// ----------------------------------------------------------------------------- receipts
const RC_COLS = (q: Sql) => q`
  r.id::int AS id, r.receipt_no, s.id::int AS supplier_id, s.code AS supplier_code, s.name AS supplier_name, r.supplier_po,
  p.id::int AS part_id, p.part_number, p.revision, r.qty_received, r.lot_number, r.arrived_at, loc.id::int AS location_id, loc.code AS location_code,
  loc.type AS location_type, r.inspection_status, u.id::int AS user_id, u.display_name, r.created_at,
  (SELECT t.id::int FROM inventory_transaction t WHERE t.receipt_id = r.id LIMIT 1) AS transaction_id`;
const FROM_RC = (q: Sql) => q`FROM receipt r JOIN supplier s ON s.id = r.supplier_id JOIN part p ON p.id = r.part_id LEFT JOIN location loc ON loc.id = r.location_id JOIN app_user u ON u.id = r.received_by`;
const shapeReceipt = (r: Row) => ({
  id: r.id, receipt_no: r.receipt_no, supplier: { id: r.supplier_id, code: r.supplier_code, name: r.supplier_name }, supplier_po: r.supplier_po,
  part: { id: r.part_id, part_number: r.part_number, revision: r.revision }, qty_received: r.qty_received, lot_number: r.lot_number, arrived_at: r.arrived_at,
  putaway_at: null, location: r.location_id ? { id: r.location_id, code: r.location_code, type: r.location_type } : null,
  inspection_status: r.inspection_status, received_by: { id: r.user_id, display_name: r.display_name }, transaction_id: r.transaction_id ?? null, created_at: r.created_at,
});

export async function getReceipt(q: Sql, ref: string) {
  const p = parseRef(ref, 'RC');
  const rows = await ('id' in p
    ? q<Row[]>`SELECT ${RC_COLS(q)} ${FROM_RC(q)} WHERE r.id = ${p.id}`
    : q<Row[]>`SELECT ${RC_COLS(q)} ${FROM_RC(q)} WHERE r.receipt_no = ${p.no}`);
  if (!rows[0]) throw notFound();
  return shapeReceipt(rows[0]);
}

export async function listReceipts(q: Sql, f: { supplier_id?: number; part_id?: number; lot_number?: string; inspection_status?: string; from?: string; to?: string; sortCol: string; desc: boolean; limit: number; offset: number }) {
  const where = q`WHERE true ${f.supplier_id ? q`AND r.supplier_id = ${f.supplier_id}` : q``} ${f.part_id ? q`AND r.part_id = ${f.part_id}` : q``}
    ${f.lot_number ? q`AND r.lot_number = ${f.lot_number}` : q``} ${f.inspection_status ? q`AND r.inspection_status = ${f.inspection_status}` : q``}
    ${f.from ? q`AND (r.arrived_at AT TIME ZONE 'UTC')::date >= ${f.from}::date` : q``} ${f.to ? q`AND (r.arrived_at AT TIME ZONE 'UTC')::date <= ${f.to}::date` : q``}`;
  const rows = await q<Row[]>`SELECT ${RC_COLS(q)} ${FROM_RC(q)} ${where} ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, r.id ASC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt r ${where}`;
  return { data: rows.map(shapeReceipt), total: t?.n ?? 0 };
}

export async function createReceipt(sql: Sql, user: Actor, input: CreateReceiptInput) {
  const id = await inTx(sql, async (tx) => {
    const clock = await getBusinessClock(tx);
    const [sup] = await tx<Row[]>`SELECT id, active FROM supplier WHERE id = ${input.supplier_id}`;
    if (!sup || !sup.active) throw inactive('supplier_id', 'The supplier');
    const [part] = await tx<Row[]>`SELECT id, active FROM part WHERE id = ${input.part_id}`;
    if (!part || !part.active) throw inactive('part_id', 'The part');
    const arrived = input.arrived_at ?? clock.now;
    if (arrived.getTime() > clock.now.getTime() + FIVE_MIN) throw validation({ arrived_at: 'cannot be in the future' });
    let locId: number | null = input.location_id ?? null;
    if (input.inspection_status === 'Rejected') {
      if (locId) throw validation({ location_id: 'must be empty for a rejected receipt' });
    } else if (input.inspection_status === 'Accepted') {
      if (!locId) throw validation({ location_id: 'is required' });
    } else if (!locId) {
      const holds = await tx<Row[]>`SELECT id::int AS id FROM location WHERE type = 'Hold' AND active`;
      if (holds.length !== 1) throw validation({ location_id: holds.length ? 'choose one of the hold locations' : 'no active hold location exists' });
      locId = holds[0].id;
    }
    if (locId) {
      const [loc] = await tx<Row[]>`SELECT id, type, active FROM location WHERE id = ${locId}`;
      if (!loc || !loc.active) throw inactive('location_id', 'The location');
      const okTypes = input.inspection_status === 'On Hold' ? ['Hold'] : ['Stock', 'Receiving', 'FG'];
      if (!okTypes.includes(loc.type)) throw validation({ location_id: `must be a ${okTypes.join(', ')} location` });
    }
    await ensureLot(tx, input.part_id, input.lot_number);
    const [r] = await tx<Row[]>`
      INSERT INTO receipt (supplier_id, supplier_po, part_id, qty_received, lot_number, arrived_at, location_id, inspection_status, received_by)
      VALUES (${input.supplier_id}, ${input.supplier_po}, ${input.part_id}, ${input.qty_received}, ${input.lot_number}, ${arrived}, ${locId}, ${input.inspection_status}, ${user.id})
      RETURNING id::int AS id, receipt_no`;
    let txnId: number | null = null;
    if (locId) {
      await lockStock(tx, [{ part_id: input.part_id, location_id: locId, lot_number: input.lot_number }]);
      const [t] = await tx<Row[]>`INSERT INTO inventory_transaction (txn_type, part_id, location_id, lot_number, qty_change, receipt_id, created_by)
                                  VALUES ('RECEIPT', ${input.part_id}, ${locId}, ${input.lot_number}, ${input.qty_received}, ${r.id}, ${user.id}) RETURNING id::int AS id`;
      txnId = t.id;
    }
    await audit(tx, { userId: user.id, action: 'RECEIPT_CREATE', table: 'receipt', recordId: r.id, changes: { receipt_no: r.receipt_no, part_id: input.part_id, qty_received: input.qty_received, lot_number: input.lot_number, inspection_status: input.inspection_status, ledger_txn_ids: txnId ? [txnId] : [] } });
    return r.id as number;
  });
  return getReceipt(sql, String(id));
}

// ----------------------------------------------------------------------------- ledger
const TXN_COLS = (q: Sql) => q`
  t.id::int AS id, t.txn_type, p.id::int AS part_id, p.part_number, p.revision, l.id::int AS location_id, l.code AS location_code, l.type AS location_type,
  t.lot_number, t.qty_change, rc.id::int AS reason_id, rc.label AS reason_label, t.reference_type, t.reference_id::int AS reference_id,
  t.txn_group::text AS transfer_group, t.note, t.txn_at, t.created_by::int AS created_by`;
const FROM_TXN = (q: Sql) => q`FROM v_inventory_transaction t JOIN part p ON p.id = t.part_id JOIN location l ON l.id = t.location_id LEFT JOIN reason_code rc ON rc.id = t.reason_code_id`;
const shapeTxn = (r: Row) => ({
  id: r.id, txn_type: r.txn_type, part: { id: r.part_id, part_number: r.part_number, revision: r.revision }, location: { id: r.location_id, code: r.location_code, type: r.location_type },
  lot_number: r.lot_number, qty_change: r.qty_change, reason_code: r.reason_id ? { id: r.reason_id, label: r.reason_label } : null, reference_type: r.reference_type,
  reference_id: r.reference_id ?? null, transfer_group: r.transfer_group ?? null, note: r.note ?? null, txn_at: r.txn_at, created_by: r.created_by,
});

export async function listTransactions(q: Sql, f: { part_id?: number; lot_number?: string; txn_type?: string[]; location_id?: number; reference_type?: string; reference_id?: number; from?: string; to?: string; desc: boolean; sortCol: string; limit: number; offset: number }) {
  const where = q`WHERE true ${f.part_id ? q`AND t.part_id = ${f.part_id}` : q``} ${f.lot_number ? q`AND t.lot_number = ${f.lot_number}` : q``}
    ${f.txn_type ? q`AND t.txn_type IN ${q(f.txn_type)}` : q``} ${f.location_id ? q`AND t.location_id = ${f.location_id}` : q``}
    ${f.reference_type ? q`AND t.reference_type = ${f.reference_type}` : q``} ${f.reference_id ? q`AND t.reference_id = ${f.reference_id}` : q``}
    ${f.from ? q`AND (t.txn_at AT TIME ZONE 'UTC')::date >= ${f.from}::date` : q``} ${f.to ? q`AND (t.txn_at AT TIME ZONE 'UTC')::date <= ${f.to}::date` : q``}`;
  const rows = await q<Row[]>`SELECT ${TXN_COLS(q)} ${FROM_TXN(q)} ${where} ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, t.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM v_inventory_transaction t ${where}`;
  return { data: rows.map(shapeTxn), total: t?.n ?? 0 };
}

export async function postInventoryTxn(sql: Sql, user: Actor, input: InventoryTxnInput) {
  const ids = await inTx(sql, async (tx) => {
    const [part] = await tx<Row[]>`SELECT id, active FROM part WHERE id = ${input.part_id}`;
    if (!part || !part.active) throw inactive('part_id', 'The part');
    const locOf = async (id: number, field: string) => {
      const [l] = await tx<Row[]>`SELECT id::int AS id, type, active FROM location WHERE id = ${id}`;
      if (!l || !l.active) throw inactive(field, 'The location');
      return l;
    };
    let src: Row | null = null;
    let dst: Row | null = null;
    if (input.txn_type === 'TRANSFER') {
      if (input.from_location_id === input.to_location_id) throw validation({ to_location_id: 'must differ from the source location' });
      src = await locOf(input.from_location_id, 'from_location_id');
      dst = await locOf(input.to_location_id, 'to_location_id');
    } else if (input.txn_type === 'SCRAP') {
      src = await locOf(input.location_id, 'location_id');
      const [rc] = await tx<Row[]>`SELECT id FROM reason_code WHERE id = ${input.reason_code_id} AND category = 'scrap' AND active`;
      if (!rc) throw validation({ reason_code_id: 'must be an active scrap reason' });
    } else {
      dst = await locOf(input.location_id, 'location_id');
      if (dst.type !== 'FG') throw validation({ location_id: 'must be a finished-goods (FG) location' });
    }
    // identity / role-by-state (R-7), decided by the DB type of the locations
    const verdict = decideMove(user.role, input.txn_type, src?.type ?? null, dst?.type ?? null);
    if (verdict !== 'ok') {
      throw new IdentityDenied(verdict, verdict === 'FORBIDDEN_HOLD_RELEASE' ? 'Moving stock out of a Hold location needs Quality or a Supervisor.' : 'Quality can only move or scrap stock into or out of Hold locations.');
    }
    if (input.txn_type === 'PRODUCTION_COMPLETE') await ensureLot(tx, input.part_id, input.lot_number);
    else await requireLot(tx, input.part_id, input.lot_number);
    const out: number[] = [];
    const ins = async (type: string, locId: number, qtyChange: number, reason: number | null, group: string | null) => {
      const [t] = await tx<Row[]>`INSERT INTO inventory_transaction (txn_type, part_id, location_id, lot_number, qty_change, reason_code_id, txn_group, note, created_by)
                                  VALUES (${type}, ${input.part_id}, ${locId}, ${input.lot_number}, ${qtyChange}, ${reason}, ${group}, ${('note' in input ? input.note : null) ?? null}, ${user.id}) RETURNING id::int AS id`;
      out.push(t.id);
    };
    if (input.txn_type === 'TRANSFER') {
      await lockStock(tx, [{ part_id: input.part_id, location_id: src!.id, lot_number: input.lot_number }, { part_id: input.part_id, location_id: dst!.id, lot_number: input.lot_number }]);
      const avail = await onHandQty(tx, input.part_id, src!.id, input.lot_number);
      if (avail < input.qty) throw conflict('INSUFFICIENT_STOCK', 'Not enough stock at the source location.', { available: avail, requested: input.qty });
      const g = randomUUID();
      await ins('TRANSFER', src!.id, -input.qty, null, g);
      await ins('TRANSFER', dst!.id, input.qty, null, g);
    } else if (input.txn_type === 'SCRAP') {
      await lockStock(tx, [{ part_id: input.part_id, location_id: src!.id, lot_number: input.lot_number }]);
      const avail = await onHandQty(tx, input.part_id, src!.id, input.lot_number);
      if (avail < input.qty) throw conflict('INSUFFICIENT_STOCK', 'Not enough stock at the location.', { available: avail, requested: input.qty });
      await ins('SCRAP', src!.id, -input.qty, input.reason_code_id, null);
    } else {
      await ins('PRODUCTION_COMPLETE', dst!.id, input.qty, null, null);
    }
    await audit(tx, { userId: user.id, action: 'INVENTORY_TXN_CREATE', table: 'inventory_transaction', recordId: out[0], changes: { txn_type: input.txn_type, part_id: input.part_id, lot_number: input.lot_number, qty: input.qty, ledger_txn_ids: out } });
    return out;
  });
  const rows = await sql<Row[]>`SELECT ${TXN_COLS(sql)} ${FROM_TXN(sql)} WHERE t.id IN ${sql(ids)} ORDER BY t.id`;
  return { transactions: rows.map(shapeTxn) };
}

// ----------------------------------------------------------------------------- on-hand
export async function listOnHand(q: Sql, f: { part_id?: number; location_id?: number; lot_number?: string; include_zero?: boolean; sortCol: string; desc: boolean; limit: number; offset: number }) {
  // v_on_hand hides zero rows; include_zero adds every (part, location, lot) that ever had a transaction.
  const base = f.include_zero
    ? q`(SELECT part_id, location_id, lot_number, SUM(qty_change)::int AS qty_on_hand FROM inventory_transaction GROUP BY part_id, location_id, lot_number)`
    : q`v_on_hand`;
  const where = q`WHERE true ${f.part_id ? q`AND oh.part_id = ${f.part_id}` : q``} ${f.location_id ? q`AND oh.location_id = ${f.location_id}` : q``} ${f.lot_number ? q`AND oh.lot_number = ${f.lot_number}` : q``}`;
  const rows = await q<Row[]>`
    SELECT p.id::int AS part_id, p.part_number, p.revision, p.description, p.abc_class, l.id::int AS location_id, l.code AS location_code, l.type AS location_type,
           oh.lot_number, oh.qty_on_hand
      FROM ${base} oh JOIN part p ON p.id = oh.part_id JOIN location l ON l.id = oh.location_id ${where}
     ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, p.part_number, l.code, oh.lot_number LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM ${base} oh ${where}`;
  return {
    data: rows.map((r) => ({
      part: { id: r.part_id, part_number: r.part_number, revision: r.revision, description: r.description, abc_class: r.abc_class },
      location: { id: r.location_id, code: r.location_code, type: r.location_type }, lot_number: r.lot_number, qty_on_hand: r.qty_on_hand,
    })),
    total: t?.n ?? 0,
  };
}

// ----------------------------------------------------------------------------- lot trace
export function normalizeLot(raw: string): string {
  const lot = raw.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,30}$/.test(lot)) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid lot number.', { fields: { lot_number: 'must be 3-30 letters, digits or hyphens' } });
  return lot;
}

export async function lotTrace(q: Sql, rawLot: string) {
  const lot = normalizeLot(rawLot);
  const backward = await q<Row[]>`
    SELECT r.receipt_no, s.id::int AS supplier_id, s.code AS supplier_code, s.name AS supplier_name, r.supplier_po, p.id::int AS part_id, p.part_number, p.revision,
           r.qty_received, r.inspection_status, r.arrived_at
      FROM receipt r JOIN supplier s ON s.id = r.supplier_id JOIN part p ON p.id = r.part_id WHERE r.lot_number = ${lot} ORDER BY r.arrived_at, r.id`;
  const forward = await q<Row[]>`
    SELECT sh.shipment_no, sh.id::int AS shipment_id, c.id::int AS customer_id, c.code AS customer_code, c.name AS customer_name, sh.ship_date::text AS ship_date,
           sl.qty_shipped, ca.id::int AS carrier_id, ca.name AS carrier_name, sh.tracking_number, sh.status
      FROM shipment_line sl JOIN shipment sh ON sh.id = sl.shipment_id JOIN customer c ON c.id = sh.customer_id LEFT JOIN carrier ca ON ca.id = sh.carrier_id
     WHERE sl.lot_number = ${lot} AND sh.status = 'Shipped' ORDER BY sh.ship_date, sh.id`;
  const movements = await q<Row[]>`
    SELECT t.txn_at, t.txn_type, l.id::int AS location_id, l.code AS location_code, t.qty_change, rc.label AS reason_label
      FROM inventory_transaction t JOIN location l ON l.id = t.location_id LEFT JOIN reason_code rc ON rc.id = t.reason_code_id
     WHERE t.lot_number = ${lot} ORDER BY t.txn_at, t.id`;
  const sum = (type: string) => movements.filter((m) => m.txn_type === type).reduce((a, m) => a + m.qty_change, 0);
  const found = backward.length + forward.length + movements.length > 0;
  return {
    lot_number: lot, found,
    backward: backward.map((r) => ({ receipt_no: r.receipt_no, supplier: { id: r.supplier_id, code: r.supplier_code, name: r.supplier_name }, supplier_po: r.supplier_po, part: { id: r.part_id, part_number: r.part_number, revision: r.revision }, qty_received: r.qty_received, inspection_status: r.inspection_status, arrived_at: r.arrived_at })),
    forward: forward.map((r) => ({ shipment_no: r.shipment_no, shipment_id: r.shipment_id, customer: { id: r.customer_id, code: r.customer_code, name: r.customer_name }, ship_date: r.ship_date, qty_shipped: r.qty_shipped, carrier: r.carrier_id ? { id: r.carrier_id, name: r.carrier_name } : null, tracking_number: r.tracking_number ?? null, status: r.status })),
    movements: movements.map((m) => ({ txn_at: m.txn_at, txn_type: m.txn_type, location: { id: m.location_id, code: m.location_code }, qty_change: m.qty_change, reason_code: m.reason_label ?? null })),
    summary: {
      received_total: sum('RECEIPT'), shipped_total: -sum('SHIP'), scrapped_total: -sum('SCRAP'), adjusted_total: sum('ADJUST'),
      on_hand_total: movements.reduce((a, m) => a + m.qty_change, 0),
    },
  };
}
