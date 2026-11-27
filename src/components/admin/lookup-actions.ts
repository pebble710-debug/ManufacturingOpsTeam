// Shared server logic for the lookup list / new / update routes.
import { getSql } from '../../lib/db';
import { handleForm } from '../../lib/http/form-handler';
import { createLookup, listLookup, lookupType, updateLookup, LOOKUP_TYPES } from '../../lib/services/lookups';
import { z } from '../../lib/validation/common';
import { HttpError } from '../../lib/http/errors';
import { formCtx, type Failure } from '../inventory/form-utils';
import { SPECS } from './lookup-specs';

const anyObject = z.record(z.string(), z.unknown());

export interface LookupPageData { response?: Response; notFound?: boolean; type: string; rows: any[]; failure: Failure | null; failedId: string }

export async function lookupPage(Astro: { request: Request; locals: any; cookies: any; url: URL; params: Record<string, string | undefined>; response: { status: number } }, mode: 'list' | 'new' | 'update'): Promise<LookupPageData> {
  const type = String(Astro.params.type ?? '');
  if (!(LOOKUP_TYPES as readonly string[]).includes(type)) return { notFound: true, type, rows: [], failure: null, failedId: '' };
  const sql = getSql();
  let failure: Failure | null = null;
  const id = String(Astro.params.id ?? '');
  if (mode !== 'list' && Astro.request.method === 'POST') {
    const out = await handleForm(formCtx(Astro), {
      schema: anyObject,
      booleans: (SPECS[type] ?? []).filter((f) => f.kind === 'bool').map((f) => f.name),
      run: (s, u, input) => (mode === 'new' ? createLookup(s, u, lookupType(type), input) : updateLookup(s, u, lookupType(type), id, input)),
      redirectTo: `/admin/lookups/${type}`,
      flash: () => (mode === 'new' ? 'Record created.' : 'Record updated.'),
    });
    if (out.ok) return { response: out.response, type, rows: [], failure: null, failedId: '' };
    failure = out;
    Astro.response.status = out.status;
  }
  const f = Astro.url.searchParams;
  const active = f.get('active') ?? (type === 'users' ? 'true' : 'all');
  let rows: any[] = [];
  try {
    rows = (await listLookup(sql, lookupType(type), { active: ['true', 'false', 'all'].includes(active) ? active : 'all', category: f.get('category') ?? undefined, q: f.get('q') ?? undefined })).data as any[];
  } catch (e) { if (!(e instanceof HttpError)) throw e; }
  return { type, rows, failure, failedId: id };
}
