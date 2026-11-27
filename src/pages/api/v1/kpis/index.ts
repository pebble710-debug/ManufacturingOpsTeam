// E-48 GET /api/v1/kpis. Parses parameters, calls the KPI module, shapes the response. No KPI math here.
import type { APIRoute } from 'astro';
import { getSql } from '../../../../lib/db';
import { getKpis } from '../../../../lib/kpi';
import { errorResponse, json, parseParams, resolveBusinessToday, unauthorized } from '../../../../lib/kpi/http';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const l = locals as { user?: unknown; reportingDate?: string };
  if (!l.user) return unauthorized(); // all signed-in roles may read (matrix P-02)
  try {
    const sql = getSql();
    const today = await resolveBusinessToday(l.reportingDate, sql);
    return json(200, { data: await getKpis(parseParams(url.searchParams, today), sql) });
  } catch (e) {
    return errorResponse(e);
  }
};
