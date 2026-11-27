// Dropdown data for the shipment forms (active lookups only; the current value stays visible on edit).
import type { Sql } from '../../lib/db';
import { listLookup } from '../../lib/services/lookups';

export interface Opt { value: string; label: string }

export async function formLookups(sql: Sql, keep: { customer?: { id: number; name: string }; parts?: { id: number; label: string }[] } = {}) {
  const customers = (await listLookup(sql, 'customers', {})).data.map((c: any) => ({ value: String(c.id), label: c.name })) as Opt[];
  const parts = (await listLookup(sql, 'parts', {})).data.map((p: any) => ({ value: String(p.id), label: `${p.part_number} ${p.description ?? ''}`.trim() })) as Opt[];
  if (keep.customer && !customers.some((c) => c.value === String(keep.customer!.id))) customers.push({ value: String(keep.customer.id), label: `${keep.customer.name} (inactive)` });
  for (const p of keep.parts ?? []) if (!parts.some((x) => x.value === String(p.id))) parts.push({ value: String(p.id), label: `${p.label} (inactive)` });
  return { customers, parts };
}

/** Rows to show: a re-rendered form keeps the rows it was sent with; a fresh form opens with 3 blank rows. */
export function lineRows(posted: Record<string, any>[] | undefined, ctrl: { add: boolean; remove: number | null }, fallback: Record<string, any>[] = []): Record<string, any>[] {
  let rows = posted ? [...posted] : [...fallback];
  if (ctrl.remove !== null) rows.splice(ctrl.remove, 1);
  if (ctrl.add) rows.push({});
  if (!posted && !fallback.length) rows = [{}, {}, {}];
  if (rows.length === 0) rows = [{}];
  return rows;
}
