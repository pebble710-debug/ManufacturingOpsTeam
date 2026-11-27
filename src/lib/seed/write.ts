// Writes the generated seed into Postgres in ONE transaction (seed-plan sections 6, 9, 12, 13).
// TRUNCATE ... RESTART IDENTITY CASCADE, batched inserts in FK order, validation queries, checksum, audit row.
// No DDL, no trigger disabling (consistency-review D-10), no sql.unsafe.
import type { Sql } from '../db.ts';
import { hashPassword, SCRYPT_PARAMS, type ScryptParams } from '../auth/password.ts';
import { adminPasswordFor, DEMO_USERS, seedCredentialMode } from './demo-credentials.ts';
import { generate, demoUserRows, type Row, type SeedMeta } from './generate.ts';

export interface SeedOptions {
  /** True when the target is not the local emulator. Selects the 'deployed' credential branch (ADR-003 D-13, DR-01). */
  remote: boolean;
  env?: Record<string, string | undefined>;
  /** ISO timestamp for setting.last_demo_reset_at (the library never reads the clock). */
  nowIso?: string;
  /** User id recorded in the DEMO_RESET audit row (null for the CLI). */
  actorUserId?: number | null;
  /** Tests may lower scrypt cost; production always uses SCRYPT_PARAMS. */
  scryptParams?: ScryptParams;
}

export interface SeedSummary {
  counts: Record<string, number>;
  checksum: string;
  tableChecksums: Record<string, string>;
  admin: string;
  credentialMode: 'local' | 'deployed';
  meta: SeedMeta;
  elapsedMs: number;
}

const INSERT_ORDER = [
  'customer', 'supplier', 'carrier', 'location', 'reason_code', 'part', 'lot', 'shipment', 'shipment_line', 'receipt',
  'packaging_error', 'rework_event', 'corrective_action', 'shipment_status_history', 'shipment_verification',
  'cycle_count', 'cycle_count_line', 'inventory_transaction',
] as const;

const CHECKSUM_TABLES = ['app_user', ...INSERT_ORDER] as const;
const BATCH = 400;

