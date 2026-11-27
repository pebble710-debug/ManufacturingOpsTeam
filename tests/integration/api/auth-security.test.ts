import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupEnv, BASE, type Env } from './helpers';
import { ROUTES } from '../../../src/lib/auth/routes';
import { can, ALL_ROLES } from '../../../src/lib/auth/permissions';
import { hashPassword } from '../../../src/lib/auth/password';
import { runPipeline, dispatchApi } from '../../../src/lib/http/pipeline-core';
import { sessionCookieName } from '../../../src/lib/auth/session';

let env: Env;
beforeAll(async () => {
  env = await setupEnv();
  const full = await hashPassword('Full-Cost-Pass-1');
  await env.sql`UPDATE app_user SET password_hash = ${full} WHERE username = 'demo.viewer'`;
});
afterAll(async () => env?.stop());

const denials = async () => Number((await env.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'ACCESS_DENIED'`)[0].n);

describe('login, session and logout (E-02..E-04)', () => {
  it('anonymous requests get 401 and no data', async () => {
    const r = await env.as(null).get('/api/v1/shipments');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHENTICATED');
    expect(r.headers.get('x-request-id')).toBeTruthy();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('wrong password, unknown user and inactive user give one identical 401; 5 failures then 429 with no scrypt work', async () => {
    await env.sql`UPDATE app_user SET active = false WHERE username = 'demo.receiver'`;
    const c = env.as(null);
    const a = await c.post('/api/v1/auth/login', { username: 'demo.supervisor', password: 'wrong' });
    const b = await c.post('/api/v1/auth/login', { username: 'nobody.here', password: 'wrong' });
    const i = await c.post('/api/v1/auth/login', { username: 'demo.receiver', password: 'Demo-Pass-1234' });
    await env.sql`UPDATE app_user SET active = true WHERE username = 'demo.receiver'`;
    for (const r of [a, b, i]) { expect(r.status).toBe(401); expect(r.body.error.code).toBe('INVALID_CREDENTIALS'); expect(r.body.error.message).toBe(a.body.error.message); }
    for (let n = 0; n < 4; n++) await c.post('/api/v1/auth/login', { username: 'demo.supervisor', password: 'wrong' });
    await c.post('/api/v1/auth/login', { username: 'demo.supervisor', password: 'wrong' });
    const t0 = Date.now();
    const blocked = await c.post('/api/v1/auth/login', { username: 'demo.supervisor', password: 'Demo-Pass-1234' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(150); // cheap rejection, no scrypt
    const log = await env.sql`SELECT action, changes FROM audit_log WHERE action = 'LOGIN_FAILED' ORDER BY id`;
    expect(log.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(log)).not.toContain('wrong');
    expect(log.some((l) => l.changes.username === 'unknown')).toBe(true);
    expect(JSON.stringify(log)).not.toContain('nobody.here');
  });

  it('login creates a rotated session; /me works with cookie; logout kills it', async () => {
    const c = env.as(null);
    const ok = await c.post('/api/v1/auth/login', { username: 'demo.viewer', password: 'Full-Cost-Pass-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.role).toBe('Viewer');
    expect(ok.body.data.csrf_token.length).toBeGreaterThanOrEqual(32);
    const me = await c.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.data.capabilities).toEqual(['P-01', 'P-02', 'P-03', 'P-29']);
    expect(me.body.data.reporting.business_today).toBe('2026-11-25');
    // stored token is a hash
    const rows = await env.sql`SELECT token_hash FROM session s JOIN app_user u ON u.id = s.user_id WHERE u.username = 'demo.viewer'`;
    expect(rows.length).toBeGreaterThan(0);
    // logout needs the CSRF token
    const noTok = await c.call('POST', '/api/v1/auth/logout', {}, { csrf: null });
    expect(noTok.status).toBe(403);
    const out = await c.call('POST', '/api/v1/auth/logout', {}, { csrf: ok.body.data.csrf_token });
    expect(out.status).toBe(204);
    expect((await c.get('/api/v1/me')).status).toBe(401);
    expect(Number((await env.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'LOGOUT'`)[0].n)).toBe(1);
  });

  it('idle and absolute session timeouts', async () => {
    const c = env.as('viewer');
    expect((await c.get('/api/v1/me')).status).toBe(200);
    await env.sql`UPDATE session SET last_seen_at = now() - interval '31 minutes' WHERE user_id = ${env.users.viewer.id}`;
    const r = await c.get('/api/v1/me');
    expect(r.status).toBe(401);
    expect(r.body.error.details.reason).toBe('expired');
    const d = env.as('viewer');
    await d.get('/api/v1/me');
    await env.sql`UPDATE session SET created_at = now() - interval '9 hours', expires_at = now() - interval '1 hour', last_seen_at = now() WHERE user_id = ${env.users.viewer.id}`;
    expect((await d.get('/api/v1/me')).status).toBe(401);
  });

  it('a deactivated user is refused on the next request', async () => {
    const c = env.as('quality');
    expect((await c.get('/api/v1/me')).status).toBe(200);
    await env.sql`UPDATE app_user SET active = false WHERE username = 'demo.quality'`;
    expect((await c.get('/api/v1/me')).body.error.details.reason).toBe('inactive');
    await env.sql`UPDATE app_user SET active = true WHERE username = 'demo.quality'`;
  });
});

