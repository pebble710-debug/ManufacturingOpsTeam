// Shared helpers for the shipment and quality pages (T-033A): one place that runs a form post through
// handleForm (contract 1.12) and turns the outcome into what the templates need.
import { handleForm, type FormOptions, type FormOutcome } from '../../lib/http/form-handler';
import { takeFlash, type Flash } from '../../lib/http/respond';
import type { FieldError } from '../types';

type AstroLike = { request: Request; locals: any; cookies: any; response: { status: number } };

export const fid = (key: string): string => key.replace(/[[\].]+/g, '-').replace(/-$/, '');

export function label(key: string): string {
  const m = /^lines\[(\d+)\]\.(.+)$/.exec(key);
  const base = (m ? m[2] : key).replace(/^checklist\./, '').replace(/_id$/, '').replace(/_/g, ' ');
  const text = base.charAt(0).toUpperCase() + base.slice(1);
  return m ? `Line ${Number(m[1]) + 1}, ${text.toLowerCase()}` : text;
}

export interface FormState {
  status: number;
  kind: 'none' | 'rerender' | 'alert' | 'generic' | 'row';
  message: string;
  fields: Record<string, string>;
  values: Record<string, any>;
  errors: FieldError[];
  code: string;
}
export const emptyState: FormState = { status: 200, kind: 'none', message: '', fields: {}, values: {}, errors: [], code: '' };

/** Runs the POST. Returns a Response to send (success / redirect) or the state to re-render. */
export async function submit<I, R>(Astro: AstroLike, opts: FormOptions<I, R>): Promise<{ response: Response } | { state: FormState }> {
  const out: FormOutcome = await handleForm({ request: Astro.request, locals: Astro.locals, cookies: Astro.cookies }, opts);
  if (out.ok) return { response: out.response };
  const errors: FieldError[] = Object.entries(out.fields).map(([k, msg]) => ({ fieldId: fid(k), message: `${label(k)}: ${msg}` }));
  const state: FormState = {
    status: out.status, kind: out.rowAction ? 'row' : out.kind, message: out.message, fields: out.fields, values: out.values, errors, code: out.code,
  };
  Astro.response.status = out.status;
  return { state };
}

/** Reads add_line / remove_line from a cloned body (the adapter drops those control names). */
export async function rowControl(request: Request): Promise<{ add: boolean; remove: number | null }> {
  try {
    const p = new URLSearchParams(await request.clone().text());
    const r = p.get('remove_line');
    return { add: p.has('add_line'), remove: r !== null && /^\d+$/.test(r) ? Number(r) : null };
  } catch {
    return { add: false, remove: null };
  }
}

export function flash(Astro: AstroLike): Flash | null {
  return takeFlash(Astro.cookies);
}

export const v = (values: Record<string, any>, key: string, fallback: any = ''): any => {
  const x = values[key];
  return x === undefined || x === null ? fallback : x;
};

export const dateText = (d: unknown): string => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(String(d).length === 10 ? `${d}T00:00:00Z` : String(d));
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
export const dateTimeText = (d: unknown): string => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(date.getTime())) return String(d);
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} ${date.toISOString().slice(11, 16)} UTC`;
};
export const toLocalInput = (d: Date): string => d.toISOString().slice(0, 16);

export const can = (locals: any, key: string): boolean => Array.isArray(locals?.capabilities) && locals.capabilities.includes(key);
