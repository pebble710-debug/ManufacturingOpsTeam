// Packaging errors, rework events and corrective actions (contract section 6; docs/02, docs/06 6.5).
import type { Sql } from '../db';
import { audit } from '../audit';
import { getBusinessClock } from '../clock';
import { HttpError, IdentityDenied, conflict, notFound, validation } from '../http/errors';
import { diffFields, inTx, inactive, parseRef, type Actor, type Ref } from './common';
import { ERROR_CODES, mayLogErrorStage, type ShipmentStatus } from './rules';
import type { CreateErrorInput, CreateReworkInput, UpdateErrorInput } from '../validation/quality';

type Row = Record<string, any>;

const FIVE_MIN = 5 * 60 * 1000;
const asDate = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

async function findError(q: Sql, ref: Ref, forUpdate = false): Promise<Row | undefined> {
  const rows = await (forUpdate
    ? 'id' in ref ? q<Row[]>`SELECT * FROM packaging_error WHERE id = ${ref.id} FOR UPDATE` : q<Row[]>`SELECT * FROM packaging_error WHERE error_no = ${ref.no} FOR UPDATE`
    : 'id' in ref ? q<Row[]>`SELECT * FROM packaging_error WHERE id = ${ref.id}` : q<Row[]>`SELECT * FROM packaging_error WHERE error_no = ${ref.no}`);
  return rows[0];
}

// ----------------------------------------------------------------------------- read models
const ERR_COLS = (q: Sql) => q`
  e.id::int AS id, e.error_no, s.id::int AS shipment_id, s.shipment_no, e.shipment_line_id::int AS shipment_line_id, e.detected_at,
  e.detected_by_role, e.detected_stage, e.category, e.paperwork_subtype, e.severity, e.description, e.root_cause_category,
  e.root_cause_note, e.status, e.packaging_related, e.closed_at, e.created_at, e.rework_episode,
  u.id::int AS reported_by_id, u.display_name AS reported_by_name,
  COALESCE((SELECT sum(w.minutes) FROM rework_event w WHERE w.packaging_error_id = e.id AND w.completed_at IS NOT NULL), 0)::int AS rework_minutes_total,
  (SELECT CASE WHEN count(*) = 0 THEN 'None' WHEN bool_or(c.status = 'Open') THEN 'Open' WHEN bool_or(c.status = 'In Progress') THEN 'In Progress' ELSE 'Closed' END
     FROM corrective_action c WHERE c.packaging_error_id = e.id) AS corrective_action_status`;

