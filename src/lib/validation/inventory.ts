// Zod schemas for receipts, inventory transactions and cycle counts (contract section 7).
import { z, zDate, zId, zInt, zLot, zNote, zStr, zTs } from './common';

export const createReceiptSchema = z
  .object({
    supplier_id: zId,
    supplier_po: zStr(1, 40),
    part_id: zId,
    qty_received: zInt(1, 1_000_000),
    lot_number: zLot,
    arrived_at: zTs.nullish(),
    inspection_status: z.enum(['Accepted', 'On Hold', 'Rejected'], { error: 'must be Accepted, On Hold or Rejected' }),
    location_id: zId.nullish(),
  })
  .strict();
export type CreateReceiptInput = z.output<typeof createReceiptSchema>;

const qty = zInt(1, 1_000_000);
export const inventoryTxnSchema = z.discriminatedUnion(
  'txn_type',
  [
    z.object({ txn_type: z.literal('TRANSFER'), part_id: zId, lot_number: zLot, from_location_id: zId, to_location_id: zId, qty, note: zNote(500) }).strict(),
    z.object({ txn_type: z.literal('SCRAP'), part_id: zId, lot_number: zLot, location_id: zId, qty, reason_code_id: zId, note: zNote(500) }).strict(),
    z.object({ txn_type: z.literal('PRODUCTION_COMPLETE'), part_id: zId, lot_number: zLot, location_id: zId, qty, note: zNote(500) }).strict(),
  ],
  { error: 'txn_type must be TRANSFER, SCRAP or PRODUCTION_COMPLETE' },
);
export type InventoryTxnInput = z.output<typeof inventoryTxnSchema>;

export const createCountSchema = z
  .object({ scheduled_date: zDate.optional(), abc_class: z.enum(['A', 'B', 'C'], { error: 'must be A, B or C' }).nullish(), location_id: zId.nullish() })
  .strict()
  .refine((v) => !!v.abc_class || !!v.location_id, { error: 'give an ABC class or a location', path: ['abc_class'] });

export const countEntriesSchema = z
  .object({
    entries: z
      .array(
        z
          .object({ line_id: zId, counted_qty: zInt(0, 10_000_000).optional(), recount_qty: zInt(0, 10_000_000).optional() })
          .strict()
          .refine((e) => (e.counted_qty === undefined) !== (e.recount_qty === undefined), { error: 'give exactly one of counted_qty or recount_qty', path: ['counted_qty'] }),
      )
      .min(1, { error: 'at least one entry is required' })
      .max(200, { error: 'at most 200 entries' }),
  })
  .strict();
export const approveCountSchema = z.object({ reason_code_id: zId.nullish(), note: zNote(500) }).strict();
