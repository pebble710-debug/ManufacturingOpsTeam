// Shipment workflow (contract sections 1.7, 5; docs/01 1.5; docs/02 2.4). Every action: one transaction,
// row lock, identity rules (403) before state (409), history row + audit row, all-or-nothing.
import type { Sql } from '../db';
import { audit } from '../audit';
import { getBusinessClock, realNow } from '../clock';
import { HttpError, IdentityDenied, conflict, notFound, validation } from '../http/errors';
import { findShipment, getShipmentDetail } from '../repos/shipments';
import {
  ALLOWED_FROM, ERROR_CODES, lateReasonRequired, mayCancelAtStatus, verifierIsPacker, type ShipmentStatus,
} from './rules';
import { diffFields, ensureLot, inTx, inactive, lockStock, onHandQty, parseRef, requireLot, type Actor } from './common';
import type {
  CorrectInput, CreateShipmentInput, ShipInput, UpdateShipmentInput, VerifyInput,
} from '../validation/shipments';
import { CHECKLIST_KEYS } from '../validation/shipments';

type Row = Record<string, any>;

async function activeRef(tx: Sql, table: 'customer' | 'part' | 'carrier' | 'location', id: number, field: string, what: string): Promise<Row> {
  const rows = await tx<Row[]>`SELECT * FROM ${tx(table)} WHERE id = ${id}`;
  if (!rows[0] || !rows[0].active) throw inactive(field, what);
  return rows[0];
}

async function history(tx: Sql, shipmentId: number, from: string | null, to: string, userId: number, businessDate: string, note?: string | null) {
  await tx`INSERT INTO shipment_status_history (shipment_id, from_status, to_status, business_date, changed_by, note)
           VALUES (${shipmentId}, ${from}, ${to}, ${businessDate}::date, ${userId}, ${note ?? null})`;
}

async function loadLocked(tx: Sql, ref: string): Promise<Row> {
  const s = await findShipment(tx, parseRef(ref, 'SH'), true);
  if (!s) throw notFound();
  return s;
}

function invalid(s: Row, action: string, extra: Record<string, unknown> = {}): HttpError {
  return conflict('INVALID_TRANSITION', `The shipment is ${s.status}; it cannot be changed with "${action}".`, {
    status: s.status, allowed_from: ALLOWED_FROM[action] ?? [], ...extra,
  });
}

/** Rework gate (contract 1.7): G1 a Before-ship error of this rework episode, G2 a completed rework event on it. */
export async function reworkGateMissing(tx: Sql, s: Row): Promise<string[]> {
  if (s.rework_origin === 'EDITED_AFTER_VERIFY' || s.rework_origin === null) return [];
  const [g] = await tx<{ errs: number; done: number }[]>`
    SELECT count(DISTINCT e.id)::int AS errs, count(DISTINCT w.id) FILTER (WHERE w.completed_at IS NOT NULL)::int AS done
      FROM packaging_error e LEFT JOIN rework_event w ON w.packaging_error_id = e.id
     WHERE e.shipment_id = ${s.id} AND e.detected_stage = 'Before ship' AND e.rework_episode = ${s.rework_episode}`;
  const missing: string[] = [];
  if (!g || g.errs === 0) missing.push('packaging_error');
  if (!g || g.done === 0) missing.push('completed_rework');
  return missing;
}

async function gateOrInvalid(tx: Sql, s: Row, action: string): Promise<never> {
  if (s.status === 'Rework') {
    const missing = await reworkGateMissing(tx, s);
    if (missing.length) {
      throw conflict('REWORK_GATE_NOT_MET', `Rework gate not met: ${missing.join(' and ').replace(/_/g, ' ')} required before the shipment can move on.`, { missing });
    }
    throw invalid(s, action, { required_action: 'reopen' });
  }
  throw invalid(s, action);
}

