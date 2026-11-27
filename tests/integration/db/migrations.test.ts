// Migration 0001 applies from an empty database through the same runner Netlify uses locally (NetlifyDB.applyMigrations).
import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS, startTestDb } from '../../helpers/testdb';
import { SEED_ANCHOR_DATE } from '../../../src/lib/seed/index';

let db: Awaited<ReturnType<typeof startTestDb>>;
beforeAll(async () => { db = await startTestDb(); });
afterAll(async () => { await db.stop(); });

describe('migration 0001_core_schema', () => {
  it('migration folders follow NNNN_slug and 0001 exists', () => {
    const dirs = readdirSync(MIGRATIONS);
    expect(dirs.every((d) => /^\d{4}_[a-z0-9_]+$/.test(d))).toBe(true);
    expect(dirs).toContain('0001_core_schema');
  });

  it('builds 24 tables and 5 views from empty', async () => {
    const t = await db.sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '%migration%'`;
    const v = await db.sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW' ORDER BY 1`;
    expect(t[0]?.n).toBeGreaterThanOrEqual(24);
    expect(v.map((r) => r.table_name)).toEqual(['v_inventory_transaction', 'v_on_hand', 'v_on_hand_detail', 'v_shipment_delivery', 'v_shipment_quality']);
  });

  it('settings defaults and ref_shipment_transition come from the migration, not the seed', async () => {
    const s = await db.sql`SELECT value FROM setting WHERE key = 'reporting_date'`;
    expect(s[0]?.value).toBe(SEED_ANCHOR_DATE);
    expect((await db.sql`SELECT count(*)::int AS n FROM ref_shipment_transition`)[0]?.n).toBe(23);
    expect((await db.sql`SELECT count(*)::int AS n FROM setting`)[0]?.n).toBe(18);
  });

  it('append-only ledger, history and audit reject UPDATE and DELETE', async () => {
    await db.sql`INSERT INTO audit_log (action) VALUES ('TEST_ROW')`;
    await expect(db.sql`UPDATE audit_log SET action = 'X_Y' WHERE action = 'TEST_ROW'`).rejects.toThrow(/append-only/);
    await expect(db.sql`DELETE FROM audit_log WHERE action = 'TEST_ROW'`).rejects.toThrow(/append-only/);
    await db.sql`TRUNCATE audit_log RESTART IDENTITY`;
  });
});
