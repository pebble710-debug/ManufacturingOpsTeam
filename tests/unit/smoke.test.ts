// Trivial smoke test so `npm test` is meaningful from day one (T-024).
import { describe, expect, it } from 'vitest';
import { GET } from '../../src/pages/health';

describe('health placeholder', () => {
  it('returns ok JSON', async () => {
    const res = await (GET as unknown as () => Response)();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', app: 'manufacturing-ops-dashboard' });
  });
});