function shapeError(r: Row, today: string) {
  const detectedDay = (r.detected_at as Date).toISOString().slice(0, 10);
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${detectedDay}T00:00:00Z`)) / 86400000;
  return {
    id: r.id, error_no: r.error_no, shipment: { id: r.shipment_id, shipment_no: r.shipment_no }, shipment_line_id: r.shipment_line_id ?? null,
    detected_at: r.detected_at, detected_by_role: r.detected_by_role, detected_stage: r.detected_stage, category: r.category,
    paperwork_subtype: r.paperwork_subtype ?? null, severity: r.severity, description: r.description,
    root_cause_category: r.root_cause_category ?? null, root_cause_note: r.root_cause_note ?? null, status: r.status,
    reported_by: { id: r.reported_by_id, display_name: r.reported_by_name }, needs_recategorisation: r.category === 'Other',
    is_overdue: r.status === 'Open' && days > 7, packaging_related: r.packaging_related, rework_minutes_total: r.rework_minutes_total,
    corrective_action_status: r.corrective_action_status, closed_at: r.closed_at ?? null, created_at: r.created_at,
  };
}

export async function getError(q: Sql, ref: string) {
  const r = await ('id' in parseRef(ref, 'PE')
    ? q<Row[]>`SELECT ${ERR_COLS(q)} FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id JOIN app_user u ON u.id = e.reported_by WHERE e.id = ${(parseRef(ref, 'PE') as { id: number }).id}`
    : q<Row[]>`SELECT ${ERR_COLS(q)} FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id JOIN app_user u ON u.id = e.reported_by WHERE e.error_no = ${(parseRef(ref, 'PE') as { no: string }).no}`);
  if (!r[0]) throw notFound();
  const clock = await getBusinessClock(q);
  const rework = await listRework(q, { packaging_error_id: r[0].id, limit: 500, offset: 0 });
  const cas = await listCorrectiveActions(q, { packaging_error_id: r[0].id, limit: 500, offset: 0 });
  return { ...shapeError(r[0], clock.today), rework_events: rework.data, corrective_actions: cas.data };
}

export interface ErrorFilter {
  status?: string[]; category?: string[]; severity?: string[]; detected_stage?: string[]; shipment_id?: number; shipment_no?: string;
  from?: string; to?: string; overdue?: boolean; needs_recategorisation?: boolean; sortCol: string; desc: boolean; limit: number; offset: number;
}
export async function listErrors(q: Sql, f: ErrorFilter) {
  const clock = await getBusinessClock(q);
  const where = q`WHERE true
    ${f.status ? q`AND e.status IN ${q(f.status)}` : q``} ${f.category ? q`AND e.category IN ${q(f.category)}` : q``}
    ${f.severity ? q`AND e.severity IN ${q(f.severity)}` : q``} ${f.detected_stage ? q`AND e.detected_stage IN ${q(f.detected_stage)}` : q``}
    ${f.shipment_id ? q`AND e.shipment_id = ${f.shipment_id}` : q``} ${f.shipment_no ? q`AND s.shipment_no = ${f.shipment_no}` : q``}
    ${f.from ? q`AND (e.detected_at AT TIME ZONE 'UTC')::date >= ${f.from}::date` : q``} ${f.to ? q`AND (e.detected_at AT TIME ZONE 'UTC')::date <= ${f.to}::date` : q``}
    ${f.overdue ? q`AND e.status = 'Open' AND (e.detected_at AT TIME ZONE 'UTC')::date < ${clock.today}::date - 7` : q``}
    ${f.needs_recategorisation ? q`AND e.category = 'Other'` : q``}`;
  const rows = await q<Row[]>`SELECT ${ERR_COLS(q)} FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id JOIN app_user u ON u.id = e.reported_by
      ${where} ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, e.id ASC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id ${where}`;
  return { data: rows.map((r) => shapeError(r, clock.today)), total: t?.n ?? 0 };
}

// ----------------------------------------------------------------------------- errors
export async function createError(sql: Sql, user: Actor, input: CreateErrorInput) {
  const eid = await inTx(sql, async (tx) => {
    const ref: Ref = input.shipment_id !== undefined ? { id: input.shipment_id } : { no: input.shipment_no! };
    const [s] = await ('id' in ref
      ? tx<Row[]>`SELECT * FROM shipment WHERE id = ${ref.id} FOR UPDATE`
      : tx<Row[]>`SELECT * FROM shipment WHERE shipment_no = ${ref.no} FOR UPDATE`);
    if (!s) throw validation({ shipment_id: 'shipment not found' });
    // R-8 (403) before the stage/status conflict (409)
    if (!mayLogErrorStage(user.role, input.detected_stage, s.status as ShipmentStatus)) {
      throw new IdentityDenied(ERROR_CODES.R8, 'Shipping can log Before-ship errors only, and not against a shipped shipment.', { status: s.status });
    }
    if (input.detected_stage === 'Before ship' && ['Shipped', 'Cancelled'].includes(s.status)) {
      throw conflict('STAGE_STATUS_MISMATCH', 'A Before-ship error cannot be logged against a shipped or cancelled shipment.', { status: s.status });
    }
    if (input.detected_stage === 'After ship' && s.status !== 'Shipped') {
      throw conflict('STAGE_STATUS_MISMATCH', 'An After-ship error can only be logged against a shipped shipment.', { status: s.status });
    }
    const clock = await getBusinessClock(tx);
    const detectedAt = input.detected_at ?? clock.now;
    if (detectedAt.getTime() > clock.now.getTime() + FIVE_MIN) throw validation({ detected_at: 'cannot be in the future' });
    if (input.shipment_line_id) {
      const [l] = await tx<Row[]>`SELECT id FROM shipment_line WHERE id = ${input.shipment_line_id} AND shipment_id = ${s.id}`;
      if (!l) throw validation({ shipment_line_id: 'is not a line of this shipment' });
    }
    const enters = input.detected_stage === 'Before ship' && ['Packing', 'Verified'].includes(s.status);
    const episode = input.detected_stage !== 'Before ship' ? null : enters ? Number(s.rework_episode) + 1 : s.status === 'Rework' ? Number(s.rework_episode) : null;
    const [e] = await tx<Row[]>`
      INSERT INTO packaging_error (shipment_id, shipment_line_id, detected_at, rework_episode, detected_by_role, detected_stage, category, paperwork_subtype,
                                   severity, description, packaging_related, reported_by)
      VALUES (${s.id}, ${input.shipment_line_id ?? null}, ${detectedAt}, ${episode}, ${input.detected_by_role}, ${input.detected_stage}, ${input.category},
              ${input.paperwork_subtype ?? null}, ${input.severity}, ${input.description}, ${input.packaging_related ?? true}, ${user.id})
      RETURNING id::int AS id, error_no`;
    if (enters) {
      await tx`UPDATE shipment SET status = 'Rework', rework_origin = 'ERROR_LOGGED', rework_episode = rework_episode + 1, verified_by = NULL, verified_at = NULL WHERE id = ${s.id}`;
      await tx`INSERT INTO shipment_status_history (shipment_id, from_status, to_status, business_date, changed_by, note)
               VALUES (${s.id}, ${s.status}, 'Rework', ${clock.today}::date, ${user.id}, ${`Packaging error ${e.error_no}`})`;
      await audit(tx, { userId: user.id, action: 'SHIPMENT_UPDATE', table: 'shipment', recordId: Number(s.id), changes: { status: [s.status, 'Rework'], rework_origin: [null, 'ERROR_LOGGED'] } });
    }
    await audit(tx, {
      userId: user.id, action: 'PACKAGING_ERROR_CREATE', table: 'packaging_error', recordId: e.id,
      changes: { shipment_id: Number(s.id), category: input.category, severity: input.severity, detected_stage: input.detected_stage, packaging_related: input.packaging_related ?? true,
                 ...(input.packaging_related === false ? { packaging_related_reason: input.packaging_related_reason } : {}) },
    });
    return e.id as number;
  });
  return getError(sql, String(eid));
}

export async function updateError(sql: Sql, user: Actor, ref: string, input: UpdateErrorInput) {
  const id = await inTx(sql, async (tx) => {
    const e = await findError(tx, parseRef(ref, 'PE'), true);
    if (!e) throw notFound();
    if (e.status === 'Closed') throw conflict('ERROR_CLOSED', 'A closed error cannot be edited.');
    const fields: Record<string, string> = {};
    const set: Row = {};
    if ('root_cause_category' in input) set.root_cause_category = input.root_cause_category ?? null;
    if ('root_cause_note' in input) set.root_cause_note = input.root_cause_note ? input.root_cause_note : null;
    if (input.packaging_related !== undefined && input.packaging_related !== e.packaging_related) {
      if (e.detected_stage !== 'After ship') fields.packaging_related = 'can be changed only for After ship errors';
      if (!input.packaging_related_reason) fields.packaging_related_reason = 'is required when changing packaging_related';
      set.packaging_related = input.packaging_related;
    }
    if (Object.keys(fields).length) throw validation(fields);
    const changes: Row = diffFields(e, set);
    if (Object.keys(changes).length === 0) return Number(e.id);
    if (set.packaging_related !== undefined) changes.reason = input.packaging_related_reason;
    await tx`UPDATE packaging_error SET ${tx(set, ...Object.keys(set))} WHERE id = ${e.id}`;
    await audit(tx, { userId: user.id, action: 'PACKAGING_ERROR_UPDATE', table: 'packaging_error', recordId: Number(e.id), changes });
    return Number(e.id);
  });
  return getError(sql, String(id));
}

export async function containError(sql: Sql, user: Actor, ref: string) {
  const id = await inTx(sql, async (tx) => {
    const e = await findError(tx, parseRef(ref, 'PE'), true);
    if (!e) throw notFound();
    if (e.status !== 'Open') throw conflict('INVALID_TRANSITION', `The error is ${e.status}; only Open errors can be contained.`, { status: e.status, allowed_from: ['Open'] });
    await tx`UPDATE packaging_error SET status = 'Contained' WHERE id = ${e.id}`;
    await audit(tx, { userId: user.id, action: 'PACKAGING_ERROR_CONTAIN', table: 'packaging_error', recordId: Number(e.id), changes: { status: ['Open', 'Contained'] } });
    return Number(e.id);
  });
  return getError(sql, String(id));
}

export async function closeError(sql: Sql, user: Actor, ref: string) {
  const id = await inTx(sql, async (tx) => {
    const e = await findError(tx, parseRef(ref, 'PE'), true);
    if (!e) throw notFound();
    if (e.status === 'Closed') throw conflict('ERROR_CLOSED', 'The error is already closed.');
    const missing: string[] = [];
    if (!e.root_cause_category) missing.push('root_cause');
    if (e.detected_stage === 'Before ship') {
      const [r] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM rework_event WHERE packaging_error_id = ${e.id} AND completed_at IS NOT NULL`;
      if (!r || r.n === 0) missing.push('completed_rework');
    }
    if (missing.length) throw conflict('CLOSE_PRECONDITION_FAILED', `Cannot close: ${missing.join(' and ').replace(/_/g, ' ')} required.`, { missing });
    await tx`UPDATE packaging_error SET status = 'Closed', closed_at = now() WHERE id = ${e.id}`;
    await audit(tx, { userId: user.id, action: 'PACKAGING_ERROR_CLOSE', table: 'packaging_error', recordId: Number(e.id), changes: { status: [e.status, 'Closed'] } });
    return Number(e.id);
  });
  return getError(sql, String(id));
}

