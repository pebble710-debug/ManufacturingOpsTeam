// Nav visibility per docs/design/ui-spec.md 2.3. Menus only; the server enforces every route.
// Uses the single permission map (src/lib/auth/permissions.ts, ADR-003 D-9).
import { can, type ActionKey } from '../lib/auth/permissions';
import { isDemoResetEnabled } from '../lib/env';
import type { Role } from './locals';

export interface NavLeaf { label: string; href: string }
export interface NavGroup { label: string; href?: string; children?: NavLeaf[] }

interface Item { label: string; href: string; action: ActionKey }

export function navFor(role: Role): NavGroup[] {
  const leaves = (items: Item[]): NavLeaf[] => items.filter((i) => can(role, i.action)).map(({ label, href }) => ({ label, href }));

  const inventory = leaves([
    { label: 'Receipts', href: '/inventory/receipts', action: 'records.read' },
    { label: 'On-hand', href: '/inventory/on-hand', action: 'records.read' },
    { label: 'Transactions', href: '/inventory/transactions', action: 'records.read' },
    { label: 'Move stock', href: '/inventory/move', action: 'inventory.move' },
    { label: 'Cycle counts', href: '/inventory/cycle-counts', action: 'records.read' },
    { label: 'Lot trace', href: '/inventory/lot-trace', action: 'records.read' },
  ]);
  const adminItems = leaves([
    { label: 'Settings', href: '/admin/settings', action: 'settings.targets' },
    { label: 'Lookups', href: '/admin/lookups/parts', action: 'lookup.manage' },
    { label: 'Audit log', href: '/admin/audit-log', action: 'audit.read' },
  ]);
  if (isDemoResetEnabled() && can(role, 'demo.reset')) adminItems.push({ label: 'Demo reset', href: '/admin/demo-reset' });

  const nav: NavGroup[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Shipments', href: '/shipments' },
    { label: 'Quality', children: [{ label: 'Errors & rework', href: '/quality/errors' }] },
    { label: 'Inventory', children: inventory },
    { label: 'Reports', href: '/reports' },
  ];
  if (adminItems.length) nav.push({ label: 'Admin', children: adminItems });
  nav.push({ label: 'Resources', href: '/resources' });
  return nav;
}
