// The seven fictional demo users (permissions-matrix section 4) and their DEMO-ONLY passwords.
// One source for the seed, the README and the login page (ADR-003 D-13). Never reuse these anywhere real.
// Fictional data only: example.com addresses, obviously fake names.
import type { Role } from '../auth/permissions';

export interface DemoUser {
  username: string;
  displayName: string;
  role: 'Admin' | 'Supervisor' | 'Shipping' | 'Receiving' | 'Quality' | 'Viewer';
  /** Published demo-only password; null for demo.admin (see adminPasswordFor). */
  password: string | null;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { username: 'demo.admin', displayName: 'Demo Admin', role: 'Admin', password: null },
  { username: 'demo.supervisor', displayName: 'Demo Supervisor', role: 'Supervisor', password: 'Demo-Supervisor-2026' },
  { username: 'demo.shipper1', displayName: 'Demo Shipper One', role: 'Shipping', password: 'Demo-Shipper1-2026' },
  { username: 'demo.shipper2', displayName: 'Demo Shipper Two', role: 'Shipping', password: 'Demo-Shipper2-2026' },
  { username: 'demo.receiver', displayName: 'Demo Receiver', role: 'Receiving', password: 'Demo-Receiver-2026' },
  { username: 'demo.quality', displayName: 'Demo Quality', role: 'Quality', password: 'Demo-Quality-2026' },
  { username: 'demo.viewer', displayName: 'Demo Viewer', role: 'Viewer', password: 'Demo-Viewer-2026' },
] as const;

/** Documented LOCAL-ONLY password of demo.admin (used only when the seed targets a local database). */
export const LOCAL_ADMIN_PASSWORD = 'Demo-Admin-Local-2026';

export const MIN_ADMIN_PASSWORD_LENGTH = 16;

export type _RoleCheck = DemoUser['role'] extends Role ? true : never;

/** ADR-003 D-13 (Sasha DR-01): the credential mode follows the target DB, not appEnv(). */
export function seedCredentialMode(opts: { remote: boolean }): 'local' | 'deployed' {
  return opts.remote ? 'deployed' : 'local';
}

/**
 * Password to hash for demo.admin, or null when the account must be created inactive.
 * Deployed mode: DEMO_ADMIN_PASSWORD, at least 16 characters, otherwise inactive. The value is never printed.
 */
export function adminPasswordFor(mode: 'local' | 'deployed', env: Record<string, string | undefined>): string | null {
  if (mode === 'local') return LOCAL_ADMIN_PASSWORD;
  const v = env.DEMO_ADMIN_PASSWORD;
  return v && v.length >= MIN_ADMIN_PASSWORD_LENGTH ? v : null;
}
