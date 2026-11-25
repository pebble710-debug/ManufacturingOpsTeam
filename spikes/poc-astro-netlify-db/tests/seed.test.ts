import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDb } from './helpers';
import { seed } from '../src/lib/seed';

let ctx: Awaited<ReturnType<typeof startDb>>;
beforeAll(async () => { ctx = await startDb(); });
afterAll(async () => { await ctx.sql.end(); await ctx.db.stop(); });

describe('#6 seed ~3,000 rows in batches inside one transaction', () => {
  it('finishes well under 60 s and is deterministic', async () => {
    const r1 = await seed(ctx.sql, 600, 2400, 500);
    console.log(`SEED_TIMING rows=${r1.rows} ms=${r1.ms}`);
    expect(r1.rows).toBe(3000);
    expect(r1.ms).toBeLessThan(60_000);
    const [c] = await ctx.sql`SELECT (SELECT count(*)::int FROM shipment) AS s, (SELECT count(*)::int FROM inventory_transaction) AS l`;
    expect(c).toEqual({ s: 600, l: 2400 });
    const sum1 = await ctx.sql`SELECT sum(qty_delta)::int AS q FROM inventory_transaction`;
    await seed(ctx.sql, 600, 2400, 500); // reset + reseed (TRUNCATE allowed by append-only triggers)
    const sum2 = await ctx.sql`SELECT sum(qty_delta)::int AS q FROM inventory_transaction`;
    expect(sum2[0].q).toBe(sum1[0].q);
  });
});
