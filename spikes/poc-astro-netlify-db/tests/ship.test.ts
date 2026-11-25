import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDb } from './helpers';
import { shipShipment, ShipError } from '../src/lib/ship';

let ctx: Awaited<ReturnType<typeof startDb>>;
beforeAll(async () => { ctx = await startDb(); });
afterAll(async () => { await ctx.sql.end(); await ctx.db.stop(); });
beforeEach(async () => {
  await ctx.sql`TRUNCATE shipment, inventory_transaction, audit_log RESTART IDENTITY CASCADE`;
  await ctx.sql`INSERT INTO shipment (shipment_no, customer, status) VALUES ('SH-1042','Aldervale Aerostructures','Verified')`;
});
const counts = async () => {
  const [r] = await ctx.sql`SELECT
    (SELECT status FROM shipment WHERE shipment_no='SH-1042') AS status,
    (SELECT count(*)::int FROM inventory_transaction) AS ledger,
    (SELECT count(*)::int FROM audit_log) AS audit`;
  return r;
};

describe('#4 transaction: ship = status + ledger + audit', () => {
  it('commits all three atomically', async () => {
    await shipShipment(ctx.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 5, actor: 'demo.shipper' });
    expect(await counts()).toMatchObject({ status: 'Shipped', ledger: 1, audit: 1 });
    const [l] = await ctx.sql`SELECT qty_delta FROM inventory_transaction`;
    expect(l.qty_delta).toBe(-5);
  });
  it('rolls back everything when a later step fails', async () => {
    await expect(shipShipment(ctx.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 5, actor: 'demo.shipper', failAfterLedger: true })).rejects.toThrow(/simulated/);
    expect(await counts()).toMatchObject({ status: 'Verified', ledger: 0, audit: 0 });
  });
  it('rolls back on a DB-level failure (audit NOT NULL violation)', async () => {
    await expect(shipShipment(ctx.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 5, actor: null as unknown as string })).rejects.toThrow();
    expect(await counts()).toMatchObject({ status: 'Verified', ledger: 0, audit: 0 });
  });
  it('refuses to ship twice (status guard)', async () => {
    await shipShipment(ctx.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 5, actor: 'u' });
    await expect(shipShipment(ctx.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 5, actor: 'u' })).rejects.toBeInstanceOf(ShipError);
    expect(await counts()).toMatchObject({ ledger: 1, audit: 1 });
  });
});
