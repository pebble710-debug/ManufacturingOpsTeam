// Typed view of Astro.locals for layouts/components (contract from Olivia/Diego, T-026).
// Reads defensively so error pages still render when middleware did not run.
export type Role = 'Admin' | 'Supervisor' | 'Shipping' | 'Receiving' | 'Quality' | 'Viewer';

export interface AppUser {
  id: string | number;
  username: string;
  displayName: string;
  role: Role;
}

export interface AppLocals {
  user: AppUser | null;
  csrfToken: string;
  /** YYYY-MM-DD */
  reportingDate: string;
  isLiveDate: boolean;
  /** Optional correlation id shown on the 500 page when middleware provides one. */
  requestId?: string;
}

export function appLocals(locals: unknown): AppLocals {
  const l = (locals ?? {}) as Partial<AppLocals>;
  return {
    user: l.user ?? null,
    csrfToken: l.csrfToken ?? '',
    reportingDate: l.reportingDate ?? '',
    isLiveDate: l.isLiveDate ?? false,
    requestId: l.requestId,
  };
}

/** "2026-11-25" -> "25 Nov 2026" (UTC, so the server time zone never shifts the date). */
export function formatReportingDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return null;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/logout')) return null;
  return next;
}
