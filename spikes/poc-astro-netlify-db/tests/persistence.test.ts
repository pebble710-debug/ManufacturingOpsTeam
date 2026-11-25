import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDb } from './helpers';
import { shipShipment } from '../src/lib/ship';

describe('#5 persistence across DB restart (local, on-disk PGlite directory)', () => {
  it('data written before stop() is readable after a fresh start() on the same directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'poc-pglite-'));
    try {
      const a = await startDb(dir);
      await a.sql`INSERT INTO shipment (shipment_no, customer, status) VALUES ('SH-1042','Aldervale Aerostructures','Verified')`;
      await shipShipment(a.sql, { shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 3, actor: 'demo.shipper' });
      await a.sql.end();
      await a.db.stop();

      const b = await startDb(dir); // applyMigrations again => must be a no-op, not a re-create
      const [s] = await b.sql`SELECT status FROM shipment WHERE shipment_no='SH-1042'`;
      const [n] = await b.sql`SELECT (SELECT count(*)::int FROM inventory_transaction) AS ledger, (SELECT count(*)::int FROM audit_log) AS audit`;
      expect(s.status).toBe('Shipped');
      expect(n).toMatchObject({ ledger: 1, audit: 1 });
      // append-only trigger survived the restart
      await expect(b.sql`DELETE FROM audit_log`).rejects.toThrow(/append-only/);
      await b.sql.end();
      await b.db.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
