// Shared helpers: extract SQL from the design documents, build a fresh in-memory PGlite, load fictional base data.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');
export const docFile = (...p: string[]) => path.join(repoRoot, 'docs', ...p);

/** All ```sql blocks under the first "## " heading that matches `heading`. */
export function sqlBlocks(file: string, heading: RegExp): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && heading.test(l));
  if (start < 0) throw new Error(`heading ${heading} not found in ${file}`);
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (cur === null) {
      if (l.startsWith('## ')) break;
      if (l.trim() === '```sql') cur = [];
    } else if (l.trim() === '```') {
      blocks.push(cur.join('\n'));
      cur = null;
    } else cur.push(l);
  }
  if (blocks.length === 0) throw new Error(`no sql block under ${heading} in ${file}`);
  return blocks;
}

/** Split a doc SQL block into statements (comments stripped; the docs contain no ';' inside string literals). */
export function statements(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function migrationSql(): string {
  // Prefer the real migration file (netlify/database/migrations/0001_core_schema); fall back to the doc block.
  const real = fileURLToPath(new URL('../../../netlify/database/migrations/0001_core_schema/migration.sql', import.meta.url));
  if (existsSync(real)) return readFileSync(real, 'utf8');
  const blocks = sqlBlocks(docFile('data-model', 'migrations-plan.md'), /^## 3\. 0001_core_schema/);
  if (blocks.length !== 1) throw new Error(`expected exactly one 0001 block, got ${blocks.length}`);
  if (!blocks[0].includes('0001_core_schema')) throw new Error('0001 block header missing');
  return blocks[0];
}

export async function newDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(migrationSql());
  return db;
}

export async function rows<T = any>(db: any, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}
export async function one<T = any>(db: any, sql: string, params: unknown[] = []): Promise<T> {
  const r = await rows<T>(db, sql, params);
  if (r.length !== 1) throw new Error(`expected 1 row, got ${r.length}: ${sql}`);
  return r[0];
}

/** Assert that the database rejects `p` with a message matching `msg` and (optionally) SQLSTATE `code`. */
export async function expectDbError(p: Promise<unknown>, msg: RegExp, code?: string) {
  let err: any;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, 'expected the database to reject this statement').toBeDefined();
  expect(String(err?.message)).toMatch(msg);
  if (code) expect(err?.code).toBe(code);
}

export const RESTRICT = '23001'; // restrict_violation (append-only / no-delete triggers)
export const CHECK = '23514'; // check_violation
export const FK = '23503'; // foreign_key_violation
export const UNIQUE = '23505';