// ---------------------------------------------------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------------------------------------------------
export async function createShipment(sql: Sql, user: Actor, input: CreateShipmentInput) {
  const id = await inTx(sql, async (tx) => {
    const clock = await getBusinessClock(tx);
    await activeRef(tx, 'customer', input.customer_id, 'customer_id', 'The customer');
    for (const [i, l] of input.lines.entries()) {
      await activeRef(tx, 'part', l.part_id, `lines[${i}].part_id`, 'The part');
      if (l.lot_number) await requireLot(tx, l.part_id, l.lot_number, `lines[${i}].lot_number`);
    }
    const [s] = await tx<{ id: string }[]>`
      INSERT INTO shipment (customer_id, customer_po, order_date, requested_date, promise_date, service_level, notes,
                            doc_packing_slip, doc_bol, doc_coc, doc_labels, created_by)
      VALUES (${input.customer_id}, ${input.customer_po}, ${input.order_date}::date, ${input.requested_date}::date, ${input.promise_date}::date,
              ${input.service_level ?? null}, ${input.notes ?? null}, ${input.doc_packing_slip}, ${input.doc_bol}, ${input.doc_coc}, ${input.doc_labels}, ${user.id})
      RETURNING id`;
    const sid = Number(s.id);
    for (const [i, l] of input.lines.entries()) {
      await tx`INSERT INTO shipment_line (shipment_id, line_no, part_id, qty_ordered, lot_number) VALUES (${sid}, ${i + 1}, ${l.part_id}, ${l.qty_ordered}, ${l.lot_number ?? null})`;
    }
    await history(tx, sid, null, 'Planned', user.id, clock.today);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_CREATE', table: 'shipment', recordId: sid, changes: { customer_id: input.customer_id, customer_po: input.customer_po, lines: input.lines.length } });
    return sid;
  });
  return getShipmentDetail(sql, id, user);
}

const HEADER_KEYS = ['customer_id', 'customer_po', 'order_date', 'requested_date', 'promise_date', 'service_level', 'notes', 'doc_packing_slip', 'doc_bol', 'doc_coc', 'doc_labels'] as const;

