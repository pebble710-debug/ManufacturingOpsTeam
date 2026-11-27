// Zod schemas for packaging errors, rework events and corrective actions (contract section 6).
import { z, zDate, zId, zNote, zStr, zTs } from './common';

export const CATEGORIES = ['Wrong part', 'Wrong quantity', 'Incorrect label', 'Paperwork', 'Packaging method', 'Damage', 'Traceability', 'Other'] as const;
export const SUBTYPES = ['Packing slip', 'BOL', 'C of C', 'Customer-specific form', 'Commercial invoice'] as const;
export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const DETECTED_BY = ['Packer', 'Verifier', 'Quality', 'Customer'] as const;
export const STAGES = ['Before ship', 'After ship'] as const;
export const ROOT_CAUSES = ['Method', 'People', 'Material', 'Machine', 'Measurement', 'Environment'] as const;
export const REWORK_ACTIONS = ['Relabel', 'Repack', 'Reprint paperwork', 'Replace part', 'Recount', 'Other'] as const;

const en = <T extends readonly [string, ...string[]]>(v: T) => z.enum(v, { error: `must be one of: ${v.join(', ')}` });

export const createErrorSchema = z
  .object({
    shipment_id: zId.optional(),
    shipment_no: z.string().trim().regex(/^SH-\d{4,}$/, { error: 'must look like SH-1042' }).optional(),
    shipment_line_id: zId.nullish(),
    detected_at: zTs.nullish(),
    detected_by_role: en(DETECTED_BY),
    detected_stage: en(STAGES),
    category: en(CATEGORIES),
    paperwork_subtype: en(SUBTYPES).nullish(),
    severity: en(SEVERITIES),
    description: zStr(1, 1000),
    packaging_related: z.boolean({ error: 'must be true or false' }).optional(),
    packaging_related_reason: zStr(10, 500).nullish(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.shipment_id === undefined && v.shipment_no === undefined) add('shipment_id', 'is required');
    if (v.category === 'Paperwork' && !v.paperwork_subtype) add('paperwork_subtype', 'is required for paperwork errors');
    if (v.category !== 'Paperwork' && v.paperwork_subtype) add('paperwork_subtype', 'is only allowed for paperwork errors');
    if (v.detected_by_role === 'Customer' && v.detected_stage !== 'After ship') add('detected_by_role', 'Customer applies only to After ship errors');
    if (v.detected_stage === 'After ship' && !['Quality', 'Customer'].includes(v.detected_by_role)) add('detected_by_role', 'After ship errors are found by Quality or the Customer');
    if (v.detected_stage === 'Before ship' && v.detected_by_role === 'Customer') add('detected_by_role', 'Customer applies only to After ship errors');
    if (v.packaging_related === false) {
      if (v.detected_stage !== 'After ship') add('packaging_related', 'can be false only for After ship errors');
      if (!v.packaging_related_reason) add('packaging_related_reason', 'is required when packaging_related is false');
    }
  });
export type CreateErrorInput = z.output<typeof createErrorSchema>;

export const updateErrorSchema = z
  .object({
    root_cause_category: en(ROOT_CAUSES).nullish(),
    root_cause_note: z.string().trim().max(2000, { error: 'must be at most 2000 characters' }).nullish(),
    packaging_related: z.boolean({ error: 'must be true or false' }).optional(),
    packaging_related_reason: zStr(10, 500).nullish(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'at least one field is required' });
export type UpdateErrorInput = z.output<typeof updateErrorSchema>;

export const createReworkSchema = z
  .object({ packaging_error_id: zId.optional(), error_no: z.string().trim().regex(/^PE-\d{4,}$/).optional(), action: en(REWORK_ACTIONS), started_at: zTs.nullish(), completed_at: zTs.nullish() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.packaging_error_id === undefined && v.error_no === undefined) ctx.addIssue({ code: 'custom', path: ['packaging_error_id'], message: 'is required' });
  });
export type CreateReworkInput = z.output<typeof createReworkSchema>;
export const completeReworkSchema = z.object({ completed_at: zTs.nullish() }).strict();

export const createCaSchema = z
  .object({ packaging_error_id: zId.optional(), error_no: z.string().trim().regex(/^PE-\d{4,}$/).optional(), action_description: zStr(1, 1000), owner_id: zId, due_date: zDate })
  .strict()
  .superRefine((v, ctx) => {
    if (v.packaging_error_id === undefined && v.error_no === undefined) ctx.addIssue({ code: 'custom', path: ['packaging_error_id'], message: 'is required' });
  });
export const updateCaSchema = z
  .object({ action_description: zStr(1, 1000).optional(), owner_id: zId.optional(), due_date: zDate.optional(), status: en(['Open', 'In Progress', 'Closed'] as const).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'at least one field is required' });
export const emptyOrNote = z.object({ note: zNote(500) }).strict();
