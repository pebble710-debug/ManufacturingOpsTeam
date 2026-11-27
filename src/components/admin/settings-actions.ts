// Shared server logic for the settings page and its two POST routes (targets, reporting).
import { getSql } from '../../lib/db';
import { handleForm } from '../../lib/http/form-handler';
import { getSettings, updateReporting, updateTargets } from '../../lib/services/lookups';
import { z } from '../../lib/validation/common';
import { formCtx, type Failure } from '../inventory/form-utils';

// The form adapter only coerces names like *_pct / *_days, so *_h targets arrive as text: convert numeric text here.
const targetsSchema = z.record(z.string(), z.unknown()).transform((o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'on_time_basis' || typeof v !== 'string' || !/^-?\d+(\.\d+)?$/.test(v) ? v : Number(v)])),
);
const reportingSchema = z.object({ mode: z.enum(['fixed', 'live'], { error: 'must be fixed or live' }), reporting_date: z.string().optional() }).strict();

export async function settingsPage(Astro: { request: Request; locals: any; cookies: any; response: { status: number } }, action: 'view' | 'targets' | 'reporting') {
  const sql = getSql();
  const ctx = formCtx(Astro);
  let failure: Failure | null = null;
  if (action !== 'view' && Astro.request.method === 'POST') {
    const out = action === 'targets'
      ? await handleForm(ctx, { schema: targetsSchema, run: (s, u, input) => updateTargets(s, u, input), redirectTo: '/admin/settings', flash: 'Targets and tolerances saved.' })
      : await handleForm(ctx, { schema: reportingSchema, run: (s, u, input) => updateReporting(s, u, input), redirectTo: '/admin/settings', flash: 'Reporting date settings saved.' });
    if (out.ok) return { response: out.response, settings: null as any, failure: null, failedForm: '' };
    failure = out;
    Astro.response.status = out.status;
  }
  return { settings: await getSettings(sql), failure, failedForm: failure ? action : '' };
}
