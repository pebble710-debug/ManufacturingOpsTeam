// Shipment read models (contract section 5: ShipmentSummary, ShipmentDetail). Tagged templates only.
import type { Sql } from '../db';
import { daysLate, isOnTime } from '../kpi/pure';
import { allowedShipmentActions, type ShipmentStatus } from '../services/rules';
import type { Actor, Ref } from '../services/common';
import { settingsMap } from '../services/common';
import { getBusinessClock } from '../clock';
import type { Role } from '../auth/permissions';

interface Row { [k: string]: any }

const SUMMARY = (q: Sql) => q`
  s.id::int AS id, s.shipment_no, s.customer_po, s.status, s.promise_date::text AS promise_date, s.requested_date::text AS requested_date,
  s.ship_date::text AS ship_date, s.hold_owner_dept, s.order_date::text AS order_date,
  c.id::int AS customer_id, c.code AS customer_code, c.name AS customer_name,
  ca.id::int AS carrier_id, ca.name AS carrier_name, hr.id::int AS hold_reason_id, hr.label AS hold_reason_label`;
const FROM = (q: Sql) => q`
  FROM shipment s JOIN customer c ON c.id = s.customer_id
  LEFT JOIN carrier ca ON ca.id = s.carrier_id LEFT JOIN reason_code hr ON hr.id = s.hold_reason_id`;

export interface Basis { basis: 'promise' | 'requested'; tolerance: number; today: string }

export async function loadBasis(q: Sql): Promise<Basis> {
  const m = await settingsMap(q);
  const clock = await getBusinessClock(q);
  return { basis: m.on_time_basis === 'requested' ? 'requested' : 'promise', tolerance: Number(m.on_time_tolerance_days ?? 0), today: clock.today };
}

export function toSummary(r: Row, b: Basis) {
  const shipped = r.status === 'Shipped' && r.ship_date;
  const basisDate = b.basis === 'requested' ? r.requested_date : r.promise_date;
  return {
    id: r.id,
    shipment_no: r.shipment_no,
    customer: { id: r.customer_id, code: r.customer_code, name: r.customer_name },
    customer_po: r.customer_po,
    promise_date: r.promise_date,
    requested_date: r.requested_date,
    ship_date: r.ship_date ?? null,
    status: r.status,
    carrier: r.carrier_id ? { id: r.carrier_id, name: r.carrier_name } : null,
    hold_reason: r.hold_reason_id ? { id: r.hold_reason_id, label: r.hold_reason_label } : null,
    hold_owner_dept: r.hold_owner_dept ?? null,
    is_overdue: r.promise_date < b.today && r.status !== 'Shipped' && r.status !== 'Cancelled',
    on_time_indicator: shipped ? (isOnTime(r.ship_date, basisDate, b.tolerance) ? 'On time' : 'Late') : null,
    days_late: shipped ? Math.max(0, daysLate(r.ship_date, basisDate)) : null,
  };
}

export interface ShipmentListFilter {
  status?: string[]; customer_id?: number; carrier_id?: number; q?: string; date_field: string; from?: string; to?: string;
  late?: boolean; overdue?: boolean; has_error?: boolean; sortCol: string; desc: boolean; limit: number; offset: number;
}

