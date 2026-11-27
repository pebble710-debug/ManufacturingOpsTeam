// Shared service helpers: actor type, transactions, references, stock locks, settings.
import type { Sql } from '../db';
import type { Role } from '../auth/permissions';
import { HttpError, notFound } from '../http/errors';

export interface Actor { id: number; username: string; displayName: string; role: Role }

/** Runs `fn` in one transaction (contract 1.9). */
export function inTx<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => fn(tx as unknown as Sql)) as Promise<T>;
}

export type Ref = { id: number } | { no: string };

/** `{id}` accepts the integer id or the business key (contract 1.1). */
export function parseRef(ref: string, prefix: string): Ref {
  if (/^[1-9]\d{0,17}$/.test(ref)) return { id: Number(ref) };
  const re = new RegExp(`^${prefix}-\\d{4,}$`);
  if (re.test(ref.toUpperCase())) return { no: ref.toUpperCase() };
  throw notFound();
}

export function refWhere(q: Sql, ref: Ref, alias: string, noCol: string) {
  return 'id' in ref ? q`${q(alias + '.id')} = ${ref.id}` : q`${q(alias + '.' + noCol)} = ${ref.no}`;
}

/** Takes the per-(part, location, lot) advisory locks in sorted order (no deadlocks); same key as the DB trigger. */
export async function lockStock(tx: Sql, keys: { part_id: number; location_id: number; lot_number: string }[]): Promise<void> {
  const uniq = [...new Set(keys.map((k) => `inv:${k.part_id}:${k.location_id}:${k.lot_number}`))].sort();
  for (const k of uniq) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${k}, 0))`;
}

export async function onHandQty(tx: Sql, partId: number, locationId: number, lot: string): Promise<number> {
  const [r] = await tx<{ q: string }[]>`SELECT COALESCE(SUM(qty_change), 0)::text AS q FROM inventory_transaction
                                         WHERE part_id = ${partId} AND location_id = ${locationId} AND lot_number = ${lot}`;
  return Number(r?.q ?? 0);
}

export async function settingsMap(q: Sql): Promise<Record<string, string>> {
  const rows = await q<{ key: string; value: string }[]>`SELECT key, value FROM setting WHERE scope = 'config'`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** old -> new pairs for the audit `changes` payload (only fields that differ). */
export function diffFields(oldRow: Record<string, unknown>, next: Record<string, unknown>): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(next)) {
    const o = oldRow[k];
    const norm = (x: unknown) => (x instanceof Date ? x.toISOString() : x === undefined ? null : typeof x === 'number' ? String(x) : x);
    if (norm(o) !== norm(v) && String(norm(o) ?? '') !== String(norm(v) ?? '')) out[k] = [o ?? null, v ?? null];
  }
  return out;
}

export const num = (v: unknown): number => Number(v);

export function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw notFound();
  return v;
}

export function inactive(field: string, what: string): HttpError {
  return new HttpError(422, 'INACTIVE_REFERENCE', `${what} is inactive or does not exist.`, { fields: { [field]: 'is inactive or does not exist' } });
}

/** Ensures the (part, lot) pair exists in the lot registry, else 422 LOT_PART_MISMATCH (contract section 7). */
export async function requireLot(tx: Sql, partId: number, lot: string, field = 'lot_number'): Promise<void> {
  const [r] = await tx<{ part_id: string }[]>`SELECT part_id FROM lot WHERE lot_number = ${lot}`;
  if (!r || Number(r.part_id) !== partId) {
    throw new HttpError(422, 'LOT_PART_MISMATCH', 'The lot number does not exist for this part.', { fields: { [field]: 'is not a registered lot of this part' } });
  }
}

/** Creates the lot row if new; 422 LOT_PART_MISMATCH when it belongs to another part. */
export async function ensureLot(tx: Sql, partId: number, lot: string, field = 'lot_number'): Promise<void> {
  await tx`INSERT INTO lot (lot_number, part_id) VALUES (${lot}, ${partId}) ON CONFLICT (lot_number) DO NOTHING`;
  await requireLot(tx, partId, lot, field);
}