// ----------------------------------------------------------------------------- rework
const REWORK_COLS = (q: Sql) => q`
  w.id::int AS id, e.id::int AS error_id, e.error_no, s.id::int AS shipment_id, s.shipment_no, w.action, w.started_at, w.completed_at, w.minutes,
  w.reverified_ok, w.created_at, u.id::int AS user_id, u.display_name`;
const shapeRework = (r: Row) => ({
  id: r.id, packaging_error: { id: r.error_id, error_no: r.error_no }, shipment: { id: r.shipment_id, shipment_no: r.shipment_no }, action: r.action,
  started_at: r.started_at, completed_at: r.completed_at ?? null, minutes: r.minutes ?? null, status: r.completed_at ? 'Completed' : 'In progress',
  performed_by: { id: r.user_id, display_name: r.display_name }, reverified_ok: r.reverified_ok ?? null, created_at: r.created_at,
});

export async function listRework(q: Sql, f: { packaging_error_id?: number; shipment_id?: number; status?: string; from?: string; to?: string; sortCol?: string; desc?: boolean; limit: number; offset: number }) {
  const where = q`WHERE true ${f.packaging_error_id ? q`AND w.packaging_error_id = ${f.packaging_error_id}` : q``} ${f.shipment_id ? q`AND w.shipment_id = ${f.shipment_id}` : q``}
    ${f.status === 'completed' ? q`AND w.completed_at IS NOT NULL` : f.status === 'in_progress' ? q`AND w.completed_at IS NULL` : q``}
    ${f.from ? q`AND w.completed_business_date >= ${f.from}::date` : q``} ${f.to ? q`AND w.completed_business_date <= ${f.to}::date` : q``}`;
  const rows = await q<Row[]>`SELECT ${REWORK_COLS(q)} FROM rework_event w JOIN packaging_error e ON e.id = w.packaging_error_id JOIN shipment s ON s.id = w.shipment_id
    JOIN app_user u ON u.id = w.performed_by ${where} ORDER BY ${q(f.sortCol ?? 'w.started_at')} ${f.desc === false ? q`ASC` : q`DESC`}, w.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM rework_event w ${where}`;
  return { data: rows.map(shapeRework), total: t?.n ?? 0 };
}

