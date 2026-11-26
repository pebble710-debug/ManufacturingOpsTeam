// PLACEHOLDER (T-024, devops-engineer): minimal liveness endpoint so build/check/e2e wiring work.
// Reports no secrets and touches no database. Owners of src/pages may keep or replace it.
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'ok', app: 'manufacturing-ops-dashboard' }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
