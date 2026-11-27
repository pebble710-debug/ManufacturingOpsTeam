// Shared by the kpis endpoints and the dashboard page: parameter parsing and the reporting date.
import type { Sql } from '../db';
import { isValidYmd, KpiParamError, type KpiParams } from './index';

export function parseParams(sp: URLSearchParams, businessToday: string): KpiParams {
  const tolRaw = sp.get('tolerance');
  return {
    from: sp.get('from') || null, to: sp.get('to') || null, basis: sp.get('basis') || null,
    granularity: sp.get('granularity') || null, businessToday,
    tolerance: tolRaw === null || tolRaw === '' ? null : /^\d+$/.test(tolRaw) ? Number(tolRaw) : -1,
  };
}

/** Reporting date: middleware value (Astro.locals.reportingDate) when valid, else the setting, else null. */
export async function resolveBusinessToday(local: string | undefined, sql: Sql): Promise<string> {
  if (local && isValidYmd(local)) return local;
  const [r] = await sql<{ value: string }[]>`SELECT value FROM setting WHERE key = 'reporting_date'`;
  return r && isValidYmd(r.value) ? r.value : new Date().toISOString().slice(0, 10);
}

const HEAD = { 'content-type': 'application/json', 'cache-control': 'no-store' };
export const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: HEAD });
export function errorResponse(e: unknown): Response {
  if (e instanceof KpiParamError) return json(422, { error: { code: 'VALIDATION_ERROR', message: e.message, fields: e.fields } });
  console.error('kpi endpoint failed', e instanceof Error ? e.name : 'unknown');
  return json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' } });
}
export const unauthorized = (): Response => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
