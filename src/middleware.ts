// Astro middleware: the deny-by-default pipeline of ADR-003 D-9 (logic in src/lib/http/pipeline-core.ts).
import { defineMiddleware } from 'astro:middleware';
import { getSql } from './lib/db';
import { runPipeline } from './lib/http/pipeline-core';

export const onRequest = defineMiddleware(async (context, next) => {
  let clientIp = 'unknown';
  try {
    clientIp = context.clientAddress || 'unknown';
  } catch {
    /* no client address in this runtime: all such clients share one bucket (fails closed) */
  }
  return runPipeline({ request: context.request, sql: getSql(), clientIp, cookies: context.cookies }, async (locals) => {
    Object.assign(context.locals, locals);
    return next();
  });
});
