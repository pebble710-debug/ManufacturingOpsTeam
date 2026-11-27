// Audit log writer (contract section 1.8). Never write passwords, tokens, CSRF values, IPs or env values here.
import type { Sql } from './db';

export interface AuditEntry {
  userId: number | string | null;
  action: string;
  table?: string | null;
  recordId?: number | string | null;
  changes?: Record<string, unknown> | null;
}

const FORBIDDEN_KEYS = /^(password|password_hash|token|csrf|csrf_token|_csrf|session|secret|ip|ip_address|authorization|cookie)$/i;

export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!FORBIDDEN_KEYS.test(k)) out[k] = scrub(v);
    return out;
  }
  return value;
}

/** Insert one audit row using the caller's transaction (same commit as the change). */
export async function audit(tx: Sql, e: AuditEntry): Promise<void> {
  const changes = e.changes ? JSON.stringify(scrub(e.changes)) : null;
  await tx`INSERT INTO audit_log (user_id, action, table_name, record_id, changes)
           VALUES (${e.userId == null ? null : Number(e.userId)}, ${e.action}, ${e.table ?? null},
                   ${e.recordId == null ? null : String(e.recordId)}, ${changes}::jsonb)`;
}

/** ACCESS_DENIED in its own short transaction so it survives the aborted request (contract 1.8). */
export async function auditDenied(
  sql: Sql,
  e: { userId: number | string | null; method: string; path: string; code: string; role?: string; required?: unknown },
): Promise<void> {
  try {
    await audit(sql, {
      userId: e.userId,
      action: 'ACCESS_DENIED',
      changes: { method: e.method, path: e.path, code: e.code, role: e.role ?? null, required: e.required ?? null },
    });
  } catch {
    // A failed audit write must never turn a 403 into a 500 that leaks state.
  }
}
