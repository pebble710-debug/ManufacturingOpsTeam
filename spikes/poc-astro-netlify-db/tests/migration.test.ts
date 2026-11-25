import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '@netlify/database-dev';
import { MIGRATIONS, startDb } from './helpers';

let ctx: Awaited<ReturnType<typeof startDb>>;
beforeAll(async () => { ctx = await startDb(); });
afterAll(async () => { await ctx.sql.end(); await ctx.db.stop(); });

describe('#3 forward-only migration + append-only trigger', () => {
  it('creates the tables and records the migration', async () => {
    const t = await ctx.sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`;
    expect(t.map((r) => r.table_name)).toEqual(['audit_log', 'inventory_transaction', 'shipment']);
  });
  it('re-applying is a no-op (idempotent tracking)', async () => {
    expect(await ctx.db.applyMigrations(MIGRATIONS)).toEqual([]);
    expect(await applyMigrations(ctx.db, MIGRATIONS)).toEqual([]);
  });
  it('rejects UPDATE and DELETE on inventory_transaction and audit_log', async () => {
    await ctx.sql`INSERT INTO inventory_transaction (part_no, qty_delta, reason) VALUES ('CRC-2041-B', 10, 'RECEIPT')`;
    await expect(ctx.sql`UPDATE inventory_transaction SET qty_delta = 99`).rejects.toThrow(/append-only/);
    await expect(ctx.sql`DELETE FROM inventory_transaction`).rejects.toThrow(/append-only/);
    await ctx.sql`INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ('demo.admin','x','y','1')`;
    await expect(ctx.sql`DELETE FROM audit_log`).rejects.toThrow(/append-only/);
  });
  it('TRUNCATE is still allowed (needed by seed/reset)', async () => {
    await ctx.sql`TRUNCATE inventory_transaction, audit_log RESTART IDENTITY`;
    const [{ n }] = await ctx.sql`SELECT count(*)::int AS n FROM inventory_transaction`;
    expect(n).toBe(0);
  });
  it('CHECK constraint rejects a bad status', async () => {
    await expect(ctx.sql`INSERT INTO shipment (shipment_no, customer, status) VALUES ('SH-9','x','Bogus')`).rejects.toThrow();
  });
});
