// Shared server logic for the cycle-count detail page and its three POST routes (entries, submit, approve).
import { getSql } from '../../lib/db';
import { handleForm } from '../../lib/http/form-handler';
import { approveCountSchema, countEntriesSchema } from '../../lib/validation/inventory';
import { emptyBody } from '../../lib/validation/common';
import { approveCycleCount, enterCounts, getCycleCount, submitCycleCount } from '../../lib/services/cycle-counts';
import { listLookup } from '../../lib/services/lookups';
import { HttpError } from '../../lib/http/errors';
import { formCtx, type Failure } from './form-utils';

type Action = 'view' | 'entries' | 'submit' | 'approve';
type Count = Awaited<ReturnType<typeof getCycleCount>>;

export interface CountPageData { response?: Response; notFound?: boolean; count?: Count; failure: Failure | null; reasons: { id: number; label: string }[] }

export async function countPage(Astro: { request: Request; locals: any; cookies: any; params: Record<string, string | undefined>; response: { status: number } }, action: Action): Promise<CountPageData> {
  const sql = getSql();
  const no = String(Astro.params.no ?? '');
  const ctx = formCtx(Astro);
  const to = `/inventory/cycle-counts/${encodeURIComponent(no)}`;
  let failure: Failure | null = null;
  if (action !== 'view' && Astro.request.method === 'POST') {
    const out =
      action === 'entries'
        ? await handleForm(ctx, {
            schema: countEntriesSchema,
            prepare: (i) => ({ entries: ((i.entries as any[]) ?? []).filter((e) => e && (e.counted_qty !== undefined || e.recount_qty !== undefined)) }),
            run: (s, u, input) => enterCounts(s, u, no, input),
            redirectTo: to,
            flash: (r) => `Counts saved for ${r.count_no}.`,
          })
        : action === 'submit'
          ? await handleForm(ctx, { schema: emptyBody, run: (s, u) => submitCycleCount(s, u, no), redirectTo: to, flash: (r) => `${r.count_no} submitted for approval.` })
          : await handleForm(ctx, {
              schema: approveCountSchema,
              run: (s, u, input) => approveCycleCount(s, u, no, input),
              redirectTo: to,
              flash: (r) => `${r.count_no} approved. ${r.adjustments.length} adjustment${r.adjustments.length === 1 ? '' : 's'} posted.`,
            });
    if (out.ok) return { response: out.response, failure: null, reasons: [] };
    failure = out;
    Astro.response.status = out.status;
  }
  const user = Astro.locals.user;
  try {
    const count = await getCycleCount(sql, no, user);
    const reasons = ((await listLookup(sql, 'reason-codes', { active: 'true', category: 'adjust' })).data as any[]).map((r) => ({ id: r.id, label: r.label }));
    return { count, failure, reasons };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { notFound: true, failure, reasons: [] };
    throw e;
  }
}
