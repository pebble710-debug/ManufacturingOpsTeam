// Cycle counts: blind count, recount, submit, approve -> ADJUST (contract 7.1; docs/03 3.4; R-3, R-4, UD-2).
import type { Sql } from '../db';
import { audit } from '../audit';
import { getBusinessClock, realNow } from '../clock';
import { HttpError, IdentityDenied, conflict, notFound, validation } from '../http/errors';
import { approverRefusal } from './rules';
import { inTx, lockStock, onHandQty, parseRef, settingsMap, type Actor, type Ref } from './common';
import type { Role } from '../auth/permissions';

type Row = Record<string, any>;
const asDate = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

async function findCount(q: Sql, ref: Ref, forUpdate = false): Promise<Row | undefined> {
  const rows = await (forUpdate
    ? 'id' in ref ? q<Row[]>`SELECT * FROM cycle_count WHERE id = ${ref.id} FOR UPDATE` : q<Row[]>`SELECT * FROM cycle_count WHERE count_no = ${ref.no} FOR UPDATE`
    : 'id' in ref ? q<Row[]>`SELECT * FROM cycle_count WHERE id = ${ref.id}` : q<Row[]>`SELECT * FROM cycle_count WHERE count_no = ${ref.no}`);
  return rows[0];
}

export async function createCycleCount(sql: Sql, user: Actor, input: { scheduled_date?: string; abc_class?: 'A' | 'B' | 'C' | null; location_id?: number | null }) {
  const id = await inTx(sql, async (tx) => {
    const clock = await getBusinessClock(tx);
    if (input.location_id) {
      const [l] = await tx<Row[]>`SELECT id FROM location WHERE id = ${input.location_id} AND active`;
      if (!l) throw validation({ location_id: 'is inactive or does not exist' });
    }
    const stock = await tx<Row[]>`
      SELECT oh.part_id::int AS part_id, oh.location_id::int AS location_id, oh.lot_number, oh.qty_on_hand, p.abc_class
        FROM v_on_hand oh JOIN part p ON p.id = oh.part_id
       WHERE oh.qty_on_hand > 0 ${input.abc_class ? tx`AND p.abc_class = ${input.abc_class}` : tx``} ${input.location_id ? tx`AND oh.location_id = ${input.location_id}` : tx``}`;
    if (stock.length === 0) throw new HttpError(422, 'NO_COUNT_LINES', 'No stock matches that scope.', { fields: { abc_class: 'no matching stock' } });
    if (stock.length > 500) throw new HttpError(422, 'COUNT_TOO_LARGE', 'The scope matches more than 500 stock rows. Narrow it.', { details: { rows: stock.length } });
    const st = await settingsMap(tx);
    const tol: Record<string, number> = { A: Number(st.tolerance_a_pct ?? 0), B: Number(st.tolerance_b_pct ?? 2), C: Number(st.tolerance_c_pct ?? 5) };
    const [c] = await tx<Row[]>`INSERT INTO cycle_count (scheduled_date, scope_abc_class, scope_location_id, created_by)
                                VALUES (${input.scheduled_date ?? clock.today}::date, ${input.abc_class ?? null}, ${input.location_id ?? null}, ${user.id}) RETURNING id::int AS id, count_no`;
    for (const r of stock) {
      await tx`INSERT INTO cycle_count_line (cycle_count_id, part_id, location_id, lot_number, abc_class, tolerance_pct, system_qty)
               VALUES (${c.id}, ${r.part_id}, ${r.location_id}, ${r.lot_number}, ${r.abc_class}, ${tol[r.abc_class]}, ${r.qty_on_hand})`;
    }
    await audit(tx, { userId: user.id, action: 'CYCLE_COUNT_CREATE', table: 'cycle_count', recordId: c.id, changes: { count_no: c.count_no, lines: stock.length, abc_class: input.abc_class ?? null, location_id: input.location_id ?? null } });
    return c.id as number;
  });
  return getCycleCount(sql, String(id), user);
}

