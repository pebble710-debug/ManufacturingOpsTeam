// Deny-by-default route table (ADR-003 D-9). Every route the app serves has exactly one entry; the middleware
// refuses non-GET requests with no entry (404) and checks the base permission of the entry's action.
import type { ActionKey } from './permissions';

export type Surface = 'api' | 'form' | 'page' | 'public';
export interface RouteSpec {
  id: string;
  method: 'GET' | 'POST' | 'PATCH';
  pattern: string;
  surface: Surface;
  action: ActionKey | 'public';
  flag?: 'DEMO_RESET_ENABLED';
}

type T = [string, RouteSpec['method'], string, Surface, ActionKey | 'public', RouteSpec['flag']?];

const A = '/api/v1';
const TABLE: T[] = [
  // ---- JSON API (contract section 3) ----
  ['E-02', 'POST', `${A}/auth/login`, 'api', 'public'],
  ['E-03', 'POST', `${A}/auth/logout`, 'api', 'session'],
  ['E-04', 'GET', `${A}/me`, 'api', 'session'],
  ['E-05', 'GET', `${A}/shipments`, 'api', 'records.read'],
  ['E-06', 'POST', `${A}/shipments`, 'api', 'shipment.write'],
  ['E-07', 'GET', `${A}/shipments/:id`, 'api', 'records.read'],
  ['E-08', 'PATCH', `${A}/shipments/:id`, 'api', 'shipment.write'],
  ['E-09', 'POST', `${A}/shipments/:id/actions/mark-ready`, 'api', 'shipment.mark-ready'],
  ['E-10', 'POST', `${A}/shipments/:id/actions/start-packing`, 'api', 'shipment.start-packing'],
  ['E-11', 'POST', `${A}/shipments/:id/actions/verify`, 'api', 'shipment.verify'],
  ['E-12', 'POST', `${A}/shipments/:id/actions/ship`, 'api', 'shipment.ship'],
  ['E-13', 'POST', `${A}/shipments/:id/actions/hold`, 'api', 'shipment.hold'],
  ['E-14', 'POST', `${A}/shipments/:id/actions/release`, 'api', 'shipment.release'],
  ['E-15', 'POST', `${A}/shipments/:id/actions/cancel`, 'api', 'shipment.cancel'],
  ['E-16', 'POST', `${A}/shipments/:id/actions/reopen`, 'api', 'shipment.reopen'],
  ['E-53', 'POST', `${A}/shipments/:id/actions/correct`, 'api', 'shipment.correct'],
  ['E-17', 'GET', `${A}/packaging-errors`, 'api', 'records.read'],
  ['E-18', 'POST', `${A}/packaging-errors`, 'api', 'error.log'],
  ['E-19', 'GET', `${A}/packaging-errors/:id`, 'api', 'records.read'],
  ['E-20', 'PATCH', `${A}/packaging-errors/:id`, 'api', 'error.manage'],
  ['E-21', 'POST', `${A}/packaging-errors/:id/actions/contain`, 'api', 'error.contain'],
  ['E-22', 'POST', `${A}/packaging-errors/:id/actions/close`, 'api', 'error.manage'],
  ['E-23', 'GET', `${A}/rework-events`, 'api', 'records.read'],
  ['E-24', 'POST', `${A}/rework-events`, 'api', 'rework.log'],
  ['E-25', 'PATCH', `${A}/rework-events/:id`, 'api', 'rework.log'],
  ['E-26', 'GET', `${A}/corrective-actions`, 'api', 'records.read'],
  ['E-27', 'POST', `${A}/corrective-actions`, 'api', 'error.manage'],
  ['E-28', 'PATCH', `${A}/corrective-actions/:id`, 'api', 'error.manage'],
  ['E-29', 'GET', `${A}/receipts`, 'api', 'records.read'],
  ['E-30', 'POST', `${A}/receipts`, 'api', 'receipt.create'],
  ['E-31', 'GET', `${A}/receipts/:id`, 'api', 'records.read'],
  ['E-32', 'GET', `${A}/inventory/on-hand`, 'api', 'records.read'],
  ['E-33', 'GET', `${A}/inventory-transactions`, 'api', 'records.read'],
  ['E-34', 'POST', `${A}/inventory-transactions`, 'api', 'inventory.move'],
  ['E-35', 'GET', `${A}/cycle-counts`, 'api', 'records.read'],
  ['E-36', 'POST', `${A}/cycle-counts`, 'api', 'count.create'],
  ['E-37', 'GET', `${A}/cycle-counts/:id`, 'api', 'records.read'],
  ['E-38', 'POST', `${A}/cycle-counts/:id/entries`, 'api', 'count.enter'],
  ['E-39', 'POST', `${A}/cycle-counts/:id/actions/submit`, 'api', 'count.enter'],
  ['E-40', 'POST', `${A}/cycle-counts/:id/actions/approve`, 'api', 'count.approve'],
  ['E-41', 'GET', `${A}/lot-trace/:lot`, 'api', 'records.read'],
  ['E-42', 'GET', `${A}/lookups/:type`, 'api', 'records.read'],
  ['E-43', 'POST', `${A}/lookups/:type`, 'api', 'lookup.manage'],
  ['E-44', 'PATCH', `${A}/lookups/:type/:id`, 'api', 'lookup.manage'],
  ['E-45', 'GET', `${A}/settings`, 'api', 'dashboard.read'],
  ['E-46', 'PATCH', `${A}/settings/targets`, 'api', 'settings.targets'],
  ['E-47', 'PATCH', `${A}/settings/reporting`, 'api', 'settings.reporting'],
  ['E-48', 'GET', `${A}/kpis`, 'api', 'dashboard.read'],
  ['E-49', 'GET', `${A}/kpis/charts/:chart`, 'api', 'dashboard.read'],
  ['E-50', 'GET', `${A}/reports/:id`, 'api', 'records.read'],
  ['E-51', 'GET', `${A}/admin/audit-log`, 'api', 'audit.read'],
  ['E-52', 'POST', `${A}/admin/demo-reset`, 'api', 'demo.reset', 'DEMO_RESET_ENABLED'],

  // ---- HTML form routes (contract section 1.12; POST only, urlencoded + _csrf) ----
  ['F-login', 'POST', '/login', 'public', 'public'],
  ['F-logout', 'POST', '/logout', 'form', 'session'],
  ['F-ship-new', 'POST', '/shipments/new', 'form', 'shipment.write'],
  ['F-ship-edit', 'POST', '/shipments/:no/edit', 'form', 'shipment.write'],
  ['F-mark-ready', 'POST', '/shipments/:no/actions/mark-ready', 'form', 'shipment.mark-ready'],
  ['F-start-packing', 'POST', '/shipments/:no/actions/start-packing', 'form', 'shipment.start-packing'],
  ['F-hold', 'POST', '/shipments/:no/actions/hold', 'form', 'shipment.hold'],
  ['F-release', 'POST', '/shipments/:no/actions/release', 'form', 'shipment.release'],
  ['F-cancel', 'POST', '/shipments/:no/actions/cancel', 'form', 'shipment.cancel'],
  ['F-reopen', 'POST', '/shipments/:no/actions/reopen', 'form', 'shipment.reopen'],
  ['F-verify', 'POST', '/shipments/:no/pack-verify', 'form', 'shipment.verify'],
  ['F-ship', 'POST', '/shipments/:no/ship', 'form', 'shipment.ship'],
  ['F-correct', 'POST', '/shipments/:no/correct', 'form', 'shipment.correct'],
  ['F-error-new', 'POST', '/quality/errors/new', 'form', 'error.log'],
  ['F-error-root', 'POST', '/quality/errors/:no/root-cause', 'form', 'error.manage'],
  ['F-error-contain', 'POST', '/quality/errors/:no/contain', 'form', 'error.contain'],
  ['F-error-close', 'POST', '/quality/errors/:no/close', 'form', 'error.manage'],
  ['F-rework-new', 'POST', '/quality/errors/:no/rework/new', 'form', 'rework.log'],
  ['F-rework-complete', 'POST', '/quality/errors/:no/rework/:rid/complete', 'form', 'rework.log'],
  ['F-ca-new', 'POST', '/quality/errors/:no/corrective-actions/new', 'form', 'error.manage'],
  ['F-ca-update', 'POST', '/quality/errors/:no/corrective-actions/:cid', 'form', 'error.manage'],
  ['F-receipt-new', 'POST', '/inventory/receipts/new', 'form', 'receipt.create'],
  ['F-move', 'POST', '/inventory/move', 'form', 'inventory.move'],
  ['F-count-new', 'POST', '/inventory/cycle-counts/new', 'form', 'count.create'],
  ['F-count-entries', 'POST', '/inventory/cycle-counts/:no/entries', 'form', 'count.enter'],
  ['F-count-submit', 'POST', '/inventory/cycle-counts/:no/submit', 'form', 'count.enter'],
  ['F-count-approve', 'POST', '/inventory/cycle-counts/:no/approve', 'form', 'count.approve'],
  ['F-lookup-new', 'POST', '/admin/lookups/:type/new', 'form', 'lookup.manage'],
  ['F-lookup-update', 'POST', '/admin/lookups/:type/:id', 'form', 'lookup.manage'],
  ['F-set-targets', 'POST', '/admin/settings/targets', 'form', 'settings.targets'],
  ['F-set-reporting', 'POST', '/admin/settings/reporting', 'form', 'settings.reporting'],
  ['F-demo-reset', 'POST', '/admin/demo-reset', 'form', 'demo.reset', 'DEMO_RESET_ENABLED'],

  // ---- Pages (GET) ----
  ['P-login', 'GET', '/login', 'public', 'public'],
  ['P-robots', 'GET', '/robots.txt', 'public', 'public'],
  ['P-health', 'GET', '/health', 'public', 'public'],
  ['P-home', 'GET', '/', 'page', 'session'],
  ['P-dashboard', 'GET', '/dashboard', 'page', 'dashboard.read'],
  ['P-resources', 'GET', '/resources', 'page', 'resources.read'],
  ['P-ship-new', 'GET', '/shipments/new', 'page', 'shipment.write'],
  ['P-ship-list', 'GET', '/shipments', 'page', 'records.read'],
  ['P-ship-edit', 'GET', '/shipments/:no/edit', 'page', 'shipment.write'],
  ['P-ship-verify', 'GET', '/shipments/:no/pack-verify', 'page', 'shipment.verify'],
  ['P-ship-ship', 'GET', '/shipments/:no/ship', 'page', 'shipment.ship'],
  ['P-ship-correct', 'GET', '/shipments/:no/correct', 'page', 'shipment.correct'],
  ['P-ship-detail', 'GET', '/shipments/:no', 'page', 'records.read'],
  ['P-error-new', 'GET', '/quality/errors/new', 'page', 'error.log'],
  ['P-errors', 'GET', '/quality/errors', 'page', 'records.read'],
  ['P-error-rework-new', 'GET', '/quality/errors/:no/rework/new', 'page', 'rework.log'],
  ['P-error-ca-new', 'GET', '/quality/errors/:no/corrective-actions/new', 'page', 'error.manage'],
  ['P-error-detail', 'GET', '/quality/errors/:no', 'page', 'records.read'],
  ['P-receipt-new', 'GET', '/inventory/receipts/new', 'page', 'receipt.create'],
  ['P-receipts', 'GET', '/inventory/receipts', 'page', 'records.read'],
  ['P-on-hand', 'GET', '/inventory/on-hand', 'page', 'records.read'],
  ['P-move', 'GET', '/inventory/move', 'page', 'inventory.move'],
  ['P-count-new', 'GET', '/inventory/cycle-counts/new', 'page', 'count.create'],
  ['P-counts', 'GET', '/inventory/cycle-counts', 'page', 'records.read'],
  ['P-count-detail', 'GET', '/inventory/cycle-counts/:no', 'page', 'records.read'],
  ['P-lot-trace', 'GET', '/inventory/lot-trace', 'page', 'records.read'],
  ['P-reports', 'GET', '/reports', 'page', 'records.read'],
  ['P-report', 'GET', '/reports/:id', 'page', 'records.read'],
  ['P-settings', 'GET', '/admin/settings', 'page', 'settings.targets'],
  ['P-lookups', 'GET', '/admin/lookups/:type', 'page', 'lookup.manage'],
  ['P-lookup-new', 'GET', '/admin/lookups/:type/new', 'page', 'lookup.manage'],
  ['P-audit', 'GET', '/admin/audit-log', 'page', 'audit.read'],
  ['P-demo-reset', 'GET', '/admin/demo-reset', 'page', 'demo.reset', 'DEMO_RESET_ENABLED'],
];

export const ROUTES: RouteSpec[] = TABLE.map(([id, method, pattern, surface, action, flag]) => ({ id, method, pattern, surface, action, ...(flag ? { flag } : {}) }));

const COMPILED = ROUTES.map((spec) => ({
  spec,
  parts: spec.pattern.split('/').filter(Boolean),
}));

export type Match =
  | { kind: 'match'; spec: RouteSpec; params: Record<string, string> }
  | { kind: 'method-not-allowed' }
  | { kind: 'none' };

/** Matches (method, pathname). A known pattern with another method gives 'method-not-allowed'. */
export function matchRoute(method: string, pathname: string): Match {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const segs = path.split('/').filter(Boolean);
  const m = method === 'HEAD' ? 'GET' : method;
  let patternSeen = false;
  for (const { spec, parts } of COMPILED) {
    if (parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) {
        try {
          params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
        } catch {
          ok = false;
          break;
        }
      } else if (parts[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    patternSeen = true;
    if (spec.method === m) return { kind: 'match', spec, params };
  }
  return patternSeen ? { kind: 'method-not-allowed' } : { kind: 'none' };
}
