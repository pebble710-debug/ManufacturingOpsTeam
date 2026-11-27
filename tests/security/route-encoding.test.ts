// Security tests (Sasha, T-034). Run: npx vitest run --config tests/security/vitest.config.ts
// SEC-01: the middleware matches routes on the RAW request pathname, but Astro routes on the fully DECODED
// pathname (astro/dist/core/util/pathname.js validateAndDecodePathname). A percent-encoded literal segment
// therefore reaches the page with no route entry and no base-permission check (step 3 is skipped when spec is null).
// These tests assert the SECURE behaviour; the SEC-01 cases fail until the pipeline is fixed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Imported by file path: the package exports map does not expose this internal helper.
import { validateAndDecodePathname } from '../../node_modules/astro/dist/core/util/pathname.js';
import { startTestDb } from '../helpers/testdb';
import type { Sql } from '../../src/lib/db';
import { runPipeline } from '../../src/lib/http/pipeline-core';
import { matchRoute, ROUTES } from '../../src/lib/auth/routes';
import { createSession, sessionCookieName } from '../../src/lib/auth/session';
import { hashPassword } from '../../src/lib/auth/password';

const BASE = 'http://localhost:4321';

/** Encodes one character of every literal segment (the way an attacker would) — e.g. /admin/audit-log -> /%61dmin/%61udit-log. */
function encodeLiterals(pattern: string): string {
  return pattern
    .split('/')
    .map((seg) => (seg === '' || seg.startsWith(':') ? seg.replace(/^:.*/, 'SH-0001') : `%${seg.charCodeAt(0).toString(16).toUpperCase()}${seg.slice(1)}`))
    .join('/');
}

describe('SEC-01 route matching must use the same (decoded) path that Astro routes on', () => {
  it('Astro decodes the path it routes on', () => {
    expect(validateAndDecodePathname('/admin/audit%2Dlog')).toBe('/admin/audit-log');
  });

  it('every GET page pattern still matches its own route entry when a literal segment is percent-encoded', () => {
    const gaps: string[] = [];
    for (const r of ROUTES.filter((x) => x.method === 'GET' && x.surface !== 'api' && x.pattern !== '/')) {
      const encoded = encodeLiterals(r.pattern);
      const decoded = validateAndDecodePathname(encoded);
      const plain = matchRoute('GET', decoded);
      const raw = matchRoute('GET', new URL(BASE + encoded).pathname);
      if (plain.kind === 'match' && (raw.kind !== 'match' || raw.spec.id !== plain.spec.id)) gaps.push(`${r.id} ${encoded}`);
    }
    expect(gaps, `raw-path matching misses: ${gaps.join(', ')}`).toEqual([]);
  });
});

describe('SEC-01 end to end through runPipeline (in-memory Postgres)', () => {
  let sql: Sql;
  let stop: () => Promise<void>;
  let viewerToken = '';

  beforeAll(async () => {
    const db = await startTestDb();
    sql = db.sql;
    stop = db.stop;
    const [u] = await sql`INSERT INTO app_user (username, display_name, role, password_hash) VALUES ('demo.viewer', 'Demo Viewer', 'Viewer', ${await hashPassword('Demo-Pass-1234', { log2N: 10, r: 8, p: 1 })}) RETURNING id::int AS id`;
    viewerToken = (await createSession(sql, u.id, new Date())).token;
  });
  afterAll(async () => stop?.());

  async function getAsViewer(path: string): Promise<{ status: number; reachedPage: boolean; route: string | null }> {
    let reachedPage = false;
    let route: string | null = null;
    const cookies = { get: (n: string) => (n === sessionCookieName() ? { value: viewerToken } : undefined), set: () => {}, delete: () => {} };
    const res = await runPipeline({ request: new Request(BASE + path), sql, clientIp: '203.0.113.9', cookies }, async (locals) => {
      reachedPage = true;
      route = locals.route?.id ?? null;
      return new Response('page', { status: 200 });
    });
    return { status: res.status, reachedPage, route };
  }

  it('control: Viewer GET /admin/audit-log is refused with 403 before the page runs', async () => {
    const r = await getAsViewer('/admin/audit-log');
    expect(r.status).toBe(403);
    expect(r.reachedPage).toBe(false);
  });

  it('control: encoded API paths are refused (API unmatched = 404)', async () => {
    const r = await getAsViewer('/api/v1/admin/audit%2Dlog');
    expect(r.status).toBe(404);
    expect(r.reachedPage).toBe(false);
  });

  it('SEC-01: Viewer GET /admin/audit%2Dlog must NOT reach the Admin-only page', async () => {
    const r = await getAsViewer('/admin/audit%2Dlog');
    expect(r.reachedPage, 'page rendered without the P-24 audit.read check').toBe(false);
  });

  it('SEC-01: flag-gated GET /admin/demo%2Dreset must NOT reach the page while DEMO_RESET_ENABLED is off', async () => {
    const r = await getAsViewer('/admin/demo%2Dreset');
    expect(r.reachedPage, 'page rendered without the flag and P-25 checks').toBe(false);
  });
});
