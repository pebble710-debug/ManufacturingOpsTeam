// The single permission map (ADR-003 D-9; docs/plan/permissions-matrix.md section 2, P-01..P-29).
// API, forms and UI hints all read this map. Identity rules R-1..R-15 live in services/rules.ts.
export type Role = 'Admin' | 'Supervisor' | 'Shipping' | 'Receiving' | 'Quality' | 'Viewer';
export const ALL_ROLES: readonly Role[] = ['Admin', 'Supervisor', 'Shipping', 'Receiving', 'Quality', 'Viewer'];

const SUP = 'Supervisor' as const;
const SHP = 'Shipping' as const;
const RCV = 'Receiving' as const;
const QUA = 'Quality' as const;
const ADM = 'Admin' as const;

export const PERMISSIONS = {
  session: { matrix: 'P-01', roles: ALL_ROLES },
  'dashboard.read': { matrix: 'P-02', roles: ALL_ROLES },
  'records.read': { matrix: 'P-03', roles: ALL_ROLES },
  'shipment.write': { matrix: 'P-04', roles: [SUP, SHP] },
  'shipment.mark-ready': { matrix: 'P-05', roles: [SUP, SHP] },
  'shipment.start-packing': { matrix: 'P-06', roles: [SUP, SHP] },
  'shipment.verify': { matrix: 'P-07', roles: [SUP, SHP, QUA] },
  'shipment.ship': { matrix: 'P-08', roles: [SUP, SHP] },
  'shipment.hold': { matrix: 'P-09', roles: [SUP, SHP, QUA] },
  'shipment.release': { matrix: 'P-10', roles: [SUP, QUA] },
  'shipment.cancel': { matrix: 'P-11', roles: [SUP, SHP] },
  'error.log': { matrix: 'P-12', roles: [SUP, SHP, QUA] },
  'rework.log': { matrix: 'P-13', roles: [SUP, SHP, QUA] },
  'error.manage': { matrix: 'P-14', roles: [SUP, QUA] },
  'receipt.create': { matrix: 'P-15', roles: [SUP, RCV] },
  'inventory.move': { matrix: 'P-16', roles: [SUP, RCV, QUA] },
  'count.create': { matrix: 'P-17', roles: [SUP] },
  'count.enter': { matrix: 'P-18', roles: [SUP, RCV] },
  'count.approve': { matrix: 'P-19', roles: [SUP] },
  'lookup.manage': { matrix: 'P-20', roles: [ADM, SUP] },
  'settings.targets': { matrix: 'P-21', roles: [ADM, SUP] },
  'settings.reporting': { matrix: 'P-22', roles: [ADM] },
  'user.manage': { matrix: 'P-23', roles: [ADM] },
  'audit.read': { matrix: 'P-24', roles: [ADM] },
  'demo.reset': { matrix: 'P-25', roles: [ADM] },
  'shipment.reopen': { matrix: 'P-26', roles: [SUP, QUA] },
  'error.contain': { matrix: 'P-27', roles: [SUP, QUA] },
  'shipment.correct': { matrix: 'P-28', roles: [SUP] },
  'resources.read': { matrix: 'P-29', roles: ALL_ROLES },
} as const satisfies Record<string, { matrix: string; roles: readonly Role[] }>;

export type ActionKey = keyof typeof PERMISSIONS;

export function can(role: Role | string | null | undefined, action: ActionKey): boolean {
  if (!role) return false;
  const entry = PERMISSIONS[action];
  return !!entry && (entry.roles as readonly string[]).includes(role);
}

export function capabilitiesFor(role: Role): ActionKey[] {
  return (Object.keys(PERMISSIONS) as ActionKey[]).filter((a) => can(role, a));
}

export function matrixIdsFor(role: Role): string[] {
  return capabilitiesFor(role).map((a) => PERMISSIONS[a].matrix).sort();
}

/** Alias kept for UI code: allowedActions(role) -> action keys the role holds in principle. */
export const allowedActions = capabilitiesFor;