export async function createRework(sql: Sql, user: Actor, input: CreateReworkInput) {
  const wid = await inTx(sql, async (tx) => {
    const [e] = await (input.packaging_error_id !== undefined
      ? tx<Row[]>`SELECT * FROM packaging_error WHERE id = ${input.packaging_error_id} FOR UPDATE`
      : tx<Row[]>`SELECT * FROM packaging_error WHERE error_no = ${input.error_no!} FOR UPDATE`);
    if (!e) throw validation({ packaging_error_id: 'packaging error not found' });
    if (e.status === 'Closed') throw conflict('ERROR_CLOSED', 'Rework cannot be logged against a closed error.');
    const clock = await getBusinessClock(tx);
    const started = input.started_at ?? clock.now;
    const completed = input.completed_at ?? null;
    const limit = clock.now.getTime() + FIVE_MIN;
    const fields: Record<string, string> = {};
    if (started.getTime() > limit) fields.started_at = 'cannot be in the future';
    if (completed && completed.getTime() > limit) fields.completed_at = 'cannot be in the future';
    if (completed && completed.getTime() < started.getTime()) fields.completed_at = 'must be on or after the start time';
    if (Object.keys(fields).length) throw validation(fields);
    const [w] = await tx<Row[]>`INSERT INTO rework_event (packaging_error_id, shipment_id, action, started_at, completed_at, performed_by)
                                VALUES (${e.id}, ${e.shipment_id}, ${input.action}, ${started}, ${completed}, ${user.id}) RETURNING id::int AS id`;
    await audit(tx, { userId: user.id, action: 'REWORK_CREATE', table: 'rework_event', recordId: w.id, changes: { packaging_error_id: Number(e.id), action: input.action, completed: !!completed } });
    return w.id as number;
  });
  return getRework(sql, wid);
}

