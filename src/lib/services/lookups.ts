// Lookups (contract E-42..E-44) and settings (E-45..E-47).
import type { Sql } from '../db';
import { audit } from '../audit';
import { formatLabel, getBusinessClock } from '../clock';
import { HttpError, conflict, notFound, validation } from '../http/errors';
import { diffFields, inTx, settingsMap, type Actor } from './common';
import { z, zStr, zOptStr, isRealDate, parseInput } from '../validation/common';

type Row = Record<string, any>;

export const LOOKUP_TYPES = ['customers', 'suppliers', 'carriers', 'parts', 'locations', 'reason-codes', 'users'] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];
const TABLE: Record<Exclude<LookupType, 'users'>, string> = {
  customers: 'customer', suppliers: 'supplier', carriers: 'carrier', parts: 'part', locations: 'location', 'reason-codes': 'reason_code',
};
const IDENTITY: Record<Exclude<LookupType, 'users'>, string[]> = {
  customers: ['code'], suppliers: ['code'], carriers: [], parts: ['part_number', 'revision'], locations: ['code', 'type'], 'reason-codes': ['code', 'category'],
};

const code20 = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,20}$/, { error: 'must be 1-20 letters, digits or hyphens' });
const SCHEMAS: Record<Exclude<LookupType, 'users'>, z.ZodObject<any>> = {
  customers: z.object({ code: code20, name: zStr(1, 100), ship_to_city: zOptStr(60), ship_to_state: zOptStr(30), active: z.boolean().optional() }).strict(),
  suppliers: z.object({ code: code20, name: zStr(1, 100), active: z.boolean().optional() }).strict(),
  carriers: z.object({ name: zStr(1, 80), mode: z.enum(['Parcel', 'LTL', 'Truckload', 'Pickup'], { error: 'must be Parcel, LTL, Truckload or Pickup' }), active: z.boolean().optional() }).strict(),
  parts: z
    .object({
      part_number: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, { error: 'must be 3-30 letters, digits or hyphens' }),
      revision: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/, { error: 'must be 1-10 letters or digits' }),
      description: zOptStr(200), unit_of_measure: zStr(1, 10).optional(), abc_class: z.enum(['A', 'B', 'C'], { error: 'must be A, B or C' }),
      packaging_instruction_ref: zOptStr(100), requires_coc: z.boolean().optional(), active: z.boolean().optional(),
    })
    .strict(),
  locations: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, { error: 'must be 2-20 letters, digits or hyphens' }), type: z.enum(['Stock', 'Receiving', 'Hold', 'Shipping', 'FG'], { error: 'invalid location type' }), active: z.boolean().optional() }).strict(),
  'reason-codes': z
    .object({ category: z.enum(['late', 'hold', 'adjust', 'scrap'], { error: 'must be late, hold, adjust or scrap' }), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, { error: 'must be 2-30 letters, digits or underscores' }), label: zStr(1, 80), active: z.boolean().optional() })
    .strict(),
};

export function lookupType(raw: string): LookupType {
  if ((LOOKUP_TYPES as readonly string[]).includes(raw)) return raw as LookupType;
  throw notFound();
}

const LIST_SQL = {
  customers: (q: Sql) => q`SELECT id::int AS id, code, name, ship_to_city, ship_to_state, active FROM customer`,
  suppliers: (q: Sql) => q`SELECT id::int AS id, code, name, active FROM supplier`,
  carriers: (q: Sql) => q`SELECT id::int AS id, name, mode, active FROM carrier`,
  parts: (q: Sql) => q`SELECT id::int AS id, part_number, revision, description, unit_of_measure, abc_class, packaging_instruction_ref, requires_coc, active FROM part`,
  locations: (q: Sql) => q`SELECT id::int AS id, code, type, active FROM location`,
  'reason-codes': (q: Sql) => q`SELECT id::int AS id, category, code, label, active FROM reason_code`,
  users: (q: Sql) => q`SELECT id::int AS id, display_name, role, active FROM app_user`,
} as const;
const ORDER: Record<LookupType, string> = { customers: 'code', suppliers: 'code', carriers: 'name', parts: 'part_number', locations: 'code', 'reason-codes': 'category, code', users: 'display_name' };

