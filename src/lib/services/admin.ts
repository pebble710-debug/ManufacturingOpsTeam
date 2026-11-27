// Admin: audit log viewer (E-51) and demo reset (E-52, Matrix R-9).
import type { Sql } from '../db';
import { realNow } from '../clock';
import { appEnv, isDemoResetEnabled } from '../env';
import { HttpError, validation } from '../http/errors';
import { dateParam, intParam, pagination, parseQuery } from '../validation/common';
import type { Actor } from './common';

type Row = Record<string, any>;

const BUSINESS_KEYS: [RegExp, string][] = [[/^SH-\d{4,}$/, 'shipment'], [/^PE-\d{4,}$/, 'packaging_error'], [/^RC-\d{4,}$/, 'receipt'], [/^CC-\d{4,}$/, 'cycle_count']];

export async function listAuditLog(q: Sql, url: URL) {
  const p = parseQuery(url, ['page', 'page_size', 'user_id', 'action', 'table_name', 'record_id', 'from', 'to']);
  const pg = pagination(p);
  const userId = intParam(p, 'user_id');
  const from = dateParam(p, 'from');
  const to = dateParam(p, 'to');
  if (from && to && from > to) throw validation({ from: 'must be on or before the end date' });
  if (p.action && !/^[A-Z][A-Z0-9_]{1,59}$/.test(p.action)) throw validation({ action: 'is not a valid action name' });
  let table = p.table_name;
  let recordId = p.record_id;
  if (recordId) {
    const key = recordId.toUpperCase();
    const hit = BUSINESS_KEYS.find(([re]) => re.test(key));
    if (hit) {
      const col = hit[1] === 'shipment' ? 'shipment_no' : hit[1] === 'packaging_error' ? 'error_no' : hit[1] === 'receipt' ? 'receipt_no' : 'count_no';
      const found = await q<{ id: string }[]>`SELECT id FROM ${q(hit[1])} WHERE ${q(col)} = ${key}`;
      table = hit[1];
      recordId = found[0] ? String(found[0].id) : '-1';
    }
  }
  const where = q`WHERE true ${userId ? q`AND a.user_id = ${userId}` : q``} ${p.action ? q`AND a.action = ${p.action}` : q``} ${table ? q`AND a.table_name = ${table}` : q``}
    ${recordId ? q`AND a.record_id = ${recordId}` : q``} ${from ? q`AND (a.at AT TIME ZONE 'UTC')::date >= ${from}::date` : q``} ${to ? q`AND (a.at AT TIME ZONE 'UTC')::date <= ${to}::date` : q``}`;
  const rows = await q<Row[]>`SELECT a.id::int AS id, a.at, a.action, a.table_name, a.record_id, a.changes, u.id::int AS user_id, u.username, u.display_name
      FROM audit_log a LEFT JOIN app_user u ON u.id = a.user_id ${where} ORDER BY a.at DESC, a.id DESC LIMIT ${pg.pageSize} OFFSET ${pg.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_log a ${where}`;
  return {
    data: rows.map((r) => ({ id: r.id, at: r.at, user: r.user_id ? { id: r.user_id, username: r.username, display_name: r.display_name } : null, action: r.action, table_name: r.table_name ?? null, record_id: r.record_id ?? null, changes: r.changes ?? null })),
    page: pg.page, page_size: pg.pageSize, total: t?.n ?? 0,
  };
}

// ----------------------------------------------------------------------------- demo reset
const COOLDOWN_MS = 10 * 60 * 1000;
const BUSINESS_TABLES = ['app_user', 'session', 'login_attempt', 'audit_log', 'customer', 'supplier', 'carrier', 'part', 'location', 'reason_code', 'lot', 'shipment', 'shipment_line',
  'packaging_error', 'rework_event', 'corrective_action', 'shipment_status_history', 'shipment_verification', 'receipt', 'cycle_count', 'cycle_count_line', 'inventory_transaction'];

export async function demoReset(sql: Sql, user: Actor, input: { confirm: string }) {
  if (!isDemoResetEnabled()) throw new HttpError(404, 'FEATURE_DISABLED', 'Not found.');
  if (input.confirm !== 'RESET DEMO DATA') throw validation({ confirm: 'type RESET DEMO DATA exactly' });
  const now = realNow();
  const [last] = await sql<{ value: string }[]>`SELECT value FROM setting WHERE key = 'last_demo_reset_at'`;
  const lastMs = last?.value ? Date.parse(last.value) : NaN;
  if (!Number.isNaN(lastMs) && now.getTime() - lastMs < COOLDOWN_MS) {
    throw new HttpError(429, 'RESET_COOLDOWN', 'The demo was reset recently. Try again later.', { headers: { 'Retry-After': String(Math.ceil((COOLDOWN_MS - (now.getTime() - lastMs)) / 1000)) } });
  }
  const started = Date.now();
  // One implementation: the seed library truncates, reseeds, sets last_demo_reset_at and writes the
  // DEMO_RESET audit row in a single transaction (seed-plan §12; ADR-003 D-13 credential rules).
  const { resetAndSeed } = await import('../seed/index');
  const summary = await resetAndSeed(sql, {
    remote: appEnv() === 'deployed',
    env: process.env,
    nowIso: now.toISOString(),
    actorUserId: user.id,
  });
  return { reset: true, duration_ms: Date.now() - started, counts: (summary as { counts?: unknown }).counts ?? {}, tables: BUSINESS_TABLES.length };
}
