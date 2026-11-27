// Error envelope (contract section 1.4). Never exposes stack traces, SQL or constraint names.
export class HttpError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
  constructor(
    status: number,
    code: string,
    message: string,
    opts: { fields?: Record<string, string>; details?: Record<string, unknown>; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = opts.fields;
    this.details = opts.details;
    this.headers = opts.headers;
  }
}

/** A 403 identity / role-by-state refusal: rolled back, then audited as ACCESS_DENIED by the caller (ADR-003 D-10). */
export class IdentityDenied extends HttpError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(403, code, message, { details });
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Not found.');
export const validation = (fields: Record<string, string>, message = 'One or more fields are invalid.') =>
  new HttpError(422, 'VALIDATION_ERROR', message, { fields });
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(409, code, message, { details });

const GENERIC: Record<number, string> = {
  400: 'The request could not be understood.',
  401: 'Sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'Not found.',
  405: 'Method not allowed.',
  413: 'The request is too large.',
  415: 'Unsupported content type.',
  429: 'Too many attempts. Try again later.',
  500: 'Something went wrong.',
  503: 'The service is temporarily unavailable.',
};

export function envelope(err: HttpError, requestId: string) {
  return {
    error: {
      code: err.code,
      message: err.message || GENERIC[err.status] || 'Error.',
      ...(err.fields ? { fields: err.fields } : {}),
      ...(err.details ? { details: err.details } : {}),
      request_id: requestId,
    },
  };
}

interface PgErr { code?: string; constraint_name?: string; message?: string }

/** Maps unexpected exceptions (DB errors) to a safe HttpError; logs nothing sensitive. */
export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const pg = e as PgErr;
  if (pg && typeof pg.code === 'string') {
    if (process.env.DEBUG_DB) console.error('DB error', pg.code, pg.constraint_name, pg.message);
    if (pg.code === '23001') {
      // restrict_violation: append-only / lock triggers
      if (/locked/i.test(pg.message ?? '')) return new HttpError(409, 'SHIPMENT_LOCKED', 'This shipment is locked. Use the correction action.');
      return new HttpError(409, 'CONFLICT', 'The change is not allowed.');
    }
    if (pg.code === '23505') return new HttpError(409, 'DUPLICATE', 'A record with that key already exists.');
    if (pg.code === '23503') return new HttpError(422, 'VALIDATION_ERROR', 'A referenced record does not exist.');
    if (pg.code === '23514') {
      if (/negative/i.test(pg.message ?? '')) return new HttpError(409, 'INSUFFICIENT_STOCK', 'Not enough stock on hand.');
      return new HttpError(422, 'VALIDATION_ERROR', 'The values violate a data rule.');
    }
    if (pg.code === '40P01' || pg.code === '40001') return new HttpError(409, 'CONFLICT', 'Please retry the request.');
    if (pg.code.startsWith('08') || pg.code === '57P03') return new HttpError(503, 'SERVICE_UNAVAILABLE', GENERIC[503], { headers: { 'Retry-After': '5' } });
  }
  return new HttpError(500, 'INTERNAL_ERROR', GENERIC[500]);
}
