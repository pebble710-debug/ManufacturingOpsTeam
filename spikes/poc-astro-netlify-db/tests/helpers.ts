import { NetlifyDB } from '@netlify/database-dev';
import { fileURLToPath } from 'node:url';
import { createClient, type Sql } from '../src/lib/db';

export const MIGRATIONS = fileURLToPath(new URL('../netlify/database/migrations', import.meta.url));

export async function startDb(directory?: string): Promise<{ db: NetlifyDB; url: string; sql: Sql }> {
  const db = new NetlifyDB({ directory, logger: () => {} });
  const url = await db.start();
  await db.applyMigrations(MIGRATIONS);
  return { db, url, sql: createClient(url) };
}