export async function resetAndSeed(sql: Sql, opts: SeedOptions, clock: () => number = () => 0): Promise<SeedSummary> {
  const t0 = clock();
  const env = opts.env ?? {};
  const mode = seedCredentialMode({ remote: opts.remote });
  const adminPw = adminPasswordFor(mode, env);
  const prm = opts.scryptParams ?? SCRYPT_PARAMS;

  // P1: hash sequentially (about 128 MiB each; never in parallel)
  const users = demoUserRows('2026-05-01T08:00:00.000Z');
  const hashes: Array<string | null> = [];
  for (const u of DEMO_USERS) {
    const pw = u.username === 'demo.admin' ? adminPw : u.password;
    hashes.push(pw ? await hashPassword(pw, prm) : null);
  }
  const userRows: Row[] = users.map((u, i) => ({ ...u, password_hash: hashes[i], active: hashes[i] !== null }));

  const data = generate();

  const summary = await sql.begin(async (tx) => {
    const has = await tx`SELECT 1 AS ok FROM setting WHERE key = 'reporting_date'`;
    if (has.length === 0) throw new Error('settings missing: apply migrations first (npm run db:migrate)');
    await tx`SET LOCAL TIME ZONE 'UTC'`;

    await tx`TRUNCATE inventory_transaction, cycle_count_line, cycle_count, receipt, lot,
             rework_event, corrective_action, packaging_error,
             shipment_verification, shipment_status_history, shipment_line, shipment,
             session, login_attempt, part, location, reason_code, carrier, supplier, customer, app_user,
             audit_log
             RESTART IDENTITY CASCADE`;
    await tx`UPDATE setting SET value = default_value, updated_by = NULL WHERE scope = 'config'`;

    const insert = async (table: string, rows: Row[]): Promise<void> => {
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0] as Row);
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH).map((r) => {
          const o: Record<string, unknown> = { ...r };
          if ('checklist' in o) o.checklist = tx.json(o.checklist as never);
          return o;
        });
        await tx`INSERT INTO ${tx(table)} ${tx(chunk as never, ...cols)}`;
      }
    };

    await insert('app_user', userRows);
    for (const t of INSERT_ORDER) await insert(t, data.tables[t] as Row[]);

    // sequences: identity columns follow insertion order; number sequences are set explicitly
    const nShip = (data.tables.shipment as Row[]).length;
    await tx`SELECT setval('shipment_no_seq', ${1000 + nShip}::bigint)`;
    await tx`SELECT setval('packaging_error_no_seq', ${(data.tables.packaging_error as Row[]).length}::bigint)`;
    await tx`SELECT setval('receipt_no_seq', ${(data.tables.receipt as Row[]).length}::bigint)`;
    await tx`SELECT setval('cycle_count_no_seq', ${(data.tables.cycle_count as Row[]).length}::bigint)`;

    // identity check: ids must equal insertion order
    for (const t of ['shipment', 'shipment_line', 'receipt', 'cycle_count_line', 'inventory_transaction', 'packaging_error'] as const) {
      const [r] = await tx`SELECT count(*)::int AS n, max(id)::int AS m FROM ${tx(t)}`;
      if (!r || r.n !== r.m) throw new Error(`id sequence mismatch in ${t}`);
    }

    await validate(tx);

    // checksum (seed-plan section 13)
    const tableChecksums: Record<string, string> = {};
    for (const t of CHECKSUM_TABLES) {
      const [r] =
        t === 'app_user'
          ? await tx`SELECT md5(coalesce(string_agg(((to_jsonb(x) - 'password_hash') - 'last_login_at')::text, '|' ORDER BY id), '')) AS h FROM app_user x`
          : await tx`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY id), '')) AS h FROM ${tx(t)} x`;
      tableChecksums[t] = (r as { h: string }).h;
    }
    const [cfg] = await tx`SELECT md5(coalesce(string_agg(((to_jsonb(x) - 'updated_at') - 'updated_by')::text, '|' ORDER BY key), '')) AS h FROM setting x WHERE scope = 'config'`;
    tableChecksums.setting = (cfg as { h: string }).h;
    const [all] = await tx`SELECT md5(${Object.keys(tableChecksums).sort().map((k) => `${k}=${tableChecksums[k]}`).join(';')}) AS h`;
    const checksum = (all as { h: string }).h;

    const counts: Record<string, number> = {};
    for (const t of ['app_user', ...INSERT_ORDER] as const) {
      const [r] = await tx`SELECT count(*)::int AS n FROM ${tx(t)}`;
      counts[t] = (r as { n: number }).n;
    }
    if (opts.nowIso) await tx`UPDATE setting SET value = ${opts.nowIso} WHERE key = 'last_demo_reset_at'`;
    await tx`INSERT INTO audit_log (user_id, action, table_name, record_id, changes)
             VALUES (${opts.actorUserId ?? null}, 'DEMO_RESET', NULL, NULL, ${tx.json({ checksum, counts } as never)})`;

    const adminState = adminPw ? 'active' : 'inactive (DEMO_ADMIN_PASSWORD not usable)';
    return { counts, checksum, tableChecksums, admin: adminState, credentialMode: mode, meta: data.meta, elapsedMs: 0 } as SeedSummary;
  });
  summary.elapsedMs = clock() - t0;
  return summary;
}

type Tx = Parameters<Parameters<Sql['begin']>[1]>[0];

