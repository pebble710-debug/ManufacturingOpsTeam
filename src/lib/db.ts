import postgres from 'postgres';
import { getConnectionString } from '@netlify/database';

export type Sql = postgres.Sql;

/** One lazily created client per process / function instance (ADR-001 R3). */
let client: Sql | undefined;

export function createClient(url: string): Sql {
  // Small pool for serverless; short idle timeout; notices silenced.
  return postgres(url, { max: 3, idle_timeout: 5, onnotice: () => {} });
}

export function getSql(): Sql {
  if (!client) {
    const url = process.env.NETLIFY_DB_URL || getConnectionString();
    client = createClient(url);
  }
  return client;
}

/** Tests inject a client (or pass undefined to reset). */
export function setSqlForTests(sql: Sql | undefined): void {
  client = sql;
}
