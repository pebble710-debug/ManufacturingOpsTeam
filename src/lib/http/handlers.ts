// JSON API handlers keyed by route id (src/lib/auth/routes.ts). Pure glue: parse -> Zod -> service -> response.
import type { Sql } from '../db';
import type { SessionContext } from '../auth/session';
import { sessionCookieName, sessionCookieOptions } from '../auth/session';
import { login } from '../auth/login';
import { realNow } from '../clock';
import { HttpError, validation } from './errors';
import { json } from './respond';
import { readJsonObject } from './pipeline';
import {
  boolParam, dateParam, emptyBody, intParam, listParam, pagination, parseInput, parseQuery, sortParam, z, zStr,
} from '../validation/common';
import * as S from '../validation/shipments';
import * as Q from '../validation/quality';
import * as V from '../validation/inventory';
import * as shipments from '../services/shipments';
import * as quality from '../services/quality';
import * as inventory from '../services/inventory';
import * as counts from '../services/cycle-counts';
import * as lookups from '../services/lookups';
import * as admin from '../services/admin';
import * as reports from '../services/reports';
import { logoutSession, meResponse } from '../services/auth';
import { listShipments, getShipmentDetail, findShipment } from '../repos/shipments';
import { parseRef, type Actor } from '../services/common';
import { getBusinessClock } from '../clock';

export interface ApiCtx {
  sql: Sql;
  request: Request;
  url: URL;
  params: Record<string, string>;
  session: SessionContext | null;
  user: Actor | null;
  cookies: { set(n: string, v: string, o?: any): void; delete(n: string, o?: any): void };
  clientIp: string;
  sessionToken: string | null;
  requestId: string;
}
type H = (c: ApiCtx) => Promise<Response>;

const body = (c: ApiCtx) => readJsonObject(c.request);
const actor = (c: ApiCtx): Actor => c.user!;
const page = <T>(r: { data: T[]; total: number }, p: { page: number; pageSize: number }) => json(200, { data: r.data, page: p.page, page_size: p.pageSize, total: r.total });
const FIVE_PARAMS = ['page', 'page_size', 'sort'];

async function shipmentId(c: ApiCtx, ref: string): Promise<number> {
  const s = await findShipment(c.sql, parseRef(ref, 'SH'));
  if (!s) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  return Number(s.id);
}

const detail = async (c: ApiCtx, id: number) => {
  const d = await getShipmentDetail(c.sql, id, actor(c));
  if (!d) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  return d;
};

function clearCookie(c: ApiCtx) {
  c.cookies.delete(sessionCookieName(), { path: '/' });
}

const loginBody = z.object({ username: zStr(1, 64), password: z.string({ error: 'is required' }).min(1, { error: 'is required' }).max(200, { error: 'is too long' }) }).strict();