export async function listLookup(q: Sql, type: LookupType, f: { active?: string; category?: string; q?: string }) {
  const active = type === 'users' ? 'true' : f.active ?? 'true';
  if (!['true', 'false', 'all'].includes(active)) throw validation({ active: 'must be true, false or all' });
  const rows = await q<Row[]>`SELECT * FROM (${LIST_SQL[type](q)}) t WHERE true
      ${active === 'all' ? q`` : q`AND active = ${active === 'true'}`}
      ${type === 'reason-codes' && f.category ? q`AND category = ${f.category}` : q``}
      ${f.q && f.q.length >= 2 ? q`AND t::text ILIKE ${'%' + f.q.replace(/[\\%_]/g, '\\$&') + '%'}` : q``}
      ORDER BY id`;
  const sorted = [...rows].sort((a, b) => ORDER[type].split(', ').map((k) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''))).find((x) => x !== 0) ?? 0);
  const out = type === 'users' ? sorted.map(({ id, display_name, role }) => ({ id, display_name, role })) : sorted;
  return { data: out, total: out.length };
}

async function inUse(tx: Sql, type: Exclude<LookupType, 'users'>, id: number): Promise<boolean> {
  const checks: Record<string, () => Promise<{ x: boolean }[]>> = {
    customers: () => tx`SELECT EXISTS (SELECT 1 FROM shipment WHERE customer_id = ${id}) AS x`,
    suppliers: () => tx`SELECT EXISTS (SELECT 1 FROM receipt WHERE supplier_id = ${id}) AS x`,
    carriers: () => tx`SELECT EXISTS (SELECT 1 FROM shipment WHERE carrier_id = ${id}) AS x`,
    parts: () => tx`SELECT (EXISTS (SELECT 1 FROM shipment_line WHERE part_id = ${id}) OR EXISTS (SELECT 1 FROM receipt WHERE part_id = ${id})
                         OR EXISTS (SELECT 1 FROM inventory_transaction WHERE part_id = ${id}) OR EXISTS (SELECT 1 FROM lot WHERE part_id = ${id})
                         OR EXISTS (SELECT 1 FROM cycle_count_line WHERE part_id = ${id})) AS x`,
    locations: () => tx`SELECT (EXISTS (SELECT 1 FROM shipment_line WHERE location_id = ${id}) OR EXISTS (SELECT 1 FROM receipt WHERE location_id = ${id})
                            OR EXISTS (SELECT 1 FROM inventory_transaction WHERE location_id = ${id}) OR EXISTS (SELECT 1 FROM cycle_count_line WHERE location_id = ${id})) AS x`,
    'reason-codes': () => tx`SELECT (EXISTS (SELECT 1 FROM shipment WHERE hold_reason_id = ${id} OR late_reason_id = ${id})
                                 OR EXISTS (SELECT 1 FROM inventory_transaction WHERE reason_code_id = ${id})
                                 OR EXISTS (SELECT 1 FROM cycle_count WHERE approval_reason_code_id = ${id})) AS x`,
  };
  return (await checks[type]())[0].x;
}

function partRule(v: Row): Record<string, string> {
  if (v.part_number && v.revision && !String(v.part_number).endsWith(`-${v.revision}`)) return { part_number: `must end with -${v.revision}` };
  return {};
}

