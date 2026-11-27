// One adapter for every HTML form handler (contract 1.12): decode -> Zod -> service -> PRG (303 + flash) or re-render data.
// The route table (middleware) has already run checks 0-3 (session, Origin, urlencoded, _csrf, base role).
import type { ZodType } from 'astro/zod';
import { getSql, type Sql } from '../db';
import { auditDenied } from '../audit';
import { HttpError, IdentityDenied, toHttpError } from './errors';
import { readFormBody } from './form';
import { setFlash, type CookieJar } from './respond';
import { parseInput } from '../validation/common';
import type { Actor } from '../services/common';

export interface FormCtx {
  request: Request;
  locals: App.Locals;
  cookies: CookieJar;
}

export interface FormOptions<I, R> {
  schema: ZodType<I>;
  /** Top-level checkbox names: true when present, false when absent. */
  booleans?: string[];
  /** Maps the pressed submit button (`intent`) into the input object (e.g. 'outcome' for E-11). */
  intentField?: string;
  /** Adjust the decoded object before Zod (e.g. add path params like shipment_no). */
  prepare?: (input: Record<string, unknown>) => Record<string, unknown>;
  run: (sql: Sql, user: Actor, input: I) => Promise<R>;
  redirectTo: string | ((result: R) => string);
  flash?: string | ((result: R) => string);
  sql?: Sql;
}

export type FormOutcome =
  | { ok: true; response: Response }
  | {
      ok: false;
      /** HTTP status to send with the re-rendered page (422 keeps the entered values; 403/409/429 show an in-place alert; others use the generic error page). */
      status: number;
      kind: 'rerender' | 'alert' | 'generic';
      code: string;
      message: string;
      fields: Record<string, string>;
      details?: Record<string, unknown>;
      /** The decoded form values to refill the page with (never includes _csrf). */
      values: Record<string, unknown>;
      /** True for add_line / remove_line: re-render the page with no error and no write. */
      rowAction: boolean;
      retryAfter?: number;
    };

const kindOf = (status: number): 'rerender' | 'alert' | 'generic' => (status === 422 ? 'rerender' : [403, 409, 429].includes(status) ? 'alert' : 'generic');

export async function handleForm<I, R>(ctx: FormCtx, opts: FormOptions<I, R>): Promise<FormOutcome> {
  const user = ctx.locals.user;
  if (!user) return { ok: true, response: new Response(null, { status: 303, headers: { Location: '/login' } }) };
  const sql = opts.sql ?? getSql();
  let values: Record<string, unknown> = {};
  try {
    const form = await readFormBody(ctx.request, { booleans: opts.booleans });
    values = form.input;
    if (form.rowAction) return { ok: false, status: 200, kind: 'rerender', code: 'ROW_ACTION', message: '', fields: {}, values, rowAction: true };
    let input = form.input;
    if (opts.intentField && form.intent) input = { ...input, [opts.intentField]: form.intent };
    if (opts.prepare) input = opts.prepare(input);
    const parsed = parseInput(opts.schema, input);
    const result = await opts.run(sql, user, parsed);
    const to = typeof opts.redirectTo === 'function' ? opts.redirectTo(result) : opts.redirectTo;
    const text = typeof opts.flash === 'function' ? opts.flash(result) : opts.flash;
    if (text) setFlash(ctx.cookies, { kind: 'success', text });
    return { ok: true, response: new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } }) };
  } catch (e) {
    const err: HttpError = toHttpError(e);
    if (err.status === 401) return { ok: true, response: new Response(null, { status: 303, headers: { Location: '/login' } }) };
    if (err.status === 403 && err.code !== 'FORBIDDEN_ROLE') {
      await auditDenied(sql, { userId: user.id, method: ctx.request.method, path: new URL(ctx.request.url).pathname, code: err.code, role: user.role });
    }
    if (err instanceof IdentityDenied || err.status < 500) {
      return {
        ok: false, status: err.status, kind: kindOf(err.status), code: err.code, message: err.message, fields: err.fields ?? {}, details: err.details, values, rowAction: false,
        retryAfter: err.headers?.['Retry-After'] ? Number(err.headers['Retry-After']) : undefined,
      };
    }
    return { ok: false, status: err.status, kind: 'generic', code: err.code, message: err.message, fields: {}, values, rowAction: false };
  }
}
