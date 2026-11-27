// The request pipeline of contract 1.3 / ADR-003 D-9, independent of Astro so tests can drive it with plain Requests.
// Steps 0-3 run here, before any handler; steps 4-7 run inside the handler/service.
import type { Sql } from '../db';
import { auditDenied } from '../audit';
import { csrfFromForm, csrfFromHeader, checkCsrf } from '../auth/csrf';
import { can, capabilitiesFor } from '../auth/permissions';
import { matchRoute, type RouteSpec } from '../auth/routes';
import { loadSession, sessionCookieName, type SessionContext } from '../auth/session';
import { getBusinessClock, realNow } from '../clock';
import { appEnv, isDemoResetEnabled } from '../env';
import { HttpError, toHttpError } from './errors';
import { checkContentType, checkOrigin, safeNext } from './pipeline';
import { errorJson } from './respond';
import { applySecurityHeaders } from './security-headers';
import { HANDLERS, type ApiCtx } from './handlers';

export type Locals = App.Locals;

export interface PipelineInput {
  request: Request;
  sql: Sql;
  clientIp: string;
  cookies: {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options?: any): void;
    delete(name: string, options?: any): void;
  };
}

function emptyLocals(requestId: string): Locals {
  return { user: null, session: null, csrfToken: '', capabilities: [], reportingDate: '', isLiveDate: false, requestId, route: null, routeParams: {} };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Minimal HTML for non-API refusals (no inline script or style: CSP). Pages with their own design handle 4xx themselves. */
function htmlError(status: number, title: string, message: string, requestId: string): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/dashboard">Back to the dashboard</a></p><p>Request ${esc(requestId)}</p></main></body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function refuse(spec: RouteSpec | null, isApiPath: boolean, err: HttpError, requestId: string): Response {
  if (isApiPath || spec?.surface === 'api') return errorJson(err, requestId);
  const titles: Record<number, string> = { 400: 'Bad request', 403: 'Not allowed', 404: 'Not found', 405: 'Method not allowed', 413: 'Request too large', 415: 'Unsupported content type', 429: 'Too many attempts', 503: 'Service unavailable' };
  return htmlError(err.status, titles[err.status] ?? 'Error', err.message, requestId);
}

const redirectToLogin = (url: URL): Response => {
  const next = safeNext(url.pathname + url.search);
  return new Response(null, { status: 303, headers: { Location: next ? `/login?next=${encodeURIComponent(next)}` : '/login' } });
};