/** Section 9 validation queries. Any returned row aborts (rolls back) the whole reset. */
export async function validate(tx: Tx | Sql): Promise<void> {
  const fail = (name: string, rows: readonly unknown[]): void => {
    if (rows.length) throw new Error(`seed validation ${name} failed: ${JSON.stringify(rows.slice(0, 3))}`);
  };
  fail('V-1 negative on-hand', await tx`
    SELECT id, part_id, location_id, lot_number, running FROM (
      SELECT t.id, t.part_id, t.location_id, t.lot_number,
             SUM(t.qty_change) OVER (PARTITION BY t.part_id, t.location_id, t.lot_number ORDER BY t.txn_at, t.id) AS running
        FROM inventory_transaction t) x WHERE running < 0`);
  fail('V-2 ships unreceived lot', await tx`
    SELECT t.id FROM inventory_transaction t
     WHERE t.txn_type = 'SHIP' AND NOT EXISTS (
       SELECT 1 FROM inventory_transaction r
        WHERE r.part_id = t.part_id AND r.lot_number = t.lot_number
          AND r.txn_type IN ('RECEIPT','PRODUCTION_COMPLETE') AND r.txn_at <= t.txn_at)`);
  fail('V-3 ships from non-stock location', await tx`
    SELECT t.id FROM inventory_transaction t JOIN location l ON l.id = t.location_id
     WHERE t.txn_type = 'SHIP' AND l.type NOT IN ('Stock','FG','Shipping')`);
  fail('V-4a receipt quantities', await tx`
    SELECT r.id FROM receipt r LEFT JOIN inventory_transaction t ON t.receipt_id = r.id
     WHERE (r.inspection_status = 'Rejected' AND t.id IS NOT NULL)
        OR (r.inspection_status <> 'Rejected' AND (t.id IS NULL OR t.qty_change <> r.qty_received))`);
  fail('V-4b shipped quantities', await tx`
    SELECT sl.id FROM shipment_line sl JOIN shipment s ON s.id = sl.shipment_id
      LEFT JOIN inventory_transaction t ON t.shipment_line_id = sl.id
     WHERE s.status = 'Shipped' AND COALESCE(-t.qty_change, 0) <> sl.qty_shipped`);
  fail('V-5 status equals last history row', await tx`
    SELECT s.id FROM shipment s JOIN LATERAL (SELECT to_status FROM shipment_status_history
       WHERE shipment_id = s.id ORDER BY changed_at DESC, id DESC LIMIT 1) h ON true WHERE h.to_status <> s.status`);
  fail('V-6a order date after ready to pack', await tx`
    SELECT s.id FROM shipment s WHERE s.order_date >
       (SELECT (MIN(changed_at) FILTER (WHERE to_status = 'Ready to Pack') AT TIME ZONE 'UTC')::date
          FROM shipment_status_history WHERE shipment_id = s.id)`);
  fail('V-6b rework before error', await tx`
    SELECT r.id FROM rework_event r JOIN packaging_error e ON e.id = r.packaging_error_id WHERE r.started_at < e.detected_at`);
  fail('V-6c count timestamps', await tx`
    SELECT c.id FROM cycle_count c WHERE c.approved_at < c.submitted_at OR c.submitted_at < c.created_at`);
  fail('V-6d ship txn time', await tx`
    SELECT t.id FROM inventory_transaction t JOIN shipment_line sl ON sl.id = t.shipment_line_id
      JOIN shipment s ON s.id = sl.shipment_id WHERE t.txn_at <> s.shipped_at`);
  fail('V-6e events before reporting date', await tx`
    SELECT 1 WHERE (SELECT MAX(x) FROM (SELECT MAX(changed_at) x FROM shipment_status_history
       UNION ALL SELECT MAX(txn_at) FROM inventory_transaction UNION ALL SELECT MAX(verified_at) FROM shipment_verification
       UNION ALL SELECT MAX(detected_at) FROM packaging_error UNION ALL SELECT MAX(arrived_at) FROM receipt) m)
       >= TIMESTAMPTZ '2026-11-25 00:00:00+00'`);
  fail('V-7a shipped without passing last attempt', await tx`
    SELECT s.id FROM shipment s WHERE s.status = 'Shipped' AND NOT EXISTS (
       SELECT 1 FROM shipment_verification v WHERE v.shipment_id = s.id AND v.result = 'Pass'
          AND v.attempt_no = (SELECT MAX(attempt_no) FROM shipment_verification WHERE shipment_id = s.id))`);
  fail('V-7b shipped without verifier', await tx`SELECT s.id FROM shipment s WHERE s.status = 'Shipped' AND s.verified_by IS NULL`);
  fail('V-8 before-ship error without completed rework', await tx`
    SELECT e.id FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id
     WHERE e.detected_stage = 'Before ship' AND s.status = 'Shipped'
       AND NOT EXISTS (SELECT 1 FROM rework_event r WHERE r.packaging_error_id = e.id AND r.completed_at IS NOT NULL)`);
  fail('V-9 tracking numbers', await tx`
    SELECT s.id FROM shipment s JOIN carrier c ON c.id = s.carrier_id
     WHERE s.status = 'Shipped' AND ((c.mode = 'Pickup' AND s.tracking_number IS NOT NULL)
        OR (c.mode <> 'Pickup' AND s.tracking_number !~ '^(SLP[0-9]{12}|HFL[0-9]{10}|TAX[0-9]{10})$'))`);
  fail('V-10a count system_qty', await tx`
    SELECT l.id FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
     WHERE l.system_qty <> COALESCE((SELECT SUM(qty_change) FROM inventory_transaction t
         WHERE t.part_id = l.part_id AND t.location_id = l.location_id AND t.lot_number = l.lot_number
           AND t.txn_at < c.created_at), 0)`);
  fail('V-10b adjust per approved line', await tx`
    SELECT l.id FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
      LEFT JOIN inventory_transaction t ON t.cycle_count_line_id = l.id
     WHERE c.status = 'Approved' AND COALESCE(t.qty_change, 0) <> l.variance_qty`);
  fail('transfer groups', await tx`
    SELECT txn_group FROM inventory_transaction WHERE txn_group IS NOT NULL
     GROUP BY txn_group HAVING COUNT(*) <> 2 OR SUM(qty_change) <> 0`);
}