export async function createLookup(sql: Sql, user: Actor, rawType: string, raw: unknown) {
  const type = lookupType(rawType);
  if (type === 'users') throw notFound();
  const input = parseInput(SCHEMAS[type], raw) as Row;
  if (type === 'parts') {
    const f = partRule(input);
    if (Object.keys(f).length) throw validation(f);
    input.description ??= '';
    input.unit_of_measure ??= 'EA';
  }
  const row = await inTx(sql, async (tx) => {
    const vals: Row = { ...input, active: input.active ?? true };
    const cols = Object.keys(vals).filter((k) => vals[k] !== undefined);
    try {
      const [r] = await tx<Row[]>`INSERT INTO ${tx(TABLE[type])} ${tx(vals, ...cols)} RETURNING id::int AS id`;
      await audit(tx, { userId: user.id, action: 'LOOKUP_CREATE', table: TABLE[type], recordId: r.id, changes: { type, ...vals } });
      return r.id as number;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        const key = IDENTITY[type][0] ?? 'name';
        throw new HttpError(409, 'DUPLICATE', `A ${type.replace(/s$/, '')} with that ${key.replace('_', ' ')} already exists.`, { fields: { [key]: 'already exists' } });
      }
      throw e;
    }
  });
  const { data } = await listLookup(sql, type, { active: 'all' });
  return data.find((d) => d.id === row)!;
}

export async function updateLookup(sql: Sql, user: Actor, rawType: string, rawId: string, raw: unknown) {
  const type = lookupType(rawType);
  if (type === 'users') throw notFound();
  if (!/^[1-9]\d{0,17}$/.test(rawId)) throw notFound();
  const id = Number(rawId);
  const schema = SCHEMAS[type].partial();
  const input = parseInput(schema.strict().refine((v: Row) => Object.keys(v).length > 0, { error: 'at least one field is required' }), raw) as Row;
  await inTx(sql, async (tx) => {
    const [cur] = await tx<Row[]>`SELECT * FROM ${tx(TABLE[type])} WHERE id = ${id} FOR UPDATE`;
    if (!cur) throw notFound();
    const merged = { ...cur, ...input };
    if (type === 'parts') {
      const f = partRule(merged);
      if (Object.keys(f).length) throw validation(f);
    }
    const changes = diffFields(cur, input);
    if (Object.keys(changes).length === 0) return;
    const identityChanged = IDENTITY[type].filter((k) => k in changes);
    if (identityChanged.length && (await inUse(tx, type, id))) {
      throw conflict('LOOKUP_IN_USE', 'This record is referenced elsewhere; its identity fields cannot change.', { fields: identityChanged });
    }
    const cols = Object.keys(changes);
    try {
      await tx`UPDATE ${tx(TABLE[type])} SET ${tx(input, ...cols)} WHERE id = ${id}`;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'DUPLICATE', 'A record with that key already exists.', { fields: { [IDENTITY[type][0] ?? 'name']: 'already exists' } });
      throw e;
    }
    await audit(tx, { userId: user.id, action: 'LOOKUP_UPDATE', table: TABLE[type], recordId: id, changes });
  });
  const { data } = await listLookup(sql, type, { active: 'all' });
  return data.find((d) => d.id === id)!;
}

// ----------------------------------------------------------------------------- settings
export async function getSettings(q: Sql) {
  const m = await settingsMap(q);
  const clock = await getBusinessClock(q);
  const n = (k: string) => Number(m[k]);
  return {
    targets: {
      on_time_pct: n('target_on_time_pct'), otif_pct: n('target_otif_pct'), pkg_error_rate_pct: n('target_pkg_error_rate_pct'), fpy_pct: n('target_fpy_pct'),
      rework_freq_pct: n('target_rework_freq_pct'), cycle_time_h: n('target_cycle_time_h'), inventory_accuracy_pct: n('target_inventory_accuracy_pct'), dock_to_stock_h: n('target_dock_to_stock_h'),
    },
    tolerances: { a_pct: n('tolerance_a_pct'), b_pct: n('tolerance_b_pct'), c_pct: n('tolerance_c_pct'), on_time_days: n('on_time_tolerance_days') },
    on_time_basis: m.on_time_basis,
    reporting: { mode: clock.mode, reporting_date: clock.reportingDate, business_today: clock.today, label: clock.label },
  };
}

