import { NetlifyDB } from '@netlify/database-dev';
import { fileURLToPath } from 'node:url';
import { createClient, setSqlForTests, type Sql } from '../../src/lib/db';

export const MIGRATIONS = fileURLToPath(new URL('../../netlify/database/migrations', import.meta.url));

/** Starts an in-memory Postgres, applies all migrations, injects the client into src/lib/db. */
export async function startTestDb(): Promise<{ sql: Sql; url: string; stop: () => Promise<void> }> {
  const db = new NetlifyDB({ logger: () => {} });
  const url = await db.start();
  await db.applyMigrations(MIGRATIONS);
  const sql = createClient(url);
  setSqlForTests(sql);
  return {
    sql,
    url,
    stop: async () => {
      setSqlForTests(undefined);
      await sql.end({ timeout: 2 });
      await db.stop();
    },
  };
}