export async function runPipeline(inp: PipelineInput, next: (locals: Locals) => Promise<Response>): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { request, sql } = inp;
  const url = new URL(request.url);
  const deployed = appEnv() === 'deployed';
  const finish = (res: Response): Response => {
    try {
      return applySecurityHeaders(res, { deployed, requestId });
    } catch {
      return applySecurityHeaders(new Response(res.body, res), { deployed, requestId });
    }
  };
  const isApiPath = url.pathname.startsWith('/api/');
  let spec: RouteSpec | null = null;
  try {
    // Hashed build assets are served by the CDN with their own headers; never gate them.
    if (url.pathname.startsWith('/_astro/')) return await next(emptyLocals(requestId));
    const method = request.method.toUpperCase();
    const m = matchRoute(method, url.pathname);
    // Step 0: method and route table (deny by default).
    if (m.kind === 'method-not-allowed') return finish(refuse(null, isApiPath, new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.'), requestId));
    const writes = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    if (m.kind === 'none') {
      if (writes || isApiPath) return finish(refuse(null, isApiPath, new HttpError(404, 'NOT_FOUND', 'Not found.'), requestId));
    }
    spec = m.kind === 'match' ? m.spec : null;
    const params = m.kind === 'match' ? m.params : {};
    const isPublic = spec?.action === 'public';

    // Step 1: session (no cookie = no DB query).
    let session: SessionContext | null = null;
    let token: string | null = null;
    if (!isPublic) {
      token = inp.cookies.get(sessionCookieName())?.value ?? null;
      const lookup = await loadSession(sql, token, realNow());
      if (!lookup.ok) {
        if (token && lookup.reason !== 'missing') inp.cookies.delete(sessionCookieName(), { path: '/' });
        if (isApiPath || spec?.surface === 'api') {
          return finish(errorJson(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.', { details: { reason: lookup.reason } }), requestId));
        }
        if (writes) return finish(new Response(null, { status: 303, headers: { Location: '/login' } }));
        return finish(redirectToLogin(url));
      }
      session = lookup.ctx;
    }
    // The login page and POST are public, but a present valid session still populates locals (page redirects signed-in users).
    if (isPublic && !session) {
      const t = inp.cookies.get(sessionCookieName())?.value ?? null;
      if (t && spec?.method === 'GET' && spec.id === 'P-login') {
        const l = await loadSession(sql, t, realNow());
        if (l.ok) {
          session = l.ctx;
          token = t;
        }
      }
    }

    // Step 1b: feature flag (E-52: before CSRF; the feature is absent for every role).
    if (spec?.flag === 'DEMO_RESET_ENABLED' && !isDemoResetEnabled()) {
      return finish(refuse(spec, isApiPath, new HttpError(404, 'FEATURE_DISABLED', 'Not found.'), requestId));
    }

    const deny = async (err: HttpError, required?: unknown): Promise<Response> => {
      if (session) await auditDenied(sql, { userId: session.user.id, method, path: url.pathname, code: err.code, role: session.user.role, required });
      return finish(refuse(spec, isApiPath, err, requestId));
    };

    if (writes) {
      // 2a Origin / Sec-Fetch-Site (siteOrigin from the request URL only: Sasha C-1)
      if (!checkOrigin(request, url.origin)) return await deny(new HttpError(403, 'CSRF_INVALID', 'The request origin is not allowed.'));
      // 2b content type per surface, body size
      try {
        checkContentType(request, spec && (spec.surface === 'api') ? 'api' : 'form');
      } catch (e) {
        return finish(refuse(spec, isApiPath, e as HttpError, requestId));
      }
      // 2c synchronizer token (login has no session, so none)
      if (session) {
        let presented: string | null;
        try {
          presented = spec?.surface === 'api' ? csrfFromHeader(request) : await csrfFromForm(request);
        } catch (e) {
          return finish(refuse(spec, isApiPath, toHttpError(e), requestId));
        }
        if (!checkCsrf(session.csrfToken, presented)) return await deny(new HttpError(403, 'CSRF_INVALID', 'The security token is missing or invalid. Reload the page and try again.'));
      }
    }

    // Step 3: base permission for the route's action.
    if (spec && spec.action !== 'public' && session) {
      if (!can(session.user.role, spec.action)) {
        return await deny(new HttpError(403, 'FORBIDDEN_ROLE', 'You do not have permission to do that.', { details: { required: spec.action } }), spec.action);
      }
    }

    const locals = emptyLocals(requestId);
    locals.route = spec;
    locals.routeParams = params;
    if (session) {
      const clock = await getBusinessClock(sql);
      locals.user = { id: session.user.id, username: session.user.username, displayName: session.user.displayName, role: session.user.role };
      locals.session = { id: session.sessionId, csrfToken: session.csrfToken, expiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt };
      locals.csrfToken = session.csrfToken;
      locals.capabilities = capabilitiesFor(session.user.role);
      locals.reportingDate = clock.today;
      locals.isLiveDate = clock.mode === 'live';
    }
    (locals as Locals & { _token?: string | null })._token = token;
    const res = await next(locals);
    return finish(res);
  } catch (e) {
    const err = toHttpError(e);
    if (err.status >= 500) console.error('request failed', requestId, e instanceof Error ? e.name : typeof e);
    return finish(refuse(spec, isApiPath, err, requestId));
  }
}

/** Executes the JSON handler of the matched API route (steps 4-7 live inside the handlers/services). */
export async function dispatchApi(inp: PipelineInput, locals: Locals): Promise<Response> {
  const spec = locals.route;
  const handler = spec ? HANDLERS[spec.id] : undefined;
  if (!spec || !handler) return errorJson(new HttpError(404, 'NOT_FOUND', 'Not found.'), locals.requestId);
  const url = new URL(inp.request.url);
  const u = locals.user;
  const ctx: ApiCtx = {
    sql: inp.sql, request: inp.request, url, params: locals.routeParams, session: null,
    user: u ? { id: u.id, username: u.username, displayName: u.displayName, role: u.role } : null,
    cookies: inp.cookies, clientIp: inp.clientIp || 'unknown', sessionToken: (locals as Locals & { _token?: string | null })._token ?? null, requestId: locals.requestId,
  };
  if (u && locals.session) {
    ctx.session = { sessionId: locals.session.id, csrfToken: locals.session.csrfToken, createdAt: new Date(), lastSeenAt: new Date(), expiresAt: locals.session.expiresAt, idleExpiresAt: locals.session.idleExpiresAt, user: u };
  }
  try {
    return await handler(ctx);
  } catch (e) {
    const err = toHttpError(e);
    if (err.status === 403 && u && err.code !== 'FORBIDDEN_ROLE') {
      await auditDenied(inp.sql, { userId: u.id, method: inp.request.method, path: url.pathname, code: err.code, role: u.role });
    }
    if (err.status >= 500) console.error('handler failed', locals.requestId, e instanceof Error ? e.name : typeof e);
    return errorJson(err, locals.requestId);
  }
}
