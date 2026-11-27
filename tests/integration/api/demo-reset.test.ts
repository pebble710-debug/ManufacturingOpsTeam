// E-52 demo reset (matrix R-9, security-plan S-29): env-gated, Admin-only, reseeds, ends sessions, cooldown.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupEnv, type Env } from './helpers';
import { demoReset } from '../../../src/lib/services/admin';

describe('E-52 demo reset', () => {
  let env: Env;
  const prev = process.env.DEMO_RESET_ENABLED;

  beforeAll(async () => {
    env = await setupEnv();
  }, 120_000);
  afterAll(async () => {
    process.env.DEMO_RESET_ENABLED = prev;
    await env?.stop();
  });

  it('returns 404 FEATURE_DISABLED when the flag is off', async () => {
    delete process.env.DEMO_RESET_ENABLED;
    const r = await env.as('admin').post('/api/v1/admin/demo-reset', { confirm: 'RESET DEMO DATA' });
    expect(r.status).toBe(404);
  });

  it('is refused for a non-Admin role', async () => {
    process.env.DEMO_RESET_ENABLED = 'true';
    const r = await env.as('supervisor').post('/api/v1/admin/demo-reset', { confirm: 'RESET DEMO DATA' });
    expect(r.status).toBe(403);
  });

  it('reseeds the fictional demo data, ends all sessions, and enforces the 10-minute cooldown', async () => {
    process.env.DEMO_RESET_ENABLED = 'true';
    const admin = env.as('admin');
    const r = await admin.post('/api/v1/admin/demo-reset', { confirm: 'RESET DEMO DATA' });
    expect(r.status).toBe(200);
    expect(r.body.data?.reset ?? r.body.reset).toBe(true);

    const [{ n }] = await env.sql`SELECT count(*)::int AS n FROM shipment`;
    expect(n).toBe(300);
    const [{ u }] = await env.sql`SELECT count(*)::int AS u FROM app_user`;
    expect(u).toBe(7);
    const [{ s }] = await env.sql`SELECT count(*)::int AS s FROM session`;
    expect(s).toBe(0);
    const audits = await env.sql`SELECT action FROM audit_log WHERE action = 'DEMO_RESET'`;
    expect(audits.length).toBeGreaterThanOrEqual(1);

    // The old session no longer works.
    const after = await admin.get('/api/v1/me');
    expect(after.status).toBe(401);

    // A second reset inside 10 minutes is refused with 429 RESET_COOLDOWN.
    const [adminRow] = await env.sql`SELECT id::int AS id, username FROM app_user WHERE username = 'demo.admin'`;
    await expect(
      demoReset(env.sql, { id: adminRow.id, username: adminRow.username, displayName: 'Demo Admin', role: 'Admin' } as never, { confirm: 'RESET DEMO DATA' }),
    ).rejects.toMatchObject({ status: 429 });
  }, 120_000);
});
