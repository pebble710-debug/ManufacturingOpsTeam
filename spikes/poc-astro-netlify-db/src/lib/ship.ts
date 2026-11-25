import type { Sql } from './db';

export class ShipError extends Error {}

/**
 * "Ship" = shipment status update + ledger row + audit row, atomically.
 * `failAfterLedger` is a test hook that throws mid-transaction to prove rollback.
 */
export async function shipShipment(
  sql: Sql,
  args: { shipmentNo: string; partNo: string; qty: number; actor: string; failAfterLedger?: boolean },
): Promise<void> {
  await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE shipment SET status = 'Shipped', shipped_at = now()
      WHERE shipment_no = ${args.shipmentNo} AND status = 'Verified'
      RETURNING id`;
    if (updated.length === 0) throw new ShipError(`${args.shipmentNo} is not in Verified status`);
    const shipmentId = updated[0]!.id as string;

    await tx`
      INSERT INTO inventory_transaction (part_no, qty_delta, reason, shipment_id)
      VALUES (${args.partNo}, ${-Math.abs(args.qty)}, 'SHIP', ${shipmentId})`;

    if (args.failAfterLedger) throw new ShipError('simulated failure after ledger insert');

    await tx`
      INSERT INTO audit_log (actor, action, entity, entity_id, detail)
      VALUES (${args.actor}, 'ship', 'shipment', ${args.shipmentNo},
              ${tx.json({ partNo: args.partNo, qty: args.qty })})`;
  });
}
