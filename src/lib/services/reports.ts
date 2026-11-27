// Reports R1, R3, R4, R7 and CSV export with the formula-injection guard (contract section 10, 1.10).
import type { Sql } from '../db';
import { getBusinessClock, addDays, realNow } from '../clock';
import { HttpError, notFound } from '../http/errors';
import { daysLate, isOnTime } from '../kpi/pure';
import { loadBasis } from '../repos/shipments';
import { dateParam, intParam, listParam, boolParam, pagination, parseQuery } from '../validation/common';
import { lotTrace, normalizeLot } from './inventory';
import { CATEGORIES, SEVERITIES, STAGES } from '../validation/quality';
import { SHIPMENT_STATUSES } from '../validation/shipments';

type Row = Record<string, any>;
export const MAX_EXPORT_ROWS = 20_000;
export const REPORT_IDS = ['R1', 'R3', 'R4', 'R7'] as const;

interface Col { key: string; label: string; type: 'text' | 'number' | 'date' | 'timestamp' }
const text = (key: string, label: string): Col => ({ key, label, type: 'text' });
const numc = (key: string, label: string): Col => ({ key, label, type: 'number' });
const datec = (key: string, label: string): Col => ({ key, label, type: 'date' });

export interface ReportResult {
  data: Row[]; columns: Col[]; totals: Row | null; report: { id: string; name: string }; period: { from: string; to: string } | null;
  generated_at: string; page: number; page_size: number; total: number; allRows: Row[];
}

const KNOWN = ['format', 'page', 'page_size', 'from', 'to', 'customer_id', 'carrier_id', 'status', 'include_cancelled', 'late_only', 'category', 'severity', 'detected_stage',
  'part_id', 'location_id', 'lot_number', 'include_zero'];

async function period(q: Sql, p: Record<string, string>): Promise<{ from: string; to: string }> {
  const clock = await getBusinessClock(q);
  const from = dateParam(p, 'from');
  const to = dateParam(p, 'to');
  const t = to ?? clock.today;
  const f = from ?? addDays(t, -29);
  if (f > t) throw new HttpError(422, 'VALIDATION_ERROR', 'The period is invalid.', { fields: { from: 'must be on or before the end date' } });
  return { from: f, to: t };
}