export async function updateShipment(sql: Sql, user: Actor, ref: string, input: UpdateShipmentInput) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status === 'Shipped' || s.status === 'Cancelled') {
      throw conflict('SHIPMENT_LOCKED', 'This shipment is locked. Use the correction action.', { status: s.status });
    }
    const clock = await getBusinessClock(tx);
    const merged: Row = { ...s };
    for (const k of HEADER_KEYS) if (k in input) merged[k] = (input as Row)[k];
    const asDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    const [od, pd, rd] = ['order_date', 'promise_date', 'requested_date'].map((k) => asDate(merged[k]));
    const fields: Record<string, string> = {};
    if (pd < od) fields.promise_date = 'must be on or after the order date';
    if (rd < od) fields.requested_date = 'must be on or after the order date';
    if (Object.keys(fields).length) throw validation(fields);
    if (input.customer_id !== undefined && input.customer_id !== Number(s.customer_id)) await activeRef(tx, 'customer', input.customer_id, 'customer_id', 'The customer');

    // header update
    const oldHeader: Row = { ...s, order_date: asDate(s.order_date), promise_date: asDate(s.promise_date), requested_date: asDate(s.requested_date) };
    const newHeader: Row = {};
    for (const k of HEADER_KEYS) if (k in input) newHeader[k] = (input as Row)[k] ?? null;
    const changes: Record<string, unknown> = diffFields(oldHeader, newHeader);
    let linesChanged = false;
    if (input.lines) {
      const existing = await tx<Row[]>`SELECT id::int AS id, part_id::int AS part_id, qty_ordered, lot_number, line_no FROM shipment_line WHERE shipment_id = ${s.id} ORDER BY line_no`;
      const byId = new Map(existing.map((l) => [l.id as number, l]));
      const keep = new Set<number>();
      const summary = { added: [] as unknown[], removed: [] as unknown[], changed: [] as unknown[] };
      for (const [i, l] of input.lines.entries()) {
        await activeRef(tx, 'part', l.part_id, `lines[${i}].part_id`, 'The part').catch(async (e) => {
          const cur = l.id ? byId.get(l.id) : undefined;
          if (!cur || cur.part_id !== l.part_id) throw e; // an unchanged inactive part on an existing line is tolerated
        });
        if (l.lot_number) await requireLot(tx, l.part_id, l.lot_number, `lines[${i}].lot_number`);
        if (l.id !== undefined && !byId.has(l.id)) throw validation({ [`lines[${i}].id`]: 'is not a line of this shipment' });
        if (l.id !== undefined) keep.add(l.id);
      }
      const removed = existing.filter((l) => !keep.has(l.id));
      if (removed.length) {
        if (!['Planned', 'Ready to Pack'].includes(s.status)) {
          throw conflict('CONFLICT', 'Lines can only be removed while the shipment is Planned or Ready to Pack.', { status: s.status });
        }
        const used = await tx<{ id: number }[]>`SELECT shipment_line_id::int AS id FROM packaging_error WHERE shipment_id = ${s.id} AND shipment_line_id = ANY(${removed.map((r) => r.id)})`;
        if (used.length) throw conflict('LINE_IN_USE', 'A line referenced by a packaging error cannot be removed.', { line_ids: used.map((u) => u.id) });
        for (const r of removed) {
          await tx`DELETE FROM shipment_line WHERE id = ${r.id}`;
          summary.removed.push({ line_no: r.line_no });
        }
      }
      let nextNo = existing.reduce((m, l) => Math.max(m, l.line_no), 0);
      for (const l of input.lines) {
        if (l.id !== undefined) {
          const cur = byId.get(l.id)!;
          const newLot = l.lot_number ?? null;
          if (cur.part_id !== l.part_id || cur.qty_ordered !== l.qty_ordered || (cur.lot_number ?? null) !== newLot) {
            await tx`UPDATE shipment_line SET part_id = ${l.part_id}, qty_ordered = ${l.qty_ordered}, lot_number = ${newLot} WHERE id = ${l.id}`;
            summary.changed.push({ line_no: cur.line_no, part_id: [cur.part_id, l.part_id], qty_ordered: [cur.qty_ordered, l.qty_ordered], lot_number: [cur.lot_number ?? null, newLot] });
          }
        } else {
          nextNo += 1;
          await tx`INSERT INTO shipment_line (shipment_id, line_no, part_id, qty_ordered, lot_number) VALUES (${s.id}, ${nextNo}, ${l.part_id}, ${l.qty_ordered}, ${l.lot_number ?? null})`;
          summary.added.push({ line_no: nextNo, part_id: l.part_id, qty_ordered: l.qty_ordered });
        }
      }
      if (summary.added.length || summary.removed.length || summary.changed.length) {
        changes.lines = summary;
        linesChanged = true;
      }
    }
    const touchedKey = ['customer_id', 'customer_po'].some((k) => k in changes);
    const reworkEntry = s.status === 'Verified' && (touchedKey || linesChanged);
    if (Object.keys(newHeader).length) {
      await tx`UPDATE shipment SET ${tx(newHeader as Record<string, any>, ...Object.keys(newHeader))} WHERE id = ${s.id}`;
    }
    if (reworkEntry) {
      const fieldsList = [...Object.keys(changes)].join(', ');
      await tx`UPDATE shipment SET status = 'Rework', rework_origin = 'EDITED_AFTER_VERIFY', rework_episode = rework_episode + 1,
                                   verified_by = NULL, verified_at = NULL WHERE id = ${s.id}`;
      await history(tx, Number(s.id), 'Verified', 'Rework', user.id, clock.today, `Edited after verification: ${fieldsList}`.slice(0, 500));
      changes.status = ['Verified', 'Rework'];
    }
    await audit(tx, { userId: user.id, action: 'SHIPMENT_UPDATE', table: 'shipment', recordId: Number(s.id), changes });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

