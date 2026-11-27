// Catch-all for the JSON API: the middleware has already run checks 0-3; this executes the route's handler.
// Specific files (e.g. kpis/) win over this rest route in Astro.
import type { APIRoute } from 'astro';
import { getSql } from '../../../lib/db';
import { dispatchApi } from '../../../lib/http/pipeline-core';

export const prerender = false;

const run: APIRoute = async ({ request, locals, cookies, clientAddress }) => {
  let ip = 'unknown';
  try {
    ip = clientAddress || 'unknown';
  } catch {
    /* none */
  }
  return dispatchApi({ request, sql: getSql(), clientIp: ip, cookies }, locals);
};

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
