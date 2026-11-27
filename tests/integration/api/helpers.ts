// Integration helpers: in-memory Postgres + the real pipeline driven with plain Requests (no Astro server).
import { startTestDb } from '../../helpers/testdb';
import type { Sql } from '../../../src/lib/db';
import { runPipeline, dispatchApi } from '../../../src/lib/http/pipeline-core';
import { createSession } from '../../../src/lib/auth/session';
import { hashPassword } from '../../../src/lib/auth/password';
import { sessionCookieName } from '../../../src/lib/auth/session';

export const BASE = 'http://localhost:4321';

export interface Env {
  sql: Sql;
  stop: () => Promise<void>;
  ids: Record<string, number>;
  users: Record<string, { id: number; username: string }>;
  as: (who: string | null) => Client;
}
export interface Res { status: number; body: any; headers: Headers; text: string }
export interface Client {
  token: string | null;
  csrf: string;
  call: (method: string, path: string, body?: unknown, opts?: { headers?: Record<string, string>; raw?: string; contentType?: string | null; csrf?: string | null }) => Promise<Res>;
  get: (path: string) => Promise<Res>;
  post: (path: string, body?: unknown) => Promise<Res>;
  patch: (path: string, body?: unknown) => Promise<Res>;
}

const ROLES: [string, string, string][] = [
  ['admin', 'demo.admin', 'Admin'], ['supervisor', 'demo.supervisor', 'Supervisor'], ['shipper1', 'demo.shipper1', 'Shipping'], ['shipper2', 'demo.shipper2', 'Shipping'],
  ['receiver', 'demo.receiver', 'Receiving'], ['quality', 'demo.quality', 'Quality'], ['viewer', 'demo.viewer', 'Viewer'],
];

