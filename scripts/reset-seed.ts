// npm run db:reset-seed  -- TRUNCATE + deterministic seed in ONE transaction (seed-plan section 12, ADR-003 D-13).
//
// Target database, in order: NETLIFY_DB_URL, then .netlify/state.json (written by `astro dev`).
// A non-local host is refused unless --remote is given. With --remote (or any non-local host) the seed uses the
// 'deployed' credential branch: demo.admin gets DEMO_ADMIN_PASSWORD (at least 16 characters) or is created inactive.
// Passwords are never printed; only the database host is.
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { resetAndSeed } from '../src/lib/seed/index.ts';

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
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const remoteFlag = process.argv.includes('--remote');
if (!isLocal && !remoteFlag) {
  console.error(`Refusing to reset non-local host "${host}" without --remote.`);
  process.exit(1);
}
const remote = remoteFlag || !isLocal;
if (!remote) process.env.APP_ENV = 'local';

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  console.log(`Seeding database on host "${host}" (${remote ? 'remote/deployed credential mode' : 'local credential mode'}) ...`);
  const s = await resetAndSeed(
    sql,
    { remote, env: process.env, nowIso: new Date().toISOString(), actorUserId: null },
    () => performance.now(),
  );
  console.log(`done in ${(s.elapsedMs / 1000).toFixed(1)} s; checksum ${s.checksum}; demo.admin: ${s.admin}`);
  console.log('rows:', JSON.stringify(s.counts));
  console.log('stories:', JSON.stringify(s.meta.stories));
  const warn = Object.entries(s.meta.calibration).filter(([k]) => k.startsWith('WARN'));
  if (warn.length) console.warn('calibration warnings:', JSON.stringify(warn));
} catch (err) {
  console.error('seed failed (transaction rolled back):', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