export const HANDLERS: Record<string, H> = {
  'E-02': async (c) => {
    const input = parseInput(loginBody, await body(c));
    const now = realNow();
    const r = await login(c.sql, { username: input.username, password: input.password, clientIp: c.clientIp, presentedToken: c.sessionToken }, now);
    c.cookies.set(sessionCookieName(), r.token, sessionCookieOptions(r.expiresAt, now));
    return json(200, { data: { user: r.user, csrf_token: r.csrfToken, session: { expires_at: r.expiresAt.toISOString(), idle_expires_at: r.idleExpiresAt.toISOString() } } });
  },
  'E-03': async (c) => {
    parseInput(emptyBody, await body(c));
    await logoutSession(c.sql, actor(c).id, c.sessionToken);
    clearCookie(c);
    return json(204, null);
  },
  'E-04': async (c) => json(200, { data: await meResponse(c.sql, c.session!) }),

  // ---- shipments ----
  'E-05': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'status', 'customer_id', 'carrier_id', 'q', 'date_field', 'from', 'to', 'late', 'overdue', 'has_error']);
    const pg = pagination(p);
    const sort = sortParam(p, { shipment_no: 's.shipment_no', customer: 'c.name', promise_date: 's.promise_date', ship_date: 's.ship_date', status: 's.status', order_date: 's.order_date' }, '-promise_date');
    const dateField = p.date_field ?? 'promise_date';
    if (!['order_date', 'requested_date', 'promise_date', 'ship_date'].includes(dateField)) throw validation({ date_field: 'must be order_date, requested_date, promise_date or ship_date' });
    const from = dateParam(p, 'from');
    const to = dateParam(p, 'to');
    if (from && to && from > to) throw validation({ from: 'must be on or before the end date' });
    if (p.q !== undefined && p.q.length < 2) throw validation({ q: 'must be at least 2 characters' });
    const r = await listShipments(c.sql, {
      status: listParam(p, 'status', S.SHIPMENT_STATUSES), customer_id: intParam(p, 'customer_id'), carrier_id: intParam(p, 'carrier_id'), q: p.q, date_field: dateField, from, to,
      late: boolParam(p, 'late'), overdue: boolParam(p, 'overdue'), has_error: boolParam(p, 'has_error'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset,
    });
    return page(r, pg);
  },
  'E-06': async (c) => {
    const d = await shipments.createShipment(c.sql, actor(c), parseInput(S.createShipmentSchema, await body(c)));
    return json(201, { data: d }, { Location: `/api/v1/shipments/${d!.id}` });
  },
  'E-07': async (c) => json(200, { data: await detail(c, await shipmentId(c, c.params.id)) }),
  'E-08': async (c) => json(200, { data: await shipments.updateShipment(c.sql, actor(c), c.params.id, parseInput(S.updateShipmentSchema, await body(c))) }),
  'E-09': async (c) => json(200, { data: await shipments.markReady(c.sql, actor(c), c.params.id, parseInput(S.noteOnly, await body(c))) }),
  'E-10': async (c) => json(200, { data: await shipments.startPacking(c.sql, actor(c), c.params.id, parseInput(S.noteOnly, await body(c))) }),
  'E-11': async (c) => json(200, { data: await shipments.verifyShipment(c.sql, actor(c), c.params.id, parseInput(S.verifySchema, await body(c))) }),
  'E-12': async (c) => json(200, { data: await shipments.shipShipment(c.sql, actor(c), c.params.id, parseInput(S.shipSchema, await body(c))) }),
  'E-13': async (c) => json(200, { data: await shipments.holdShipment(c.sql, actor(c), c.params.id, parseInput(S.holdSchema, await body(c))) }),
  'E-14': async (c) => json(200, { data: await shipments.releaseShipment(c.sql, actor(c), c.params.id, parseInput(S.noteOnly, await body(c))) }),
  'E-15': async (c) => json(200, { data: await shipments.cancelShipment(c.sql, actor(c), c.params.id, parseInput(S.cancelSchema, await body(c))) }),
  'E-16': async (c) => json(200, { data: await shipments.reopenShipment(c.sql, actor(c), c.params.id, parseInput(S.noteOnly, await body(c))) }),
  'E-53': async (c) => json(200, { data: await shipments.correctShipment(c.sql, actor(c), c.params.id, S.parseCorrection(await body(c))) }),

  // ---- quality ----
  'E-17': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'status', 'category', 'severity', 'detected_stage', 'shipment_id', 'shipment_no', 'from', 'to', 'overdue', 'needs_recategorisation']);
    const pg = pagination(p);
    const sort = sortParam(p, { error_no: 'e.error_no', detected_at: 'e.detected_at', severity: 'e.severity', status: 'e.status' }, '-detected_at');
    return page(await quality.listErrors(c.sql, {
      status: listParam(p, 'status', ['Open', 'Contained', 'Closed']), category: listParam(p, 'category', Q.CATEGORIES), severity: listParam(p, 'severity', Q.SEVERITIES),
      detected_stage: listParam(p, 'detected_stage', Q.STAGES), shipment_id: intParam(p, 'shipment_id'), shipment_no: p.shipment_no, from: dateParam(p, 'from'), to: dateParam(p, 'to'),
      overdue: boolParam(p, 'overdue'), needs_recategorisation: boolParam(p, 'needs_recategorisation'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset,
    }), pg);
  },
  'E-18': async (c) => {
    const e = await quality.createError(c.sql, actor(c), parseInput(Q.createErrorSchema, await body(c)));
    return json(201, { data: e }, { Location: `/api/v1/packaging-errors/${e.id}` });
  },
  'E-19': async (c) => json(200, { data: await quality.getError(c.sql, c.params.id) }),
  'E-20': async (c) => json(200, { data: await quality.updateError(c.sql, actor(c), c.params.id, parseInput(Q.updateErrorSchema, await body(c))) }),
  'E-21': async (c) => {
    parseInput(emptyBody, await body(c));
    return json(200, { data: await quality.containError(c.sql, actor(c), c.params.id) });
  },
  'E-22': async (c) => {
    parseInput(emptyBody, await body(c));
    return json(200, { data: await quality.closeError(c.sql, actor(c), c.params.id) });
  },
  'E-23': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'packaging_error_id', 'shipment_id', 'status', 'from', 'to']);
    const pg = pagination(p);
    const sort = sortParam(p, { started_at: 'w.started_at', completed_at: 'w.completed_at', minutes: 'w.minutes' }, '-started_at');
    if (p.status && !['in_progress', 'completed'].includes(p.status)) throw validation({ status: 'must be in_progress or completed' });
    return page(await quality.listRework(c.sql, { packaging_error_id: intParam(p, 'packaging_error_id'), shipment_id: intParam(p, 'shipment_id'), status: p.status, from: dateParam(p, 'from'), to: dateParam(p, 'to'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset }), pg);
  },
  'E-24': async (c) => {
    const w = await quality.createRework(c.sql, actor(c), parseInput(Q.createReworkSchema, await body(c)));
    return json(201, { data: w }, { Location: `/api/v1/rework-events/${w.id}` });
  },
  'E-25': async (c) => json(200, { data: await quality.completeRework(c.sql, actor(c), idParam(c.params.id), parseInput(Q.completeReworkSchema, await body(c))) }),
  'E-26': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'status', 'owner_id', 'packaging_error_id', 'overdue']);
    const pg = pagination(p);
    const sort = sortParam(p, { due_date: 'c.due_date', status: 'c.status', id: 'c.id' }, 'due_date');
    return page(await quality.listCorrectiveActions(c.sql, { status: p.status, owner_id: intParam(p, 'owner_id'), packaging_error_id: intParam(p, 'packaging_error_id'), overdue: boolParam(p, 'overdue'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset }), pg);
  },
  'E-27': async (c) => {
    const ca = await quality.createCorrectiveAction(c.sql, actor(c), parseInput(Q.createCaSchema, await body(c)));
    return json(201, { data: ca }, { Location: `/api/v1/corrective-actions/${ca.id}` });
  },
  'E-28': async (c) => json(200, { data: await quality.updateCorrectiveAction(c.sql, actor(c), idParam(c.params.id), parseInput(Q.updateCaSchema, await body(c))) }),

  // ---- inventory ----
  'E-29': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'supplier_id', 'part_id', 'lot_number', 'inspection_status', 'from', 'to']);
    const pg = pagination(p);
    const sort = sortParam(p, { receipt_no: 'r.receipt_no', arrived_at: 'r.arrived_at' }, '-arrived_at');
    return page(await inventory.listReceipts(c.sql, { supplier_id: intParam(p, 'supplier_id'), part_id: intParam(p, 'part_id'), lot_number: p.lot_number?.toUpperCase(), inspection_status: p.inspection_status, from: dateParam(p, 'from'), to: dateParam(p, 'to'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset }), pg);
  },
  'E-30': async (c) => {
    const r = await inventory.createReceipt(c.sql, actor(c), parseInput(V.createReceiptSchema, await body(c)));
    return json(201, { data: r }, { Location: `/api/v1/receipts/${r.id}` });
  },
  'E-31': async (c) => json(200, { data: await inventory.getReceipt(c.sql, c.params.id) }),
  'E-32': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'part_id', 'location_id', 'lot_number', 'include_zero']);
    const pg = pagination(p);
    const sort = sortParam(p, { part_number: 'p.part_number', location: 'l.code', lot_number: 'oh.lot_number', qty_on_hand: 'oh.qty_on_hand' }, 'part_number');
    return page(await inventory.listOnHand(c.sql, { part_id: intParam(p, 'part_id'), location_id: intParam(p, 'location_id'), lot_number: p.lot_number?.toUpperCase(), include_zero: boolParam(p, 'include_zero'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset }), pg);
  },
  'E-33': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'part_id', 'lot_number', 'txn_type', 'location_id', 'reference_type', 'reference_id', 'from', 'to']);
    const pg = pagination(p);
    const sort = sortParam(p, { txn_at: 't.txn_at', id: 't.id' }, '-txn_at');
    return page(await inventory.listTransactions(c.sql, {
      part_id: intParam(p, 'part_id'), lot_number: p.lot_number?.toUpperCase(), txn_type: listParam(p, 'txn_type', ['RECEIPT', 'SHIP', 'TRANSFER', 'PRODUCTION_COMPLETE', 'SCRAP', 'ADJUST']), location_id: intParam(p, 'location_id'),
      reference_type: listParam(p, 'reference_type', ['receipt', 'shipment', 'cycle_count', 'manual'])?.[0], reference_id: intParam(p, 'reference_id'), from: dateParam(p, 'from'), to: dateParam(p, 'to'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset,
    }), pg);
  },
  'E-34': async (c) => {
    const raw = await body(c);
    if (typeof raw.txn_type === 'string' && !['TRANSFER', 'SCRAP', 'PRODUCTION_COMPLETE'].includes(raw.txn_type)) throw validation({ txn_type: 'must be TRANSFER, SCRAP or PRODUCTION_COMPLETE' });
    return json(201, { data: await inventory.postInventoryTxn(c.sql, actor(c), parseInput(V.inventoryTxnSchema, raw)) });
  },

  // ---- cycle counts ----
  'E-35': async (c) => {
    const p = parseQuery(c.url, [...FIVE_PARAMS, 'status', 'from', 'to']);
    const pg = pagination(p);
    const sort = sortParam(p, { count_no: 'c.count_no', scheduled_date: 'c.scheduled_date', status: 'c.status' }, '-scheduled_date');
    return page(await counts.listCycleCounts(c.sql, { status: listParam(p, 'status', ['Open', 'Counted', 'Approved'])?.[0], from: dateParam(p, 'from'), to: dateParam(p, 'to'), sortCol: sort.col, desc: sort.desc, limit: pg.pageSize, offset: pg.offset }), pg);
  },
  'E-36': async (c) => json(201, { data: await counts.createCycleCount(c.sql, actor(c), parseInput(V.createCountSchema, await body(c))) }),
  'E-37': async (c) => json(200, { data: await counts.getCycleCount(c.sql, c.params.id, actor(c)) }),
  'E-38': async (c) => json(200, { data: await counts.enterCounts(c.sql, actor(c), c.params.id, parseInput(V.countEntriesSchema, await body(c))) }),
  'E-39': async (c) => {
    parseInput(emptyBody, await body(c));
    return json(200, { data: await counts.submitCycleCount(c.sql, actor(c), c.params.id) });
  },
  'E-40': async (c) => json(200, { data: await counts.approveCycleCount(c.sql, actor(c), c.params.id, parseInput(V.approveCountSchema, await body(c))) }),
  'E-41': async (c) => json(200, { data: await inventory.lotTrace(c.sql, c.params.lot) }),

  // ---- lookups / settings ----
  'E-42': async (c) => {
    const p = parseQuery(c.url, ['active', 'category', 'q']);
    const r = await lookups.listLookup(c.sql, lookups.lookupType(c.params.type), p);
    return json(200, { data: r.data, page: 1, page_size: r.total, total: r.total });
  },
  'E-43': async (c) => json(201, { data: await lookups.createLookup(c.sql, actor(c), c.params.type, await body(c)) }),
  'E-44': async (c) => json(200, { data: await lookups.updateLookup(c.sql, actor(c), c.params.type, c.params.id, await body(c)) }),
  'E-45': async (c) => json(200, { data: await lookups.getSettings(c.sql) }),
  'E-46': async (c) => json(200, { data: await lookups.updateTargets(c.sql, actor(c), await body(c)) }),
  'E-47': async (c) => {
    const input = parseInput(z.object({ mode: z.enum(['fixed', 'live'], { error: 'must be fixed or live' }), reporting_date: z.string().optional() }).strict(), await body(c));
    return json(200, { data: await lookups.updateReporting(c.sql, actor(c), input) });
  },

  // ---- reports / admin ----
  'E-50': async (c) => {
    const r = await reports.runReport(c.sql, c.params.id, c.url);
    if (c.url.searchParams.get('format') === 'csv') {
      const clock = await getBusinessClock(c.sql);
      return new Response(reports.toCsv(r.columns, r.allRows), {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${reports.csvFileName(r.report.id, r.report.name, clock.today)}"` },
      });
    }
    const { allRows: _all, ...rest } = r;
    return json(200, rest);
  },
  'E-51': async (c) => json(200, await admin.listAuditLog(c.sql, c.url)),
  'E-52': async (c) => {
    const input = parseInput(z.object({ confirm: z.string({ error: 'is required' }) }).strict(), await body(c));
    const r = await admin.demoReset(c.sql, actor(c), input);
    clearCookie(c);
    return json(200, { data: r });
  },
};

function idParam(raw: string): number {
  if (!/^[1-9]\d{0,17}$/.test(raw)) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  return Number(raw);
}
