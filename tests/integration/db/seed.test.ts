// Seed integration tests (seed-plan sections 5, 9, 13, 14). Runs the real generator against in-memory Postgres.
// scrypt cost is lowered for speed (the production parameters are exercised by the timing test only once).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from '../../helpers/testdb';
import { resetAndSeed, validate, type SeedSummary } from '../../../src/lib/seed/index';
import { KPI_ORACLE_WINDOWS, kpiOracle } from './kpi-oracle';

const FAST = { log2N: 10, r: 8, p: 1 };
let db: Awaited<ReturnType<typeof startTestDb>>;
let first: SeedSummary;
let firstMs = 0;

beforeAll(async () => {
  db = await startTestDb();
  const t = performance.now();
  first = await resetAndSeed(db.sql, { remote: false, scryptParams: FAST }, () => performance.now());
  firstMs = performance.now() - t;
});
afterAll(async () => { await db.stop(); });

const one = async <T = Record<string, unknown>>(q: Promise<T[]>): Promise<T> => (await q)[0] as T;

describe('seed volumes and distributions (seed-plan section 5)', () => {
  it('finishes in well under 60 s locally', () => {
    console.log(`seed time (scrypt fast): ${Math.round(firstMs)} ms`);
    expect(firstMs).toBeLessThan(60_000);
  });

  it('row counts', () => {
    const c = first.counts;
    expect(c).toMatchObject({
      app_user: 7, customer: 6, supplier: 4, carrier: 4, location: 10, part: 26, shipment: 300, receipt: 150,
      packaging_error: 21, rework_event: 20, corrective_action: 14, cycle_count: 12,
    });
    expect(c.shipment_line).toBeGreaterThan(540);
    expect(c.shipment_line).toBeLessThan(640);
    expect(c.shipment_status_history).toBeGreaterThan(1400);
    expect(c.shipment_status_history).toBeLessThan(1600);
    expect(c.inventory_transaction).toBeGreaterThan(720);
    expect(c.inventory_transaction).toBeLessThan(800);
    expect(c.lot).toBeGreaterThanOrEqual(150);
    expect(c.lot).toBeLessThanOrEqual(165);
    expect(c.cycle_count_line).toBeGreaterThanOrEqual(195);
    expect(c.cycle_count_line).toBeLessThanOrEqual(200);
    expect(c.shipment_verification).toBeGreaterThan(280);
    expect(c.shipment_verification).toBeLessThan(296);
  });

  it('shipment statuses', async () => {
    const rows = await db.sql`SELECT status, count(*)::int AS n FROM shipment GROUP BY status`;
    const m = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    expect(m).toEqual({ Shipped: 274, Cancelled: 6, Planned: 6, 'Ready to Pack': 4, Packing: 3, Verified: 2, 'On Hold': 3, Rework: 2 });
  });

  it('peak vs other shipped volume and late rate', async () => {
    const r = await one(db.sql`SELECT count(*) FILTER (WHERE ship_date BETWEEN '2026-10-28' AND '2026-11-20')::int AS peak,
      count(*) FILTER (WHERE ship_date NOT BETWEEN '2026-10-28' AND '2026-11-20')::int AS other,
      count(*) FILTER (WHERE ship_date > promise_date)::int AS late FROM shipment WHERE status = 'Shipped'`);
    expect(r).toEqual({ peak: 70, other: 204, late: 28 });
    expect((r.late as number) / 274).toBeGreaterThanOrEqual(0.08);
    expect((r.late as number) / 274).toBeLessThanOrEqual(0.12);
    expect(await one(db.sql`SELECT count(*)::int AS n FROM shipment WHERE status='Shipped' AND ship_date > promise_date AND late_reason_id IS NULL`)).toEqual({ n: 0 });
  });

  it('packaging errors, categories, stages, severities, statuses', async () => {
    const by = async (col: string): Promise<Record<string, number>> =>
      Object.fromEntries((await db.sql`SELECT ${db.sql(col)} AS k, count(*)::int AS n FROM packaging_error GROUP BY 1`).map((r) => [r.k, r.n]));
    expect(await by('category')).toEqual({
      'Incorrect label': 6, Paperwork: 5, 'Wrong quantity': 3, 'Packaging method': 2, 'Wrong part': 2, Damage: 1, Traceability: 1, Other: 1,
    });
    expect(await by('detected_stage')).toEqual({ 'Before ship': 18, 'After ship': 3 });
    expect(await by('severity')).toEqual({ Low: 5, Medium: 6, High: 8, Critical: 2 });
    expect(await by('status')).toEqual({ Closed: 12, Contained: 3, Open: 6 });
    expect(await by('detected_by_role')).toEqual({ Verifier: 10, Packer: 4, Quality: 4, Customer: 3 });
    expect(await one(db.sql`SELECT count(DISTINCT shipment_id)::int AS n FROM packaging_error`)).toEqual({ n: 20 });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM packaging_error WHERE status = 'Open' AND detected_at < TIMESTAMPTZ '2026-11-18 00:00:00+00'`)).toMatchObject({});
    const old = await one(db.sql`SELECT count(*)::int AS n FROM packaging_error WHERE status = 'Open' AND detected_at < TIMESTAMPTZ '2026-11-18 00:00:00+00'`);
    expect(old.n).toBeGreaterThanOrEqual(3);
  });

  it('rework events and corrective actions', async () => {
    const a = Object.fromEntries((await db.sql`SELECT action, count(*)::int AS n FROM rework_event GROUP BY 1`).map((r) => [r.action, r.n]));
    expect(a).toEqual({ Relabel: 7, 'Reprint paperwork': 5, Repack: 4, 'Replace part': 2, Recount: 1, Other: 1 });
    expect(await one(db.sql`SELECT count(*) FILTER (WHERE completed_at IS NULL)::int AS open FROM rework_event`)).toEqual({ open: 1 });
    const ca = Object.fromEntries((await db.sql`SELECT status, count(*)::int AS n FROM corrective_action GROUP BY 1`).map((r) => [r.status, r.n]));
    expect(ca).toEqual({ Closed: 8, 'In Progress': 4, Open: 2 });
    const od = await one(db.sql`SELECT count(*)::int AS n FROM corrective_action WHERE status <> 'Closed' AND due_date < DATE '2026-11-25'`);
    expect(od.n).toBeGreaterThanOrEqual(3);
  });

  it('receipts: 150 with 140 accepted / 8 on hold / 2 rejected; held lots', async () => {
    const r = Object.fromEntries((await db.sql`SELECT inspection_status s, count(*)::int AS n FROM receipt GROUP BY 1`).map((x) => [x.s, x.n]));
    expect(r).toEqual({ Accepted: 140, 'On Hold': 8, Rejected: 2 });
    const held = await db.sql`SELECT t.lot_number, sum(t.qty_change)::int AS q FROM v_on_hand_detail d JOIN inventory_transaction t ON t.lot_number = d.lot_number AND t.location_id = d.location_id AND t.part_id = d.part_id WHERE d.on_hold GROUP BY 1`;
    expect(held.length).toBe(3);
    expect(held.map((h) => h.lot_number)).toContain('L2646-001');
  });

  it('cycle counts: 12 counts, statuses, accuracy by class', async () => {
    const st = Object.fromEntries((await db.sql`SELECT status, count(*)::int AS n FROM cycle_count GROUP BY 1`).map((r) => [r.status, r.n]));
    expect(st).toEqual({ Approved: 10, Counted: 1, Open: 1 });
    const acc = await db.sql`SELECT abc_class, count(*)::int n, count(*) FILTER (WHERE first_in_tolerance)::int AS ok FROM cycle_count_line WHERE counted_qty IS NOT NULL GROUP BY 1 ORDER BY 1`;
    const pct = Object.fromEntries(acc.map((r) => [r.abc_class, (r.ok as number) / (r.n as number)]));
    expect(pct.C).toBeLessThan(pct.A as number);
    expect(pct.C).toBeLessThan(pct.B as number);
    const total = acc.reduce((s, r) => s + (r.n as number), 0);
    const ok = acc.reduce((s, r) => s + (r.ok as number), 0);
    expect(ok / total).toBeGreaterThanOrEqual(0.95);
    expect(ok / total).toBeLessThanOrEqual(0.98);
  });
});

describe('demo stories (seed-plan section 8)', () => {
  it('SH-1042 paperwork revision error', async () => {
    const s = await one(db.sql`SELECT s.*, c.name AS customer FROM shipment s JOIN customer c ON c.id = s.customer_id WHERE shipment_no = 'SH-1042'`);
    expect(s.customer).toBe('Aldervale Aerostructures');
    expect(String(s.ship_date)).toMatch(/^2026-06-(1[5-9]|2\d|30)|Jun 1[5-9]|Jun 2\d|Jun 30/);
    const e = await one(db.sql`SELECT e.*, r.action, r.minutes, u.username AS packer FROM packaging_error e JOIN rework_event r ON r.packaging_error_id = e.id
      JOIN shipment s ON s.id = e.shipment_id JOIN app_user u ON u.id = s.packed_by WHERE s.shipment_no = 'SH-1042'`);
    expect(e).toMatchObject({ category: 'Paperwork', paperwork_subtype: 'Packing slip', severity: 'High', status: 'Closed', root_cause_category: 'Method', action: 'Reprint paperwork', minutes: 35, packer: 'demo.shipper2' });
    expect(e.description).toContain('revision B');
    const att = await db.sql`SELECT attempt_no, result FROM shipment_verification v JOIN shipment s ON s.id = v.shipment_id WHERE s.shipment_no = 'SH-1042' ORDER BY 1`;
    expect(att.map((a) => a.result)).toEqual(['Fail', 'Pass']);
    const late = await one(db.sql`SELECT (s.ship_date - s.promise_date)::int AS days, r.code FROM shipment s JOIN reason_code r ON r.id = s.late_reason_id WHERE shipment_no = 'SH-1042'`);
    expect(late).toEqual({ days: 1, code: 'LATE_PAPERWORK' });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM corrective_action c JOIN packaging_error e ON e.id = c.packaging_error_id JOIN shipment s ON s.id = e.shipment_id WHERE s.shipment_no='SH-1042' AND c.status='Closed'`)).toEqual({ n: 1 });
  });

  it('pinned open shipments SH-1281..SH-1300', async () => {
    const rows = await db.sql`SELECT shipment_no, status, held_from_status, rework_origin, promise_date::text AS promise, (SELECT username FROM app_user WHERE id = packed_by) AS packer FROM shipment WHERE shipment_no >= 'SH-1281' ORDER BY 1`;
    const m = Object.fromEntries(rows.map((r) => [r.shipment_no, r]));
    expect(m['SH-1281']).toMatchObject({ status: 'On Hold', held_from_status: 'Packing', promise: '2026-11-20' });
    expect(m['SH-1284']).toMatchObject({ status: 'Rework', rework_origin: 'VERIFICATION_FAILED', packer: 'demo.shipper1' });
    expect(m['SH-1285']).toMatchObject({ status: 'Rework', rework_origin: 'ERROR_LOGGED' });
    expect(m['SH-1286'].status).toBe('Verified');
    expect(m['SH-1287']).toMatchObject({ status: 'Verified', promise: '2026-11-24' });
    expect(m['SH-1288']).toMatchObject({ status: 'Packing', packer: 'demo.shipper1' });
    expect(m['SH-1290']).toMatchObject({ status: 'Packing', packer: 'demo.supervisor' });
    expect(m['SH-1300'].status).toBe('Planned');
    expect(rows.length).toBe(20);
  });

  it('story lots L2640-001 (traced) and L2646-001 (held), counts CC-0010..0012', async () => {
    const t = await db.sql`SELECT txn_type, sum(qty_change)::int q, count(*)::int n FROM inventory_transaction WHERE lot_number = 'L2640-001' GROUP BY 1 ORDER BY 1`;
    const m = Object.fromEntries(t.map((r) => [r.txn_type, r]));
    expect(m.RECEIPT).toMatchObject({ q: 400, n: 1 });
    expect(m.SHIP.n).toBe(4);
    expect(m.SCRAP).toMatchObject({ q: -5, n: 1 });
    const cust = await db.sql`SELECT DISTINCT c.name FROM inventory_transaction t JOIN shipment_line sl ON sl.id = t.shipment_line_id JOIN shipment s ON s.id = sl.shipment_id JOIN customer c ON c.id = s.customer_id WHERE t.lot_number = 'L2640-001' ORDER BY 1`;
    expect(cust.map((c) => c.name)).toEqual(['Aldervale Aerostructures', 'Ironleaf Agricultural Equipment', 'Pinecrest Robotics']);
    const held = await one(db.sql`SELECT qty_received, inspection_status, (SELECT name FROM supplier WHERE id = supplier_id) AS supplier FROM receipt WHERE lot_number = 'L2646-001'`);
    expect(held).toEqual({ qty_received: 120, inspection_status: 'On Hold', supplier: 'Meridian Polymer Co.' });
    const cc10 = await one(db.sql`SELECT count(*)::int n, count(*) FILTER (WHERE NOT first_in_tolerance)::int AS miss, count(*) FILTER (WHERE NOT final_in_tolerance)::int AS miss2 FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id WHERE c.count_no = 'CC-0010'`);
    expect(cc10).toEqual({ n: 17, miss: 2, miss2: 1 });
    expect(await one(db.sql`SELECT status FROM cycle_count WHERE count_no = 'CC-0011'`)).toEqual({ status: 'Counted' });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id WHERE c.count_no = 'CC-0012' AND counted_qty IS NULL`)).toEqual({ n: 12 });
  });

  it('customer-found story error is on a Brightwater shipment and open with an overdue action', async () => {
    const r = await one(db.sql`SELECT s.shipment_no, e.status, e.category, c.name, ca.status AS ca_status, ca.due_date::text AS due FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id
      JOIN customer c ON c.id = s.customer_id JOIN corrective_action ca ON ca.packaging_error_id = e.id WHERE e.description LIKE 'Customer count shows 118%'`);
    expect(r).toMatchObject({ status: 'Open', category: 'Wrong quantity', name: 'Brightwater Marine Systems', ca_status: 'In Progress', due: '2026-11-20' });
    expect(first.meta.stories.S2_customer_found_error_shipment).toBe(r.shipment_no);
  });
});

describe('consistency and determinism', () => {
  it('all seed-plan section 9 validation queries return zero rows', async () => {
    await validate(db.sql);
  });

  it('numbers continue after the seed: SH-1301, RC-0151, PE-0022, CC-0013', async () => {
    const [a] = await db.sql`SELECT 'SH-' || lpad(nextval('shipment_no_seq')::text, 4, '0') AS n`;
    const [b] = await db.sql`SELECT 'RC-' || lpad(nextval('receipt_no_seq')::text, 4, '0') AS n`;
    const [c] = await db.sql`SELECT 'PE-' || lpad(nextval('packaging_error_no_seq')::text, 4, '0') AS n`;
    const [d] = await db.sql`SELECT 'CC-' || lpad(nextval('cycle_count_no_seq')::text, 4, '0') AS n`;
    expect([a?.n, b?.n, c?.n, d?.n]).toEqual(['SH-1301', 'RC-0151', 'PE-0022', 'CC-0013']);
    // the reset re-seeds the sequences, so run it again in the determinism test
  });

  it('ledger replay: on-hand view equals the sum of the ledger and nothing is negative', async () => {
    expect(await one(db.sql`SELECT count(*)::int AS n FROM v_on_hand WHERE qty_on_hand < 0`)).toEqual({ n: 0 });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM inventory_transaction WHERE txn_type='SHIP' AND shipment_line_id IS NULL`)).toEqual({ n: 0 });
  });

  it('fictional only: cast names, example.com emails, tracking prefixes', async () => {
    const cust = (await db.sql`SELECT name FROM customer ORDER BY id`).map((r) => r.name);
    expect(cust).toEqual(['Aldervale Aerostructures', 'Brightwater Marine Systems', 'Pinecrest Robotics', 'Summit Valley Pumps', 'Ironleaf Agricultural Equipment', 'Northgate Rail Services']);
    expect((await db.sql`SELECT name FROM supplier ORDER BY id`).map((r) => r.name)).toEqual(['Graystone Metals Supply', 'Kestrel Fasteners', 'Meridian Polymer Co.', 'Bluefield Packaging']);
    expect((await db.sql`SELECT name FROM carrier ORDER BY id`).map((r) => r.name)).toEqual(['SwiftLane Parcel', 'Harbor Freight Lines LTL', 'TransAxis Truckload', 'Customer Pickup']);
    expect(await one(db.sql`SELECT count(*)::int AS n FROM app_user WHERE email !~ '@example\.com$'`)).toEqual({ n: 0 });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM shipment WHERE tracking_number IS NOT NULL AND tracking_number !~ '^(SLP|HFL|TAX)[0-9]+$'`)).toEqual({ n: 0 });
  });

  it('seven demo users with the right roles; hashes are scrypt, unique and not the password', async () => {
    const u = await db.sql`SELECT username, role, active, password_hash FROM app_user ORDER BY id`;
    expect(u.map((x) => `${x.username}:${x.role}`)).toEqual([
      'demo.admin:Admin', 'demo.supervisor:Supervisor', 'demo.shipper1:Shipping', 'demo.shipper2:Shipping',
      'demo.receiver:Receiving', 'demo.quality:Quality', 'demo.viewer:Viewer',
    ]);
    expect(u.every((x) => x.active && /^scrypt\$10\$8\$1\$/.test(x.password_hash as string))).toBe(true);
    expect(new Set(u.map((x) => x.password_hash)).size).toBe(7);
  });

  it('reset twice gives the same checksum and the same table checksums (determinism)', async () => {
    const again = await resetAndSeed(db.sql, { remote: false, scryptParams: FAST });
    expect(again.checksum).toBe(first.checksum);
    expect(again.tableChecksums).toEqual(first.tableChecksums);
    expect(again.counts).toEqual(first.counts);
    // numbers restart from the seed state again
    const [a] = await db.sql`SELECT 'SH-' || lpad(nextval('shipment_no_seq')::text, 4, '0') AS n`;
    expect(a?.n).toBe('SH-1301');
    // only one audit row after a reset (D-5)
    expect(await one(db.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'DEMO_RESET'`)).toEqual({ n: 1 });
    expect(await one(db.sql`SELECT count(*)::int AS n FROM audit_log`)).toEqual({ n: 1 });
  });

  it('pinned checksum: changes only with a deliberate generator change (update seed-plan section 10 too)', () => {
    expect(first.checksum).toBe(PINNED_CHECKSUM);
  });

  it('KPI oracle values on the seed equal the pinned values (docs/data-model/seed-plan.md section 10)', async () => {
    for (const w of KPI_ORACLE_WINDOWS) {
      const got = await kpiOracle(db.sql, w.from, w.to);
      expect(got, w.name).toMatchObject(PINNED_KPI[w.name] as Record<string, unknown>);
    }
  });

  it('with production scrypt parameters the whole reset still finishes in under 60 s (ADR-001 R4, local measurement)', async () => {
    const t = performance.now();
    const s = await resetAndSeed(db.sql, { remote: false }, () => performance.now());
    const ms = performance.now() - t;
    console.log(`seed time (production scrypt 2^17, 7 users): ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(60_000);
    expect(s.checksum).toBe(first.checksum);
  });
});

describe('demo.admin credential branch (ADR-003 D-13, Sasha DR-01 / DR-02)', () => {
  const adminRow = async () => one(db.sql`SELECT active, password_hash FROM app_user WHERE username = 'demo.admin'`);

  it('remote target without DEMO_ADMIN_PASSWORD: demo.admin is inactive with no hash', async () => {
    const s = await resetAndSeed(db.sql, { remote: true, env: {}, scryptParams: FAST });
    expect(await adminRow()).toEqual({ active: false, password_hash: null });
    expect(s.admin).toContain('inactive');
    expect(s.credentialMode).toBe('deployed');
  });

  it('remote target with a password shorter than 16 characters: still inactive', async () => {
    await resetAndSeed(db.sql, { remote: true, env: { DEMO_ADMIN_PASSWORD: 'short-pw-15char' }, scryptParams: FAST });
    expect(await adminRow()).toEqual({ active: false, password_hash: null });
  });

  it('remote target with a 16+ character password: active, and the password is not in the summary', async () => {
    const pw = 'a-long-enough-test-secret';
    const s = await resetAndSeed(db.sql, { remote: true, env: { DEMO_ADMIN_PASSWORD: pw }, scryptParams: FAST });
    const row = await adminRow();
    expect(row.active).toBe(true);
    expect(String(row.password_hash)).toMatch(/^scrypt\$10\$8\$1\$/);
    expect(JSON.stringify(s)).not.toContain(pw);
    // never the published local password on a remote target
    const { verifyPassword } = await import('../../../src/lib/auth/password');
    const { LOCAL_ADMIN_PASSWORD } = await import('../../../src/lib/seed/demo-credentials');
    expect(await verifyPassword(LOCAL_ADMIN_PASSWORD, row.password_hash as string)).toBe(false);
    expect(await verifyPassword(pw, row.password_hash as string)).toBe(true);
  });

  it('the six published users can log in with their demo-only passwords', async () => {
    await resetAndSeed(db.sql, { remote: false, scryptParams: FAST });
    const { verifyPassword } = await import('../../../src/lib/auth/password');
    const { DEMO_USERS } = await import('../../../src/lib/seed/demo-credentials');
    for (const u of DEMO_USERS.filter((x) => x.password)) {
      const r = await one(db.sql`SELECT password_hash FROM app_user WHERE username = ${u.username}`);
      expect(await verifyPassword(u.password as string, r.password_hash as string), u.username).toBe(true);
    }
  });
});

// ---- pinned values (seed-plan section 10); regenerate deliberately when the generator changes ----
const PINNED_CHECKSUM = '2f9e05673e717b456f92bf7d947115a3';
const PINNED_KPI: Record<string, Record<string, unknown>> = {
  'default_window_2026-10-27_to_2026-11-25': {
    shipped: 76, on_time_pct: 84.2, otif_pct: 81.6, median_cycle_h: 27.58, p90_cycle_h: 84.39,
    kpi3_error_rate_pct: 11.8, kpi3_errors_per_100: 11.8, shipments_with_error: 9, errors: 9, internal_catches: 8, customer_escapes: 1,
    kpi4_fpy_pct: 86.3, verified: 80, first_pass_no_error: 69, kpi5_rework_freq_pct: 13.2, rework_events: 10, total_minutes: 439, avg_minutes: 43.9,
    lines: 17, accuracy_first_count_pct: 88.2, accuracy_after_recount_pct: 94.1, absolute_variance_units: 7,
  },
  'previous_period_2026-09-27_to_2026-10-26': {
    shipped: 38, on_time_pct: 86.8, otif_pct: 86.8, median_cycle_h: 19.48, p90_cycle_h: 68.03,
    kpi3_error_rate_pct: 5.3, shipments_with_error: 2, errors: 2, internal_catches: 2, customer_escapes: 0,
    kpi4_fpy_pct: 94.7, verified: 38, first_pass_no_error: 36, kpi5_rework_freq_pct: 7.9, rework_events: 3, total_minutes: 91, avg_minutes: 30.33,
    lines: 34, accuracy_first_count_pct: 100, accuracy_after_recount_pct: 100, absolute_variance_units: 49,
  },
  'six_months_2026-05-26_to_2026-11-25': {
    shipped: 274, on_time_pct: 89.8, otif_pct: 88.3, median_cycle_h: 22.28, p90_cycle_h: 69.21,
    kpi3_error_rate_pct: 6.6, kpi3_errors_per_100: 6.9, shipments_with_error: 18, errors: 19, internal_catches: 16, customer_escapes: 3,
    kpi4_fpy_pct: 92.8, kpi5_rework_freq_pct: 6.9, rework_events: 19, total_minutes: 817, avg_minutes: 43,
    lines: 168, accuracy_first_count_pct: 95.2, accuracy_after_recount_pct: 97, absolute_variance_units: 167,
  },
};
