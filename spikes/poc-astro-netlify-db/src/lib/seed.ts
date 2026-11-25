import type { Sql } from './db';

/** mulberry32: deterministic PRNG (ADR-001 section 5, no faker). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = ['Aldervale Aerostructures', 'Brightwater Marine Systems', 'Pinecrest Robotics',
  'Summit Valley Pumps', 'Ironleaf Agricultural Equipment', 'Northgate Rail Services'];

export async function seed(sql: Sql, shipments = 600, ledger = 2400, batch = 500): Promise<{ rows: number; ms: number }> {
  const rnd = mulberry32(20261125);
  const t0 = performance.now();
  await sql.begin(async (tx) => {
    await tx`TRUNCATE shipment, inventory_transaction, audit_log RESTART IDENTITY CASCADE`;
    const sRows = Array.from({ length: shipments }, (_, i) => ({
      shipment_no: `SH-${String(1000 + i).padStart(4, '0')}`,
      customer: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)]!,
      status: i % 3 === 0 ? 'Shipped' : 'Verified',
    }));
    for (let i = 0; i < sRows.length; i += batch) {
      await tx`INSERT INTO shipment ${tx(sRows.slice(i, i + batch), 'shipment_no', 'customer', 'status')}`;
    }
    const lRows = Array.from({ length: ledger }, (_, i) => ({
      part_no: `CRC-${2000 + Math.floor(rnd() * 60)}-${'ABC'[Math.floor(rnd() * 3)]}`,
      lot_no: `L26${String(1 + (i % 48)).padStart(2, '0')}-${String(1 + (i % 9)).padStart(3, '0')}`,
      qty_delta: (1 + Math.floor(rnd() * 50)) * (rnd() < 0.4 ? -1 : 1),
      reason: 'RECEIPT',
    }));
    for (let i = 0; i < lRows.length; i += batch) {
      await tx`INSERT INTO inventory_transaction ${tx(lRows.slice(i, i + batch), 'part_no', 'lot_no', 'qty_delta', 'reason')}`;
    }
  });
  return { rows: shipments + ledger, ms: Math.round(performance.now() - t0) };
}
