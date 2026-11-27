// Typed Astro.locals (ADR-003 D-1; shape agreed with src/components/locals.ts).
declare namespace App {
  interface Locals {
    user: { id: number; username: string; displayName: string; role: import('../auth/permissions').Role } | null;
    session: { id: number; csrfToken: string; expiresAt: Date; idleExpiresAt: Date } | null;
    csrfToken: string;
    capabilities: import('../auth/permissions').ActionKey[];
    reportingDate: string;
    isLiveDate: boolean;
    requestId: string;
    route: import('../auth/routes').RouteSpec | null;
    routeParams: Record<string, string>;
  }
}
