// Apply netlify/database/migrations to a Postgres database using the same runner Netlify's
// local emulator uses (applyMigrations from @netlify/database-dev) over postgres.js.
// Forward-only; re-running is a no-op. Needs no Netlify CLI or login.
//
// Connection string, in order: NETLIFY_DB_URL, then .netlify/state.json (written by `astro dev`).
// Against a REMOTE database, pass --remote to confirm intent (see ADR-002 section 7).
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { applyMigrations, type SQLExecutor } from '@netlify/database-dev';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? 'netlify/database/migrations';

function resolveUrl(): string {
  const fromEnv = process.env.NETLIFY_DB_URL;
  if (fromEnv) return fromEnv;
  if (existsSync('.netlify/state.json')) {
    const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8')) as { dbConnectionString?: string };
    if (state.dbConnectionString) return state.dbConnectionString;
  }
  console.error('No database found. Start the local emulator first (`npm run dev`) or set NETLIFY_DB_URL.');
  process.exit(1);
}

const url = resolveUrl();
const host = new URL(url).hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
if (!isLocal && !process.argv.includes('--remote')) {
  console.error(`Refusing to migrate non-local host "${host}" without --remote.`);
  process.exit(1);
}
if (!existsSync(MIGRATIONS_DIR)) {
  console.log(`No ${MIGRATIONS_DIR} directory yet; nothing to apply.`);
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const exec: SQLExecutor = {
  // sql.unsafe is allowed ONLY in this migration runner (migration files are trusted, committed SQL).
  exec: (q) => sql.unsafe(q),
  query: async <T>(q: string, params?: unknown[]) => ({
    rows: (await sql.unsafe(q, params as never[])) as unknown as T[],
  }),
  transaction: (fn) =>
    sql.begin((tx) =>
      fn({
        exec: (q) => tx.unsafe(q),
        query: async <T>(q: string, params?: unknown[]) => ({
          rows: (await tx.unsafe(q, params as never[])) as unknown as T[],
        }),
      }),
    ) as never,
};

try {
  const applied = await applyMigrations(exec, MIGRATIONS_DIR);
  console.log('applied:', applied);
} finally {
  await sql.end();
}
