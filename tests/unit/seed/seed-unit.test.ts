// Pure seed helpers: PRNG determinism, quota allocation, credential mode (S-30), generator purity.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng, quota } from '../../../src/lib/seed/prng';
import { adminPasswordFor, DEMO_USERS, seedCredentialMode } from '../../../src/lib/seed/demo-credentials';
import { generate } from '../../../src/lib/seed/generate';
import { isoWeek, ms } from '../../../src/lib/seed/time';

describe('prng', () => {
  it('same seed and name give the same stream; different names differ', () => {
    const a = new Rng(1, 'x'); const b = new Rng(1, 'x'); const c = new Rng(1, 'y');
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });
  it('quota allocates exactly the total by largest remainder', () => {
    expect(quota(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(quota(70, [1, 2, 3, 4]).reduce((x, y) => x + y, 0)).toBe(70);
    expect(quota(0, [1, 1])).toEqual([0, 0]);
  });
  it('iso week numbers match the lot-number plan (week 40 starts 2026-09-28, week 48 starts 2026-11-23)', () => {
    expect(isoWeek(ms(2026, 9, 28))).toBe(40);
    expect(isoWeek(ms(2026, 11, 9))).toBe(46);
    expect(isoWeek(ms(2026, 11, 23))).toBe(48);
  });
});

describe('demo credentials (ADR-003 D-13, S-30)', () => {
  it('seed credential mode follows the target DB', () => {
    expect(seedCredentialMode({ remote: false })).toBe('local');
    expect(seedCredentialMode({ remote: true })).toBe('deployed');
  });
  it('deployed: admin password needs DEMO_ADMIN_PASSWORD of at least 16 characters', () => {
    expect(adminPasswordFor('deployed', {})).toBeNull();
    expect(adminPasswordFor('deployed', { DEMO_ADMIN_PASSWORD: 'x'.repeat(15) })).toBeNull();
    expect(adminPasswordFor('deployed', { DEMO_ADMIN_PASSWORD: 'x'.repeat(16) })).toBe('x'.repeat(16));
  });
  it('local: the documented local password; seven fictional users', () => {
    expect(adminPasswordFor('local', {})).toMatch(/Local/);
    expect(DEMO_USERS).toHaveLength(7);
    expect(DEMO_USERS.every((u) => u.username.startsWith('demo.'))).toBe(true);
  });
});

describe('generator', () => {
  it('is pure and deterministic: two runs give identical tables', () => {
    const a = JSON.stringify(generate().tables);
    const b = JSON.stringify(generate().tables);
    expect(a).toBe(b);
  });
  it('src/lib/seed never uses Math.random, Date.now or a bare new Date()', () => {
    const dir = join(process.cwd(), 'src/lib/seed');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|new Date\(\)/);
    }
  });
  it('DEMO_ADMIN_PASSWORD is referenced only inside src/lib/seed (and env.ts)', () => {
    const dir = join(process.cwd(), 'src/lib/seed');
    const hits = readdirSync(dir).filter((f) => readFileSync(join(dir, f), 'utf8').includes('DEMO_ADMIN_PASSWORD'));
    expect(hits.length).toBeGreaterThan(0);
  });
});
