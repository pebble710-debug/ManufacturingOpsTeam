// Fixture loader for KPI integration tests (kpi-spec section 13). Triggers and foreign keys are bypassed with
// session_replication_role = replica (CHECK constraints still apply), so only the facts a KPI reads are inserted.
import type { Sql } from '../../../src/lib/db';

export type Tx = Parameters<Parameters<Sql['begin']>[1]>[0];
export const load = async (sql: Sql, fn: (tx: Tx) => Promise<void>): Promise<void> => {
  await sql.begin(async (tx) => { await tx`SET LOCAL session_replication_role = replica`; await fn(tx); });
};

export interface ShipSpec { no: string; promise: string; ship?: string; requested?: string; readyAt?: string; shippedAt?: string; cancelled?: boolean; lines?: [number, number | null][] }

export async function addShipment(tx: Tx, s: ShipSpec): Promise<number> {
  const shipped = !!s.ship && !s.cancelled;
  const [row] = await tx<{ id: number }[]>`
    INSERT INTO shipment (shipment_no, customer_id, customer_po, order_date, requested_date, promise_date, status, late_reason_id,
                          ship_date, shipped_at, carrier_id, packages_count, total_weight_lb, packed_by, verified_by, verified_at, created_by)
    VALUES (${s.no}, 1, 'PO-1', '2026-09-01', ${s.requested ?? s.promise}, ${s.promise}, ${s.cancelled ? 'Cancelled' : shipped ? 'Shipped' : 'Verified'},
            ${shipped && s.ship! > s.promise ? 1 : null},
            ${shipped ? s.ship! : null}, ${shipped ? s.shippedAt! : null}, ${shipped ? 1 : null}, ${shipped ? 1 : null}, ${shipped ? 10 : null},
            ${shipped ? 2 : null}, ${shipped ? 3 : null}, ${shipped ? s.shippedAt! : null}, 1)
    RETURNING id`;
  if (s.readyAt) {
    await tx`INSERT INTO shipment_status_history (shipment_id, from_status, to_status, changed_at, business_date, changed_by)
             VALUES (${row.id}, 'Planned', 'Ready to Pack', ${s.readyAt}, ${s.readyAt.slice(0, 10)}, 1)`;
  }
  let n = 1;
  for (const [ordered, shippedQty] of s.lines ?? []) {
    await tx`INSERT INTO shipment_line (shipment_id, line_no, part_id, qty_ordered, qty_shipped, short_note)
             VALUES (${row.id}, ${n++}, 1, ${ordered}, ${shippedQty}, ${shippedQty !== null && shippedQty < ordered ? 'short' : null})`;
  }
  return row.id;
}

export async function addVerification(tx: Tx, shipmentId: number, result: 'Pass' | 'Fail', businessDate: string, attempt = 1): Promise<void> {
  const checklist = ({ part_number: true, revision: true, quantity: true, lot: true, labels: true, packing_slip: true, packaging_method: true });
  await tx`INSERT INTO shipment_verification (shipment_id, attempt_no, result, packer_id, verified_by, checklist, failed_items, verified_at, business_date)
           VALUES (${shipmentId}, ${attempt}, ${result}, 2, 3, ${tx.json(checklist)}, ${result === 'Fail' ? ['labels'] : []}::text[], ${businessDate + 'T10:00:00Z'}, ${businessDate})`;
}

export async function addError(tx: Tx, shipmentId: number, o: { stage: 'Before ship' | 'After ship'; category: string; detectedAt: string; related?: boolean }): Promise<number> {
  const role = o.stage === 'After ship' ? 'Customer' : 'Verifier';
  const [r] = await tx<{ id: number }[]>`
    INSERT INTO packaging_error (shipment_id, detected_at, detected_by_role, detected_stage, category, paperwork_subtype, severity, description, reported_by, packaging_related)
    VALUES (${shipmentId}, ${o.detectedAt}, ${role}, ${o.stage}, ${o.category}, ${o.category === 'Paperwork' ? 'Packing slip' : null}, 'Low', 'fixture', 1, ${o.related ?? true})
    RETURNING id`;
  return r.id;
}

export async function addRework(tx: Tx, errorId: number, shipmentId: number, start: string, end: string): Promise<void> {
  await tx`INSERT INTO rework_event (packaging_error_id, shipment_id, action, started_at, completed_at, performed_by)
           VALUES (${errorId}, ${shipmentId}, 'Relabel', ${start}, ${end}, 1)`;
}

export async function addCount(tx: Tx, o: { status: 'Open' | 'Counted' | 'Approved'; approved?: string; lines: { cls: 'A' | 'B' | 'C'; tol: number; system: number; counted: number | null; recount?: number }[] }): Promise<void> {
  const [c] = await tx<{ id: number }[]>`
    INSERT INTO cycle_count (scheduled_date, status, created_by, submitted_by, submitted_at, approved_by, approved_at, approved_business_date)
    VALUES ('2026-11-01', ${o.status}, 1, ${o.status === 'Open' ? null : 2}, ${o.status === 'Open' ? null : '2026-11-02T10:00:00Z'},
            ${o.status === 'Approved' ? 3 : null}, ${o.status === 'Approved' ? o.approved + 'T12:00:00Z' : null}, ${o.status === 'Approved' ? o.approved! : null})
    RETURNING id`;
  let n = 1;
  for (const l of o.lines) {
    await tx`INSERT INTO cycle_count_line (cycle_count_id, part_id, location_id, lot_number, abc_class, tolerance_pct, system_qty, counted_qty, counted_by, counted_at, recount_qty, recounted_by, recounted_at)
             VALUES (${c.id}, ${n++}, 1, 'L2611-001', ${l.cls}, ${l.tol}, ${l.system}, ${l.counted}, ${l.counted === null ? null : 2}, ${l.counted === null ? null : '2026-11-02T09:00:00Z'},
                     ${l.recount ?? null}, ${l.recount === undefined ? null : 2}, ${l.recount === undefined ? null : '2026-11-02T09:30:00Z'})`;
  }
}