const TARGET_KEYS = ['target_on_time_pct', 'target_otif_pct', 'target_pkg_error_rate_pct', 'target_fpy_pct', 'target_rework_freq_pct', 'target_cycle_time_h',
  'target_inventory_accuracy_pct', 'target_dock_to_stock_h', 'tolerance_a_pct', 'tolerance_b_pct', 'tolerance_c_pct', 'on_time_tolerance_days', 'on_time_basis'];

export async function updateTargets(sql: Sql, user: Actor, raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'BAD_REQUEST', 'The request body must be an object.');
  const body = raw as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const k of Object.keys(body)) if (!TARGET_KEYS.includes(k)) fields[k] = 'is not a known setting';
  if (Object.keys(body).length === 0) fields._ = 'at least one setting is required';
  if (Object.keys(fields).length) throw validation(fields);
  await inTx(sql, async (tx) => {
    const rows = await tx<Row[]>`SELECT key, value, value_type, min_value::float8 AS min_value, max_value::float8 AS max_value FROM setting WHERE key IN ${tx(Object.keys(body))} FOR UPDATE`;
    const meta = new Map(rows.map((r) => [r.key as string, r]));
    const upd: Record<string, string> = {};
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(body)) {
      const m = meta.get(k);
      if (!m) { fields[k] = 'is not a known setting'; continue; }
      if (k === 'on_time_basis') {
        if (v !== 'promise' && v !== 'requested') fields[k] = 'must be promise or requested';
      } else if (typeof v !== 'number' || !Number.isFinite(v)) fields[k] = 'must be a number';
      else if (k === 'on_time_tolerance_days' && !Number.isInteger(v)) fields[k] = 'must be a whole number';
      else if (v < m.min_value || v > m.max_value) fields[k] = `must be between ${m.min_value} and ${m.max_value}`;
      if (!fields[k]) {
        const s = String(v);
        if (s !== m.value) { upd[k] = s; changes[k] = [m.value, s]; }
      }
    }
    if (Object.keys(fields).length) throw validation(fields);
    for (const [k, v] of Object.entries(upd)) await tx`UPDATE setting SET value = ${v}, updated_by = ${user.id} WHERE key = ${k}`;
    if (Object.keys(changes).length) await audit(tx, { userId: user.id, action: 'SETTINGS_TARGETS_UPDATE', table: 'setting', changes });
  });
  return getSettings(sql);
}

export async function updateReporting(sql: Sql, user: Actor, input: { mode: 'fixed' | 'live'; reporting_date?: string }) {
  await inTx(sql, async (tx) => {
    const m = await settingsMap(tx);
    if (input.mode === 'fixed' && !input.reporting_date) throw validation({ reporting_date: 'is required in fixed mode' });
    if (input.reporting_date && (!isRealDate(input.reporting_date) || input.reporting_date < '2000-01-01' || input.reporting_date > '2100-12-31')) throw validation({ reporting_date: 'must be a valid date between 2000-01-01 and 2100-12-31' });
    const changes: Record<string, [unknown, unknown]> = {};
    if (m.reporting_mode !== input.mode) changes.reporting_mode = [m.reporting_mode, input.mode];
    await tx`UPDATE setting SET value = ${input.mode}, updated_by = ${user.id} WHERE key = 'reporting_mode'`;
    if (input.reporting_date && input.reporting_date !== m.reporting_date) {
      changes.reporting_date = [m.reporting_date, input.reporting_date];
      await tx`UPDATE setting SET value = ${input.reporting_date}, updated_by = ${user.id} WHERE key = 'reporting_date'`;
    }
    await audit(tx, { userId: user.id, action: 'SETTINGS_REPORTING_UPDATE', table: 'setting', changes });
  });
  return getSettings(sql);
}

export { formatLabel };