export async function listCycleCounts(q: Sql, f: { status?: string; from?: string; to?: string; sortCol: string; desc: boolean; limit: number; offset: number }) {
  const where = q`WHERE true ${f.status ? q`AND c.status = ${f.status}` : q``} ${f.from ? q`AND c.scheduled_date >= ${f.from}::date` : q``} ${f.to ? q`AND c.scheduled_date <= ${f.to}::date` : q``}`;
  const rows = await q<Row[]>`
    SELECT c.id::int AS id, c.count_no, c.scheduled_date::text AS scheduled_date, c.status, c.scope_abc_class, loc.id::int AS loc_id, loc.code AS loc_code,
           c.created_by::int AS created_by, c.created_at, c.submitted_at, c.approved_by::int AS approved_by, c.approved_at,
           (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id) AS line_count,
           (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id AND l.counted_qty IS NOT NULL) AS counted_count
      FROM cycle_count c LEFT JOIN location loc ON loc.id = c.scope_location_id ${where}
     ORDER BY ${q(f.sortCol)} ${f.desc ? q`DESC` : q`ASC`}, c.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`;
  const [t] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM cycle_count c ${where}`;
  return { data: rows.map(shapeCount), total: t?.n ?? 0 };
}

const shapeCount = (r: Row) => ({
  id: r.id, count_no: r.count_no, scheduled_date: r.scheduled_date, status: r.status,
  scope: { abc_class: r.scope_abc_class ?? null, location: r.loc_id ? { id: r.loc_id, code: r.loc_code } : null },
  created_by: r.created_by, created_at: r.created_at, submitted_at: r.submitted_at ?? null, approved_by: r.approved_by ?? null, approved_at: r.approved_at ?? null,
  line_count: r.line_count, counted_count: r.counted_count,
});

export async function getCycleCount(q: Sql, ref: string, user: { id: number; role: Role }) {
  const p = parseRef(ref, 'CC');
  const [h] = await ('id' in p
    ? q<Row[]>`SELECT c.id::int AS id, c.count_no, c.scheduled_date::text AS scheduled_date, c.status, c.scope_abc_class, loc.id::int AS loc_id, loc.code AS loc_code,
                      c.created_by::int AS created_by, c.created_at, c.submitted_at, c.submitted_by::int AS submitted_by, c.approved_by::int AS approved_by, c.approved_at,
                      (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id) AS line_count,
                      (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id AND l.counted_qty IS NOT NULL) AS counted_count
                 FROM cycle_count c LEFT JOIN location loc ON loc.id = c.scope_location_id WHERE c.id = ${p.id}`
    : q<Row[]>`SELECT c.id::int AS id, c.count_no, c.scheduled_date::text AS scheduled_date, c.status, c.scope_abc_class, loc.id::int AS loc_id, loc.code AS loc_code,
                      c.created_by::int AS created_by, c.created_at, c.submitted_at, c.submitted_by::int AS submitted_by, c.approved_by::int AS approved_by, c.approved_at,
                      (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id) AS line_count,
                      (SELECT count(*)::int FROM cycle_count_line l WHERE l.cycle_count_id = c.id AND l.counted_qty IS NOT NULL) AS counted_count
                 FROM cycle_count c LEFT JOIN location loc ON loc.id = c.scope_location_id WHERE c.count_no = ${p.no}`);
  if (!h) throw notFound();
  const lines = await q<Row[]>`
    SELECT l.id::int AS id, pt.id::int AS part_id, pt.part_number, pt.revision, pt.abc_class, loc.id::int AS location_id, loc.code AS location_code, l.lot_number,
           l.counted_qty, l.recount_qty, l.counted_by::int AS counted_by, l.counted_at, l.recounted_by::int AS recounted_by, l.recounted_at,
           l.system_qty, l.final_qty, l.first_variance_qty, l.variance_qty, l.first_in_tolerance, l.final_in_tolerance,
           (SELECT t.id::int FROM inventory_transaction t WHERE t.cycle_count_line_id = l.id) AS adjustment_txn_id
      FROM cycle_count_line l JOIN part pt ON pt.id = l.part_id JOIN location loc ON loc.id = l.location_id
     WHERE l.cycle_count_id = ${h.id} ORDER BY loc.code, pt.part_number, l.lot_number`;
  const reveal = (h.status === 'Counted' && (user.role === 'Supervisor' || user.role === 'Admin')) || h.status === 'Approved';
  const entered = lines.some((l) => l.counted_by === user.id || l.recounted_by === user.id);
  return {
    ...shapeCount(h),
    can_approve: user.role === 'Supervisor' && h.status === 'Counted' && !entered && h.submitted_by !== user.id,
    caller_entered_lines: entered,
    lines: lines.map((l) => ({
      id: l.id, part: { id: l.part_id, part_number: l.part_number, revision: l.revision, abc_class: l.abc_class }, location: { id: l.location_id, code: l.location_code },
      lot_number: l.lot_number, counted_qty: l.counted_qty ?? null, recount_qty: l.recount_qty ?? null,
      recount_required: l.counted_qty !== null && l.first_in_tolerance === false && l.recount_qty === null,
      counted_by: l.counted_by ?? null, counted_at: l.counted_at ?? null, recounted_by: l.recounted_by ?? null, recounted_at: l.recounted_at ?? null,
      ...(reveal
        ? { system_qty: l.system_qty, variance: l.first_variance_qty ?? null, within_tolerance: l.first_in_tolerance ?? null, final_qty: l.final_qty ?? null, final_variance: l.variance_qty ?? null, adjustment_txn_id: l.adjustment_txn_id ?? null }
        : {}),
    })),
  };
}

export async function enterCounts(sql: Sql, user: Actor, ref: string, input: { entries: { line_id: number; counted_qty?: number; recount_qty?: number }[] }) {
  const id = await inTx(sql, async (tx) => {
    const c = await findCount(tx, parseRef(ref, 'CC'), true);
    if (!c) throw notFound();
    if (c.status !== 'Open') throw conflict('INVALID_COUNT_STATE', `The count is ${c.status}; entries are accepted only while it is Open.`, { status: c.status });
    const now = realNow();
    for (const [i, e] of input.entries.entries()) {
      const [l] = await tx<Row[]>`SELECT * FROM cycle_count_line WHERE id = ${e.line_id} AND cycle_count_id = ${c.id} FOR UPDATE`;
      if (!l) throw validation({ [`entries[${i}].line_id`]: 'is not a line of this count' });
      if (e.counted_qty !== undefined) {
        if (l.counted_qty !== null) throw conflict('ALREADY_COUNTED', 'This line already has a first count; it cannot be changed.', { line_id: e.line_id });
        await tx`UPDATE cycle_count_line SET counted_qty = ${e.counted_qty}, counted_by = ${user.id}, counted_at = ${now} WHERE id = ${l.id}`;
      } else {
        if (l.counted_qty === null) throw validation({ [`entries[${i}]`]: 'needs a first count before a recount' });
        if (l.first_in_tolerance) throw validation({ [`entries[${i}]`]: 'a recount is only for lines out of tolerance' });
        if (l.recount_qty !== null) throw validation({ [`entries[${i}]`]: 'this line was already recounted' });
        await tx`UPDATE cycle_count_line SET recount_qty = ${e.recount_qty!}, recounted_by = ${user.id}, recounted_at = ${now} WHERE id = ${l.id}`;
      }
    }
    await audit(tx, { userId: user.id, action: 'CYCLE_COUNT_ENTRY', table: 'cycle_count', recordId: Number(c.id), changes: { entries: input.entries.length } });
    return Number(c.id);
  });
  const rows = await sql<Row[]>`SELECT l.id::int AS id, l.counted_qty, l.recount_qty, (l.counted_qty IS NOT NULL AND l.first_in_tolerance = false AND l.recount_qty IS NULL) AS recount_required
                                FROM cycle_count_line l WHERE l.cycle_count_id = ${id} ORDER BY l.id`;
  const [c] = await sql<Row[]>`SELECT count_no, status FROM cycle_count WHERE id = ${id}`;
  return { count_no: c.count_no, status: c.status, lines: rows.map((r) => ({ line_id: r.id, counted_qty: r.counted_qty ?? null, recount_qty: r.recount_qty ?? null, recount_required: r.recount_required })) };
}

export async function submitCycleCount(sql: Sql, user: Actor, ref: string) {
  const id = await inTx(sql, async (tx) => {
    const c = await findCount(tx, parseRef(ref, 'CC'), true);
    if (!c) throw notFound();
    if (c.status !== 'Open') throw conflict('INVALID_COUNT_STATE', `The count is ${c.status}; only an Open count can be submitted.`, { status: c.status });
    const bad = await tx<{ id: number }[]>`SELECT id::int AS id FROM cycle_count_line WHERE cycle_count_id = ${c.id}
        AND (counted_qty IS NULL OR (first_in_tolerance = false AND recount_qty IS NULL)) ORDER BY id`;
    if (bad.length) throw new HttpError(422, 'COUNT_INCOMPLETE', 'Every line needs a count, and out-of-tolerance lines need a recount.', { details: { line_ids: bad.map((b) => b.id) } });
    await tx`UPDATE cycle_count SET status = 'Counted', submitted_by = ${user.id}, submitted_at = ${realNow()} WHERE id = ${c.id}`;
    await audit(tx, { userId: user.id, action: 'CYCLE_COUNT_SUBMIT', table: 'cycle_count', recordId: Number(c.id), changes: { status: ['Open', 'Counted'] } });
    return Number(c.id);
  });
  return getCycleCount(sql, String(id), user);
}

export async function approveCycleCount(sql: Sql, user: Actor, ref: string, input: { reason_code_id?: number | null; note?: string | null }) {
  const { id, adjustments, warnings } = await inTx(sql, async (tx) => {
    const c = await findCount(tx, parseRef(ref, 'CC'), true);
    if (!c) throw notFound();
    const lines = await tx<Row[]>`SELECT * FROM cycle_count_line WHERE cycle_count_id = ${c.id} ORDER BY id`;
    // R-4 + UD-2 (403) before the state checks (409), read under the count's row lock.
    const refusal = approverRefusal(user.id, lines.flatMap((l) => [l.counted_by === null ? null : Number(l.counted_by), l.recounted_by === null ? null : Number(l.recounted_by)]), c.submitted_by === null ? null : Number(c.submitted_by));
    if (refusal) throw new IdentityDenied(refusal, 'A Supervisor cannot approve a count they entered, recounted or submitted.');
    if (c.status === 'Approved') throw conflict('ALREADY_APPROVED', 'This count is already approved.');
    if (c.status !== 'Counted') throw conflict('INVALID_COUNT_STATE', `The count is ${c.status}; only a Counted count can be approved.`, { status: c.status });
    const variances = lines.filter((l) => l.final_qty !== l.system_qty);
    if (variances.length && !input.reason_code_id) throw validation({ reason_code_id: 'is required when a line has a variance' });
    if (input.reason_code_id) {
      const [rc] = await tx<Row[]>`SELECT id FROM reason_code WHERE id = ${input.reason_code_id} AND category = 'adjust' AND active`;
      if (!rc) throw validation({ reason_code_id: 'must be an active adjustment reason' });
    }
    await lockStock(tx, variances.map((l) => ({ part_id: Number(l.part_id), location_id: Number(l.location_id), lot_number: l.lot_number })));
    const warnings: Row[] = [];
    const plan: { l: Row; delta: number }[] = [];
    for (const l of variances) {
      const cur = await onHandQty(tx, Number(l.part_id), Number(l.location_id), l.lot_number);
      const delta = l.final_qty - l.system_qty;
      if (cur + delta < 0) throw conflict('ADJUST_WOULD_GO_NEGATIVE', 'The adjustment would drive on-hand below zero.', { line_id: Number(l.id), current: cur, adjustment: delta });
      if (cur !== l.system_qty) warnings.push({ line_id: Number(l.id), code: 'ON_HAND_CHANGED_SINCE_SNAPSHOT', snapshot_qty: l.system_qty, current_qty: cur });
      plan.push({ l, delta });
    }
    const adjustments: Row[] = [];
    for (const { l, delta } of plan) {
      const [t] = await tx<Row[]>`INSERT INTO inventory_transaction (txn_type, part_id, location_id, lot_number, qty_change, reason_code_id, cycle_count_line_id, created_by)
                                  VALUES ('ADJUST', ${l.part_id}, ${l.location_id}, ${l.lot_number}, ${delta}, ${input.reason_code_id!}, ${l.id}, ${user.id}) RETURNING id::int AS id`;
      adjustments.push({ line_id: Number(l.id), txn_id: t.id, qty_change: delta });
    }
    const clock = await getBusinessClock(tx);
    await tx`UPDATE cycle_count SET status = 'Approved', approved_by = ${user.id}, approved_at = ${realNow()}, approved_business_date = ${clock.today}::date,
                                    approval_reason_code_id = ${input.reason_code_id ?? null}, approval_note = ${input.note ?? null} WHERE id = ${c.id}`;
    await audit(tx, { userId: user.id, action: 'CYCLE_COUNT_APPROVE', table: 'cycle_count', recordId: Number(c.id), changes: { status: ['Counted', 'Approved'], adjustments, reason_code_id: input.reason_code_id ?? null } });
    return { id: Number(c.id), adjustments, warnings };
  });
  const detail = await getCycleCount(sql, String(id), user);
  return { ...detail, can_approve: false, adjustments, warnings };
}

export { asDate };