export async function setupEnv(): Promise<Env> {
  const db = await startTestDb();
  const sql = db.sql;
  const hash = await hashPassword('Demo-Pass-1234', { log2N: 10, r: 8, p: 1 });
  const users: Env['users'] = {};
  for (const [key, username, role] of ROLES) {
    const [u] = await sql`INSERT INTO app_user (username, display_name, role, password_hash) VALUES (${username}, ${'Demo ' + key}, ${role}, ${hash}) RETURNING id::int AS id`;
    users[key] = { id: u.id, username };
  }
  const ids: Record<string, number> = {};
  const one = async (k: string, q: Promise<any[]>) => { ids[k] = (await q)[0].id; };
  await one('cust', sql`INSERT INTO customer (code, name) VALUES ('ALDER', 'Aldervale Aerostructures') RETURNING id::int AS id`);
  await one('cust2', sql`INSERT INTO customer (code, name) VALUES ('BRIGHT', 'Brightwater Marine Systems') RETURNING id::int AS id`);
  await one('sup', sql`INSERT INTO supplier (code, name) VALUES ('GRAY', 'Graystone Metals Supply') RETURNING id::int AS id`);
  await one('carrier', sql`INSERT INTO carrier (name, mode) VALUES ('SwiftLane Parcel', 'Parcel') RETURNING id::int AS id`);
  await one('pickup', sql`INSERT INTO carrier (name, mode) VALUES ('Customer Pickup', 'Pickup') RETURNING id::int AS id`);
  await one('partA', sql`INSERT INTO part (part_number, revision, description, abc_class, requires_coc) VALUES ('CRC-2041-B', 'B', 'Bracket', 'A', true) RETURNING id::int AS id`);
  await one('partB', sql`INSERT INTO part (part_number, revision, description, abc_class) VALUES ('CRC-3100-A', 'A', 'Spacer', 'C') RETURNING id::int AS id`);
  await one('stk', sql`INSERT INTO location (code, type) VALUES ('STK-01', 'Stock') RETURNING id::int AS id`);
  await one('hold', sql`INSERT INTO location (code, type) VALUES ('HOLD-01', 'Hold') RETURNING id::int AS id`);
  await one('fg', sql`INSERT INTO location (code, type) VALUES ('FG-01', 'FG') RETURNING id::int AS id`);
  await one('rcv', sql`INSERT INTO location (code, type) VALUES ('RCV-01', 'Receiving') RETURNING id::int AS id`);
  await one('late', sql`INSERT INTO reason_code (category, code, label) VALUES ('late', 'CARRIER', 'Carrier delay') RETURNING id::int AS id`);
  await one('holdReason', sql`INSERT INTO reason_code (category, code, label) VALUES ('hold', 'QUALITY', 'Quality hold') RETURNING id::int AS id`);
  await one('adjust', sql`INSERT INTO reason_code (category, code, label) VALUES ('adjust', 'COUNT', 'Cycle count variance') RETURNING id::int AS id`);
  await one('scrap', sql`INSERT INTO reason_code (category, code, label) VALUES ('scrap', 'DAMAGED', 'Damaged in handling') RETURNING id::int AS id`);

  const as = (who: string | null): Client => {
    let token: string | null = null;
    let csrf = '';
    const jar = new Map<string, string>();
    const ready = (async () => {
      if (!who) return;
      const s = await createSession(sql, users[who].id, new Date());
      token = s.token;
      csrf = s.csrfToken;
      jar.set(sessionCookieName(), s.token);
    })();
    const client: Client = {
      get token() { return token; },
      get csrf() { return csrf; },
      async call(method, path, body, opts = {}) {
        await ready;
        const headers: Record<string, string> = { ...(opts.headers ?? {}) };
        const ct = opts.contentType === undefined ? (method === 'GET' ? null : 'application/json') : opts.contentType;
        if (ct) headers['content-type'] = ct;
        const tokenHeader = opts.csrf === undefined ? csrf : opts.csrf;
        if (tokenHeader && method !== 'GET') headers['x-csrf-token'] = tokenHeader;
        const init: RequestInit = { method, headers };
        if (method !== 'GET') init.body = opts.raw ?? (body === undefined ? undefined : JSON.stringify(body));
        const request = new Request(BASE + path, init);
        const cookies = {
          get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
          set: (n: string, v: string) => void jar.set(n, v),
          delete: (n: string) => void jar.delete(n),
        };
        const inp = { request, sql, clientIp: '203.0.113.9', cookies };
        const res = await runPipeline(inp, (locals) => dispatchApi(inp, locals));
        const text = await res.text();
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* html or csv */ }
        if (jar.has(sessionCookieName()) && !who) { token = jar.get(sessionCookieName())!; }
        return { status: res.status, body: parsed, headers: res.headers, text };
      },
      get: (p) => client.call('GET', p),
      post: (p, b) => client.call('POST', p, b ?? {}),
      patch: (p, b) => client.call('PATCH', p, b ?? {}),
    };
    return client;
  };
  return { sql, stop: db.stop, ids, users, as };
}

/** Receives stock through the API so on-hand exists: returns the lot number. */
export async function receive(env: Env, partKey: string, lot: string, qty: number, loc = 'stk'): Promise<void> {
  const r = await env.as('receiver').post('/api/v1/receipts', {
    supplier_id: env.ids.sup, supplier_po: 'PO-1', part_id: env.ids[partKey], qty_received: qty, lot_number: lot, inspection_status: 'Accepted', location_id: env.ids[loc],
  });
  if (r.status !== 201) throw new Error('receive failed ' + JSON.stringify(r.body));
}

export function shipmentBody(env: Env, over: Record<string, unknown> = {}) {
  return {
    customer_id: env.ids.cust, customer_po: 'PO-48117', order_date: '2026-11-10', requested_date: '2026-11-24', promise_date: '2026-11-25',
    doc_coc: true, lines: [{ part_id: env.ids.partA, qty_ordered: 10, lot_number: 'L2611-004' }], ...over,
  };
}
