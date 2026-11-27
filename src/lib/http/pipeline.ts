// Request pipeline checks (contract section 1.3, ADR-003 D-5, D-8). Pure functions, unit-tested.
import { HttpError } from './errors';

export const MAX_BODY = 65_536;

/** Check 2a. siteOrigin must come from the request URL, never from Origin/Referer (Sasha C-1). */
export function checkOrigin(request: Request, siteOrigin: string): boolean {
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === siteOrigin; // 'null' never equals the site origin
  const sfs = request.headers.get('sec-fetch-site');
  if (sfs !== null) return sfs === 'same-origin' || sfs === 'none';
  return true; // curl, tests: no browser headers; the synchronizer token still applies (2c)
}

export type BodySurface = 'api' | 'form';

/** Check 2b: exact media type per surface; only `charset=utf-8` is tolerated as a parameter. */
export function contentTypeOk(header: string | null, surface: BodySurface): boolean {
  if (!header) return false;
  const [type, ...params] = header.split(';').map((s) => s.trim().toLowerCase());
  const want = surface === 'api' ? 'application/json' : 'application/x-www-form-urlencoded';
  if (type !== want) return false;
  return params.every((p) => p === 'charset=utf-8' || p === 'charset="utf-8"');
}

export function checkContentType(request: Request, surface: BodySurface): void {
  if (!contentTypeOk(request.headers.get('content-type'), surface)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type.');
  }
  const len = request.headers.get('content-length');
  if (len !== null && Number(len) > MAX_BODY) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
}

/** Reads the body as text, refusing more than `max` bytes (header first, then a streaming counter). */
export async function readBodyCapped(request: Request, max = MAX_BODY): Promise<string> {
  const len = request.headers.get('content-length');
  if (len !== null && Number(len) > max) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** JSON body -> object. A zero-length body is `{}`. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await readBodyCapped(request);
  if (text.trim() === '') return {};
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'The request body is not valid JSON.');
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'BAD_REQUEST', 'The request body must be a JSON object.');
  return v as Record<string, unknown>;
}

/** `next` redirect allow-list (Sasha C-8): a single leading slash, no control chars, no encoded // or \. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return null;
  }
  for (const s of [next, decoded]) {
    if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f\u007f]/.test(s)) return null;
    if (/^\/[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  }
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/logout')) return null;
  return next;
}
