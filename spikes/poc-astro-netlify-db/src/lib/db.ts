import postgres from 'postgres';
import { getConnectionString } from '@netlify/database';

export type Sql = postgres.Sql;

/** One lazily created client per process / function instance (ADR-001 R3). */
let client: Sql | undefined;

export function createClient(url: string): Sql {
  // max small for serverless; idle_timeout short. onnotice silenced.
  return postgres(url, { max: 1, idle_timeout: 5, onnotice: () => {} });
}

export function getSql(): Sql {
  client ??= createClient(getConnectionString());
  return client;
}