export async function getRework(q: Sql, id: number) {
  const [r] = await q<Row[]>`SELECT ${REWORK_COLS(q)} FROM rework_event w JOIN packaging_error e ON e.id = w.packaging_error_id JOIN shipment s ON s.id = w.shipment_id
    JOIN app_user u ON u.id = w.performed_by WHERE w.id = ${id}`;
  if (!r) throw notFound();
  return shapeRework(r);
}

export async function completeRework(sql: Sql, user: Actor, id: number, input: { completed_at?: Date | null }) {
  await inTx(sql, async (tx) => {
    const [w] = await tx<Row[]>`SELECT * FROM rework_event WHERE id = ${id} FOR UPDATE`;
    if (!w) throw notFound();
    if (w.completed_at) throw conflict('ALREADY_COMPLETED', 'This rework event is already completed.');
    const clock = await getBusinessClock(tx);
    const at = input.completed_at ?? clock.now;
    if (at.getTime() > clock.now.getTime() + FIVE_MIN) throw validation({ completed_at: 'cannot be in the future' });
    if (at.getTime() < (w.started_at as Date).getTime()) throw validation({ completed_at: 'must be on or after the start time' });
    await tx`UPDATE rework_event SET completed_at = ${at} WHERE id = ${id}`;
    await audit(tx, { userId: user.id, action: 'REWORK_COMPLETE', table: 'rework_event', recordId: id, changes: { completed_at: [null, at.toISOString()] } });
  });
  return getRework(sql, id);
}

// ----------------------------------------------------------------------------- corrective actions
const CA_COLS = (q: Sql) => q`
  c.id::int AS id, e.id::int AS error_id, e.error_no, c.action_description, c.status, c.due_date::text AS due_date, c.closed_at, c.created_at,
  u.id::int AS owner_id, u.display_name AS owner_name`;
export async function listCorrectiveActions(q: Sql, f: { status?: string; owner_id?: number; packaging_error_id?: number; overdue?: boolean; sortCol?: string; desc?: boolean; limit: number; offset: number }) {
  const clock = await getBusinessClock(q);
  const where = q`WHERE true ${f.status ? q`AND c.status = ${f.status}` : q``} ${f.owner_id ? q`AND c.owner_id = ${f.owner_id}` : q``}
    ${f.packaging_error_id ? q`AND c.packaging_error_id = ${f.packaging_error_id}` : q``}
    ${f.overdue ? q`AND c.status <> 'Closed' AND c.due_date < ${clock.today}::date` : q``}`;
  const rows = await q<Row[]>`SELECT ${CA_COLS(q)} FROM corrective_action c JOIN packaging_error e ON e.id = c.packaging_error_id JOIN app_user u ON u.id = c.owner_id
    ${where} ORDER BY ${q(f.sortCol ?? 'c.due_date')} ${f.desc ? q`DESC` : q`ASC`}, c.id ASC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM corrective_action c ${where}`;
  return {
    data: rows.map((r) => ({
      id: r.id, packaging_error: { id: r.error_id, error_no: r.error_no }, action_description: r.action_description, owner: { id: r.owner_id, display_name: r.owner_name },
      due_date: r.due_date, status: r.status, is_overdue: r.due_date < clock.today && r.status !== 'Closed', closed_at: r.closed_at ?? null, created_at: r.created_at,
    })),
    total: t?.n ?? 0,
  };
}

