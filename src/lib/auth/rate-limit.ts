// DB-backed login throttle (ADR-003 D-6): 5 failures per (user, client) and 30 per client per 15 minutes.
import type { Sql } from '../db';
import { sha256hex } from './tokens';

const WINDOW_MS = 15 * 60 * 1000;
export const USER_LIMIT = 5;
export const CLIENT_LIMIT = 30;

let saltCache: string | undefined;
export function resetSaltCacheForTests() {
  saltCache = undefined;
}

async function salt(sql: Sql): Promise<string> {
  if (saltCache) return saltCache;
  const r = await sql<{ value: string }[]>`SELECT value FROM setting WHERE key = 'client_key_salt'`;
  saltCache = r[0]?.value ?? 'fallback-salt';
  return saltCache;
}

export interface LoginKeys { userKey: string; clientKey: string }

export async function clientKeys(sql: Sql, username: string, clientIp: string): Promise<LoginKeys> {
  const s = await salt(sql);
  const ip = clientIp || 'unknown';
  return {
    clientKey: 'c:' + sha256hex(`${s}\0${ip}`),
    userKey: 'u:' + sha256hex(`${s}\0${username}\0${ip}`),
  };
}

function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
}

export async function isThrottled(sql: Sql, keys: LoginKeys, now: Date): Promise<{ throttled: boolean; retryAfterS: number }> {
  const ws = windowStart(now);
  const rows = await sql<{ key: string; fail_count: number }[]>`
    SELECT key, fail_count FROM login_attempt WHERE window_start = ${ws} AND key IN (${keys.userKey}, ${keys.clientKey})`;
  const by = Object.fromEntries(rows.map((r) => [r.key, r.fail_count]));
  const throttled = (by[keys.userKey] ?? 0) >= USER_LIMIT || (by[keys.clientKey] ?? 0) >= CLIENT_LIMIT;
  return { throttled, retryAfterS: Math.max(1, Math.ceil((ws.getTime() + WINDOW_MS - now.getTime()) / 1000)) };
}

export async function recordFailure(tx: Sql, keys: LoginKeys, now: Date): Promise<void> {
  const ws = windowStart(now);
  for (const key of [keys.userKey, keys.clientKey]) {
    await tx`INSERT INTO login_attempt (key, window_start, fail_count, updated_at) VALUES (${key}, ${ws}, 1, ${now})
             ON CONFLICT (key, window_start) DO UPDATE SET fail_count = login_attempt.fail_count + 1, updated_at = ${now}`;
  }
  await tx`DELETE FROM login_attempt WHERE window_start < ${new Date(now.getTime() - 24 * 3600 * 1000)}`;
}

export async function clearUserKey(tx: Sql, keys: LoginKeys): Promise<void> {
  await tx`DELETE FROM login_attempt WHERE key = ${keys.userKey}`;
}