/** INSERT one row from an object; returns the new id. Column names come from test code only. */
export async function insertRow(db: any, table: string, o: Record<string, unknown>): Promise<number> {
  const cols = Object.keys(o);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`;
  const r = await db.query(sql, cols.map((c) => o[c]));
  return Number(r.rows[0].id);
}

export type Ids = {
  user: Record<string, number>;
  part: Record<string, number>;
  loc: Record<string, number>;
  cust: Record<string, number>;
  supplier: Record<string, number>;
  carrier: Record<string, number>;
  reason: Record<string, number>;
};

/** Fictional lookups and the 7 demo users (permissions-matrix section 4). Password hashes are fake fixtures. */
export async function loadBase(db: PGlite): Promise<Ids> {
  await db.exec(`
INSERT INTO app_user (username, display_name, email, role, password_hash) VALUES
 ('demo.admin','Demo Admin','demo.admin@example.com','Admin','scrypt$fixture-not-a-real-hash'),
 ('demo.supervisor','Demo Supervisor','demo.supervisor@example.com','Supervisor','scrypt$fixture-not-a-real-hash'),
 ('demo.shipper1','Demo Shipper One','demo.shipper1@example.com','Shipping','scrypt$fixture-not-a-real-hash'),
 ('demo.shipper2','Demo Shipper Two','demo.shipper2@example.com','Shipping','scrypt$fixture-not-a-real-hash'),
 ('demo.receiver','Demo Receiver','demo.receiver@example.com','Receiving','scrypt$fixture-not-a-real-hash'),
 ('demo.quality','Demo Quality','demo.quality@example.com','Quality','scrypt$fixture-not-a-real-hash'),
 ('demo.viewer','Demo Viewer','demo.viewer@example.com','Viewer','scrypt$fixture-not-a-real-hash');
INSERT INTO customer (code, name, ship_to_city, ship_to_state) VALUES
 ('ALDERVALE','Aldervale Aerostructures','Fictionton','ZZ'),
 ('PINECREST','Pinecrest Robotics','Fictionton','ZZ');
INSERT INTO supplier (code, name) VALUES ('GRAYSTONE','Graystone Metals Supply');
INSERT INTO carrier (name, mode) VALUES ('SwiftLane Parcel','Parcel'), ('Customer Pickup','Pickup');
INSERT INTO part (part_number, revision, description, abc_class) VALUES
 ('CRC-2041-B','B','Demo bracket','A'), ('CRC-3310-A','A','Demo housing','B'),
 ('CRC-4102-A','A','Demo clip','C'),    ('CRC-5005-A','A','Demo shaft','A');
INSERT INTO location (code, type) VALUES ('STK-A01','Stock'), ('HOLD-01','Hold'), ('FG-01','FG');
INSERT INTO reason_code (category, code, label) VALUES
 ('late','CARRIER_LATE','Carrier late pickup'), ('hold','QUALITY_HOLD','Quality hold'),
 ('adjust','CNT_VAR','Cycle count variance'), ('scrap','SCR_DMG','Damaged in handling');
`);
  const m = async (table: string, key: string) =>
    Object.fromEntries((await rows(db, `SELECT id, ${key} AS k FROM ${table}`)).map((r) => [r.k, Number(r.id)]));
  return {
    user: await m('app_user', 'username'),
    part: await m('part', 'part_number'),
    loc: await m('location', 'code'),
    cust: await m('customer', 'code'),
    supplier: await m('supplier', 'code'),
    carrier: await m('carrier', 'name'),
    reason: await m('reason_code', 'code'),
  };
}

export const insertLot = (db: any, ids: Ids, lotNumber: string, partNumber: string) =>
  insertRow(db, 'lot', { lot_number: lotNumber, part_id: ids.part[partNumber] });

/** Minimal valid shipment (default status Planned). Override any column. */
export function shipmentDefaults(ids: Ids, o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customer_id: ids.cust.ALDERVALE,
    customer_po: 'PO-TEST',
    order_date: '2026-10-28',
    requested_date: '2026-11-10',
    promise_date: '2026-11-10',
    created_by: ids.user['demo.supervisor'],
    ...o,
  };
}

/** A Shipped shipment row (valid unless overridden). */
export function shippedDefaults(ids: Ids, o: Record<string, unknown> = {}): Record<string, unknown> {
  return shipmentDefaults(ids, {
    status: 'Shipped',
    ship_date: '2026-11-05',
    shipped_at: '2026-11-05T12:00:00Z',
    carrier_id: ids.carrier['SwiftLane Parcel'],
    packages_count: 1,
    total_weight_lb: 10.5,
    packed_by: ids.user['demo.shipper1'],
    verified_by: ids.user['demo.shipper2'],
    verified_at: '2026-11-05T10:00:00Z',
    ...o,
  });
}

/** Append status-history rows [status, isoTimestamp] in order for one shipment (first row has from_status NULL). */
export async function addHistory(db: any, ids: Ids, shipmentId: number, steps: [string, string][]) {
  let prev: string | null = null;
  for (const [to, at] of steps) {
    await insertRow(db, 'shipment_status_history', {
      shipment_id: shipmentId, from_status: prev, to_status: to, changed_at: at,
      business_date: at.slice(0, 10), changed_by: ids.user['demo.shipper1'],
    });
    prev = to;
  }
}
