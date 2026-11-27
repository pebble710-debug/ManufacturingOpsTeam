// JSON response helpers and PRG flash messages for the form surface.
import { HttpError, envelope } from './errors';

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(wire(body)), {
    status,
    headers: { ...(status === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers },
  });
}

export function errorJson(err: HttpError, requestId: string): Response {
  return json(err.status, envelope(err, requestId), { ...(err.headers ?? {}), 'X-Request-Id': requestId });
}

const NUMERIC_KEY = /^(id|.+_id|line_no|attempt_no|qty|qty_.+|.+_qty|.+_count|minutes|rework_episode|total|page|page_size|.+_total|available|requested|count)$/;
const STRICT_NUM = /^-?\d+(\.\d+)?$/;

/** Normalises DB output for the wire: bigint/numeric strings -> numbers for numeric-looking keys, +00:00 -> Z. */
export function wire(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(wire);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && NUMERIC_KEY.test(k) && STRICT_NUM.test(x)) out[k] = Number(x);
      else if (typeof x === 'string' && /T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/.test(x)) out[k] = x.replace(/\+00:00$/, 'Z');
      else out[k] = wire(x);
    }
    return out;
  }
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** One-shot flash message carried across the post/redirect/get hop (read once by the page, then cleared). */
export interface Flash { kind: 'success' | 'info' | 'error'; text: string }
export const FLASH_COOKIE = 'flash';

export interface CookieJar {
  set(name: string, value: string, options?: Record<string, unknown>): void;
  get(name: string): { value: string } | undefined;
  delete(name: string, options?: Record<string, unknown>): void;
}

export function setFlash(cookies: CookieJar, flash: Flash): void {
  cookies.set(FLASH_COOKIE, Buffer.from(JSON.stringify(flash)).toString('base64url'), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 });
}
export function takeFlash(cookies: CookieJar): Flash | null {
  const c = cookies.get(FLASH_COOKIE);
  if (!c) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  try {
    const f = JSON.parse(Buffer.from(c.value, 'base64url').toString('utf8')) as Flash;
    return f && typeof f.text === 'string' ? { kind: f.kind ?? 'info', text: f.text.slice(0, 300) } : null;
  } catch {
    return null;
  }
}
