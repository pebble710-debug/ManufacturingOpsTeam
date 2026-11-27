// Login and logout (ADR-003 D-5, D-7). Both surfaces (JSON API and the /login form) call these functions.
import type { Sql } from '../db';
import { audit } from '../audit';
import { HttpError } from '../http/errors';
import { clearUserKey, clientKeys, isThrottled, recordFailure } from './rate-limit';
import { hashPassword, needsRehash, verifyPassword } from './password';
import { createSession, deleteSessionByToken, purgeExpiredSessions } from './session';
import { sha256 } from './tokens';
import type { Role } from './permissions';

export interface LoginOk {
  user: { id: number; username: string; display_name: string; role: Role };
  token: string;
  csrfToken: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

export async function login(
  sql: Sql,
  input: { username: string; password: string; clientIp: string; presentedToken?: string | null },
  now: Date,
): Promise<LoginOk> {
  const username = input.username.trim().toLowerCase();
  const keys = await clientKeys(sql, username, input.clientIp);
  // Rate limit first: a throttled client costs no scrypt work and no audit row.
  const t = await isThrottled(sql, keys, now);
  if (t.throttled) {
    throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Try again later.', { headers: { 'Retry-After': String(t.retryAfterS) } });
  }
  const rows = await sql<{ id: string; username: string; display_name: string; role: Role; password_hash: string | null; active: boolean }[]>`
    SELECT id, username, display_name, role, password_hash, active FROM app_user WHERE username = ${username}`;
  const u = rows[0];
  const ok = await verifyPassword(input.password, u?.active ? u.password_hash : null);
  if (!u || !u.active || !ok) {
    await sql.begin(async (tx) => {
      await recordFailure(tx as unknown as Sql, keys, now);
      // Only an existing username is stored; otherwise the literal "unknown" (people type passwords into the username box).
      await audit(tx as unknown as Sql, { userId: u ? Number(u.id) : null, action: 'LOGIN_FAILED', changes: { username: u ? u.username : 'unknown' } });
    });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
  }
  const rehash = needsRehash(u.password_hash!) ? await hashPassword(input.password) : null;
  return sql.begin(async (txr) => {
    const tx = txr as unknown as Sql;
    if (input.presentedToken) await tx`DELETE FROM session WHERE token_hash = ${sha256(input.presentedToken)}`;
    await purgeExpiredSessions(tx, now);
    const s = await createSession(tx, Number(u.id), now);
    await clearUserKey(tx, keys);
    await tx`UPDATE app_user SET last_login_at = ${now} WHERE id = ${u.id}`;
    if (rehash) await tx`UPDATE app_user SET password_hash = ${rehash} WHERE id = ${u.id}`;
    await audit(tx, { userId: Number(u.id), action: 'LOGIN_SUCCESS', table: 'app_user', recordId: u.id });
    return {
      user: { id: Number(u.id), username: u.username, display_name: u.display_name, role: u.role },
      token: s.token,
      csrfToken: s.csrfToken,
      expiresAt: s.expiresAt,
      idleExpiresAt: s.idleExpiresAt,
    };
  });
}

export async function logout(sql: Sql, userId: number, token: string | null): Promise<void> {
  await sql.begin(async (txr) => {
    const tx = txr as unknown as Sql;
    if (token) await deleteSessionByToken(tx, token);
    await audit(tx, { userId, action: 'LOGOUT' });
  });
}
