// PLACEHOLDER smoke (T-024, devops-engineer). Quinn owns tests/e2e/** and replaces/extends this.
import { expect, test } from '@playwright/test';

test('health endpoint responds', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});