export async function runReport(q: Sql, id: string, url: URL): Promise<ReportResult> {
  const rid = id.toUpperCase();
  if (!(REPORT_IDS as readonly string[]).includes(rid)) throw notFound();
  const p = parseQuery(url, KNOWN);
  const csv = p.format === 'csv';
  if (p.format !== undefined && p.format !== 'csv' && p.format !== 'json') throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid format.', { fields: { format: 'must be csv or json' } });
  const pg = pagination(p);
  let out: { rows: Row[]; columns: Col[]; totals: Row | null; name: string; period: { from: string; to: string } | null };

  if (rid === 'R1') {
    const per = await period(q, p);
    const b = await loadBasis(q);
    const st = listParam(p, 'status', SHIPMENT_STATUSES);
    const cust = intParam(p, 'customer_id');
    const car = intParam(p, 'carrier_id');
    const incCancel = boolParam(p, 'include_cancelled') ?? false;
    const lateOnly = boolParam(p, 'late_only') ?? false;
    const rows = await q<Row[]>`
      SELECT s.shipment_no, c.name AS customer, s.customer_po, s.promise_date::text AS promise_date, s.requested_date::text AS requested_date, s.ship_date::text AS ship_date,
             ca.name AS carrier, s.tracking_number, s.status
        FROM shipment s JOIN customer c ON c.id = s.customer_id LEFT JOIN carrier ca ON ca.id = s.carrier_id
       WHERE ((s.ship_date BETWEEN ${per.from}::date AND ${per.to}::date)
              ${incCancel ? q`OR (s.status = 'Cancelled' AND s.promise_date BETWEEN ${per.from}::date AND ${per.to}::date)` : q``})
         ${incCancel ? q`` : q`AND s.status <> 'Cancelled'`}
         ${st ? q`AND s.status IN ${q(st)}` : q``} ${cust ? q`AND s.customer_id = ${cust}` : q``} ${car ? q`AND s.carrier_id = ${car}` : q``}
       ORDER BY s.ship_date DESC NULLS LAST, s.shipment_no`;
    let data = rows.map((r) => {
      const shipped = r.status === 'Shipped' && r.ship_date;
      const basis = b.basis === 'requested' ? r.requested_date : r.promise_date;
      return {
        shipment_no: r.shipment_no, customer: r.customer, customer_po: r.customer_po, promise_date: r.promise_date, ship_date: r.ship_date ?? null, carrier: r.carrier ?? null,
        tracking_number: r.tracking_number ?? null, status: r.status,
        on_time: shipped ? (isOnTime(r.ship_date, basis, b.tolerance) ? 'On time' : 'Late') : null, days_late: shipped ? Math.max(0, daysLate(r.ship_date, basis)) : null,
      };
    });
    if (lateOnly) data = data.filter((r) => r.on_time === 'Late');
    out = {
      rows: data, totals: { row_count: data.length }, name: 'Shipment Log', period: per,
      columns: [text('shipment_no', 'Shipment'), text('customer', 'Customer'), text('customer_po', 'Customer PO'), datec('promise_date', 'Promise date'), datec('ship_date', 'Ship date'),
        text('carrier', 'Carrier'), text('tracking_number', 'Tracking number'), text('status', 'Status'), text('on_time', 'On time'), numc('days_late', 'Days late')],
    };
  } else if (rid === 'R3') {
    const per = await period(q, p);
    const cat = listParam(p, 'category', CATEGORIES);
    const sev = listParam(p, 'severity', SEVERITIES);
    const stg = listParam(p, 'detected_stage', STAGES);
    const st = listParam(p, 'status', ['Open', 'Contained', 'Closed']);
    const rows = await q<Row[]>`
      SELECT e.error_no, s.shipment_no, e.category, e.severity, e.detected_stage, e.packaging_related, e.root_cause_category,
             (SELECT sum(w.minutes)::int FROM rework_event w WHERE w.packaging_error_id = e.id AND w.completed_at IS NOT NULL) AS rework_minutes,
             (SELECT CASE WHEN bool_or(c.status = 'Open') THEN 'Open' WHEN bool_or(c.status = 'In Progress') THEN 'In Progress' ELSE 'Closed' END
                FROM corrective_action c WHERE c.packaging_error_id = e.id) AS corrective_action_status
        FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id
       WHERE (e.detected_at AT TIME ZONE 'UTC')::date BETWEEN ${per.from}::date AND ${per.to}::date
         ${cat ? q`AND e.category IN ${q(cat)}` : q``} ${sev ? q`AND e.severity IN ${q(sev)}` : q``} ${stg ? q`AND e.detected_stage IN ${q(stg)}` : q``} ${st ? q`AND e.status IN ${q(st)}` : q``}
       ORDER BY e.detected_at DESC, e.error_no`;
    const data = rows.map((r) => ({ ...r, root_cause_category: r.root_cause_category ?? null, rework_minutes: r.rework_minutes ?? null, corrective_action_status: r.corrective_action_status ?? null }));
    out = {
      rows: data, name: 'Packaging Error and Rework Log', period: per,
      totals: { error_count: data.length, total_rework_minutes: data.reduce((a, r) => a + (r.rework_minutes ?? 0), 0) },
      columns: [text('error_no', 'Error'), text('shipment_no', 'Shipment'), text('category', 'Category'), text('severity', 'Severity'), text('detected_stage', 'Detected stage'),
        text('packaging_related', 'Packaging related'), text('root_cause_category', 'Root cause category'), numc('rework_minutes', 'Rework minutes'), text('corrective_action_status', 'Corrective action')],
    };
  } else if (rid === 'R4') {
    const part = intParam(p, 'part_id');
    const loc = intParam(p, 'location_id');
    const lot = p.lot_number ? normalizeLot(p.lot_number) : undefined;
    const incZero = boolParam(p, 'include_zero') ?? false;
    const base = incZero
      ? q`(SELECT part_id, location_id, lot_number, SUM(qty_change)::int AS qty_on_hand FROM inventory_transaction GROUP BY part_id, location_id, lot_number)`
      : q`v_on_hand`;
    const rows = await q<Row[]>`
      SELECT p.part_number, p.revision, p.description, p.abc_class, l.code AS location, l.type AS location_type, oh.lot_number, oh.qty_on_hand
        FROM ${base} oh JOIN part p ON p.id = oh.part_id JOIN location l ON l.id = oh.location_id
       WHERE true ${part ? q`AND oh.part_id = ${part}` : q``} ${loc ? q`AND oh.location_id = ${loc}` : q``} ${lot ? q`AND oh.lot_number = ${lot}` : q``}
       ORDER BY p.part_number, l.code, oh.lot_number`;
    out = {
      rows, totals: { row_count: rows.length }, name: 'Inventory On-Hand', period: null,
      columns: [text('part_number', 'Part number'), text('revision', 'Revision'), text('description', 'Description'), text('abc_class', 'ABC class'), text('location', 'Location'),
        text('location_type', 'Location type'), text('lot_number', 'Lot'), numc('qty_on_hand', 'Quantity on hand')],
    };
  } else {
    if (!p.lot_number) throw new HttpError(422, 'VALIDATION_ERROR', 'A lot number is required.', { fields: { lot_number: 'is required' } });
    const t = await lotTrace(q, p.lot_number);
    const rows: Row[] = [];
    for (const r of t.backward) rows.push({ section: 'RECEIPT', date: r.arrived_at.toISOString(), document: r.receipt_no, party: r.supplier.name, part_number: r.part.part_number, location: null, txn_type: 'RECEIPT', qty: r.qty_received, carrier: null, tracking_number: null });
    for (const m of t.movements) rows.push({ section: 'MOVEMENT', date: m.txn_at.toISOString(), document: null, party: null, part_number: null, location: m.location.code, txn_type: m.txn_type, qty: m.qty_change, carrier: null, tracking_number: null });
    for (const f of t.forward) rows.push({ section: 'SHIPMENT', date: f.ship_date, document: f.shipment_no, party: f.customer.name, part_number: null, location: null, txn_type: 'SHIP', qty: f.qty_shipped, carrier: f.carrier?.name ?? null, tracking_number: f.tracking_number });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    out = {
      rows, name: 'Lot Trace', period: null,
      totals: { received_total: t.summary.received_total, shipped_total: t.summary.shipped_total, on_hand_total: t.summary.on_hand_total },
      columns: [text('section', 'Section'), text('date', 'Date'), text('document', 'Document'), text('party', 'Party'), text('part_number', 'Part number'), text('location', 'Location'),
        text('txn_type', 'Transaction'), numc('qty', 'Quantity'), text('carrier', 'Carrier'), text('tracking_number', 'Tracking number')],
    };
  }
  if (csv && out.rows.length > MAX_EXPORT_ROWS) throw new HttpError(422, 'EXPORT_TOO_LARGE', 'The export has more than 20,000 rows. Narrow the filters.');
  return {
    data: csv ? out.rows : out.rows.slice(pg.offset, pg.offset + pg.pageSize), columns: out.columns, totals: out.totals, report: { id: rid, name: out.name }, period: out.period,
    generated_at: realNow().toISOString(), page: pg.page, page_size: pg.pageSize, total: out.rows.length, allRows: out.rows,
  };
}

// ----------------------------------------------------------------------------- CSV
/** Prefixes a single quote to text cells that start with = + - @ TAB or CR (after leading spaces). Numbers are never prefixed. */
export function guardCell(v: unknown, type: Col['type']): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (type === 'text' && /^ *[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}
export function csvQuote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const NONE_COLS = new Set(['rework_minutes', 'corrective_action_status']);
export function toCsv(columns: Col[], rows: Row[]): string {
  const lines = [columns.map((c) => csvQuote(guardCell(c.label, 'text'))).join(',')];
  for (const r of rows) {
    lines.push(columns.map((c) => {
      const v = r[c.key];
      if ((v === null || v === undefined) && NONE_COLS.has(c.key)) return 'None';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return csvQuote(guardCell(v, c.type));
    }).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function csvFileName(id: string, name: string, today: string): string {
  return `${id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${today}.csv`;
}
