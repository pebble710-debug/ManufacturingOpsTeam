// SPIKE: apply ./netlify/database/migrations to the *running* local emulator (or any NETLIFY_DB_URL)
// using @netlify/database-dev's applyMigrations over a postgres.js connection.
// Connection string: NETLIFY_DB_URL, else .netlify/state.json (written by `astro dev`).
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { applyMigrations, type SQLExecutor } from '@netlify/database-dev';

const url = process.env.NETLIFY_DB_URL ?? (JSON.parse(readFileSync('.netlify/state.json', 'utf8')) as { dbConnectionString: string }).dbConnectionString;
const sql = postgres(url, { max: 1, onnotice: () => {} });
const exec: SQLExecutor = {
  exec: (q) => sql.unsafe(q), // migration runner only; banned in app code
  query: async <T>(q: string, params?: unknown[]) => ({ rows: (await sql.unsafe(q, params as never[])) as unknown as T[] }),
  transaction: (fn) => sql.begin((tx) => fn({
    exec: (q) => tx.unsafe(q),
    query: async <T>(q: string, params?: unknown[]) => ({ rows: (await tx.unsafe(q, params as never[])) as unknown as T[] }),
  })) as never,
};
const applied = await applyMigrations(exec, 'netlify/database/migrations');
console.log('applied:', applied);
await sql.end();
