// SCH-01..SCH-06: the 0001 DDL extracted from docs/data-model/migrations-plan.md applies cleanly and has the shape schema.md promises.
import { beforeAll, describe, expect, it } from 'vitest';
import { migrationSql, newDb, rows, one, expectDbError } from './helpers';

let db: any;
beforeAll(async () => {
  db = await newDb(); // throws if the DDL does not apply
});

describe('0001 DDL (extracted from migrations-plan.md section 3)', () => {
  it('SCH-01 extracts exactly one 0001 block and applies it to an empty database', async () => {
    const sql = migrationSql();
    expect(sql.split('\n').length).toBeGreaterThan(500);
    expect(sql).toContain('CREATE TABLE shipment (');
  });

  it('SCH-02 creates 24 tables and 5 views (schema.md section 1)', async () => {
    const t = await rows(db, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
    const v = await rows(db, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='VIEW'`);
    expect(t.length).toBe(24);
    expect(v.map((r) => r.table_name).sort()).toEqual(
      ['v_inventory_transaction', 'v_on_hand', 'v_on_hand_detail', 'v_shipment_delivery', 'v_shipment_quality'].sort(),
    );
  });

  it('SCH-03 seeds the 17 config/system settings plus the random client_key_salt (schema.md 3.4)', async () => {
    const s = await rows(db, `SELECT key, value, scope FROM setting ORDER BY key`);
    expect(s.length).toBe(18);
    const byKey = Object.fromEntries(s.map((r) => [r.key, r]));
    expect(byKey.reporting_mode.value).toBe('fixed');
    expect(byKey.reporting_date.value).toBe('2026-11-25');
    expect(byKey.target_on_time_pct.value).toBe('95');
    expect(byKey.target_otif_pct.value).toBe('93');
    expect(byKey.target_pkg_error_rate_pct.value).toBe('2');
    expect(byKey.target_fpy_pct.value).toBe('98');
    expect(byKey.target_rework_freq_pct.value).toBe('2');
    expect(byKey.target_cycle_time_h.value).toBe('24');
    expect(byKey.target_inventory_accuracy_pct.value).toBe('97');
    expect(byKey.target_dock_to_stock_h.value).toBe('8');
    expect([byKey.tolerance_a_pct.value, byKey.tolerance_b_pct.value, byKey.tolerance_c_pct.value]).toEqual(['0', '2', '5']);
    expect(byKey.demo_read_only_mode.value).toBe('false');
    expect(byKey.last_demo_reset_at.scope).toBe('system');
    expect(byKey.client_key_salt.scope).toBe('system');
    expect(byKey.client_key_salt.value).toMatch(/^[0-9a-f]{64}$/);
    expect(s.filter((r) => r.scope === 'system').map((r) => r.key).sort()).toEqual(['client_key_salt', 'last_demo_reset_at']);
  });

  it('SCH-04 ref_shipment_transition holds exactly the 23 documented transitions (contract 1.7)', async () => {
    const r = await rows(db, `SELECT from_status, to_status FROM ref_shipment_transition`);
    expect(r.length).toBe(23);
    const has = (a: string, b: string) => r.some((x) => x.from_status === a && x.to_status === b);
    for (const [a, b] of [['Planned', 'Ready to Pack'], ['Ready to Pack', 'Packing'], ['Packing', 'Verified'], ['Verified', 'Shipped'],
      ['Packing', 'Rework'], ['Verified', 'Rework'], ['Rework', 'Packing'], ['On Hold', 'Cancelled'], ['Rework', 'Cancelled']]) {
      expect(has(a, b), `${a} -> ${b}`).toBe(true);
    }
    // No shortcuts around verification or rework, and Shipped / Cancelled are terminal.
    for (const [a, b] of [['Planned', 'Shipped'], ['Packing', 'Shipped'], ['Rework', 'Shipped'], ['Rework', 'Verified'],
      ['Shipped', 'Packing'], ['Shipped', 'Cancelled'], ['Cancelled', 'Planned']]) {
      expect(has(a, b), `${a} -> ${b} must not exist`).toBe(false);
    }
  });

  it('SCH-05 trigger inventory: 4 append-only, 17 no-delete, 16 set_updated_at, 2 deferred constraint triggers (schema.md 6)', async () => {
    const t = await rows(db, `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`);
    const names = t.map((r) => r.tgname as string);
    expect(names.filter((n) => n.endsWith('_append_only')).sort()).toEqual(
      ['audit_log_append_only', 'inventory_transaction_append_only', 'shipment_status_history_append_only', 'shipment_verification_append_only'],
    );
    expect(names.filter((n) => n.endsWith('_no_delete')).length).toBe(17);
    expect(names.filter((n) => n.endsWith('_set_updated_at')).length).toBe(16);
    expect(names).toContain('inventory_transaction_nonnegative');
    expect(names).toContain('inventory_transaction_transfer_balanced');
    expect(names).toContain('cycle_count_approval_guard');
    expect(names).toContain('shipment_status_history_chain');
    expect(names).toContain('shipment_line_delete_guard');
    // Deferred (checked at COMMIT)
    const d = await rows(db, `SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger WHERE tgname IN ('inventory_transaction_nonnegative','inventory_transaction_transfer_balanced')`);
    expect(d.every((r) => r.tgdeferrable && r.tginitdeferred)).toBe(true);
  });

  it('SCH-06 session and login_attempt are NOT protected from delete (logout / cleanup)', async () => {
    const t = await rows(db, `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('session_no_delete','login_attempt_no_delete','audit_log_no_delete')`);
    expect(t).toEqual([]);
    await db.exec(`INSERT INTO login_attempt (key, window_start) VALUES ('abcdefgh12345678', now())`);
    await db.exec(`DELETE FROM login_attempt`);
    expect((await one(db, `SELECT count(*)::int AS n FROM login_attempt`)).n).toBe(0);
  });

  it('SCH-07 enumerations are text + CHECK (no CREATE TYPE) so widening is a constraint swap (migrations-plan 1/5)', async () => {
    expect((await one(db, `SELECT count(*)::int AS n FROM pg_type WHERE typtype='e'`)).n).toBe(0);
    const c = await rows(db, `SELECT conname FROM pg_constraint WHERE conname IN ('shipment_status_check','shipment_shipped_fields_chk','shipment_late_reason_chk','inventory_transaction_adjust_chk')`);
    expect(c.length).toBe(4); // names the planned migrations 0002..0005 DROP CONSTRAINT by
    await expectDbError(db.exec(`SELECT 1`).then(() => db.exec(`INSERT INTO carrier (name, mode) VALUES ('Rail Fantasy','Rail')`)), /violates check constraint/, '23514');
  });
});
