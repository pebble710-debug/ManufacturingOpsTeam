import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_ROLES, PERMISSIONS, can, capabilitiesFor, type Role } from '../../../src/lib/auth/permissions';
import { matchRoute, ROUTES } from '../../../src/lib/auth/routes';

const COLS: Role[] = ['Admin', 'Supervisor', 'Shipping', 'Receiving', 'Quality', 'Viewer'];

function matrix(): Record<string, Role[]> {
  const md = readFileSync(new URL('../../../docs/plan/permissions-matrix.md', import.meta.url), 'utf8');
  const out: Record<string, Role[]> = {};
  for (const line of md.split('\n')) {
    const m = /^\| (P-\d\d) \|/.exec(line);
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells: '', id, action, admin, sup, shp, rcv, qua, viewer, story, ''
    out[m[1]] = COLS.filter((_, i) => /^Y/.test(cells[3 + i]));
  }
  return out;
}

describe('S-01: permission map equals the permissions matrix (P-01..P-29)', () => {
  const m = matrix();
  it('has all 29 rows', () => expect(Object.keys(m)).toHaveLength(29));
  for (const [key, entry] of Object.entries(PERMISSIONS)) {
    it(`${entry.matrix} ${key}`, () => {
      expect([...entry.roles].sort()).toEqual([...m[entry.matrix]].sort());
    });
  }
  it('every matrix row is mapped exactly once', () => {
    const ids = Object.values(PERMISSIONS).map((p) => p.matrix).sort();
    expect(ids).toEqual(Object.keys(m).sort());
  });
  it('Viewer holds only read actions and Admin no operational action (R-2)', () => {
    expect(capabilitiesFor('Viewer').sort()).toEqual(['dashboard.read', 'records.read', 'resources.read', 'session']);
    for (const a of ['shipment.write', 'shipment.verify', 'shipment.ship', 'receipt.create', 'count.approve', 'error.log'] as const) expect(can('Admin', a)).toBe(false);
  });
  it('unknown role or action is denied', () => {
    expect(can('Root', 'session')).toBe(false);
    expect(can(null, 'session')).toBe(false);
  });
  it('ALL_ROLES includes Viewer', () => expect(ALL_ROLES).toContain('Viewer'));
});

describe('S-03: route table', () => {
  it('has unique ids and public routes are exactly the allow-list', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    const pub = ROUTES.filter((r) => r.action === 'public').map((r) => `${r.method} ${r.pattern}`).sort();
    expect(pub).toEqual(['GET /health', 'GET /login', 'GET /robots.txt', 'POST /api/v1/auth/login', 'POST /login'].sort());
  });
  it('matches params, 405 for known path with other method, none for unknown', () => {
    const m = matchRoute('POST', '/api/v1/shipments/SH-1042/actions/verify');
    expect(m.kind === 'match' && m.params.id).toBe('SH-1042');
    expect(matchRoute('GET', '/api/v1/shipments/1/actions/verify').kind).toBe('method-not-allowed');
    expect(matchRoute('DELETE', '/api/v1/shipments').kind).toBe('method-not-allowed');
    expect(matchRoute('POST', '/api/v1/nope').kind).toBe('none');
    expect(matchRoute('GET', '/shipments/new').kind === 'match' && (matchRoute('GET', '/shipments/new') as any).spec.id).toBe('P-ship-new');
  });
  it('every API write route requires a non-public action except login', () => {
    for (const r of ROUTES.filter((x) => x.surface === 'api' && x.method !== 'GET')) {
      if (r.id !== 'E-02') expect(r.action).not.toBe('public');
    }
  });
});