export async function listShipments(q: Sql, f: ShipmentListFilter) {
  const b = await loadBasis(q);
  const dateCol = q(`s.${f.date_field}`);
  const like = f.q ? `%${f.q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const where = q`WHERE true
    ${f.status ? q`AND s.status IN ${q(f.status)}` : q``}
    ${f.customer_id ? q`AND s.customer_id = ${f.customer_id}` : q``}
    ${f.carrier_id ? q`AND s.carrier_id = ${f.carrier_id}` : q``}
    ${like ? q`AND (s.shipment_no ILIKE ${like} OR s.customer_po ILIKE ${like} OR s.tracking_number ILIKE ${like})` : q``}
    ${f.from ? q`AND ${dateCol} >= ${f.from}::date` : q``}
    ${f.to ? q`AND ${dateCol} <= ${f.to}::date` : q``}
    ${f.late ? q`AND s.status = 'Shipped' AND (s.ship_date - ${b.basis === 'requested' ? q`s.requested_date` : q`s.promise_date`}) > ${b.tolerance}` : q``}
    ${f.overdue ? q`AND s.promise_date < ${b.today}::date AND s.status NOT IN ('Shipped','Cancelled')` : q``}
    ${f.has_error ? q`AND EXISTS (SELECT 1 FROM packaging_error e WHERE e.shipment_id = s.id)` : q``}`;
  const order = q`ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, s.id ASC`;
  const rows = await q<Row[]>`SELECT ${SUMMARY(q)} ${FROM(q)} ${where} ${order} LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n ${FROM(q)} ${where}`;
  return { data: rows.map((r) => toSummary(r, b)), total: t?.n ?? 0 };
}

/** Finds a shipment id by id or business key. Optionally locks the row. */
export async function findShipment(q: Sql, ref: Ref, forUpdate = false): Promise<Row | undefined> {
  const rows = await (forUpdate
    ? 'id' in ref
      ? q<Row[]>`SELECT * FROM shipment WHERE id = ${ref.id} FOR UPDATE`
      : q<Row[]>`SELECT * FROM shipment WHERE shipment_no = ${ref.no} FOR UPDATE`
    : 'id' in ref
      ? q<Row[]>`SELECT * FROM shipment WHERE id = ${ref.id}`
      : q<Row[]>`SELECT * FROM shipment WHERE shipment_no = ${ref.no}`);
  return rows[0];
}

export async function getShipmentDetail(q: Sql, shipmentId: number, user: { id: number; role: Role }) {
  const b = await loadBasis(q);
  const [r] = await q<Row[]>`
    SELECT ${SUMMARY(q)}, s.service_level, s.tracking_number, s.packages_count, s.total_weight_lb::float8 AS total_weight_lb,
           s.doc_packing_slip, s.doc_bol, s.doc_coc, s.doc_labels, s.notes, s.rework_origin, s.held_from_status, s.rework_episode,
           s.verified_at, s.shipped_at, s.created_at, s.updated_at, s.created_by::int AS created_by,
           s.packed_by::int AS packed_by, s.verified_by::int AS verified_by,
           lr.id::int AS late_reason_id, lr.label AS late_reason_label, pu.display_name AS packer_name, vu.display_name AS verifier_name
    ${FROM(q)}
    LEFT JOIN reason_code lr ON lr.id = s.late_reason_id
    LEFT JOIN app_user pu ON pu.id = s.packed_by LEFT JOIN app_user vu ON vu.id = s.verified_by
    WHERE s.id = ${shipmentId}`;
  if (!r) return null;
  const lines = await q<Row[]>`
    SELECT l.id::int AS id, l.line_no, l.qty_ordered, l.qty_shipped, l.lot_number, l.short_note,
           p.id::int AS part_id, p.part_number, p.revision, p.description, p.requires_coc, p.packaging_instruction_ref,
           loc.id::int AS location_id, loc.code AS location_code, loc.type AS location_type
      FROM shipment_line l JOIN part p ON p.id = l.part_id LEFT JOIN location loc ON loc.id = l.location_id
     WHERE l.shipment_id = ${shipmentId} ORDER BY l.line_no`;
  const history = await q<Row[]>`
    SELECT h.id::int AS id, h.from_status, h.to_status, h.changed_at, h.business_date::text AS business_date, h.note,
           u.id::int AS user_id, u.display_name FROM shipment_status_history h JOIN app_user u ON u.id = h.changed_by
     WHERE h.shipment_id = ${shipmentId} ORDER BY h.changed_at, h.id`;
  const verifs = await q<Row[]>`
    SELECT v.attempt_no, v.result, v.checklist, v.failed_items, v.note, v.verified_at, v.business_date::text AS business_date,
           vu.id::int AS verifier_id, vu.display_name AS verifier_name, pu.id::int AS packer_id, pu.display_name AS packer_name
      FROM shipment_verification v JOIN app_user vu ON vu.id = v.verified_by JOIN app_user pu ON pu.id = v.packer_id
     WHERE v.shipment_id = ${shipmentId} ORDER BY v.attempt_no`;
  const errors = await q<Row[]>`
    SELECT e.id::int AS id, e.error_no, e.category, e.severity, e.status, e.detected_stage, e.detected_at, e.packaging_related
      FROM packaging_error e WHERE e.shipment_id = ${shipmentId} ORDER BY e.id`;
  const rework = await q<Row[]>`
    SELECT w.id::int AS id, e.error_no, w.action, w.started_at, w.completed_at, w.minutes, w.reverified_ok
      FROM rework_event w JOIN packaging_error e ON e.id = w.packaging_error_id WHERE w.shipment_id = ${shipmentId} ORDER BY w.id`;
  const cas = await q<Row[]>`
    SELECT ca.id::int AS id, e.error_no, ca.action_description, ca.status, ca.due_date::text AS due_date
      FROM corrective_action ca JOIN packaging_error e ON e.id = ca.packaging_error_id WHERE e.shipment_id = ${shipmentId} ORDER BY ca.id`;
  const corrections = await q<Row[]>`
    SELECT a.at, a.changes, u.id::int AS user_id, u.display_name FROM audit_log a LEFT JOIN app_user u ON u.id = a.user_id
     WHERE a.action = 'SHIPMENT_CORRECT' AND a.table_name = 'shipment' AND a.record_id = ${String(shipmentId)} ORDER BY a.at, a.id`;
  const summary = toSummary(r, b);
  return {
    ...summary,
    order_date: r.order_date,
    tracking_number: r.tracking_number ?? null,
    service_level: r.service_level ?? null,
    packages_count: r.packages_count ?? null,
    total_weight_lb: r.total_weight_lb ?? null,
    late_reason: r.late_reason_id ? { id: r.late_reason_id, label: r.late_reason_label } : null,
    doc_packing_slip: r.doc_packing_slip,
    doc_bol: r.doc_bol,
    doc_coc: r.doc_coc,
    doc_labels: r.doc_labels,
    packed_by: r.packed_by ? { id: r.packed_by, display_name: r.packer_name } : null,
    verified_by: r.verified_by ? { id: r.verified_by, display_name: r.verifier_name } : null,
    verified_at: r.verified_at ?? null,
    shipped_at: r.shipped_at ?? null,
    rework_origin: r.rework_origin ?? null,
    held_from_status: r.held_from_status ?? null,
    notes: r.notes ?? '',
    created_at: r.created_at,
    created_by: r.created_by,
    updated_at: r.updated_at,
    lines: lines.map((l) => ({
      id: l.id, line_no: l.line_no,
      part: { id: l.part_id, part_number: l.part_number, revision: l.revision, description: l.description, requires_coc: l.requires_coc, packaging_instruction_ref: l.packaging_instruction_ref ?? null },
      qty_ordered: l.qty_ordered, qty_shipped: l.qty_shipped ?? null, lot_number: l.lot_number ?? null,
      location: l.location_id ? { id: l.location_id, code: l.location_code, type: l.location_type } : null,
      short_note: l.short_note ?? null,
    })),
    status_history: history.map((h) => ({ id: h.id, from_status: h.from_status ?? null, to_status: h.to_status, changed_at: h.changed_at, business_date: h.business_date, changed_by: { id: h.user_id, display_name: h.display_name }, note: h.note ?? null })),
    verifications: verifs.map((v) => ({
      attempt_no: v.attempt_no, result: v.result, verified_by: { id: v.verifier_id, display_name: v.verifier_name },
      packer: { id: v.packer_id, display_name: v.packer_name }, verified_at: v.verified_at, business_date: v.business_date,
      checklist: v.checklist, failed_items: v.failed_items, note: v.note ?? null,
    })),
    packaging_errors: errors.map((e) => ({ id: e.id, error_no: e.error_no, category: e.category, severity: e.severity, status: e.status, detected_stage: e.detected_stage, detected_at: e.detected_at, packaging_related: e.packaging_related })),
    rework_events: rework.map((w) => ({ id: w.id, error_no: w.error_no, action: w.action, started_at: w.started_at, completed_at: w.completed_at ?? null, minutes: w.minutes ?? null, status: w.completed_at ? 'Completed' : 'In progress', reverified_ok: w.reverified_ok ?? null })),
    corrective_actions: cas.map((c) => ({ id: c.id, error_no: c.error_no, action_description: c.action_description, status: c.status, due_date: c.due_date })),
    corrections: corrections.map((c) => {
      const ch = (c.changes ?? {}) as Record<string, unknown>;
      const { reason, lines: ln, ...fields } = ch as { reason?: string; lines?: unknown[] };
      return { at: c.at, by: { id: c.user_id, display_name: c.display_name }, reason: reason ?? '', changes: fields, lines: ln ?? [] };
    }),
    allowed_actions: allowedShipmentActions(user, { status: r.status as ShipmentStatus, packed_by: r.packed_by ?? null }),
  };
}

export type { Actor };
