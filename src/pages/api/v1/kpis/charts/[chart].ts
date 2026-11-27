// E-49 GET /api/v1/kpis/charts/{C1|C2|C3}. No KPI math here.
import type { APIRoute } from 'astro';
import { getSql } from '../../../../../lib/db';
import { getChart } from '../../../../../lib/kpi';
import { errorResponse, json, parseParams, resolveBusinessToday, unauthorized } from '../../../../../lib/kpi/http';

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const l = locals as { user?: unknown; reportingDate?: string };
  if (!l.user) return unauthorized();
  const chart = (params.chart ?? '').toUpperCase();
  if (!['C1', 'C2', 'C3'].includes(chart)) return json(404, { error: { code: 'NOT_FOUND', message: 'Unknown chart.' } });
  try {
    const sql = getSql();
    const today = await resolveBusinessToday(l.reportingDate, sql);
    return json(200, { data: await getChart(chart, parseParams(url.searchParams, today), sql) });
  } catch (e) {
    return errorResponse(e);
  }
};
