// Shared Zod helpers (contract sections 1.1, 1.4). Zod comes through Astro's re-export.
import { z } from 'astro/zod';
import { HttpError } from '../http/errors';

export { z };

export const zInt = (min: number, max: number) => z.number({ error: 'must be a whole number' }).int({ error: 'must be a whole number' }).min(min, { error: `must be >= ${min}` }).max(max, { error: `must be <= ${max}` });
export const zId = z.number({ error: 'is required' }).int({ error: 'must be a whole number' }).min(1, { error: 'must be a valid id' });
export const zStr = (min: number, max: number) =>
  z.string({ error: 'is required' }).trim().min(min, { error: min <= 1 ? 'is required' : `must be at least ${min} characters` }).max(max, { error: `must be at most ${max} characters` });
export const zOptStr = (max: number) => z.string({ error: 'must be text' }).trim().max(max, { error: `must be at most ${max} characters` }).nullish();

export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const zDate = z.string({ error: 'is required' }).refine(isRealDate, { error: 'must be a valid date (YYYY-MM-DD)' });

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const toDate = (s: string) => new Date(/(Z|[+-]\d{2}:\d{2})$/.test(s) ? s : `${s}Z`);
/** ISO 8601 timestamp (offset allowed) normalised to a Date (UTC). */
export const zTs = z
  .string({ error: 'must be a timestamp' })
  .refine((s) => TS_RE.test(s) && !Number.isNaN(toDate(s).getTime()), { error: 'must be an ISO 8601 timestamp' })
  .transform(toDate);

export const zLot = z
  .string({ error: 'is required' })
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z0-9][A-Z0-9-]{2,29}$/.test(s), { error: 'must be 3-30 characters: letters, digits and hyphens' });

export const zNote = (max = 500) => z.string().trim().max(max, { error: `must be at most ${max} characters` }).nullish();

function pathToField(path: PropertyKey[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out || '_';
}

/** Validates `raw` with `schema`. Unknown keys -> 400 UNKNOWN_FIELD (R-12); other problems -> 422 VALIDATION_ERROR. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const unknown: string[] = [];
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      const base = pathToField(issue.path);
      for (const k of issue.keys) unknown.push(base === '_' ? k : `${base}.${k}`);
    } else {
      const f = pathToField(issue.path);
      if (!(f in fields)) fields[f] = issue.message === 'Invalid input' ? 'is invalid' : issue.message;
    }
  }
  if (unknown.length) {
    throw new HttpError(400, 'UNKNOWN_FIELD', 'The request contains fields that are not accepted.', {
      fields: Object.fromEntries(unknown.map((k) => [k, 'not accepted'])),
    });
  }
  throw new HttpError(422, 'VALIDATION_ERROR', 'One or more fields are invalid.', { fields });
}

export const emptyBody = z.object({}).strict();
export const noteBody = z.object({ note: zNote(500) }).strict();

/** Query parsing: unknown params -> 422 (contract 1.1). `known` lists allowed names. */
export function parseQuery(url: URL, known: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const bad: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (!known.includes(k)) bad[k] = 'is not a known parameter';
    else if (v !== '') out[k] = v;
  }
  if (Object.keys(bad).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Unknown query parameter.', { fields: bad });
  return out;
}

export interface PageQuery { page: number; pageSize: number; offset: number }
export function pagination(q: Record<string, string>): PageQuery {
  const fields: Record<string, string> = {};
  const page = q.page === undefined ? 1 : Number(q.page);
  const pageSize = q.page_size === undefined ? 25 : Number(q.page_size);
  if (!Number.isInteger(page) || page < 1) fields.page = 'must be an integer >= 1';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) fields.page_size = 'must be an integer from 1 to 100';
  if (Object.keys(fields).length) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid paging parameters.', { fields });
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function intParam(q: Record<string, string>, key: string): number | undefined {
  if (q[key] === undefined) return undefined;
  const n = Number(q[key]);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid filter.', { fields: { [key]: 'must be a positive integer' } });
  return n;
}
export function dateParam(q: Record<string, string>, key: string): string | undefined {
  if (q[key] === undefined) return undefined;
  if (!isRealDate(q[key])) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid filter.', { fields: { [key]: 'must be a valid date (YYYY-MM-DD)' } });
  return q[key];
}
export function listParam(q: Record<string, string>, key: string, allowed: readonly string[]): string[] | undefined {
  if (q[key] === undefined) return undefined;
  const vals = q[key].split(',').map((s) => s.trim()).filter(Boolean);
  const bad = vals.filter((v) => !allowed.includes(v));
  if (bad.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid filter.', { fields: { [key]: `must be one of: ${allowed.join(', ')}` } });
  return vals;
}
export function boolParam(q: Record<string, string>, key: string): boolean | undefined {
  if (q[key] === undefined) return undefined;
  if (q[key] !== 'true' && q[key] !== 'false') throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid filter.', { fields: { [key]: 'must be true or false' } });
  return q[key] === 'true';
}
export function sortParam(q: Record<string, string>, allowed: Record<string, string>, dflt: string): { col: string; desc: boolean } {
  const raw = q.sort ?? dflt;
  const desc = raw.startsWith('-');
  const key = desc ? raw.slice(1) : raw;
  if (!(key in allowed)) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid sort.', { fields: { sort: `must be one of: ${Object.keys(allowed).join(', ')}` } });
  return { col: allowed[key], desc };
}
