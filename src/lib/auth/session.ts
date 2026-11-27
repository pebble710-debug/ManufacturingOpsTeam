// Cookies and DB-backed sessions (ADR-003 D-3, D-4).
import type { Sql } from '../db';
import { isDevServer } from '../env';
import { newToken, sha256 } from './tokens';
import type { Role } from './permissions';

export const IDLE_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export function sessionCookieName(dev: boolean = isDevServer()): string {
  return dev ? 'sid' : '__Host-sid';
}

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}
export function sessionCookieOptions(expiresAt: Date, now: Date, dev: boolean = isDevServer()): CookieOptions {
  return {
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

export interface SessionContext {
  sessionId: number;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  user: { id: number; username: string; displayName: string; role: Role };
}
export type SessionLookup = { ok: true; ctx: SessionContext } | { ok: false; reason: 'missing' | 'expired' | 'inactive' };

export async function createSession(tx: Sql, userId: number, now: Date): Promise<{ token: string; csrfToken: string; expiresAt: Date; idleExpiresAt: Date }> {
  const token = newToken();
  const csrfToken = newToken();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  await tx`INSERT INTO session (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at)
           VALUES (${sha256(token)}, ${userId}, ${csrfToken}, ${now}, ${now}, ${expiresAt})`;
  return { token, csrfToken, expiresAt, idleExpiresAt: new Date(Math.min(now.getTime() + IDLE_MS, expiresAt.getTime())) };
}

export async function loadSession(sql: Sql, token: string | null | undefined, now: Date): Promise<SessionLookup> {
  if (!token) return { ok: false, reason: 'missing' };
  const rows = await sql<
    { id: string; user_id: string; csrf_token: string; created_at: Date; last_seen_at: Date; expires_at: Date; username: string; display_name: string; role: Role; active: boolean }[]
  >`SELECT s.id, s.user_id, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at,
           u.username, u.display_name, u.role, u.active
      FROM session s JOIN app_user u ON u.id = s.user_id
     WHERE s.token_hash = ${sha256(token)}`;
  const r = rows[0];
  if (!r) return { ok: false, reason: 'missing' };
  if (now.getTime() >= r.expires_at.getTime() || now.getTime() >= r.last_seen_at.getTime() + IDLE_MS) {
    await sql`DELETE FROM session WHERE id = ${r.id}`;
    return { ok: false, reason: 'expired' };
  }
  if (!r.active) {
    await sql`DELETE FROM session WHERE id = ${r.id}`;
    return { ok: false, reason: 'inactive' };
  }
  let lastSeen = r.last_seen_at;
  if (now.getTime() - r.last_seen_at.getTime() >= LAST_SEEN_THROTTLE_MS) {
    await sql`UPDATE session SET last_seen_at = ${now} WHERE id = ${r.id} AND last_seen_at < ${new Date(now.getTime() - LAST_SEEN_THROTTLE_MS)}`;
    lastSeen = now;
  }
  const expiresAt = r.expires_at;
  return {
    ok: true,
    ctx: {
      sessionId: Number(r.id),
      csrfToken: r.csrf_token,
      createdAt: r.created_at,
      lastSeenAt: lastSeen,
      expiresAt,
      idleExpiresAt: new Date(Math.min(lastSeen.getTime() + IDLE_MS, expiresAt.getTime())),
      user: { id: Number(r.user_id), username: r.username, displayName: r.display_name, role: r.role },
    },
  };
}

export async function deleteSessionByToken(sql: Sql, token: string): Promise<void> {
  await sql`DELETE FROM session WHERE token_hash = ${sha256(token)}`;
}
export async function deleteUserSessions(tx: Sql, userId: number): Promise<void> {
  await tx`DELETE FROM session WHERE user_id = ${userId}`;
}
export async function purgeExpiredSessions(sql: Sql, now: Date): Promise<void> {
  await sql`DELETE FROM session WHERE expires_at < ${now} OR last_seen_at < ${new Date(now.getTime() - IDLE_MS)}`;
}
