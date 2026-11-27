// Auth service used by the /login page (via src/components/auth-bridge.ts), the form routes and the JSON API.
import { getSql, type Sql } from '../db';
import { getBusinessClock, realNow } from '../clock';
import { login as doLogin, logout as doLogout } from '../auth/login';
import { matrixIdsFor, capabilitiesFor } from '../auth/permissions';
import { sessionCookieName, sessionCookieOptions, type CookieOptions, type SessionContext } from '../auth/session';
import { HttpError } from '../http/errors';

export interface LoginInput { username: string; password: string; clientKey: string }
export type SessionCookie = { name: string; value: string; options: CookieOptions };
export type LoginResult =
  | { ok: true; sessionCookie: SessionCookie; user: { id: number; username: string; display_name: string; role: string }; csrfToken: string; expiresAt: Date; idleExpiresAt: Date }
  | { ok: false; status: number; code: string; retryAfter?: number };

/**
 * Page-friendly login: never throws for expected failures. `clientKey` is the client IP (Astro.clientAddress);
 * it is only ever hashed (never stored raw). The caller sets the returned cookie and redirects (PRG).
 */
export async function loginWithPassword(input: LoginInput, opts: { sql?: Sql; presentedToken?: string | null } = {}): Promise<LoginResult> {
  const sql = opts.sql ?? getSql();
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  if (!username || username.length > 64 || !password || password.length > 200) return { ok: false, status: 422, code: 'VALIDATION_ERROR' };
  try {
    const now = realNow();
    const r = await doLogin(sql, { username, password, clientIp: input.clientKey, presentedToken: opts.presentedToken }, now);
    return {
      ok: true,
      sessionCookie: { name: sessionCookieName(), value: r.token, options: sessionCookieOptions(r.expiresAt, now) },
      user: r.user, csrfToken: r.csrfToken, expiresAt: r.expiresAt, idleExpiresAt: r.idleExpiresAt,
    };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, status: e.status, code: e.code, retryAfter: e.headers?.['Retry-After'] ? Number(e.headers['Retry-After']) : undefined };
    return { ok: false, status: 503, code: 'SERVICE_UNAVAILABLE' };
  }
}

export async function logoutSession(sql: Sql, userId: number, token: string | null): Promise<void> {
  await doLogout(sql, userId, token);
}

export async function meResponse(sql: Sql, s: SessionContext) {
  const clock = await getBusinessClock(sql);
  return {
    user: { id: s.user.id, username: s.user.username, display_name: s.user.displayName, role: s.user.role },
    csrf_token: s.csrfToken,
    session: { expires_at: s.expiresAt.toISOString(), idle_expires_at: s.idleExpiresAt.toISOString() },
    capabilities: matrixIdsFor(s.user.role),
    actions: capabilitiesFor(s.user.role),
    reporting: { mode: clock.mode, reporting_date: clock.reportingDate, business_today: clock.today, label: clock.label },
  };
}
