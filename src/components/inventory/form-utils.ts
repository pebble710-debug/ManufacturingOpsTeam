// Helpers shared by the inventory, reports and admin pages (T-033B): form context, error mapping, list queries.
import type { FormCtx, FormOutcome } from '../../lib/http/form-handler';
import type { FieldError } from '../types';

export type Failure = Extract<FormOutcome, { ok: false }>;

interface AstroLike { request: Request; locals: unknown; cookies: unknown }
export const formCtx = (a: AstroLike): FormCtx => ({ request: a.request, locals: a.locals as FormCtx['locals'], cookies: a.cookies as FormCtx['cookies'] });

/** "qty_received" -> "Qty received"; "entries[0].counted_qty" -> "Entry 1 counted qty". */
export function humanize(key: string): string {
  const m = /^entries\[(\d+)\]\.?(.*)$/.exec(key);
  if (m) return `Entry ${Number(m[1]) + 1}${m[2] ? ' ' + m[2].replace(/_/g, ' ') : ''}`;
  const s = key.replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Form';
}

/** Field errors for the summary: link target is the field id (same as the input name). */
export function fieldErrors(f: Failure | null, labels: Record<string, string> = {}, prefix = ''): FieldError[] {
  if (!f) return [];
  return Object.entries(f.fields).map(([k, msg]) => ({ fieldId: prefix + k.replace(/[[\].]+/g, '-').replace(/-$/, ''), message: `${labels[k] ?? humanize(k)} ${msg}` }));
}
export const errOf = (f: Failure | null, key: string): string | undefined => f?.fields[key];

/** Refill value from the failed submission, else the default. */
export function val(f: Failure | null, key: string, dflt = ''): string {
  const v = f?.values?.[key];
  return v === undefined || v === null ? dflt : String(v);
}

/** Plain-language text for the in-place alert (403/409/429/other). */
export function alertText(f: Failure): string {
  switch (f.code) {
    case 'APPROVER_SAME_AS_COUNTER': return 'You cannot approve this count because you entered or recounted lines on it. Ask a different Supervisor to approve it.';
    case 'APPROVER_SAME_AS_SUBMITTER': return 'You cannot approve this count because you submitted it. Ask a different Supervisor to approve it.';
    case 'FORBIDDEN_HOLD_RELEASE': return 'Moving stock out of a Hold location needs Quality or a Supervisor.';
    case 'FORBIDDEN_NON_HOLD_TXN': return 'Quality can only move or scrap stock into or out of Hold locations.';
    case 'INSUFFICIENT_STOCK': {
      const d = f.details as { available?: number; requested?: number } | undefined;
      return `Not enough stock at that location${d ? ` (available ${d.available}, requested ${d.requested})` : ''}.`;
    }
    case 'COUNT_INCOMPLETE': return 'Every line needs a count, and lines out of tolerance need a recount, before the count can be submitted.';
    case 'RESET_COOLDOWN': return `The demo was reset recently. Try again in ${f.retryAfter ? Math.ceil(f.retryAfter / 60) : 10} minutes.`;
    default: return f.message || 'The change could not be made.';
  }
}

export const isAlert = (f: Failure | null): f is Failure => !!f && f.kind !== 'rerender';

export interface ListQuery { page: number; pageSize: number; sortKey: string; desc: boolean }
/** Reads ?page & ?sort&dir (sort keys are validated by the caller's map). */
export function listQuery(url: URL, sorts: Record<string, string>, dflt: string, dfltDesc: boolean): { page: number; pageSize: number; sortCol: string; sortKey: string; desc: boolean; offset: number } {
  const pageN = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageN) && pageN >= 1 ? pageN : 1;
  const raw = url.searchParams.get('sort') ?? dflt;
  const sortKey = raw in sorts ? raw : dflt;
  const dir = url.searchParams.get('dir');
  const desc = dir === 'desc' ? true : dir === 'asc' ? false : sortKey === dflt ? dfltDesc : false;
  return { page, pageSize: 25, sortCol: sorts[sortKey], sortKey, desc, offset: (page - 1) * 25 };
}

export const qs = (url: URL, k: string): string => url.searchParams.get(k)?.trim() ?? '';
export const qsInt = (url: URL, k: string): number | undefined => {
  const v = Number(qs(url, k));
  return Number.isInteger(v) && v > 0 ? v : undefined;
};
export const qsDate = (url: URL, k: string): string | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(qs(url, k)) ? qs(url, k) : undefined);
export const fmtTs = (d: unknown): string => (d instanceof Date ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : d ? String(d) : '');
