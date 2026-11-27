// TEMPORARY SHIM (T-026): nav visibility per docs/design/ui-spec.md 2.3 and
// docs/plan/permissions-matrix.md. Menus only; the server enforces every route.
// TODO: replace with `can(role, actionId)` from src/lib/auth/permissions.ts when available.
import type { Role } from './locals';

export interface NavLeaf { label: string; href: string }
export interface NavGroup { label: string; href?: string; children?: NavLeaf[] }

const ALL: Role[] = ['Admin', 'Supervisor', 'Shipping', 'Receiving', 'Quality', 'Viewer'];

interface Item { label: string; href: string; roles: Role[] }

export function navFor(role: Role): NavGroup[] {
  const show = (i: Item) => i.roles.includes(role);
  const leaf = ({ label, href }: Item): NavLeaf => ({ label, href });

  const inventory: Item[] = [
    { label: 'Receipts', href: '/inventory/receipts', roles: ALL },
    { label: 'On-hand', href: '/inventory/on-hand', roles: ALL },
    { label: 'Move stock', href: '/inventory/move', roles: ['Supervisor', 'Receiving', 'Quality'] },
    { label: 'Cycle counts', href: '/inventory/cycle-counts', roles: ALL },
    { label: 'Lot trace', href: '/inventory/lot-trace', roles: ALL },
  ];
  const admin: Item[] = [
    { label: 'Settings', href: '/admin/settings', roles: ['Admin', 'Supervisor'] },
    { label: 'Lookups', href: '/admin/lookups/parts', roles: ['Admin', 'Supervisor'] },
    { label: 'Audit log', href: '/admin/audit-log', roles: ['Admin'] },
  ];

  const nav: NavGroup[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Shipments', href: '/shipments' },
    { label: 'Quality', children: [{ label: 'Errors & rework', href: '/quality/errors' }] },
    { label: 'Inventory', children: inventory.filter(show).map(leaf) },
    { label: 'Reports', href: '/reports' },
  ];
  const adminItems = admin.filter(show).map(leaf);
  if (adminItems.length) nav.push({ label: 'Admin', children: adminItems });
  nav.push({ label: 'Resources', href: '/resources' });
  return nav;
}