describe('write-request pipeline order (contract 1.3)', () => {
  const url = '/api/v1/shipments';
  it('no CSRF token -> 403 CSRF_INVALID + audit; wrong token too; forged Origin too', async () => {
    const c = env.as('supervisor');
    const before = await denials();
    const none = await c.call('POST', url, {}, { csrf: null });
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('CSRF_INVALID');
    expect((await c.call('POST', url, {}, { csrf: 'x'.repeat(43) })).body.error.code).toBe('CSRF_INVALID');
    const forged = await c.call('POST', url, {}, { headers: { origin: 'https://evil.example' } });
    expect(forged.body.error.code).toBe('CSRF_INVALID');
    const crossSite = await c.call('POST', url, {}, { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status).toBe(403);
    expect(await denials()).toBe(before + 4);
    const a = await env.as('shipper1');
    const b = await env.as('shipper2');
    expect((await a.call('POST', url, {}, { csrf: (await b.get('/api/v1/me')).body.data.csrf_token })).body.error.code).toBe('CSRF_INVALID'); // token of another session
  });
  it('wrong or missing content type -> 415 (before CSRF-independent body parsing); form type on API route -> 415', async () => {
    const c = env.as('supervisor');
    for (const ct of ['text/plain', 'multipart/form-data; boundary=x', 'application/x-www-form-urlencoded', null]) {
      const r = await c.call('POST', url, undefined, { contentType: ct, raw: '{}' });
      expect(r.status).toBe(415);
      expect(r.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
  });
  it('malformed JSON -> 400, array body -> 400, oversized -> 413, unknown field -> 400, GET of a write URL -> 405, unknown POST -> 404', async () => {
    const c = env.as('supervisor');
    expect((await c.call('POST', url, undefined, { raw: '{oops' })).body.error.code).toBe('BAD_REQUEST');
    expect((await c.call('POST', url, undefined, { raw: '[]' })).status).toBe(400);
    expect((await c.call('POST', url, undefined, { raw: JSON.stringify({ notes: 'x'.repeat(70_000) }) })).status).toBe(413);
    expect((await c.post(url, { verified_by: 1 })).body.error.code).toBe('UNKNOWN_FIELD');
    expect((await c.get('/api/v1/shipments/1/actions/ship')).status).toBe(405);
    expect((await c.get('/api/v1/auth/logout')).status).toBe(405);
    expect((await c.post('/api/v1/nothing')).status).toBe(404);
    expect((await c.call('DELETE', '/api/v1/shipments/1')).status).toBe(405);
  });
  it('422 never reveals state: invalid body with a missing shipment is still 422, valid body with missing shipment is 404', async () => {
    const c = env.as('shipper1');
    expect((await c.post('/api/v1/shipments/SH-9999/actions/hold', {})).status).toBe(422);
    expect((await c.post('/api/v1/shipments/SH-9999/actions/mark-ready', {})).status).toBe(404);
    expect((await c.get('/api/v1/shipments/abc')).status).toBe(404);
  });
});

describe('S-02/T-10: every API write route is refused for roles without the action (403 + audit), demo reset is 404 when disabled', () => {
  const writes = ROUTES.filter((r) => r.surface === 'api' && r.method !== 'GET' && r.id !== 'E-02' && r.id !== 'E-03');
  const fill = (p: string) => p.replace(':id', '1').replace(':type', 'parts').replace(':lot', 'L2611-004').replace(':chart', 'C1');
  for (const role of ['viewer', 'admin', 'shipper1', 'receiver', 'quality', 'supervisor']) {
    it(`${role}: base permission enforced on all ${writes.length} write routes`, async () => {
      const c = env.as(role);
      const rl = env.users[role] ? (await env.sql`SELECT role FROM app_user WHERE id = ${env.users[role].id}`)[0].role : '';
      for (const r of writes) {
        const before = await denials();
        const res = await c.call(r.method, fill(r.pattern), {});
        const allowed = r.action !== 'public' && can(rl, r.action);
        if (r.flag === 'DEMO_RESET_ENABLED') { expect(res.status, r.id).toBe(404); expect(res.body.error.code).toBe('FEATURE_DISABLED'); continue; }
        if (!allowed) {
          expect(res.status, `${role} ${r.id}`).toBe(403);
          expect(res.body.error.code, `${role} ${r.id}`).toBe('FORBIDDEN_ROLE');
          expect(await denials(), `${role} ${r.id} audit`).toBe(before + 1);
        } else {
          expect(res.body?.error?.code, `${role} ${r.id}`).not.toBe('FORBIDDEN_ROLE');
        }
      }
    });
  }
  it('every role set is consistent with the permission map', () => expect(ALL_ROLES).toHaveLength(6));
});

describe('page pipeline (form surface)', () => {
  const page = async (method: string, path: string, init: RequestInit, jar: Record<string, string> = {}) => {
    const request = new Request(BASE + path, { method, ...init });
    const cookies = { get: (n: string) => (jar[n] ? { value: jar[n] } : undefined), set: () => {}, delete: () => {} };
    const inp = { request, sql: env.sql, clientIp: '203.0.113.9', cookies };
    return runPipeline(inp, async () => new Response('page ok', { status: 200 }));
  };
  it('anonymous page GET redirects to /login with a safe next; /login stays public', async () => {
    const r = await page('GET', '/shipments?status=Packing', {});
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/login?next=%2Fshipments%3Fstatus%3DPacking');
    expect((await page('GET', '/login', {})).status).toBe(200);
  });
  it('form POST needs urlencoded + _csrf; wrong type is 415 and JSON on a form route is refused', async () => {
    const s = await env.as('supervisor');
    await s.get('/api/v1/me');
    const jar = { [sessionCookieName()]: s.token! };
    const body = (t: string) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: t });
    expect((await page('POST', '/shipments/new', body('customer_po=x'), jar)).status).toBe(403);
    expect((await page('POST', '/shipments/new', body(`_csrf=${s.csrf}&customer_po=x`), jar)).status).toBe(200);
    expect((await page('POST', '/shipments/new', { headers: { 'content-type': 'application/json' }, body: '{}' }, jar)).status).toBe(415);
    expect((await page('POST', '/shipments/new', { headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--' }, jar)).status).toBe(415);
    const v = await env.as('viewer');
    await v.get('/api/v1/me');
    const vjar = { [sessionCookieName()]: v.token! };
    const denied = await page('POST', '/shipments/new', body(`_csrf=${v.csrf}`), vjar);
    expect(denied.status).toBe(403);
    expect((await page('GET', '/admin/audit-log', {}, vjar)).status).toBe(403);
    expect((await page('GET', '/dashboard', {}, vjar)).status).toBe(200);
    expect((await page('POST', '/nope', body('a=1'), vjar)).status).toBe(404);
  });
});
void dispatchApi;