async function getCa(q: Sql, id: number) {
  const r = await q<Row[]>`SELECT c.id FROM corrective_action c WHERE c.id = ${id}`;
  if (!r[0]) throw notFound();
  const { data } = await listCorrectiveActions(q, { limit: 500, offset: 0 });
  return data.find((c) => c.id === id)!;
}

export async function createCorrectiveAction(sql: Sql, user: Actor, input: { packaging_error_id?: number; error_no?: string; action_description: string; owner_id: number; due_date: string }) {
  const id = await inTx(sql, async (tx) => {
    const [e] = await (input.packaging_error_id !== undefined
      ? tx<Row[]>`SELECT * FROM packaging_error WHERE id = ${input.packaging_error_id} FOR UPDATE`
      : tx<Row[]>`SELECT * FROM packaging_error WHERE error_no = ${input.error_no!} FOR UPDATE`);
    if (!e) throw validation({ packaging_error_id: 'packaging error not found' });
    if (e.status === 'Closed') throw conflict('ERROR_CLOSED', 'Corrective actions cannot be added to a closed error.');
    const [o] = await tx<Row[]>`SELECT id FROM app_user WHERE id = ${input.owner_id} AND active`;
    if (!o) throw inactive('owner_id', 'The owner');
    if (input.due_date < (e.detected_at as Date).toISOString().slice(0, 10)) throw validation({ due_date: 'must be on or after the detection date' });
    const [c] = await tx<Row[]>`INSERT INTO corrective_action (packaging_error_id, action_description, owner_id, due_date, created_by)
                                VALUES (${e.id}, ${input.action_description}, ${input.owner_id}, ${input.due_date}::date, ${user.id}) RETURNING id::int AS id`;
    await audit(tx, { userId: user.id, action: 'CORRECTIVE_ACTION_CREATE', table: 'corrective_action', recordId: c.id, changes: { packaging_error_id: Number(e.id), owner_id: input.owner_id, due_date: input.due_date } });
    return c.id as number;
  });
  return getCa(sql, id);
}

const CA_ORDER: Record<string, number> = { Open: 0, 'In Progress': 1, Closed: 2 };
export async function updateCorrectiveAction(sql: Sql, user: Actor, id: number, input: { action_description?: string; owner_id?: number; due_date?: string; status?: string }) {
  await inTx(sql, async (tx) => {
    const [c] = await tx<Row[]>`SELECT * FROM corrective_action WHERE id = ${id} FOR UPDATE`;
    if (!c) throw notFound();
    if (c.status === 'Closed') throw conflict('ACTION_CLOSED', 'A closed corrective action cannot be edited.');
    const fields: Record<string, string> = {};
    if (input.status && CA_ORDER[input.status] < CA_ORDER[c.status]) fields.status = 'can only move forward: Open, In Progress, Closed';
    if (input.owner_id !== undefined) {
      const [o] = await tx<Row[]>`SELECT id FROM app_user WHERE id = ${input.owner_id} AND active`;
      if (!o) throw inactive('owner_id', 'The owner');
    }
    if (input.due_date) {
      const [e] = await tx<Row[]>`SELECT detected_at FROM packaging_error WHERE id = ${c.packaging_error_id}`;
      if (input.due_date < (e.detected_at as Date).toISOString().slice(0, 10)) fields.due_date = 'must be on or after the detection date';
    }
    if (Object.keys(fields).length) throw validation(fields);
    const set: Row = { ...input };
    if (input.status === 'Closed') set.closed_at = new Date();
    const changes = diffFields({ ...c, due_date: asDate(c.due_date) }, set);
    if (Object.keys(changes).length === 0) return;
    await tx`UPDATE corrective_action SET ${tx(set, ...Object.keys(set))} WHERE id = ${id}`;
    await audit(tx, { userId: user.id, action: 'CORRECTIVE_ACTION_UPDATE', table: 'corrective_action', recordId: id, changes });
  });
  return getCa(sql, id);
}

export { HttpError };