// ---------------------------------------------------------------------------------------------------------------------
// Simple transitions
// ---------------------------------------------------------------------------------------------------------------------
export async function markReady(sql: Sql, user: Actor, ref: string, input: { note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status !== 'Planned') throw invalid(s, 'mark-ready');
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = 'Ready to Pack' WHERE id = ${s.id}`;
    await history(tx, Number(s.id), 'Planned', 'Ready to Pack', user.id, clock.today, input.note);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_MARK_READY', table: 'shipment', recordId: Number(s.id), changes: { status: ['Planned', 'Ready to Pack'] } });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

export async function startPacking(sql: Sql, user: Actor, ref: string, input: { note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    const repack = s.status === 'Packing' && s.packed_by === null;
    if (s.status !== 'Ready to Pack' && !repack) throw invalid(s, 'start-packing');
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = 'Packing', packed_by = ${user.id} WHERE id = ${s.id}`;
    if (!repack) await history(tx, Number(s.id), 'Ready to Pack', 'Packing', user.id, clock.today, input.note);
    await audit(tx, {
      userId: user.id, action: 'SHIPMENT_START_PACKING', table: 'shipment', recordId: Number(s.id),
      changes: { status: [s.status, 'Packing'], packed_by: [s.packed_by ?? null, user.id], ...(repack ? { repack: true } : {}) },
    });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

export async function holdShipment(sql: Sql, user: Actor, ref: string, input: { hold_reason_id: number; hold_owner_dept: string; note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    const [rc] = await tx<Row[]>`SELECT id FROM reason_code WHERE id = ${input.hold_reason_id} AND category = 'hold' AND active`;
    if (!rc) throw validation({ hold_reason_id: 'must be an active hold reason' });
    if (!ALLOWED_FROM.hold.includes(s.status)) throw invalid(s, 'hold');
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = 'On Hold', held_from_status = ${s.status}, hold_reason_id = ${input.hold_reason_id}, hold_owner_dept = ${input.hold_owner_dept} WHERE id = ${s.id}`;
    await history(tx, Number(s.id), s.status, 'On Hold', user.id, clock.today, input.note);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_HOLD', table: 'shipment', recordId: Number(s.id), changes: { status: [s.status, 'On Hold'], hold_reason_id: input.hold_reason_id, hold_owner_dept: input.hold_owner_dept } });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

export async function releaseShipment(sql: Sql, user: Actor, ref: string, input: { note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status !== 'On Hold') throw invalid(s, 'release');
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = ${s.held_from_status}, held_from_status = NULL, hold_reason_id = NULL, hold_owner_dept = NULL WHERE id = ${s.id}`;
    await history(tx, Number(s.id), 'On Hold', s.held_from_status, user.id, clock.today, input.note);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_RELEASE', table: 'shipment', recordId: Number(s.id), changes: { status: ['On Hold', s.held_from_status] } });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

export async function cancelShipment(sql: Sql, user: Actor, ref: string, input: { reason: string; note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    // R-5 first (403 role-by-state), then the state conflict (409).
    if (!mayCancelAtStatus(user.role, s.status as ShipmentStatus)) {
      throw new IdentityDenied(ERROR_CODES.R5, 'Shipping can cancel only while the shipment is Planned or Ready to Pack.', { status: s.status });
    }
    if (!ALLOWED_FROM.cancel.includes(s.status)) throw invalid(s, 'cancel');
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = 'Cancelled', held_from_status = NULL, hold_reason_id = NULL, hold_owner_dept = NULL WHERE id = ${s.id}`;
    await history(tx, Number(s.id), s.status, 'Cancelled', user.id, clock.today, input.reason);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_CANCEL', table: 'shipment', recordId: Number(s.id), changes: { status: [s.status, 'Cancelled'], reason: input.reason } });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

export async function reopenShipment(sql: Sql, user: Actor, ref: string, input: { note?: string | null }) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status !== 'Rework') throw invalid(s, 'reopen');
    const missing = await reworkGateMissing(tx, s);
    if (missing.length) {
      throw conflict('REWORK_GATE_NOT_MET', `Rework gate not met: ${missing.join(' and ').replace(/_/g, ' ')} required before the shipment can be reopened.`, { missing });
    }
    const clock = await getBusinessClock(tx);
    await tx`UPDATE shipment SET status = 'Packing', packed_by = NULL, rework_origin = NULL WHERE id = ${s.id}`;
    await history(tx, Number(s.id), 'Rework', 'Packing', user.id, clock.today, input.note);
    await audit(tx, { userId: user.id, action: 'SHIPMENT_REOPEN', table: 'shipment', recordId: Number(s.id), changes: { status: ['Rework', 'Packing'], packed_by: [s.packed_by ?? null, null] } });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

// ---------------------------------------------------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------------------------------------------------
export async function verifyShipment(sql: Sql, user: Actor, ref: string, input: VerifyInput) {
  const { id, attempt } = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    // R-1 under the row lock, before any 409 (contract 1.3 step 5). No verification row is written on refusal.
    if (verifierIsPacker(s.packed_by === null ? null : Number(s.packed_by), user.id)) {
      throw new IdentityDenied(ERROR_CODES.R1, 'The person who packed this shipment cannot verify it.');
    }
    if (s.status !== 'Packing') await gateOrInvalid(tx, s, 'verify');
    if (s.packed_by === null) throw invalid(s, 'verify', { reason: 'no_packer', required_action: 'start-packing' });

    const lines = await tx<Row[]>`SELECT l.lot_number, p.requires_coc FROM shipment_line l JOIN part p ON p.id = l.part_id WHERE l.shipment_id = ${s.id}`;
    const needCoc = lines.some((l) => l.requires_coc);
    const fields: Record<string, string> = {};
    const checklist: Record<string, 'pass' | 'fail'> = {};
    for (const k of CHECKLIST_KEYS) {
      const v = input.checklist[k];
      if (k === 'coc' && !needCoc) {
        if (v !== undefined) fields['checklist.coc'] = 'is not applicable to this shipment';
        continue;
      }
      if (v === undefined) fields[`checklist.${k}`] = 'is required';
      else checklist[k] = v;
    }
    if (Object.keys(fields).length) {
      const code = Object.values(fields).some((m) => m === 'is required') ? 'CHECKLIST_INCOMPLETE' : 'VALIDATION_ERROR';
      throw new HttpError(422, code, 'Every applicable checklist item must be marked pass or fail.', { fields });
    }
    const contradict: Record<string, string> = {};
    if (checklist.lot === 'pass' && lines.some((l) => !l.lot_number)) contradict['checklist.lot'] = 'cannot pass: a line has no lot number';
    if (checklist.coc === 'pass' && !s.doc_coc) contradict['checklist.coc'] = 'cannot pass: the C of C flag is off';
    if (Object.keys(contradict).length) throw new HttpError(422, 'CHECKLIST_CONTRADICTS_RECORD', 'A passing item contradicts the shipment record.', { fields: contradict });

    const failed = Object.entries(checklist).filter(([, v]) => v === 'fail').map(([k]) => k);
    const clock = await getBusinessClock(tx);
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM shipment_verification WHERE shipment_id = ${s.id}`;
    const attemptNo = n + 1;
    await tx`INSERT INTO shipment_verification (shipment_id, attempt_no, result, packer_id, verified_by, checklist, failed_items, note, business_date)
             VALUES (${s.id}, ${attemptNo}, ${failed.length ? 'Fail' : 'Pass'}, ${s.packed_by}, ${user.id}, ${tx.json(checklist)},
                     ${failed}::text[], ${input.note ?? null}, ${clock.today}::date)`;
    if (failed.length === 0) {
      await tx`UPDATE shipment SET status = 'Verified', verified_by = ${user.id}, verified_at = ${realNow()}, rework_origin = NULL WHERE id = ${s.id}`;
      await tx`UPDATE rework_event SET reverified_ok = true WHERE shipment_id = ${s.id} AND completed_at IS NOT NULL AND reverified_ok IS NULL`;
      await history(tx, Number(s.id), 'Packing', 'Verified', user.id, clock.today, input.note);
    } else {
      await tx`UPDATE shipment SET status = 'Rework', rework_origin = 'VERIFICATION_FAILED', rework_episode = rework_episode + 1,
                                   verified_by = NULL, verified_at = NULL WHERE id = ${s.id}`;
      await history(tx, Number(s.id), 'Packing', 'Rework', user.id, clock.today, `Verification failed: ${failed.join(', ')}`);
    }
    await audit(tx, {
      userId: user.id, action: 'SHIPMENT_VERIFY', table: 'shipment', recordId: Number(s.id),
      changes: { attempt_no: attemptNo, result: failed.length ? 'Fail' : 'Pass', failed_items: failed, status: ['Packing', failed.length ? 'Rework' : 'Verified'] },
    });
    return { id: Number(s.id), attempt: attemptNo };
  });
  const detail = await getShipmentDetail(sql, id, user);
  return { ...detail!, verification: detail!.verifications.find((v) => v.attempt_no === attempt) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------------------------------------------------
export async function shipShipment(sql: Sql, user: Actor, ref: string, input: ShipInput) {
  const { id, ledger } = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status !== 'Verified') await gateOrInvalid(tx, s, 'ship');
    const clock = await getBusinessClock(tx);
    const asDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    const orderDate = asDate(s.order_date);
    const promise = asDate(s.promise_date);
    const shipDate = input.ship_date ?? clock.today;
    const fields: Record<string, string> = {};
    if (shipDate > clock.today) fields.ship_date = 'cannot be in the future';
    if (shipDate < orderDate) fields.ship_date = 'cannot be before the order date';
    const [carrier] = await tx<Row[]>`SELECT id, mode, active FROM carrier WHERE id = ${input.carrier_id}`;
    if (!carrier || !carrier.active) fields.carrier_id = 'is inactive or does not exist';
    if (carrier && carrier.active && carrier.mode !== 'Pickup' && !input.tracking_number) fields.tracking_number = 'is required unless the carrier is Customer Pickup';
    const late = lateReasonRequired(shipDate, promise);
    if (late && !input.late_reason_id) fields.late_reason_id = 'is required when the ship date is after the promise date';
    if (!late && input.late_reason_id) fields.late_reason_id = 'must be empty when the shipment is not late';
    if (input.late_reason_id) {
      const [lr] = await tx<Row[]>`SELECT id FROM reason_code WHERE id = ${input.late_reason_id} AND category = 'late' AND active`;
      if (!lr) fields.late_reason_id = 'must be an active late reason';
    }
    // lines
    const lines = await tx<Row[]>`SELECT id::int AS id, line_no, part_id::int AS part_id, qty_ordered, lot_number, location_id::int AS location_id FROM shipment_line WHERE shipment_id = ${s.id} ORDER BY line_no`;
    const inLines = new Map((input.lines ?? []).map((l) => [l.line_id, l]));
    if (input.lines) {
      if (inLines.size !== input.lines.length) fields.lines = 'a line appears more than once';
      for (const l of lines) if (!inLines.has(l.id)) fields.lines = 'must contain every shipment line exactly once';
      for (const l of input.lines) if (!lines.some((x) => x.id === l.line_id)) fields.lines = 'contains a line that is not part of this shipment';
    }
    const plan: { line: Row; qty: number; lot: string | null; loc: number | null; note: string | null }[] = [];
    for (const [i, l] of lines.entries()) {
      const given = inLines.get(l.id);
      const qty = given ? given.qty_shipped : l.qty_ordered;
      const lot = given?.lot_number ?? l.lot_number ?? null;
      const loc = given?.location_id ?? l.location_id ?? null;
      const note = given?.short_note ?? null;
      const key = (f: string) => `lines[${input.lines ? [...inLines.keys()].indexOf(l.id) : i}].${f}`;
      if (qty > l.qty_ordered) fields[key('qty_shipped')] = 'cannot exceed the quantity ordered';
      if (qty < l.qty_ordered && !note) fields[key('short_note')] = 'is required when shipping less than ordered';
      if (qty > 0) {
        if (!lot) fields[key('lot_number')] = 'is required';
        if (!loc) fields[key('location_id')] = 'is required';
      }
      plan.push({ line: l, qty, lot, loc, note });
    }
    if (!plan.some((p) => p.qty > 0)) fields.lines = 'at least one line must ship a quantity above 0';
    if (Object.keys(fields).length) throw validation(fields);
    // lot / location validity (needs DB reads)
    for (const [i, p] of plan.entries()) {
      if (p.lot) await requireLot(tx, p.line.part_id, p.lot, `lines[${i}].lot_number`);
      if (p.loc) {
        const [loc] = await tx<Row[]>`SELECT type, active FROM location WHERE id = ${p.loc}`;
        if (!loc || !loc.active || !['Stock', 'FG', 'Shipping'].includes(loc.type)) {
          throw validation({ [`lines[${i}].location_id`]: 'must be an active Stock, FG or Shipping location' });
        }
      }
    }
    // stock check under lock (US-041)
    const need = plan.filter((p) => p.qty > 0);
    await lockStock(tx, need.map((p) => ({ part_id: p.line.part_id, location_id: p.loc!, lot_number: p.lot! })));
    const requestedBy = new Map<string, number>();
    for (const p of need) requestedBy.set(`${p.line.part_id}|${p.loc}|${p.lot}`, (requestedBy.get(`${p.line.part_id}|${p.loc}|${p.lot}`) ?? 0) + p.qty);
    for (const p of need) {
      const avail = await onHandQty(tx, p.line.part_id, p.loc!, p.lot!);
      const total = requestedBy.get(`${p.line.part_id}|${p.loc}|${p.lot}`)!;
      if (avail < total) throw conflict('INSUFFICIENT_STOCK', 'Not enough stock on hand for this line.', { line_id: p.line.id, available: avail, requested: total });
    }
    // 1. lines first (UD-3 lock trigger refuses line changes once Shipped)
    for (const p of plan) {
      await tx`UPDATE shipment_line SET qty_shipped = ${p.qty}, lot_number = ${p.lot}, location_id = ${p.loc}, short_note = ${p.note} WHERE id = ${p.line.id}`;
    }
    // 2. ledger
    const now = realNow();
    const ledger: Row[] = [];
    for (const p of need) {
      const [t] = await tx<Row[]>`INSERT INTO inventory_transaction (txn_type, part_id, location_id, lot_number, qty_change, shipment_line_id, txn_at, created_by)
                                  VALUES ('SHIP', ${p.line.part_id}, ${p.loc}, ${p.lot}, ${-p.qty}, ${p.line.id}, ${now}, ${user.id})
                                  RETURNING id::int AS id, txn_type, part_id::int AS part_id, location_id::int AS location_id, lot_number, qty_change, txn_at`;
      ledger.push(t);
    }
    // 3. shipment
    await tx`UPDATE shipment SET status = 'Shipped', ship_date = ${shipDate}::date, shipped_at = ${now}, carrier_id = ${input.carrier_id},
                                 tracking_number = ${input.tracking_number ?? null}, packages_count = ${input.packages_count},
                                 total_weight_lb = ${input.total_weight_lb}, late_reason_id = ${input.late_reason_id ?? null},
                                 service_level = ${input.service_level ?? s.service_level ?? null}
              WHERE id = ${s.id}`;
    await history(tx, Number(s.id), 'Verified', 'Shipped', user.id, clock.today, input.note);
    await audit(tx, {
      userId: user.id, action: 'SHIPMENT_SHIP', table: 'shipment', recordId: Number(s.id),
      changes: { status: ['Verified', 'Shipped'], ship_date: shipDate, carrier_id: input.carrier_id, late_reason_id: input.late_reason_id ?? null, ledger_txn_ids: ledger.map((l) => l.id) },
    });
    return { id: Number(s.id), ledger };
  });
  return { ...(await getShipmentDetail(sql, id, user))!, ledger };
}

// ---------------------------------------------------------------------------------------------------------------------
// Correction (E-53, UD-3)
// ---------------------------------------------------------------------------------------------------------------------
export async function correctShipment(sql: Sql, user: Actor, ref: string, input: CorrectInput) {
  const id = await inTx(sql, async (tx) => {
    const s = await loadLocked(tx, ref);
    if (s.status !== 'Shipped' && s.status !== 'Cancelled') throw invalid(s, 'correct', { required_action: 'edit' });
    const clock = await getBusinessClock(tx);
    const asDate = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    const cur: Row = { ...s, order_date: asDate(s.order_date), requested_date: asDate(s.requested_date), promise_date: asDate(s.promise_date), ship_date: asDate(s.ship_date), carrier_id: s.carrier_id === null ? null : Number(s.carrier_id), late_reason_id: s.late_reason_id === null ? null : Number(s.late_reason_id), total_weight_lb: s.total_weight_lb === null ? null : Number(s.total_weight_lb) };
    const COLS = ['customer_po', 'requested_date', 'promise_date', 'ship_date', 'carrier_id', 'tracking_number', 'service_level', 'packages_count', 'total_weight_lb', 'late_reason_id', 'doc_packing_slip', 'doc_bol', 'doc_coc', 'doc_labels', 'notes'] as const;
    const next: Row = {};
    for (const k of COLS) if (k in input) next[k] = (input as Row)[k] ?? null;
    const changes = diffFields(cur, next);
    const lineChanges: { line_id: number; short_note: [unknown, unknown] }[] = [];
    const fields: Record<string, string> = {};
    if (input.lines) {
      for (const [i, l] of input.lines.entries()) {
        const [row] = await tx<Row[]>`SELECT id, short_note, qty_shipped, qty_ordered FROM shipment_line WHERE id = ${l.line_id} AND shipment_id = ${s.id}`;
        if (!row) { fields[`lines[${i}].line_id`] = 'is not a line of this shipment'; continue; }
        const nn = l.short_note ?? null;
        if (s.status === 'Cancelled') fields[`lines[${i}].short_note`] = 'cannot be corrected on a cancelled shipment';
        if ((row.short_note ?? null) !== nn) {
          if (nn === null && row.qty_shipped !== null && row.qty_shipped < row.qty_ordered) fields[`lines[${i}].short_note`] = 'is required for a short shipment';
          lineChanges.push({ line_id: Number(row.id), short_note: [row.short_note ?? null, nn] });
        }
      }
    }
    if (s.status === 'Cancelled') {
      for (const k of ['ship_date', 'carrier_id', 'tracking_number', 'service_level', 'packages_count', 'total_weight_lb', 'late_reason_id']) {
        if (k in input) fields[k] = 'cannot be corrected on a cancelled shipment';
      }
    }
    const merged = { ...cur, ...next };
    if (merged.promise_date < merged.order_date) fields.promise_date = 'must be on or after the order date';
    if (merged.requested_date < merged.order_date) fields.requested_date = 'must be on or after the order date';
    if (s.status === 'Shipped') {
      if (merged.ship_date > clock.today) fields.ship_date = 'cannot be in the future';
      if (merged.ship_date < merged.order_date) fields.ship_date = 'cannot be before the order date';
      const [carrier] = await tx<Row[]>`SELECT mode, active FROM carrier WHERE id = ${merged.carrier_id}`;
      if ('carrier_id' in next && (!carrier || !carrier.active)) fields.carrier_id = 'is inactive or does not exist';
      if (carrier && carrier.mode !== 'Pickup' && !merged.tracking_number) fields.tracking_number = 'is required unless the carrier is Customer Pickup';
      const late = lateReasonRequired(merged.ship_date, merged.promise_date);
      if (late && !merged.late_reason_id) fields.late_reason_id = 'is required when the ship date is after the promise date';
      if (!late && merged.late_reason_id) fields.late_reason_id = 'must be empty when the shipment is not late';
      if (merged.late_reason_id && 'late_reason_id' in next) {
        const [lr] = await tx<Row[]>`SELECT id FROM reason_code WHERE id = ${merged.late_reason_id} AND category = 'late' AND active`;
        if (!lr) fields.late_reason_id = 'must be an active late reason';
      }
    }
    if (Object.keys(fields).length) throw validation(fields);
    if (Object.keys(changes).length === 0 && lineChanges.length === 0) throw validation({ _: 'Nothing to correct' }, 'Nothing to correct.');
    const setObj: Row = {};
    for (const k of Object.keys(changes)) setObj[k] = next[k];
    if (Object.keys(setObj).length) await tx`UPDATE shipment SET ${tx(setObj, ...Object.keys(setObj))} WHERE id = ${s.id}`;
    for (const c of lineChanges) await tx`UPDATE shipment_line SET short_note = ${c.short_note[1] as string | null} WHERE id = ${c.line_id}`;
    await audit(tx, {
      userId: user.id, action: 'SHIPMENT_CORRECT', table: 'shipment', recordId: Number(s.id),
      changes: { ...changes, reason: input.reason, lines: lineChanges },
    });
    return Number(s.id);
  });
  return getShipmentDetail(sql, id, user);
}

// Re-export for handlers.
export { ensureLot };
