// Zod schemas for shipments and shipment actions (contract sections 5, E-06..E-16, E-53). All strict (R-12).
import { z, zDate, zId, zInt, zLot, zNote, zOptStr, zStr, parseInput } from './common';
import { HttpError } from '../http/errors';

export const HOLD_DEPTS = ['Shipping', 'Quality', 'Receiving', 'Production', 'Planning', 'Customer'] as const;
export const SHIPMENT_STATUSES = ['Planned', 'Ready to Pack', 'Packing', 'Verified', 'Shipped', 'On Hold', 'Rework', 'Cancelled'] as const;
export const CHECKLIST_KEYS = ['part_number', 'revision', 'quantity', 'lot', 'labels', 'packing_slip', 'coc', 'packaging_method'] as const;

const lineIn = z
  .object({
    id: zId.optional(),
    part_id: zId,
    qty_ordered: zInt(1, 1_000_000),
    lot_number: zLot.nullish(),
  })
  .strict();

const bool = z.boolean({ error: 'must be true or false' });

const headerFields = {
  customer_id: zId,
  customer_po: zStr(1, 40),
  order_date: zDate,
  requested_date: zDate,
  promise_date: zDate,
  service_level: zOptStr(40),
  notes: zOptStr(1000),
  doc_packing_slip: bool,
  doc_bol: bool,
  doc_coc: bool,
  doc_labels: bool,
};

function dateRules(v: { order_date?: string; requested_date?: string; promise_date?: string }, ctx: z.RefinementCtx) {
  if (v.order_date && v.promise_date && v.promise_date < v.order_date) ctx.addIssue({ code: 'custom', path: ['promise_date'], message: 'must be on or after the order date' });
  if (v.order_date && v.requested_date && v.requested_date < v.order_date) ctx.addIssue({ code: 'custom', path: ['requested_date'], message: 'must be on or after the order date' });
}

export const createShipmentSchema = z
  .object({
    ...headerFields,
    doc_packing_slip: bool.default(false),
    doc_bol: bool.default(false),
    doc_coc: bool.default(false),
    doc_labels: bool.default(false),
    lines: z.array(lineIn).min(1, { error: 'at least one line is required' }).max(50, { error: 'at most 50 lines' }),
  })
  .strict()
  .superRefine(dateRules);
export type CreateShipmentInput = z.output<typeof createShipmentSchema>;

export const updateShipmentSchema = z
  .object({
    customer_id: headerFields.customer_id.optional(),
    customer_po: headerFields.customer_po.optional(),
    order_date: headerFields.order_date.optional(),
    requested_date: headerFields.requested_date.optional(),
    promise_date: headerFields.promise_date.optional(),
    service_level: headerFields.service_level,
    notes: headerFields.notes,
    doc_packing_slip: bool.optional(),
    doc_bol: bool.optional(),
    doc_coc: bool.optional(),
    doc_labels: bool.optional(),
    lines: z.array(lineIn).min(1, { error: 'at least one line is required' }).max(50).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'at least one field is required' });
export type UpdateShipmentInput = z.output<typeof updateShipmentSchema>;

export const noteOnly = z.object({ note: zNote(500) }).strict();
export const holdSchema = z.object({ hold_reason_id: zId, hold_owner_dept: z.enum(HOLD_DEPTS, { error: `must be one of: ${HOLD_DEPTS.join(', ')}` }), note: zNote(500) }).strict();
export const cancelSchema = z.object({ reason: zStr(1, 500), note: zNote(500) }).strict();

const passFail = z.enum(['pass', 'fail'], { error: 'must be pass or fail' });
export const verifySchema = z
  .object({
    checklist: z.object(Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, passFail.optional()])) as Record<(typeof CHECKLIST_KEYS)[number], z.ZodOptional<typeof passFail>>).strict(),
    note: zNote(500),
    outcome: z.enum(['pass', 'fail']).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const fails = Object.values(v.checklist).filter((x) => x === 'fail').length;
    if (fails > 0 && !(v.note && v.note.length >= 1)) ctx.addIssue({ code: 'custom', path: ['note'], message: 'is required when any item fails' });
    if (v.outcome === 'pass' && fails > 0) ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'cannot be pass when an item failed' });
    if (v.outcome === 'fail' && fails === 0) ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'cannot be fail when every item passed' });
  });
export type VerifyInput = z.output<typeof verifySchema>;

const weight = z
  .number({ error: 'must be a number' })
  .gt(0, { error: 'must be greater than 0' })
  .max(100_000, { error: 'must be at most 100000' })
  .refine((n) => Math.abs(Math.round(n * 100) / 100 - n) < 1e-9, { error: 'must have at most 2 decimals' });
const tracking = z.string().trim().regex(/^[A-Za-z0-9-]{1,40}$/, { error: 'must be 1-40 letters, digits or hyphens' });

export const shipSchema = z
  .object({
    ship_date: zDate.optional(),
    carrier_id: zId,
    tracking_number: tracking.nullish(),
    packages_count: zInt(1, 999),
    total_weight_lb: weight,
    late_reason_id: zId.nullish(),
    service_level: zOptStr(40),
    lines: z
      .array(
        z
          .object({
            line_id: zId,
            qty_shipped: zInt(0, 1_000_000),
            lot_number: zLot.nullish(),
            location_id: zId.nullish(),
            short_note: zStr(1, 300).nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(50)
      .optional(),
    note: zNote(500),
  })
  .strict();
export type ShipInput = z.output<typeof shipSchema>;

const CORRECTION_FORBIDDEN = ['status', 'customer_id', 'order_date', 'qty_ordered', 'qty_shipped', 'lot_number', 'location_id', 'part_id'];
export const correctSchema = z
  .object({
    reason: zStr(10, 500),
    customer_po: headerFields.customer_po.optional(),
    requested_date: zDate.optional(),
    promise_date: zDate.optional(),
    ship_date: zDate.optional(),
    carrier_id: zId.optional(),
    tracking_number: tracking.nullish(),
    service_level: zOptStr(40),
    packages_count: zInt(1, 999).optional(),
    total_weight_lb: weight.optional(),
    late_reason_id: zId.nullish(),
    doc_packing_slip: bool.optional(),
    doc_bol: bool.optional(),
    doc_coc: bool.optional(),
    doc_labels: bool.optional(),
    notes: zOptStr(1000),
    lines: z.array(z.object({ line_id: zId, short_note: zStr(1, 300).nullish() }).strict()).max(50).optional(),
  })
  .strict();
export type CorrectInput = z.output<typeof correctSchema>;

/** E-53: ledger- or status-affecting fields get 422 CORRECTION_FIELD_NOT_ALLOWED; actor fields still 400 (R-12). */
export function parseCorrection(raw: unknown): CorrectInput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const bad: string[] = [];
  for (const k of Object.keys(obj)) if (CORRECTION_FORBIDDEN.includes(k)) bad.push(k);
  if (Array.isArray(obj.lines)) {
    for (const l of obj.lines as Record<string, unknown>[]) {
      if (l && typeof l === 'object') for (const k of Object.keys(l)) if (CORRECTION_FORBIDDEN.includes(k)) bad.push(`lines.${k}`);
    }
  }
  if (bad.length) {
    throw new HttpError(422, 'CORRECTION_FIELD_NOT_ALLOWED', 'Inventory and status are not changed by a correction; use a cycle count.', {
      fields: Object.fromEntries(bad.map((k) => [k, 'cannot be changed by a correction'])),
    });
  }
  return parseInput(correctSchema, raw);
}
