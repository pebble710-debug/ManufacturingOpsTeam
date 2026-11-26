# UI Specification — Version 1 Core

**Task:** T-013 · **Owner:** Maya (ux-ui-designer) · **Date:** 2026-11-25 (revision 2: 2026-11-26) · **Status:** REVISION 2, ready for Felix (front end), Kenji (dashboard), Diego (API), Dana (data), Quinn (QA) review; aligned with the final [permissions matrix](../plan/permissions-matrix.md) (Sasha-reviewed) and [security plan](../security/security-plan.md); API wording checked against [api/contract.md](../api/contract.md)
**Revision 2 changes:** Viewer kept and seeded (read-only guest); Admin never sees operational actions (R-2); R-4 adopted (S19, S18); R-7 covers scrap and limits Quality to Hold moves (S16); Shipping cannot cancel from On Hold (R-5); demo reset cooldown, 404 when off, sessions ended (S23); unpublished deployed Admin password (S01); session timeout, 429 and generic error UX (new section 2.6, S01, S26); CSP-friendly front-end rules (new section 10.1); Rework gate applies to "Start packing again" (4.10, S05, S06); section 14 shows which questions are answered.
**Scope contract:** [project-scope.md](../project-scope.md) (V1-CORE, 11 acceptance criteria). **Stories:** [plan/backlog.md](../plan/backlog.md) §3.1 (authoritative release index). **Roles:** [plan/permissions-matrix.md](../plan/permissions-matrix.md). **Stack:** [ADR-001](../ADR-001.md) (Astro server-rendered pages, plain CSS with tokens, HTML forms with POST, progressive enhancement only, Chart.js bundled).
**Tags:** [R] researched, [A] assumption, [P] proposed (project convention). All names, parts, lots and values in wireframes are **fictional** and illustrative; KPI numbers in wireframes are not seed values.

> This document is a design contract, not code. Where a field, status, endpoint or rule is not defined upstream, it is listed in section 14 (open questions) rather than invented.

---

## 0. How to read this spec

- Wireframes are ASCII. `[ text ]` is an input, `[v]` a select, `( )` a radio, `[x]` a checked box, `[ Button ]` a button, `(n)` is an annotation keyed to the numbered notes under each wireframe.
- Every screen block lists: route, roles, stories, wireframe, annotations, accessibility notes, responsive notes.
- Release tags: **V1-CORE** is designed in full. **Later (v1.1)** items are named and given a reserved place so the layout does not need rework, but they are **not designed or built** now (section 12).
- Routes are proposals that follow the ADR-001 page tree (`pages/` login, dashboard, shipments, quality, inventory, reports, admin). Diego/Felix may adjust paths; the screen inventory and behaviours are what matter.

## 1. Design principles

1. **Glanceable first, detail one step away.** The dashboard answers "do we need to act?" in about five seconds; every number says what it is, the target, and whether it is better or worse.
2. **Never color alone.** Every status, severity, KPI direction and chart series carries text, plus an icon or pattern.
3. **Mistake-proof by sequence.** Only the next legal action is offered, in explicit verbs ("Mark Verified", "Ship SH-1042"). Illegal steps are explained, not silently missing.
4. **Hide what your role can never do; explain what you cannot do right now.** (Rule R-UI-1.) A Receiving user never sees "Verify". A packer who opens Pack & Verify sees why the verify buttons are unavailable. The server enforces everything regardless (HTTP 403 for role or identity, 409 for state).
5. **Honest about the demo.** A "DEMO – FICTIONAL DATA" banner on every page and a fixed reporting date label on the dashboard, reports and form date hints, so a professor opening the site months later sees meaningful KPIs and knows why.
6. **Works without JavaScript.** Every form is a plain HTML POST with server-side validation and a redirect-after-post. JavaScript only adds live hints, chart rendering and convenience (section 11).
7. **Built for gloves and tablets.** 16 px minimum text, 44 px minimum targets, no hover-only content, no drag, no timeouts.
8. **Plain language.** "Tracking number", not "TRK_NO". Messages say what is wrong and how to fix it.

---

## 2. Sitemap and navigation

### 2.1 Screen inventory and routes

| ID | Screen | Route [P] | Who can open (view) | Primary stories |
|----|--------|-----------|--------------------|-----------------|
| S01 | Login | `/login` | everyone (signed out) | US-001, US-002, US-009 |
| S02 | Dashboard | `/dashboard` (`/` redirects) | all signed-in roles | US-054, US-056, US-057, US-058, US-008, US-055 |
| S03 | Shipment list | `/shipments` | all | US-024 |
| S04 | Shipment create / edit | `/shipments/new`, `/shipments/{no}/edit` | Shipping, Supervisor | US-014 |
| S05 | Shipment detail + status actions | `/shipments/{no}` | all | US-024 (018), US-016, US-030 |
| S06 | Pack & Verify checklist | `/shipments/{no}/pack-verify` | all view; act: Shipping, Quality, Supervisor | US-019, US-020, US-030 |
| S07 | Ship | `/shipments/{no}/ship` | Shipping, Supervisor | US-021 (022), US-041 |
| S08 | Hold / Release / Cancel | `/shipments/{no}/hold`, `/release`, `/cancel` | per matrix | US-016 (017) |
| S09 | Packaging error list | `/quality/errors` | all | US-032 (034) |
| S10 | Log packaging error | `/quality/errors/new?shipment={no}` | Shipping, Quality, Supervisor | US-027 (033) |
| S11 | Packaging error detail | `/quality/errors/{PE-no}` | all | US-027, US-029, US-032 |
| S12 | Log rework | `/quality/errors/{PE-no}/rework/new` | Shipping, Quality, Supervisor | US-029 |
| S13 | Root cause and corrective action | `/quality/errors/{PE-no}/root-cause`, `/corrective-actions/new` | Quality, Supervisor | US-031, US-032 |
| S14 | Receipts list + Receive material | `/inventory/receipts`, `/inventory/receipts/new` | all view; Receiving, Supervisor act | US-035 |
| S15 | On-hand | `/inventory/on-hand` | all | US-037 (038) |
| S16 | Move stock (transfer, scrap, production complete) | `/inventory/move` | Receiving, Supervisor, Quality (limited) | US-035 (039), US-037 |
| S17 | Cycle count list + create | `/inventory/cycle-counts`, `/new` | all view; Supervisor creates | US-043 (042) |
| S18 | Count entry (blind) | `/inventory/cycle-counts/{CC-no}` (Open) | Receiving, Supervisor | US-043 |
| S19 | Count review and approval | `/inventory/cycle-counts/{CC-no}` (Counted) | Supervisor approves; others read | US-044 |
| S20 | Lot trace (R7) | `/inventory/lot-trace?lot=` | all | US-045 |
| S21 | Reports (index, R1, R3, R4, CSV) | `/reports`, `/reports/r1`, `/r3`, `/r4` | all | US-065 (066, 068, 069) |
| S22 | Settings (targets, reporting date) | `/admin/settings` | Admin (all); Supervisor (targets only) | US-008 |
| S23 | Demo data reset (confirm) | `/admin/demo-reset` | Admin, only when enabled | US-011 |
| S24 | Lookups (F10) | `/admin/lookups/{type}` | Admin, Supervisor | US-007 |
| S25 | Audit log | `/admin/audit-log` | Admin | US-005 (006) |
| S26 | System pages: 403, 404, 409 in-page, 500 | n/a | everyone | US-003, US-074, US-075 |

### 2.2 Navigation structure (left nav, groups follow the `ui-design-system` skill)

```
Dashboard
Shipments
Quality
  Errors & rework
Inventory
  Receipts
  On-hand
  Move stock
  Cycle counts
  Lot trace
Reports
Admin
  Settings
  Lookups
  Audit log
```

### 2.3 Role-aware menu (what each role sees)

Y = item shown. A menu item is shown when the role can open at least the read view or an action on it. Hidden items are a convenience only; every route is protected server-side (T-12, T-10, T-11).

| Menu item | Admin | Supervisor | Shipping | Receiving | Quality | Viewer |
|-----------|:-----:|:----------:|:--------:|:---------:|:-------:|:------:|
| Dashboard | Y | Y | Y | Y | Y | Y |
| Shipments (list, detail) | Y | Y | Y | Y | Y | Y |
| Errors & rework | Y | Y | Y | Y | Y | Y |
| Receipts | Y | Y | Y | Y | Y | Y |
| On-hand | Y | Y | Y | Y | Y | Y |
| Move stock | | Y | | Y | Y (limited) | |
| Cycle counts | Y | Y | Y | Y | Y | Y |
| Lot trace | Y | Y | Y | Y | Y | Y |
| Reports | Y | Y | Y | Y | Y | Y |
| Admin > Settings | Y (full) | Y (targets only) | | | | |
| Admin > Lookups | Y | Y | | | | |
| Admin > Audit log | Y | | | | | |

### 2.4 Action visibility (rule R-UI-1) by role

| Action button | Shown to | Shown but unavailable (with reason) to |
|---------------|----------|----------------------------------------|
| New shipment, Edit shipment | Shipping, Supervisor | none (hidden for others) |
| Mark Ready to Pack, Start Packing | Shipping, Supervisor | none |
| Mark Verified / Fail verification | Shipping, Quality, Supervisor | **the current packer** (identity rule R-1, including a Supervisor or Quality user who packed) |
| Ship | Shipping, Supervisor | same roles when status is not Verified (state) |
| Put On Hold | Shipping, Quality, Supervisor | none |
| Release from hold | Quality, Supervisor | Shipping (sees "Only Quality or Supervisor can release", R-6) |
| Cancel shipment | Supervisor (any status before Shipped); Shipping only while Planned or Ready to Pack | Shipping in later statuses **including On Hold** (sees hint, R-5; server answers 403, not 409) |
| Log packaging error | Shipping (before ship only), Quality, Supervisor | Shipping on a Shipped shipment (sees hint, R-8) |
| Log rework | Shipping, Quality, Supervisor | none |
| Root cause, corrective action, close error | Quality, Supervisor | none |
| Receive material | Receiving, Supervisor | none |
| Transfer, scrap, production complete (stock not in a Hold location) | Receiving, Supervisor | none |
| Transfer or scrap into or out of a Hold location | Quality, Supervisor | Receiving (sees hint, R-7; decided by the source location type) |
| Production complete | Receiving, Supervisor | none (not offered to Quality) |
| Create count list | Supervisor | none |
| Enter counts | Receiving, Supervisor | none |
| Approve count | Supervisor | **a Supervisor who entered or recounted any line of that count** (R-4, `APPROVER_SAME_AS_COUNTER`) |
| Targets, lookups | Admin, Supervisor | none |
| Reporting date, demo reset | Admin | Supervisor sees the reporting date as read-only text; no reset section |
| Audit log, users (screen later) | Admin | none (hidden) |

Admin and Viewer have **no operational actions** (R-2, matrix section 4): on operational screens they see read-only content and the one-line note defined directly below.

**Read-only roles (Admin, Viewer).** Neither role has any operational action (R-2; Viewer is the read-only guest and the recommended login for visitors to the public site). On every operational screen they see the same content as other roles with **no action buttons and no forms**, plus one line under the page title:
- Viewer: `You are signed in as Viewer, a read-only guest. You can look at everything but can't change anything.`
- Admin: `You are signed in as Admin. Admins manage settings and users and can't pack, verify, ship, count or post stock (separation of duties).`
The server still returns 403 for every write (T-6, T-10). Viewer sees no Admin menu group.

**Seeded accounts, one role each (R-11).** Menu and actions never combine roles; the role label in the top bar is the only role the user has.

### 2.5 After login

All roles land on the dashboard. The top bar shows display name and role (US-001). No role-specific home in v1 core.

### 2.6 Session, sign-in limits and generic errors (security plan §3.2, §3.3, §8.3)

| Situation | What the user sees | Notes |
|-----------|--------------------|-------|
| Idle 30 min or session older than 8 h, then any request | Redirect to `/login` with an info alert: `You were signed out because the session expired. Sign in again to continue.` After sign-in the user returns to the page they asked for (GET pages only; a lost form is not replayed) | Alert `role="status"`. Wording is the same for idle and absolute expiry (no need to explain which). |
| Form submitted after expiry | Same redirect and message plus: `Your last change was not saved.` | Never silently drop; the POST is not retried. Entered values are not kept (security over convenience, 3.3.7 exception: authentication timeout). |
| Too many failed sign-ins (429) | On `/login`: `Too many sign-in attempts. Wait 15 minutes and try again, or use another demo account.` The form stays usable (no lockout) | Generic: does not say which username or whether it exists; same layout as the normal error; no countdown timer. `Retry-After` is not shown as a clock. |
| Wrong username or password, unknown or deactivated user | `Username or password is incorrect.` | One message for every case (US-001, security plan §3.1). |
| Role changed or user deactivated while signed in | Next request redirects to `/login` with the session-expired message | Ends sessions immediately (R-11). |
| Demo reset by Admin (R-9) | Everyone, including the Admin, is signed out; next request shows `/login` with `The demo data was reset. Sign in again.` | Public visitors see this when an Admin resets; it is expected. |
| Server error (500) / DB waking (503) | Generic page (S26) with an error id | No stack, SQL, table or constraint names. Fail closed. |
| Missing CSRF token or forged origin (403 `CSRF_INVALID`) | Problem alert: `We couldn't verify that request. Reload the page and try again.` | Typical cause is a stale tab after expiry. |
| Wrong content type (415) | Not reachable from the UI (forms are urlencoded) | Tested by QA only. |

Session UX rules: no countdown banners and no auto-logout popups in v1. The 30 min idle limit is stated on the login page footer (`For security, sessions end after 30 minutes without activity.`) and the user returns to the same page after signing in. Sign-out is a POST button, never a link (R-13).
**WCAG 2.2.1 (Timing Adjustable) note:** a timeout under 20 h normally needs a warning and a way to extend. I treat the security idle timeout as the "essential" exception and mitigate it with the statement above and the return-to-page behaviour; an optional "Your session ends in 2 minutes. [ Stay signed in ]" prompt (external script, no inline code) is listed as open question 14.21 for Sasha and Quinn rather than built by default.

---

## 3. Layout and design tokens

### 3.1 App shell

```
+--------------------------------------------------------------------------------------------+
| (1) DEMO - FICTIONAL DATA   Cobalt Ridge Components, Inc. is fictional. No real data.        |  amber, full width
+--------------------------------------------------------------------------------------------+
| [Skip to main content]                                                                      |  visible on focus
| (2) Cobalt Ridge Ops Dashboard   Riverton plant     (3) Reporting as of 25 Nov 2026 -        |  navy top bar
|                                                          fixed demo date                    |
|                                        (4) Demo Shipper One - Shipping    [ Sign out ]      |
+---------------+----------------------------------------------------------------------------+
| (5) nav       | (6) <main>                                                                  |
| Dashboard     |  Breadcrumb: Shipments > SH-1042                                            |
| Shipments     |  <h1> page title                                                            |
| Quality       |  (flash message / alerts)                                                   |
|  Errors...    |  page content                                                               |
| Inventory     |                                                                             |
|  ...          |                                                                             |
| Reports       |                                                                             |
| Admin         |                                                                             |
+---------------+----------------------------------------------------------------------------+
| (7) footer: Fictional demo system - not a certified or production system - Help: README     |
+--------------------------------------------------------------------------------------------+
```

1. **DEMO banner**: real text (not an image), first element in `<header>`, on every page including login and error pages (US-009), visible without scrolling at laptop and tablet widths. Not sticky (sticky bars can hide focused elements, WCAG 2.4.11).
2. App name is a link to the dashboard.
3. **Compact reporting-date chip** on every page (same text source as the full label in 4.2). In live mode it reads "Live date: 25 Nov 2026".
4. User name and role are text. **Sign out** is a POST form button (CSRF token), 44 px.
5. `<nav aria-label="Main">`, current page has `aria-current="page"` plus a 4 px left bar and bold text (not color alone).
6. `<main id="main">`, single `<h1>`.
7. `<footer>` (contentinfo). No compliance claims.

Landmarks: `header` (banner), `nav`, `main`, `footer`. Skip link is the first focusable element. `<title>` pattern: `Page name — Context | Cobalt Ridge Ops (DEMO)`, for example `Pack & Verify — SH-1042 | Cobalt Ridge Ops (DEMO)`.

Layout widths: left nav 220 px at 1024 px and wider; below 1024 px the nav collapses into a "Menu" disclosure button (native `<details>`, no JavaScript needed) above the page content. Content max width 1440 px, centered.

### 3.2 Design tokens (one CSS file, `:root` custom properties)

Light theme only in v1 [P]; dark theme is optional later. All contrast ratios below were **calculated by hand** with the WCAG 2.2 relative-luminance formula for this spec; Felix and Quinn must re-check the built pages with axe-core and a contrast checker (see section 9).

```css
:root {
  color-scheme: light;

  /* --- Color: neutrals --- */
  --color-bg-page:        #F5F7FA;
  --color-surface:        #FFFFFF;
  --color-surface-header: #E8ECF1;   /* table header, neutral tint */
  --color-border:         #D3D9E2;   /* decorative dividers ONLY, never the sole boundary of a control */
  --color-border-strong:  #6B7686;   /* input and control boundaries */
  --color-text:           #1A2330;
  --color-text-muted:     #4A5565;
  --color-text-on-dark:   #FFFFFF;
  --color-text-on-dark-muted: #C9D6E6;
  --color-topbar-bg:      #12263F;

  /* --- Color: action --- */
  --color-primary:        #0B5CAD;
  --color-primary-hover:  #084A8C;
  --color-link:           #0B5CAD;   /* always underlined */
  --color-focus:          #0B5CAD;   /* on light surfaces */
  --color-focus-on-dark:  #FFFFFF;   /* on navy top bar and amber banner use dark ring #1A2330 */

  /* --- Color: demo banner --- */
  --color-banner-bg:      #FFD966;
  --color-banner-text:    #1A2330;

  /* --- Color: status families (bg / text / border = text) --- */
  --status-neutral-bg: #E8ECF1;  --status-neutral-text: #26303D;
  --status-info-bg:    #DCEBFA;  --status-info-text:    #083A70;
  --status-success-bg: #DDF3E4;  --status-success-text: #0B4A24;
  --status-warning-bg: #FFF0C2;  --status-warning-text: #5C3A00;
  --status-danger-bg:  #FBE3E1;  --status-danger-text:  #7A1410;
  --status-muted-bg:   #EEF0F3;  --status-muted-text:   #4A5565;
  --color-error-border:#B3261E;  /* invalid field border, 2 px, with icon and text */

  /* --- Color: charts (marks must be >= 3:1 on white) --- */
  --chart-1: #0B5CAD;   /* primary series, bars */
  --chart-2: #B45309;   /* secondary series, lines, cumulative % */
  --chart-target: #4A5565; /* neutral, dashed */
  --chart-grid: #D3D9E2;   /* decorative */

  /* --- Type --- */
  --font-sans: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace; /* IDs, lots, tracking */
  --font-size-100: 0.875rem;  /* 14 px: captions, badge text, chart ticks only */
  --font-size-200: 1rem;      /* 16 px: body, inputs, table text (minimum for content) */
  --font-size-300: 1.125rem;  /* 18 px: lead text, table on wall view */
  --font-size-400: 1.25rem;   /* 20 px: h3, card titles */
  --font-size-500: 1.5rem;    /* 24 px: h2 */
  --font-size-600: 1.875rem;  /* 30 px: h1 */
  --font-size-700: 2.25rem;   /* 36 px: KPI value */
  --line-height-body: 1.5;
  --line-height-tight: 1.2;
  --font-weight-regular: 400; --font-weight-semibold: 600; --font-weight-bold: 700;

  /* --- Spacing (4 px base) --- */
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.5rem;  --space-6: 2rem;    --space-7: 3rem;    --space-8: 4rem;

  /* --- Radius, elevation, size --- */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(18, 38, 63, 0.14);
  --size-target-min: 2.75rem;   /* 44 px: all buttons, radios, checkboxes, nav items, table row links */
  --size-focus-width: 3px;
  --size-nav: 13.75rem;         /* 220 px */
  --size-content-max: 90rem;    /* 1440 px */
}
/* Breakpoints (media queries cannot use custom properties): 768, 1024, 1280, 1920 px */
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
@media (min-width: 120rem) { :root { font-size: 125%; } }          /* >= 1920 px wall screens */
.view-wall { font-size: 150%; }                                       /* ?view=wall, see 8 */
:focus-visible { outline: var(--size-focus-width) solid var(--color-focus); outline-offset: 2px; }
html { scroll-padding-top: var(--space-6); }  /* anchors and focus never hide under anything */
```

### 3.3 Contrast checks (calculated)

| Foreground on background | Ratio | Requirement | Pass |
|--------------------------|------:|-------------|:----:|
| Text `#1A2330` on surface `#FFFFFF` | 15.8:1 | 4.5 | Y |
| Text `#1A2330` on page `#F5F7FA` | 14.8:1 | 4.5 | Y |
| Muted text `#4A5565` on white | 7.6:1 | 4.5 | Y |
| Muted text `#4A5565` on page `#F5F7FA` | 7.0:1 | 4.5 | Y |
| White on primary button `#0B5CAD` | 6.7:1 | 4.5 | Y |
| White on primary hover `#084A8C` | 8.9:1 | 4.5 | Y |
| Link/primary `#0B5CAD` on white / page | 6.7 / 6.2:1 | 4.5 | Y |
| White on navy top bar `#12263F` | 15.3:1 | 4.5 | Y |
| `#C9D6E6` on navy top bar | 10.4:1 | 4.5 | Y |
| Banner text `#1A2330` on amber `#FFD966` | 11.6:1 | 4.5 | Y |
| Neutral badge `#26303D` on `#E8ECF1` | 11.3:1 | 4.5 | Y |
| Info badge `#083A70` on `#DCEBFA` | 9.4:1 | 4.5 | Y |
| Success badge `#0B4A24` on `#DDF3E4` | 8.9:1 | 4.5 | Y |
| Warning badge `#5C3A00` on `#FFF0C2` | 9.0:1 | 4.5 | Y |
| Danger badge `#7A1410` on `#FBE3E1` | 8.9:1 | 4.5 | Y |
| Muted badge `#4A5565` on `#EEF0F3` | 6.6:1 | 4.5 | Y |
| Danger text `#7A1410` on white (error messages) | 10.9:1 | 4.5 | Y |
| Success text `#0B4A24` / warning text `#5C3A00` on white | 10.4 / 6.9:1 | 4.5 | Y |
| Control border `#6B7686` on white / page | 4.6 / 4.3:1 | 3 (non-text) | Y |
| Error border `#B3261E` on white | 6.5:1 | 3 | Y |
| Focus ring `#0B5CAD` on white / page | 6.7 / 6.2:1 | 3 | Y |
| Chart blue `#0B5CAD` on white | 6.7:1 | 3 | Y |
| Chart orange `#B45309` on white | 5.0:1 | 3 | Y |
| Chart target grey `#4A5565` on white | 7.6:1 | 3 | Y |
| Disabled-style button text `#4A5565` on `#E8ECF1` | 6.4:1 | n/a (exempt, kept readable) | Y |

Rules that go with the table: links are underlined; placeholders are never used as labels (and are not used at all in v1); `--color-border` (decorative, about 1.5:1) is never the only boundary of an input, button, checkbox or radio.

### 3.4 Spacing, grid and radius usage

- Page padding 24 px (`--space-5`); card padding 16 px (`--space-4`) on laptop and tablet, 24 px on wall view.
- Vertical rhythm between sections 24 px; between a label and its field 4 px; between fields 16 px.
- Cards and tiles: `--radius-md`, 1 px `--color-border`, white, `--shadow-card`. Buttons and inputs: `--radius-sm`. Badges: `--radius-pill`.
- Forms: single column, max width 40 rem; two columns for short related fields from 1024 px.

---

## 4. Components

Suggested Astro component names are in brackets for Felix.

### 4.1 Status badge [`StatusBadge`] — text + icon + tint, never color alone

Anatomy: `[icon] Label` in a pill, 14 px semibold, 1 px border in the text color, min height 28 px (it is not interactive). The icon is inline SVG with `aria-hidden="true"`; the **text is always the accessible name**. Icons differ in **shape**, not only color.

| Value | Family | Icon (shape) | Visible text |
|-------|--------|--------------|--------------|
| Planned | neutral | dashed circle | Planned |
| Ready to Pack | info | clipboard | Ready to Pack |
| Packing | info | open box | Packing |
| Verified | success | shield with check | Verified |
| Shipped | success | truck | Shipped |
| On Hold | warning | pause bars | On Hold |
| Rework | warning | counter-clockwise arrow | Rework |
| Cancelled | muted (dashed border) | circle with slash | Cancelled |
| Delivered (later) | success | package with check | Delivered |
| On time | success | check | On time |
| Late (n days) | danger | clock | Late (3 days) |
| Overdue (n days) | danger | clock | Overdue (2 days) |
| Error status Open / Contained / Closed | warning / info / success | circle / box / check | Open, Contained, Closed |
| Severity Minor / Major / Critical | neutral / warning / danger | circle / triangle / octagon | Minor, Major, Critical |
| Inspection Accepted / On Hold / Rejected | success / warning / danger | check / pause / cross | Accepted, On Hold, Rejected |
| Count status Open / Counted / Approved | info / warning / success | circle / pencil / check | Open, Counted, Approved |
| Corrective action Open / In Progress / Closed / Overdue | warning / info / success / danger | circle / half circle / check / clock | Open, In Progress, Closed, Overdue |
| Within tolerance / Out of tolerance | success / warning | check / triangle | Within tolerance, Out of tolerance |

### 4.2 Reporting-date label [`ReportingDate`]

Purpose: tell every viewer which "today" the numbers use (US-008, US-054, acceptance criterion 11).

```
Variant A: fixed demo date (default, large form on Dashboard and every report page)
+--------------------------------------------------------------------------------------+
| [calendar icon]  Reporting as of 25 Nov 2026 - demonstration data                     |
|                  Fixed demo date: KPIs, "overdue" and default dates use this date,    |
|                  not today's real date. (Admin: [ Change in Settings ])                |
+--------------------------------------------------------------------------------------+
Variant B: live (Admin switched modes)
|  [calendar icon]  Reporting as of 14 Jan 2027 - live date                             |
Compact chip (top bar, every page):   [cal] As of 25 Nov 2026 - fixed demo date
Form date hint:                       "Defaults to the reporting date, 25 Nov 2026."
```

- Real text in a `<p>` (not a tooltip, not an image); info family tint with a 4 px left border; contrast 9.4:1.
- Always includes the **date, the words "demonstration data" (or "live date")**, and one explanatory sentence. The sentence is the only part hidden on the compact chip.
- Printed or exported pages repeat the label (reports and CSV file name carry the date; see S21).
- The "Change in Settings" link appears only for Admin.

### 4.3 KPI tile [`KpiTile`]

```
+----------------------------------+
| On-Time Shipment %               |  label, 16 px semibold (h3)
| 94.2 %                           |  value, 36 px bold
| Target: 95 %                     |  16 px
| [x] Misses target                |  status chip: icon + words (check = Meets, cross = Misses)
| ^ Up 1.1 pts vs previous period  |  arrow + direction word + amount
|   (better)                       |  better / worse / unchanged in words
| > How is this calculated?        |  <details> disclosure
+----------------------------------+
```

States and exact text:

| State | Value | Status chip | Change line |
|-------|-------|-------------|-------------|
| Meets target | `96.4 %` | `Meets target` (success, check) | `Up 1.1 pts vs previous period (better)` |
| Misses target | `94.2 %` | `Misses target` (danger, cross) | `Down 0.8 pts vs previous period (worse)` |
| Flat | value | chip as above | `Flat vs previous period (unchanged)` |
| No data (null KPI) | `No data` | none | `Not enough records in this period` (no arrow) |
| Previous period has no data | value | chip | `No previous period to compare` |

- The arrow shows the **numeric direction** (▲ up, ▼ down, ▬ flat). **Better/worse is a separate word** because for error rate and cycle time "down" is better. Direction of good: higher is better for On-Time %, OTIF %, FPY %, Inventory Accuracy %; lower is better for Packaging Error Rate % and Cycle Time (h) [from docs/05].
- Targets use the comparator in text: `Target: < 2 %`, `Target: 95 %`, `Target: 24 h`.
- Units are always written next to the value (`%`, `h`), with a space.
- "How is this calculated?" is a native `<details>` in the tile (keyboard, touch and screen-reader friendly, no hover). Contents come from docs/05 (formula, period basis, exclusions) and the text is supplied by the KPI module.
- Tile is **not a link** in v1 core. A reserved footer slot "View records" is left for the later click-through (US-063).
- Order (fixed): On-Time Shipment %, OTIF %, Packaging Error Rate %, Packaging FPY %, Median Shipment Cycle Time (h), Inventory Accuracy %.
- Accessibility: tile is a `<section aria-labelledby>`; value and unit are one text run ("94.2 %"); icons `aria-hidden`.

### 4.4 Chart card [`ChartCard`]

```
+-----------------------------------------------------------------------------+
| <h2> Are we shipping on time, and which way is it trending?                  |  title = the question
| Summary (one line, server-generated text):                                   |
|   Weekly on-time % ranged 90 to 98 %; last week 94 %, 1 pt below target.     |
| [ chart canvas, role="img" aria-label = same summary ]                       |
| Legend (HTML, not canvas): [solid line] On-time %   [dashed line] Target 95 %|
| > View data table        [ Open the shipments behind this chart ]            |
+-----------------------------------------------------------------------------+
```

- Title phrased as the question; summary sentence is visible text (Kenji's module supplies it); canvas gets `role="img"` and the same sentence as `aria-label`.
- **Data table alternative** inside `<details><summary>View data table</summary>` with a real `<table>` (caption, `th scope`). The table is rendered server-side, so it exists without JavaScript; Chart.js is the enhancement. Without JavaScript the card shows summary + data table open.
- "Open the shipments behind this chart" is a normal link to the filtered list or report (keyboard-reachable click-through for C1 to C3, satisfying the chart click-through criteria without relying on clicking marks). Clicking marks may be added as a mouse bonus.
- Series are distinguished by **line style, marker shape and direct labels**, not color alone. Palette: `--chart-1` blue, `--chart-2` orange, `--chart-target` dashed grey. Fonts 14 px minimum in canvas (18 px on wall view); animation disabled under `prefers-reduced-motion`.
- Axis titles with units. Bars start at zero. Gaps (no data) are gaps, never zero.

### 4.5 Data table [`DataTable`]

- `<table>` with `<caption>` (visible or visually hidden), `<th scope="col">` and `<th scope="row">` for the identifying cell (shipment number).
- Sortable columns: header contains a link (`<a>`, works without JavaScript) and the `<th>` carries `aria-sort="ascending|descending|none"`; the current sort also shows ▲/▼ plus the words in visually-hidden text ("sorted ascending").
- Filters above in a `<form method="get">` with a `role="search"` wrapper for search boxes; result count line `Showing 1–25 of 287 shipments` in `aria-live="polite"` after filtering (full page loads announce naturally).
- Pagination at **25 rows**: `Previous`, page links with `aria-current="page"`, `Next`; each 44 px high.
- Column priority classes: **P1** always, **P2** from 768 px, **P3** from 1024 px (hidden below, available on the detail page).
- Row link: the identifier cell is the link; the whole row is not clickable (avoids target and focus ambiguity).
- Numeric columns right-aligned with units in the header; dates `25 Nov 2026`, times 24 h `09:14`, IDs in `--font-mono`.
- Header background `--color-surface-header`, row dividers `--color-border`, hover tint is optional and never the only affordance.
- Empty result: see 4.9.

### 4.6 Form field [`FormField`]

```
Label text (required)            <- <label for>, above the field, 16 px semibold
Hint text, if any                <- muted, linked with aria-describedby
[ input ........................ ]   44 px high, 2 px --color-border-strong border
(x) Error: what is wrong and how to fix it     <- appears here on invalid, icon + text, danger text
```

- Labels are always visible and above the control. Required fields end with the text **(required)**. Optional fields are unmarked.
- Controlled values use selects or radios (radios when 2 to 4 choices and the consequences differ). No free typing where a list exists.
- Native `type="date"`, `type="datetime-local"`, `type="number"` (with `inputmode`, `min`, `step`) used where reliable; hint shows the expected format in words.
- Defaults: date fields default to the **reporting date** (hint says so), "performed by" and "owner" default to the current user, ship date defaults to the reporting date.
- Invalid state: 2 px `--color-error-border`, an inline error icon + message (text, `--status-danger-text`), `aria-invalid="true"`, error id appended to `aria-describedby`.
- `autocomplete` attributes where they apply (login only in v1 core). Do not clear fields after a failed POST (WCAG 3.3.7 redundant entry); re-render with the user's values.
- Radios and checkboxes: whole row (control + label) is the 44 px target; groups use `<fieldset><legend>`.
- Textareas: 4 rows default, character guidance in the hint, no hidden maximum without a message.

### 4.7 Error summary [`ErrorSummary`] and field error flow

On a failed POST the server re-renders the same page with HTTP 422, keeps all entered values, and shows:

```
+----------------------------------------------------------------------------+
| [!] There is a problem                                                      |  <h2>, tabindex="-1", autofocus
| Fix the 3 items below, then submit again.                                   |
|  - Enter a tracking number                (link to the field)               |
|  - Choose a late reason                   (link to the field)               |
|  - Enter a quantity greater than 0 for line 2                               |
+----------------------------------------------------------------------------+
```

- Focus moves to the summary on load (`autofocus` on the heading with `tabindex="-1"`), so keyboard and screen-reader users hear it first; each item is a link to the field (`href="#field-id"`). Summary links and inline messages use identical wording.
- Success: redirect (PRG) to the next page with a flash alert (`role="status"`, not auto-dismissing).

### 4.8 Buttons [`Button`]

| Type | Look | Use |
|------|------|-----|
| Primary | `--color-primary` fill, white text, 44 px min height, 16 px semibold | One per page region: the next legal step ("Mark Verified", "Ship SH-1042", "Save shipment") |
| Secondary | white, 2 px primary border, primary text | Safe alternatives ("Save progress", "Back to shipment") |
| Danger | white, 2 px `--status-danger-text` border and text, warning icon | Destructive or blocking outcomes ("Fail verification and send to Rework", "Cancel shipment") |
| Link-style | underlined primary text, 44 px hit area | Cancel / back |
| Unavailable | `--status-neutral-bg` fill, muted text, `aria-disabled="true"`, **visible reason text next to it** | Role-allowed but blocked now (verify as packer, ship when not Verified) |

- Labels are verbs and, for irreversible steps, include the record: "Ship SH-1042", "Approve count CC-0007 and post 3 adjustments".
- **Unavailable pattern** (used for verifier = packer, R-7, and state blocks): use `aria-disabled="true"`, not the HTML `disabled` attribute, so the button stays focusable and the reason is read; the reason sits in a paragraph linked by `aria-describedby`. With JavaScript, activation is intercepted and focus moves to the reason. **Without JavaScript the submit still goes to the server, which answers 403 or 409 with the same wording.** The server never relies on the button state.
- Double-submit: buttons use a normal form submit; the server is idempotent where it matters (no UI timers). With JavaScript an enhanced "Saving…" state may set `aria-disabled` after the first click.
- States: hover (`--color-primary-hover`), focus (3 px ring, 2 px offset), active (pressed 1 px inset), unavailable (above). Never remove the focus ring.

### 4.9 Alerts, empty states, error states [`Alert`, `EmptyState`]

Alerts: left 4 px border + icon + bold lead word + sentence; family tints from section 3.2; `role="status"` for info/success, `role="alert"` for errors that appear after load.

| Kind | Lead word | Example |
|------|-----------|---------|
| Info | "Note" | `Note: You packed this shipment, so someone else must verify it.` |
| Success | "Saved" | `Saved: Shipment SH-1042 moved to Verified.` |
| Warning | "Check" | `Check: Editing a Verified shipment sends it back to Rework.` |
| Error | "Problem" | `Problem: Verification refused. …` |

Empty states (always text + next step, role-aware):

| Place | Text | Action |
|-------|------|--------|
| Shipment list, no matches | `No shipments match these filters. Try removing a filter.` | `[ Clear filters ]`; plus `[ New shipment ]` for Shipping, Supervisor |
| Error list, none | `No packaging errors in this period.` | `[ Log packaging error ]` (permitted roles) |
| Chart, no data | `No data for this period. Choose a longer date range.` | range controls |
| KPI tile | `No data` (see 4.3) | none |
| On-hand, no rows | `No stock matches these filters.` | `[ Clear filters ]` |
| Lot trace, unknown lot | `No records found for lot L9999-999. Check the lot number (format L2611-004).` | focus returns to the field |
| Report, no rows | `No rows match these filters. The CSV export will contain only the header row.` | `[ Clear filters ]` |

Error pages (S26): `403` "You don't have permission to do that" (names the role, offers the dashboard link); `404` "We can't find that page"; `500` "Something went wrong on our side" with a short reference id and no stack traces; signed-out requests redirect to login with "Please sign in to continue." State conflicts (`409`) are shown **in place** as a Problem alert on the page the user was on, not a separate page.

### 4.10 Gate checklist [`GateChecklist`] (mistake-proofing for Rework → ship)

Shown on shipment detail when status is Rework (and again on Pack & Verify) so the user sees exactly what blocks Ship (US-030, acceptance criterion 2):

```
Before SH-1042 can ship again
 [x] 1. Packaging error logged          PE-0107 (Paperwork, Major)
 [x] 2. Rework completed                Reprint paperwork, 22 min
 [ ] 3. Packed again                    [ Start packing again ] (a new packer is recorded)
 [ ] 4. Verified again by a different person
```

Per the API contract (E-16, `REWORK_GATE_NOT_MET`) steps 1 and 2 gate **Start packing again** itself, not only the re-verification: until both are done, that button is shown **unavailable** with the missing step named (pattern 4.8; messages `E-GATE-1`, `E-GATE-2`). Steps 3 and 4 follow in order.

Each line has text status ("Done" / "Not done") in addition to the box glyph, which is `aria-hidden`; the list is an ordered list `<ol>`.

---

## 5. Key flows

### 5.1 Shipment lifecycle with rework (acceptance criteria 1 and 2)

```
Planned --Mark Ready to Pack--> Ready to Pack --Start Packing (user A = packer)--> Packing
Packing --Verify by user B, all Pass--> Verified --Ship SH-xxxx--> Shipped
Packing --Verify by user B, any Fail--> Rework  (or: error logged before ship -> Rework)
Rework: log error (S10) -> log rework + complete (S12) -> Start Packing again (user C = new packer)
        -> verify by someone who is not C (earlier packer A may verify) -> Verified -> Ship
Any status before Shipped: On Hold (reason) -> Release (Quality/Supervisor) -> back to prior status
Before Shipped: Cancelled (Supervisor; Shipping only Planned/Ready to Pack)
```

### 5.2 Verifier ≠ packer (how the UI explains it)

Packer identity is shown **early and everywhere**:
1. **Start Packing** button: "Start packing (you will be recorded as the packer)", with the hint "The packer cannot verify the same shipment. A different person checks it."
2. **Shipment detail** shows `Packer: Demo Shipper One · Verifier: not yet verified`.
3. **Pack & Verify** adapts to who is looking (full spec in S06):

| Viewer of the page | What they see |
|--------------------|---------------|
| Current packer (any role: Shipping, Quality, Supervisor) | Info alert "You packed this shipment" + read-only list of what the verifier will check + **Unavailable** buttons with reason. No answers can be entered. |
| Different user whose role may verify (Shipping, Quality, Supervisor) | Full interactive checklist and two outcome buttons. |
| Admin, Receiving, Viewer | Read-only checklist results and the note "Your role (Receiving) cannot verify shipments." No buttons. |
| Anyone, status not Packing | Read-only attempts history; verify controls absent; note "SH-1042 is Verified, so no further verification is needed." |

4. After a failed verification and re-pack by user C, the page re-evaluates: earlier packer A **can** verify, C **cannot** (T-5). The "Current packer" field is the single source for the message.
5. Direct requests: if a packer posts a verification anyway, the server answers 403 (`VERIFIER_SAME_AS_PACKER`, [P] pending Diego/Marcus) and the page re-renders with the same Problem text (copy in section 7). No verification attempt is recorded as passed.

---

## 6. Screens

Shared template for all form screens: breadcrumb, `<h1>`, flash alert, optional gate or role note, `ErrorSummary`, form, action row (primary left, secondary and link-style right), and a "Reporting date" hint on date fields.

---

### S01 Login

**Route** `/login` · **Roles** signed-out · **Stories** US-001, US-002 (merged), US-009 (banner)

```
+--------------------------------------------------------------------------------+
| DEMO - FICTIONAL DATA   Cobalt Ridge Components, Inc. is fictional. No real data|
+--------------------------------------------------------------------------------+
|  Cobalt Ridge Ops Dashboard - Riverton plant                                     |
|                                                                                  |
|  +-------------------------------------------+                                   |
|  | <h1> Sign in                              |                                   |
|  | [i] Note: You were signed out because the |  (5) expiry, role="status"        |
|  |     session expired. Sign in again.       |                                   |
|  | [!] Problem: Username or password is      |  (1) generic, role="alert"        |
|  |     incorrect.   (429: Too many sign-in   |  (6) rate limit, same layout      |
|  |     attempts. Wait 15 minutes ...)        |                                   |
|  | Username (required)                       |                                   |
|  | [ demo.shipper1__________________ ]       |  (2) autocomplete="username"      |
|  | Password (required)                       |                                   |
|  | [ ************ ]  [ ] Show password        |  (3) autocomplete=current-password|
|  | [ Sign in ]                               |                                   |
|  +-------------------------------------------+                                   |
|  [i] Just looking around? Sign in as demo.viewer (read-only guest).     (4)      |
|  > Demo accounts (fictional, demo-only)                       <details>          |
|    Username        Role        Good for                                          |
|    demo.viewer     Viewer      Read-only guest: look at everything, change nothing|
|    demo.shipper1   Shipping    Packing a shipment                                |
|    demo.shipper2   Shipping    Verifying a shipment packed by shipper1           |
|    demo.quality    Quality     Verifying, holds, root cause                      |
|    demo.supervisor Supervisor  Approvals, cancel, verify                         |
|    demo.receiver   Receiving   Receipts, transfers, counts                       |
|    demo.admin      Admin       Settings, reporting date, audit, demo reset       |
|    Demo passwords: see the README (demo-only, never reuse them).                 |
|    demo.admin: sign-in is not published on this site.                       (7)  |
|  For security, sessions end after 30 minutes without activity.                   |
+--------------------------------------------------------------------------------+
```

Annotations
1. One generic message for wrong password, unknown user and deactivated user (US-001); never says which. Signed-out redirects show "Please sign in to continue." above the form.
2. Field names/labels: "Username", "Password". No placeholder text.
3. "Show password" is a progressive-enhancement checkbox; paste is allowed (WCAG 3.3.8 accessible authentication: no memory test, no CAPTCHA, password managers work).
4. **Viewer is the recommended visitor login** and is named first. The demo accounts table helps the presenter and explains the verifier rule (shipper1 packs, shipper2 verifies). The published demo-only passwords for Viewer, Shipping, Receiving, Quality and Supervisor are shown on this page or linked to the README (matrix section 4, security plan PD-2); either is acceptable to the design, Felix follows what Theo/Diego decide.
5. Session-expiry message (2.6) appears above the form when the user was redirected for expiry, reset or role change.
6. **429**: `Too many sign-in attempts. Wait 15 minutes and try again, or use another demo account.` There is **no account lockout** (security plan §3.3), so the form stays enabled; the message never says which username was limited. Same status wording is used even for correct credentials while limited.
7. **Admin password is not published** on the deployed site (R-9, PD-2). The row says so in plain text. If the deployed Admin account is inactive, signing in as `demo.admin` shows the same generic "Username or password is incorrect." message (no hint that the account is inactive). Locally the documented demo password works.

Accessibility: `<h1>` is "Sign in"; error is `role="alert"` and focus goes to it on re-render; the DEMO banner precedes everything; page `<title>` "Sign in | Cobalt Ridge Ops (DEMO)". Responsive: single centered card, max 28 rem, works at 768 px and wider; the demo table scrolls inside its `<details>` region only if needed.

---

### S02 Dashboard

**Route** `/dashboard` · **Roles** all · **Stories** US-054 (tiles, date range, reporting-date label), US-056 (C1), US-057 (C2), US-058 (C3), US-008 (date source), US-055 (date range only), US-077

```
[DEMO banner]  [top bar ........................................ As of 25 Nov 2026 - fixed demo date]
+---------+----------------------------------------------------------------------------------------+
| nav     | Dashboard                                                                               |
|         | +------------------------------------------------------------------------------------+ |
|         | | [cal] Reporting as of 25 Nov 2026 - demonstration data                       (1)   | |
|         | |  Fixed demo date: KPIs, "overdue" and default dates use this date, not today's date.| |
|         | +------------------------------------------------------------------------------------+ |
|         | Period: ( ) Last 7 days  (x) Last 30 days  ( ) Last 90 days  ( ) Custom         (2)   |
|         | From [2026-10-27]  To [2026-11-25]  [ Apply ]   Compared with 27 Sep - 26 Oct 2026     |
|         |                                                                                         |
|         | <h2 class="visually-hidden">Key measures</h2>                                           |
|         | +---------+---------+---------+---------+---------+---------+                  (3)      |
|         | |On-Time %|OTIF %   |Pkg Error|Pkg FPY %|Median   |Inventory|                          |
|         | |94.2 %   |91.0 %   |Rate     |97.1 %   |Cycle    |Accuracy |                          |
|         | |Target   |Target   |2.6 %    |Target   |Time (h) |96.8 %   |                          |
|         | |95 %     |93 %     |Target   |98 %     |21.5 h   |Target   |                          |
|         | |[x]Misses|[x]Misses|< 2 %    |[x]Misses|Target   |97 %     |                          |
|         | |^ Up 1.1 |v Down 0.8|[x]Misses|^ Up 0.5 |24 h     |[x]Misses|                          |
|         | | pts     | pts     |v Down 0.4|pts     |[v]Meets |= Flat   |                          |
|         | | (better)| (worse) | pts     | (better)|v Down 1.0|(unchang)|                          |
|         | |>How calc|>How calc|(better) |>How calc|h(better) |>How calc|                          |
|         | +---------+---------+---------+---------+---------+---------+                          |
|         |                                                                                         |
|         | +--------------------------------------+ +-----------------------------------------+   |
|         | | Are we shipping on time, and which   | | Do packaging errors rise when volume    |   |
|         | | way is it trending?              (4) | | rises?                                  |   |
|         | | Summary sentence ...                 | | Summary sentence ...                    |   |
|         | | [C1 line chart + dashed target]      | | [C2 bars + line on second axis]         |   |
|         | | > View data table  [Open shipments]  | | > View data table  [Open shipments]     |   |
|         | +--------------------------------------+ +-----------------------------------------+   |
|         | +-----------------------------------------------------------------------------------+  |
|         | | Which few problems cause most packaging errors?                                   |  |
|         | | Summary sentence ...                                                              |  |
|         | | [C3 Pareto: sorted bars + cumulative % line on 0-100 % axis]                      |  |
|         | | > View data table  [Open packaging errors]                                        |  |
|         | +-----------------------------------------------------------------------------------+  |
|         | (5) Later (not built in v1 core): needs-attention lists, tile click-through, customer/carrier filters |
+---------+----------------------------------------------------------------------------------------+
```

Annotations
1. **Reporting-date label** (component 4.2) is the first content under the `<h1>`, always visible, plain text. In fixed mode the default period is the 30 days ending on the reporting date (US-008); with seed data the default view is never empty (criterion 11).
2. **Date range** is a GET form (presets as radios plus custom From/To). Applying it updates tiles, charts and the "Open ..." links together and the previous period is the equal-length period immediately before (US-054). Invalid range (from after to) shows the standard inline error: "From date can't be after the To date."
3. **KPI row** (component 4.3), six tiles in the fixed order; one row at 1280 px and wider. Wireframe text is abbreviated; the real tile has the full anatomy.
4. **Charts** (component 4.4) with the specs below. Each chart is a `<section>` with its question as `<h2>`.
5. Reserved, **not built**: needs-attention lists (US-062), tile click-through (US-063), customer and carrier filters (US-084), charts C4–C6 (US-059–061). Do not render placeholders; just leave the layout able to add a row under the charts.

Chart specifications (Kenji supplies data via the KPI module; Maya owns presentation)

| Chart | Type | Axes | Series styling | Summary sentence example |
|-------|------|------|----------------|--------------------------|
| C1 On-time % by week vs target | Line + dashed target | X: ISO week (label "Week of 2 Nov"); Y: 0–100 % **or** starts at 50 % with axis title "On-time shipments (%), axis starts at 50 %" [P] | Solid blue line, round markers; target grey dashed with direct label "Target 95 %"; gaps for weeks with no shipments | "Weekly on-time rate ranged from 90 % to 98 %. Last week 94 %, 1 point below target." |
| C2 Shipments per day vs error rate | Bars + line, **dual axis** | Left Y: "Shipments per day" (starts at 0); right Y: "Packaging error rate (%)" (starts at 0); X: day (weekly points when fewer than 5 shipments a day, per US-057) | Blue bars; orange line with **square markers** and direct end label "Error rate"; both axes titled and tick labels matching series (left blue text, right orange text is not required, titles suffice) | "Busiest week had 58 shipments with a 6.1 % error rate; quieter weeks averaged 28 shipments and 2.4 %." |
| C3 Errors by category (Pareto) | Sorted bars + cumulative % line | Left Y: "Packaging errors (count)"; right Y: "Cumulative share (%)" fixed 0–100; X: category names (wrap, never rotated more than 45°) | Blue bars sorted descending; orange cumulative line with diamond markers ending at 100 %; label on each bar with count | "Incorrect label and Paperwork account for 62 % of the 41 errors." |

Accessibility: tiles and charts are in logical DOM order; every chart has summary, `role="img"` label, and data table; `<h2>` per chart; reporting-date label uses `<p>`; no auto-refresh and no animation under `prefers-reduced-motion`. Contrast of all marks ≥ 3:1 (section 3.3).

Responsive
- ≥1280 px: six tiles in one row; C1 and C2 side by side; C3 full width.
- 1024–1279 px (tablet landscape): tiles wrap to 3 + 3; charts stack to two columns for C1/C2 if ≥ 960 px of content else one column.
- 768–1023 px (tablet portrait): tiles 2 × 3; charts one column; nav collapsed to the Menu disclosure.
- Wall screen (≥1920 px or `?view=wall`): see section 8.

---

### S03 Shipment list

**Route** `/shipments` · **Roles** all (create button for Shipping, Supervisor) · **Stories** US-024

```
Shipments                                                               [ New shipment ]   (1)
Views:  All | Overdue | On Hold | Ready to Pack | Rework                                   (2)
+--------------------------------------------------------------------------------------------+
| <form method="get" role="search">                                                          |
| Search (shipment no., customer PO or tracking no.)  [ SH-10________ ]                       |
| Status [All v]  Customer [All v]  Carrier [All v]                                          |
| Date field [Promise date v]  From [        ]  To [        ]   [ ] Late only  [ ] Overdue only |
| [ Apply filters ]  [ Clear filters ]                                                        |
+--------------------------------------------------------------------------------------------+
Showing 1-25 of 287 shipments                                              Sorted by promise date
Shipment | Customer             | PO       | Promise     | Status        | Carrier        | Timing
SH-1042  | Aldervale Aerostr.   | PO-77310 | 21 Nov 2026 | [S] Shipped   | SwiftLane Parc.| Late (2 days)
SH-1198  | Brightwater Marine   | PO-80122 | 27 Nov 2026 | [P] Packing   | Harbor Freight | Not yet due
SH-1203  | Pinecrest Robotics   | PO-80190 | 24 Nov 2026 | [R] Ready ... | -              | Overdue (1 day)
...
[ Previous ]  1  2  3 ... 12  [ Next ]
```

Annotations
1. "New shipment" shown only to Shipping and Supervisor (R-UI-1).
2. **View links** (plain GET links that set filters) replace the deferred needs-attention lists and due-soon view: Overdue (promise date before the reporting date and not Shipped or Cancelled, US-024), On Hold (hold reason column shown in this view), Ready to Pack, Rework. Current view has `aria-current="true"` and bold text.
3. Columns: P1 Shipment no. (link, mono), Customer, Promise date, Status (badge), Timing (text: "On time", "Late (n days)", "Overdue (n days)", "Not yet due"); P2 Carrier, Ship date, Customer PO; P3 Customer PO (when tablet), Tracking no. (searchable, not shown).
4. Sortable: Shipment no., Promise date, Status, Customer. Sort and filters are in the query string so links and the back button work.
5. "Date field" select chooses which date the range applies to (Order, Requested, Promise, Ship).
6. Result count always shown; zero results shows the empty state (4.9).

Accessibility: filter form is a labelled group; table caption "Shipments, 25 per page, sorted by promise date"; status and timing are text; the "Late only" and "Overdue only" checkboxes are 44 px rows. Responsive: ≥1024 all columns; 768 px hides P3, filters wrap to two rows; the filter bar collapses into a `<details>` "Filters (2 applied)" below 768 px (outside the required range, still safe).

---

### S04 Shipment create / edit (F1)

**Route** `/shipments/new`, `/shipments/{no}/edit` · **Roles** Shipping, Supervisor · **Stories** US-014 (absorbs US-015 edit and US-023 document flags)

```
New shipment                                  (Edit: "Edit shipment SH-1042")
[ErrorSummary when invalid]
Edit-warning (only when editing a Verified shipment):
 [!] Check: Saving changes to part, revision, quantity or lot sends SH-1042 back to Rework.
     It will have to be verified again.                                                    (1)
-- Header --------------------------------------------------------------------------------
Customer (required)            [Select customer v]
Customer PO (required)         [ PO-77310________ ]
Order date (required)          [ 2026-11-25 ]   Defaults to the reporting date, 25 Nov 2026.
Requested date (required)      [ 2026-12-02 ]
Promise date (required)       [ 2026-12-02 ]   Must be on or after the order date.
-- Lines ---------------------------------------------------------------------------------
Line | Part (required)            | Revision | Qty ordered (required) | Lot (optional)   |
 1   | [CRC-2041-B Bracket... v]  | B (shown)| [ 50 ]                  | [ L2611-004 ]    | [ Remove line ]
 2   | [Select part v]            |          | [    ]                  | [            ]   | [ Remove line ]
[ Add another line ]                                                                      (2)
-- Documents (flags) ---------------------------------------------------------------------
[ ] Packing slip prepared   [ ] Bill of lading prepared   [ ] C of C prepared   [ ] Labels printed   (3)
Notes (optional) [ ............................ ]
[ Save shipment ]   Cancel
```

Annotations
1. The warning appears only on edit of a Verified shipment, matching US-015 (returns to Rework with history note).
2. Lines are **server-rendered rows**: the page opens with 3 empty line rows; "Add another line" is a submit button (name `add_line`) that re-renders with one more row and keeps the values (no JavaScript needed). With JavaScript it may add a row in place. "Remove line" works the same way. Revision is displayed from the selected part (read-only text), not typed.
3. Document flags are checkboxes with plain labels; they only record whether the documents are ready (generation is v2).
4. Dates default to the reporting date where the doc says "today" and show the hint. Editing is refused for Shipped, Delivered, Cancelled: the page shows read-only values and a Note ("Shipped shipments can't be edited.") and direct requests are rejected.
5. Status is **not** an editable field anywhere (US-016); it appears as a badge in the page heading on edit.
6. Customer, part and carrier dropdowns list only active lookups; the existing (deactivated) value stays visible on edit.

Validation copy: see section 7.1. Accessibility: line table is a real `<table>` with a `<label>` per input (visually hidden headers allowed only when a visible column header exists; each cell input has an `aria-label` including the line number, for example "Quantity ordered, line 2"). Responsive: at 768 px the line table becomes stacked line cards (each line a bordered group with its own legend "Line 2").

---

### S05 Shipment detail with status actions

**Route** `/shipments/{no}` · **Roles** all view; actions per matrix · **Stories** US-024 (absorbs US-018), US-016 (absorbs US-017), US-019, US-021, US-030

```
Breadcrumb: Shipments > SH-1042
SH-1042   [S] Shipped            Aldervale Aerostructures - PO-77310          [ Print-friendly? no (later) ]
+- Next step ---------------------------------------------------------------------------------+
| (1) Status: Packing. Next: a person other than the packer verifies the packed shipment.      |
| Packer: Demo Shipper One (since 25 Nov 2026 09:14)     Verifier: not yet verified           |
| [ Open Pack & Verify ]   [ Edit shipment ]   [ Put on hold ]   [ Cancel shipment ]          |
| Hint: Only a Supervisor can cancel once packing has started.                              (2)|
+--------------------------------------------------------------------------------------------+
(3) Gate checklist (only in Rework)  ... component 4.10
-- Summary (definition list) ---------------------------------------------------------------
Order date 25 Nov 2026   Requested 02 Dec 2026   Promise 02 Dec 2026   Timing: Not yet due
Carrier -   Tracking -   Packages -   Weight -   Ship date -   Late reason -
Documents: Packing slip Yes, Bill of lading No, C of C Yes, Labels Yes                      (4)
-- Lines -----------------------------------------------------------------------------------
Line | Part                    | Rev | Ordered | Shipped | Lot        | Location
 1   | CRC-2041-B Bracket      | B   | 50      | -       | L2611-004  | STK-A01
-- Verification attempts --------------------------------------------------------------------
# | Result            | By               | When              | Failed items
1 | Failed            | Demo Quality     | 25 Nov 09:40      | Packing slip matches
-- Packaging errors and rework --------------------------------------------------------------
PE-0107 Paperwork (Major) [Closed]  Rework 22 min  Corrective action: Open   [ View error ]
-- Status history ---------------------------------------------------------------------------
When             | From          | To            | By               | Note
25 Nov 09:14     | Ready to Pack | Packing       | Demo Shipper One |
```

Annotations
1. **Next step box** is the single place for actions and always says in words what comes next. Its primary button changes with status (table below). Heading `<h2>Next step</h2>`.
2. **Explained absences**: when a role or state hides an action that the user might expect, a hint line says why (R-UI-1). Examples: Shipping on Packing: "Only a Supervisor can cancel once packing has started."; Shipping on On Hold: "Only Quality or Supervisor can release a hold."; Admin: the R-2 note.
3. Rework shows the gate checklist (4.10) inside the Next step box.
4. Boolean document flags are shown as Yes/No text. Late shipments show `Late (3 days)` and the late reason; shipped lines show shipped quantity and lot.

Status action matrix (what the Next step box offers)

| Status | Primary action (roles) | Other actions |
|--------|------------------------|---------------|
| Planned | `Mark Ready to Pack` (Shipping, Supervisor) | Edit; Put on hold (Shipping, Quality, Supervisor); Cancel (Shipping, Supervisor) |
| Ready to Pack | `Start packing (you become the packer)` (Shipping, Supervisor) | Edit; Hold; Cancel |
| Packing | `Open Pack & Verify` (everyone sees it; verify availability is on S06) | Edit; Log packaging error; Hold; Cancel (Supervisor only) |
| Verified | `Ship SH-1042` (Shipping, Supervisor) | Edit (warns); Hold; Cancel (Supervisor) |
| Rework | next unmet step from the gate checklist: `Log packaging error`, `Log rework`, or `Start packing again` (Shipping, Supervisor; unavailable with reason until error and rework are done) | Hold; Cancel (Supervisor) |
| On Hold | `Release from hold` (Quality, Supervisor) | Cancel (Supervisor); shows hold reason and owning department |
| Shipped | none | `Log customer-found error` (Quality, Supervisor) |
| Cancelled | none | read-only, shows cancel note |

Status changes are POST buttons inside `<form>`s with CSRF token; **Start packing**, **Mark Ready to Pack** and **Release** are one-click forms (no confirmation page) because they are reversible through history; **Cancel** goes to a confirm page (S08).

Accessibility: heading hierarchy `h1` shipment number, `h2` per section; summary as `<dl>`; tables with captions; status badge text first in reading order; history table is chronological and not sortable. Responsive: at 768 px the summary `<dl>` is a single column, tables hide P3 columns (Location, Failed items detail moves under the row as text).

---

### S06 Pack & Verify checklist (F2)

**Route** `/shipments/{no}/pack-verify` · **Roles** all view; verify: Shipping, Quality, Supervisor (not the packer) · **Stories** US-019, US-020, US-030 · docs/02 §2.4

**State A: a different eligible user is verifying (interactive)**

```
Pack & Verify - SH-1042   [P] Packing
Verifying as: Demo Quality (Quality).   Current packer: Demo Shipper One since 25 Nov 2026 09:14.   (1)
+- Shipment to check ----------------------------------------------------------------------------+
| Line | Part               | Rev | Qty | Lot        | Packaging instruction (ref, rev)            |
|  1   | CRC-2041-B Bracket | B   | 50  | L2611-004  | PI-2041 rev C                                |
+-------------------------------------------------------------------------------------------------+
[ErrorSummary]
<h2>Checklist</h2>   Answer every item: Pass or Fail.            Progress: 0 of 8 answered   (2) aria-live
Item                                         Pass   Fail   Note (required if Fail)
1 Part number matches                        ( )    ( )    [______________]
   Compare label, packing slip and parts with line 1 (CRC-2041).
2 Revision matches                           ( )    ( )    [______________]
3 Quantity matches                           ( )    ( )    [______________]
4 Lot recorded                               ( )    ( )    [______________]
5 Labels match                               ( )    ( )    [______________]
6 Packing slip matches                       ( )    ( )    [______________]
7 C of C present (shown only when a part requires it)  ( ) ( ) [__________]
8 Packaging method follows the instruction   ( )    ( )    [______________]
  [ Mark Verified ]   [ Fail verification and send to Rework ]                              (3)
  Mark Verified needs all items on Pass. Fail verification needs at least one Fail and a note.
-- Attempts so far ------------------------------------------------------------------------------
# | Result | By | When | Failed items
```

**State B: the current packer opens the page (verify unavailable)**

```
Pack & Verify - SH-1042   [P] Packing
+- [i] Note ---------------------------------------------------------------------------------+
| You packed this shipment, so someone else must verify it.                              (4)|
| A second person checks the work so one mistake cannot pass unnoticed. Ask another Shipping,|
| Quality or Supervisor user to sign in and open this page. You can read the checklist below.|
+--------------------------------------------------------------------------------------------+
What the verifier will check (read-only)
 1. Part number matches   2. Revision matches   3. Quantity matches   4. Lot recorded
 5. Labels match   6. Packing slip matches   7. C of C present (if required)   8. Packaging method
 [ Mark Verified ]  (unavailable)   [ Fail verification and send to Rework ]  (unavailable)
 <p id="why-unavailable">Unavailable to you: you are the packer of SH-1042. The server also
 refuses this, even if the page is bypassed.</p>
```

**State C: role cannot verify (Admin, Receiving, Viewer)**: read-only checklist results and the note "Your role (Receiving) cannot verify shipments. Only Shipping, Quality and Supervisor users can verify." No buttons.

**State D: status is not Packing**: attempts history only, with "SH-1042 is Verified, so no further verification is needed." (or, for Rework: the gate checklist and "Start packing again" on the detail page).

Annotations
1. The page always states **who is verifying** and **who the current packer is**, so a user knows before acting whether it will be allowed. For a packer it is the same person; the page then renders State B.
2. Each item is a `<fieldset>` with a `<legend>` (item text) and two radios "Pass" and "Fail" (44 px rows), both **unselected by default** (no pre-answered items; unanswered counts as not passed). The note input per item is always in the DOM and labeled "Note for item 5 (required if Fail)"; with JavaScript the note is shown only when Fail is chosen. The progress text is static text on load and a live counter with JavaScript ("5 of 8 answered, 0 failed", `aria-live="polite"`).
3. **Two explicit outcome buttons** (no generic "Submit"). Mistake-proofing messages if the wrong one is pressed: Mark Verified with any Fail or unanswered item, or Fail verification with no Fail item (copy in 7.2). Fail verification is a **danger** button with a warning icon; it moves the shipment to Rework and saves the failed items.
4. **Why it is unavailable** (State B). The buttons are `aria-disabled="true"`, reachable by keyboard, and described by `#why-unavailable` (4.8). With JavaScript, activating one moves focus to the Note. Without JavaScript the POST reaches the server and returns 403 with the same wording (section 7.2 `E-VER-1`). **The server always enforces; the page only explains.** A Supervisor or Quality user who packed gets the same State B (T-4).
5. After **Mark Verified**: redirect to S05 with "Saved: SH-1042 is Verified. Next: ship it." After **Fail**: redirect to S05 with "Verification failed. SH-1042 moved to Rework. Log the packaging error next." and a button to S10 with the shipment pre-selected (full pre-fill from failed items is later, US-028).
6. Item 7 (C of C) appears only if any line's part requires a C of C (US-019). Packaging instruction reference and revision per line are shown above the checklist (US-019 first AC).
7. Re-verification after rework (US-030): if the error or completed rework is missing, the page shows the gate checklist (4.10) and the outcome buttons are Unavailable with the missing step named (copy 7.2 `E-GATE-1`, `E-GATE-2`).

Accessibility: radio groups are real `<fieldset>`/`<legend>`; the 16-row-tall targets are 44 px on tablets (gloved use); errors per item are linked from the summary; failure result and status are text; no color-only pass/fail marks (✔ Pass / ✖ Fail words appear in the attempts table). Responsive: ≥1024 table-like grid (item, Pass, Fail, Note); at 768 px each item is a stacked card with Pass and Fail side by side and the note below; buttons stack full width, "Mark Verified" first.

---

### S07 Ship (F3)

**Route** `/shipments/{no}/ship` · **Roles** Shipping, Supervisor · **Stories** US-021 (absorbs US-022), US-041, US-030

```
Ship SH-1042 - Aldervale Aerostructures      [V] Verified     Promise date: 21 Nov 2026
[Blocked panel, only if status is not Verified:]
 [!] Problem: SH-1042 is Rework, not Verified. It must be verified again before it can ship. [ Back to shipment ]
[ErrorSummary]
Ship date (required)           [ 2026-11-25 ]  Defaults to the reporting date, 25 Nov 2026.
Carrier (required)             [Select carrier v]
Tracking number (required unless Customer Pickup)   [ SLP123456789012 ]   Letters, digits, hyphens.
Service level (optional)       [ Ground ]
Packages (required)            [ 2 ]          Total weight in lb (required)  [ 41.5 ]
-- Late reason --------------------------------------------------------------------------------
Required only when the ship date is after the promise date (21 Nov 2026).
Late reason                    [Select reason v]                                            (1)
 (JS only:) [!] This shipment will ship 4 days late.
-- Lines shipped ------------------------------------------------------------------------------
Line | Part               | Ordered | Qty shipped (required) | Ship from lot and location (required)
 1   | CRC-2041-B         | 50      | [ 50 ]                 | [L2611-004 - STK-A01 - 120 available v]   (2)
Note if any line ships short:  [ ....................................... ]                       (3)
[ Ship SH-1042 ]   Cancel
```

Annotations
1. Late reason: the field is always in the page. Server rule: required when ship date is after promise date (hint text states this). With JavaScript the label gains "(required)" and a live notice "This shipment will ship N days late." when the date changes; if the reporting date already exceeds the promise date on load, the page renders it as required.
2. One combined select per line, **"lot - location - available"**, limited to rows with stock for that part. This prevents typing a wrong lot and shows availability (US-041). If a part has no stock, the select shows "No stock available for CRC-2041-B" and the Ship button is Unavailable with the same text. [P: the select can be long; at most about 10 rows per part in seed data.]
3. Short shipping: if a shipped quantity is less than ordered, a note is required and the page states "This shipment will not count as in full for OTIF."
4. Tracking is optional only for Customer Pickup (US-021). The carrier select shows mode text; with JavaScript the label toggles "(required)" text. Without JavaScript the hint "Not needed for Customer Pickup" is permanent and the server decides.
5. The submit button names the record ("Ship SH-1042") because shipping posts SHIP ledger transactions and cannot be undone. Atomic: status and ledger change together or not at all (US-041).
6. Admin, Receiving, Viewer see no form (read-only note). Status not Verified: **Blocked panel** replaces the form (409 in place), with a link back.

Accessibility: late-reason change and the short-ship notice use `aria-live="polite"`; select options are text only ("L2611-004, STK-A01, 120 available"); all errors linked in summary. Responsive: lines become stacked cards at 768 px.

---

### S08 Hold, Release, Cancel

**Routes** `/shipments/{no}/hold`, `/release`, `/cancel` · **Stories** US-016 (absorbs US-017) · same page template, one short form each

```
Put SH-1042 on hold                                   Shipment status now: [P] Packing
Hold reason (required)         [Select reason v]      (hold reason codes)
Owning department (required)   [Select department v]  (who must act to clear it)               (1)
Note (optional)                [ ...................... ]
[ Put SH-1042 on hold ]   Cancel
   -------------------------------------------------------------------------------------------
Release SH-1042 from hold                       Hold reason: Quality hold - Owner: Quality
Releasing returns the shipment to Packing (its status before the hold).
Note (optional) [ ........ ]        [ Release SH-1042 ]   Back
   -------------------------------------------------------------------------------------------
Cancel SH-1042  (Shipping: only Planned or Ready to Pack; Supervisor: any status before Shipped)
                                                   [!] Cancelling can't be undone.
Cancelled shipments are read-only and leave all KPIs and charts.
Reason (required)  [ ....................... ]
Confirm: [ ] I understand SH-1042 will be cancelled.                                      (2)
[ Cancel SH-1042 ] (danger)    Keep shipment
```

Annotations
1. "Owning department" values (provisional, contract §2): Shipping, Quality, Receiving, Production, Planning, Customer (14.6).
2. The confirmation checkbox is a plain required checkbox (no modal dialog), keeping the page keyboard- and no-JS-safe.
3. Role gating: release is hidden from Shipping (hint on S05); cancel for Shipping is only offered in Planned and Ready to Pack (R-5); wrong status or role shows the standard Problem alert.

Accessibility: standard form template; destructive button uses danger style plus the word "Cancel" and the record number.

---

### S09 Packaging error list

**Route** `/quality/errors` · **Roles** all view · **Stories** US-032 (absorbs US-034), links from C3

```
Errors & rework                                                [ Log packaging error ]  (permitted roles)
Filters: Status [All v] Category [All v] Severity [All v] Stage [All v] Shipment [SH-____] From [ ] To [ ] [Apply][Clear]
Showing 1-25 of 41 errors
Error    | Shipment | Category          | Severity     | Stage       | Status        | Rework min | Corrective action
PE-0107  | SH-1042  | Paperwork         | [!] Major    | Before ship | [O] Open      | 22         | Open
PE-0101  | SH-1010  | Incorrect label   | [.] Minor    | After ship  | [O] Overdue...| None       | None
```

Annotations: Open errors older than 7 days show "Open - Overdue (9 days)" text (US-034). Category "Other" shows "Needs recategorising" text in the category cell (US-027). "After ship" rows display the text "Customer-found". Columns P1: Error, Shipment, Category, Status; P2: Severity, Stage; P3: Rework minutes, Corrective action. Filters honour the C3 click-through query (`?category=Paperwork&from=…&to=…`). Accessibility and responsive as S03.

---

### S10 Log packaging error (F4)

**Route** `/quality/errors/new?shipment=SH-1042` · **Roles** Shipping (before ship), Quality, Supervisor · **Stories** US-027 (absorbs US-033)

Step 0 (when arriving without `?shipment=`): a small GET form "Which shipment? `Shipment number (required) [SH-____]` `[ Continue ]`", then the form below. This keeps the form no-JS and prevents a wrong-shipment error.

```
Log packaging error - SH-1042 (Aldervale Aerostructures) [P] Packing
[!] Check: Logging an error before ship moves SH-1042 to Rework.        (shown when status is Packing or Verified)  (1)
[ErrorSummary]
Shipment line (optional)    [All lines v]
Detected at (required)      [ 2026-11-25T10:05 ]
Detected by (required)      ( ) Packer  ( ) Verifier  ( ) Quality  ( ) Customer                    (2)
Detected stage (required)   ( ) Before ship  ( ) After ship (customer-found)                       (3)
Category (required)         [Select category v]
   Wrong part - Wrong quantity - Incorrect label - Paperwork - Packaging method - Damage - Traceability - Other
Paperwork type (required when category is Paperwork)
                            [Select v]  Packing slip - BOL - C of C - Customer-specific form - Commercial invoice   (4)
Severity (required)         ( ) Minor   ( ) Major   ( ) Critical     (definitions below)
Description (required)      [ ........................................................ ]
-- Root cause (optional; can be added later by Quality or Supervisor) --
> Add root cause now  (details element)
[ Save packaging error ]   Cancel
```

Annotations
1. Warning text only when the shipment is Packing or Verified (US-027). Shipments already in Rework do not show it.
2. Detected-by "Customer" is only valid with "After ship"; the server rejects other combinations with the inline message in 7.3. [P] Pre-select "Customer" and "After ship" when the shipment is Shipped.
3. **Stage options depend on shipment status and role** (rendered on the server): Shipped shipment + Quality/Supervisor shows both radios with After ship pre-selected; Shipped + Shipping shows a Note ("Only Quality or Supervisor can log errors found after shipping") and no form (R-8); before-ship statuses show only "Before ship" selected.
4. Paperwork type is rendered always, with "(required when category is Paperwork)", and with JavaScript is hidden unless Paperwork is selected.
5. Severity definitions as help text beneath the radios [P, wording is mine; Priya/Quinn to confirm]: Minor = caught and fixed with no effect on the customer; Major = shipment cannot ship until corrected; Critical = could cause a safety, regulatory or serious customer problem (illustrative wording, no compliance claim).
6. Category "Other" shows a hint: "Quality will review and recategorise it."
7. The root cause fieldset reuses the F6 fields (S13) so Quality can fill them in one go.

Accessibility: radio groups with legends; description has a counter hint; errors per field. Responsive: single column.

---

### S11 Packaging error detail

**Route** `/quality/errors/{PE-no}` · **Roles** all view · **Stories** US-027, US-029, US-032 (US-034 close-out)

```
PE-0107  [O] Open   Paperwork - Packing slip   [!] Major   Before ship   Shipment SH-1042
Detected 25 Nov 2026 10:05 by Verifier - Reported by Demo Quality
Description: Packing slip lists revision B, parts are revision C.
+- Close-out ------------------------------------------------------------------------------+
| Status: Open -> Contained -> Closed.        [ Mark Contained ]  [ Close error ] (Quality, Supervisor) |
| To close: [x] at least one rework completed  [ ] root-cause category set                      (1)
| Unavailable: root-cause category is missing. Add it in "Root cause" below.                  |
+------------------------------------------------------------------------------------------+
-- Rework events -------------------------------------------------------------- [ Log rework ]
Action           | Started          | Completed        | Minutes | By               | Re-verified
Reprint paperwork| 25 Nov 10:15     | 25 Nov 10:37     | 22      | Demo Shipper Two | Not yet
Total minutes: 22 (in-progress events are excluded)
-- Root cause -------------------------------------------------------- [ Edit root cause ]
Category (6M): Method        5 Whys note: ...
-- Corrective actions ---------------------------------------------- [ Add corrective action ]
Action | Owner | Due | Status | 
```

Annotations
1. **Close** is Unavailable (reason shown) until at least one rework event is completed for before-ship errors and a root-cause category is set (US-034). Customer-found errors need no rework event.
2. The "Re-verified" column is read-only text ("Yes", "Not yet"); it is set by the server when the re-verification passes, not typed (contract E-11).
3. Buttons for Root cause, Add corrective action, Close error appear only for Quality and Supervisor; Log rework for Shipping, Quality, Supervisor.
4. Overdue corrective actions show the text badge "Overdue".

Accessibility: each section is an `<h2>`; tables have captions. Responsive: tables hide P3 columns at 768 px.

---

### S12 Log rework (F5)

**Route** `/quality/errors/{PE-no}/rework/new` · **Roles** Shipping, Quality, Supervisor · **Stories** US-029

```
Log rework for PE-0107 (SH-1042)
Action (required)               [Select action v]   Relabel - Repack - Reprint paperwork - Replace part - Recount - Other
Started at (required)           [ 2026-11-25T10:15 ]
Completed at (leave blank if still in progress)   [                    ]                        (1)
Minutes                         Calculated when you save (completed minus started).
Performed by (required)         [Demo Shipper Two v]   Defaults to you.
Re-verified OK                  Set automatically when SH-1042 passes verification again.        (2)
Note (optional)                 [ ....................... ]
[ Save rework ]    Cancel
```

Annotations: (1) A blank end time saves the event as **In progress**; it shows as "In progress" and is not counted in minute totals (US-029). To finish later the user opens the event from S11 ("Complete rework" uses the same form with the end time required). (2) Read-only text; no checkbox is offered (server-managed, 14.5). Rework cannot be created without an error (the page is only reachable from an error). Validation: end earlier than start is rejected inline.

---

### S13 Root cause and corrective action (F6)

**Routes** `/quality/errors/{PE-no}/root-cause`, `/quality/errors/{PE-no}/corrective-actions/new` · **Roles** Quality, Supervisor · **Stories** US-031, US-032

```
Root cause for PE-0107
Root-cause category, 6M (required)   [Select v]   Method - People - Material - Machine - Measurement - Environment
5 Whys note (optional but recommended)
 [ Why 1: ...                                 ]   Hint: write one why per line. Stop when you
 [ Why 2: ...                                 ]   reach a cause you can fix.
 [ ........................................... ]
[ Save root cause ]   Cancel
------------------------------------------------------------------------------------------------
Add corrective action for PE-0107
Action description (required)   [ ....................... ]
Owner (required)                [Select active user v]
Due date (required)             [ 2026-12-09 ]   Can't be before the error was detected (25 Nov 2026).
Status                          ( ) Open  ( ) In Progress  ( ) Closed       (new actions start as Open)
[ Save corrective action ]   Cancel
```

Annotations: The 5 Whys is one textarea (the data model has a single `root_cause_note`); the page pre-fills a five-line template ("Why 1:" through "Why 5:") so the structure is guided without extra fields. Owner lists only active users (US-032). Closed actions become read-only and stamp closed-at. Owner and due date are required in the UI [P]; the data model allows them to be empty (open question 14.7). Past-due, not-closed actions show "Overdue" text.

Accessibility: textarea labelled "5 Whys note", hint associated; segmented status is a radio group. Responsive: single column.

---

### S14 Receipts list and Receive material (F7)

**Routes** `/inventory/receipts`, `/inventory/receipts/new` · **Roles** all view; Receiving, Supervisor create · **Stories** US-035

```
Receipts                                                          [ Receive material ]
Filters: Supplier [All v] Part [All v] Inspection [All v] From [ ] To [ ] [Apply]
Receipt  | Supplier             | Part           | Qty | Lot        | Arrived      | Inspection
RC-0148  | Graystone Metals ... | CRC-3310-A     | 200 | L2647-002  | 24 Nov 08:20 | [check] Accepted
RC-0147  | Kestrel Fasteners    | CRC-1120-C     | 500 | L2647-001  | 24 Nov 07:55 | [pause] On Hold
-------------------------------------------------------------------------------------------
Receive material
Supplier (required)             [Select supplier v]
Supplier PO (required)          [ PO-S-4471 ]
Part (required)                 [Select part v]
Quantity received (required)    [ 200 ]
Lot number (required)           [ L2648-001 ]   Format: L, year, week, hyphen, number. Example L2611-004.   (1)
Arrival time (required)         [ 2026-11-25T08:20 ]   Date defaults to the reporting date.
Inspection status (required)    ( ) Accepted  ( ) On Hold  ( ) Rejected                                  (2)
Receive into location           [RCV-01 v]   (Accepted only)
[ Save receipt ]    Cancel
```

Annotations
1. Hint shows a suggested prefix from the reporting date's week (`L2648-`). The format is a hint only; the server accepts letters, digits and hyphens, 3 to 30 characters, stored upper-case (14.8, contract Q-I).
2. Under the radios a static "What happens" list (text): **Accepted**: stock is added at the chosen location. **On Hold**: stock is added at HOLD-01 and needs a Quality or Supervisor transfer to release. **Rejected**: no stock is added; the receipt stays visible.
3. After save: redirect to the receipts list with "Saved: RC-0149, 200 × CRC-3310-A, lot L2648-001, Accepted into RCV-01."

Accessibility: required fields in text; the "What happens" list is associated to the radio group by `aria-describedby`. Responsive: table hides P3 columns (Supplier PO, Arrival), form single column.

---

### S15 On-hand

**Route** `/inventory/on-hand` · **Roles** all view; row actions per role · **Stories** US-037 (absorbs US-038)

```
On-hand inventory (from the ledger)                                [ Export CSV: see Reports R4 ]
Filters: Part [All v]  Location [All v]  Lot [ L2611-___ ]  [ ] Include zero quantities  [Apply][Clear]
Part            | Description | ABC | Location | Lot        | On hand | Actions
CRC-2041-B      | Bracket     | A   | STK-A01  | L2611-004  | 60      | [ Trace lot ]  [ Move or scrap ]
CRC-1120-C      | Fastener kit| C   | HOLD-01  | L2647-001  | 500     | [ Trace lot ]  [ Move or scrap ]
Total shown: 12 rows
```

Annotations: "On hand" is derived from the append-only ledger; the page footer says "Derived from the ledger. Ledger entries can't be edited or deleted; corrections are new entries." "Move or scrap" opens S16 with the part, lot and location pre-selected (visible to Receiving, Supervisor, and Quality for Hold rows). "Trace lot" opens S20, which also lists the transactions behind the lot (covers the deferred transaction history). Hold locations show a "Hold" text tag in the location cell. Accessibility: numeric column right-aligned; row actions have visually hidden context ("Trace lot L2611-004"). Responsive: P3 (Description, ABC) hidden at 768 px.

---

### S16 Move stock (F8)

**Route** `/inventory/move` (and from On-hand row) · **Roles** Receiving, Supervisor; Quality for Hold locations only (R-7) · **Stories** US-035 (absorbs US-039), US-037

```
Move stock
Type (required)    ( ) Transfer   ( ) Scrap   ( ) Production complete        (Adjustments come from approved cycle counts)
Step 1 (when not coming from On-hand):  Part [Select part v] [ Find stock ] (GET)
Stock to move   CRC-2041-B - L2611-004 - STK-A01 - 60 available                     (read-only, from On-hand)
-- Transfer ---------------------------------------------------------------------------------
Quantity (required)              [ 20 ]   Up to 60.
To location (required)           [Select location v]   Must differ from STK-A01.
-- Scrap ------------------------------------------------------------------------------------
Quantity (required)  [   ]       Scrap reason (required) [Select reason v]
-- Production complete (adds finished parts; no source stock) -------------------------------
Part [v]  Lot [   ]  Quantity [   ]  To location [v]
Note (optional)  [ ... ]
[ Move 20 to FG-01 ]   (button text reflects the type and quantity when JS is on; "Post transaction" without)
Unavailable (Receiving, source is HOLD-01): "Moving stock out of HOLD-01 needs a Quality or Supervisor user."   (1)
```

Annotations
1. **R-7.** Any transfer **or scrap** whose source is a Hold-type location (HOLD-01) needs Quality or Supervisor; the rule follows the source location's type, not anything the user picks. Receiving who opens a Hold row sees the form read-only with the Unavailable button and the reason `Moving or scrapping stock in a Hold location needs a Quality or Supervisor user.` (T-13, T-19; server 403 `FORBIDDEN_HOLD_RELEASE`). **Quality** sees only Transfer and Scrap, and only for stock in or going into Hold locations, with the note `Quality can move or scrap held stock only.` Production complete is not offered to Quality (server 403 `FORBIDDEN_NON_HOLD_TXN`). Shipping, Admin and Viewer do not see the screen.
2. A transfer is one atomic action creating two ledger entries; the success message says "Moved 20 of CRC-2041-B (L2611-004) from STK-A01 to FG-01."
3. The sections of the three types are separate pages states: Type radios submit a GET (`?type=scrap`) to show only the relevant fields, so the page works without JavaScript.

Accessibility: type radios are a `<fieldset>`; availability and "Must differ from source" hints associated to inputs. Responsive: single column.

---

### S17 Cycle count list and create

**Route** `/inventory/cycle-counts`, `/inventory/cycle-counts/new` · **Roles** all view; Supervisor creates · **Stories** US-043 (absorbs US-042)

```
Cycle counts                                                              [ Create count list ] (Supervisor)
Count   | Scheduled   | Scope        | Lines | Status                    | Accuracy       | Actions
CC-0012 | 24 Nov 2026 | Class A      | 18    | [pencil] Counted          | -              | [ Review and approve ]
CC-0011 | 17 Nov 2026 | Location STK-A| 22   | [check] Approved          | 95.5 %         | [ View ]
CC-0013 | 25 Nov 2026 | Class C      | 20    | [circle] Open             | -              | [ Enter counts ]
--------------------------------------------------------------------------------------------
Create count list
Count by (required)    ( ) ABC class  ( ) Location
ABC class [A v]  or  Location [Select v]       (the matching control is required)
Scheduled date (required)   [ 2026-11-26 ]   Defaults to the reporting date.
[ Create count list ]   Cancel
```

Annotations: Action links are role-aware ("Enter counts" for Receiving and Supervisor; "Review and approve" for Supervisor on Counted counts; others see "View"). The accuracy column appears only for Approved counts. Creating produces one line per part/location/lot with non-zero on-hand; the success message says how many lines. Accessibility and responsive: as S03.

---

### S18 Count entry (blind)

**Route** `/inventory/cycle-counts/{CC-no}` while status Open · **Roles** Receiving, Supervisor · **Stories** US-043

```
Count CC-0013 - Class C - scheduled 25 Nov 2026                      [Open]
[i] Note: Count what you find. System quantities are hidden on purpose so the count is independent.   (1)
[ErrorSummary]
Part            | Location | Lot        | Counted quantity (required) | Recount
CRC-1120-C      | HOLD-01  | L2647-001  | [ 495 ]                      | (appears only when needed)
CRC-3310-A      | STK-A04  | L2640-003  | [ 130 ]                      |
CRC-2077-A      | STK-B02  | L2639-001  | [    ]                       |
...
[ Save counts ]                 [ Submit count for approval ]  (unavailable until every line is complete)   (2)
```

After "Save counts", lines that need a recount look like:

```
CRC-1120-C | HOLD-01 | L2647-001 | Counted: 495 (saved)  | Recount quantity (required) [     ]
                       [!] Out of tolerance: count this item again and enter the new quantity.   (3)
```

Annotations
1. **No system quantity anywhere** for the counter: not in the page, not hidden in markup, not in the response (US-043). No variance amounts either; only the words "Within tolerance" are never shown to counters, and only "Out of tolerance: count again" is shown.
2. "Save counts" saves progress (secondary button); "Submit count for approval" is a primary button that is Unavailable with reason ("3 lines still need a count. 1 line needs a recount.") until all lines (and required recounts) are complete; the server decides.
3. The first counted quantity is kept unchanged (read-only text) when a recount is requested (US-043). Counts accept whole numbers 0 or more; blank is not 0.
4. Supervisor entering counts sees the same blind page, with a hint under the title: `If you enter or recount any line, another Supervisor must approve this count.` (R-4 is adopted; it covers recounts too). In the demo, counts are entered by `demo.receiver`, so `demo.supervisor` can approve.
5. Per the API contract the system quantity is absent from the response for an Open count for **every** role, including Supervisor; the server tells the page only `recount_required`.

Accessibility: each count input has `aria-label` "Counted quantity, CRC-1120-C, HOLD-01, lot L2647-001"; the table uses `inputmode="numeric"`; recount messages are inline and in the summary. Responsive: at 768 px each line becomes a card with the identifiers on top and one large number input (min 56 px high) for gloved use.

---

### S19 Count review and approval

**Route** `/inventory/cycle-counts/{CC-no}` while status Counted · **Roles** Supervisor approves; all others read (system quantities visible on a Counted count only to Supervisor and Admin, and to all roles once Approved, per contract §7.1) · **Stories** US-044

```
Count CC-0012 - Class A - scheduled 24 Nov 2026   [Counted]   Entered by: Demo Receiver
Summary: 18 lines. 16 within tolerance, 2 out of tolerance (88.9 %). 2 adjustments will post.   (1)
Part       | Loc     | Lot       | ABC | System | Counted | Recount | Final | Variance | Result                  | Adjust reason
CRC-2041-B | STK-A01 | L2611-004 | A   | 100    | 96      | 96      | 96    | -4       | [!] Out of tolerance    | [Select adjust reason v]
CRC-3310-A | STK-A04 | L2640-003 | A   | 130    | 130     | -       | 130   | 0        | [check] Within tolerance| -
[ Approve count CC-0012 and post 1 adjustment ]    Back to list                                  (2)
Unavailable (if you entered or recounted any line, R-4): "You entered this count, so another Supervisor must approve it." (3)
   The Approve button stays visible but unavailable (pattern 4.8); server answer 403 APPROVER_SAME_AS_COUNTER.
```

Annotations
1. The summary previews effect in words, including the accuracy this count adds (US-053 formula: lines within tolerance ÷ lines counted).
2. Approving is explicit and irreversible: one adjustment per line with a variance, using the chosen adjust reason (required for each variance line). Repeating approval posts nothing again (US-044); the page for an Approved count shows no button and the text "Approved by Demo Supervisor on 25 Nov 2026 14:02. Adjustments posted."
3. **R-4 is adopted** (permissions matrix, test T-15): a Supervisor who entered or recounted any line cannot approve. The page shows who entered the count ("Entered by: Demo Receiver") and, when the viewer is the counter, the Unavailable button with the reason. The contract names the code `APPROVER_ENTERED_COUNT`; the matrix names it `APPROVER_SAME_AS_COUNTER` (open question 14.22).
4. Non-Supervisors see this page read-only with "Only a Supervisor can approve counts."

Accessibility: tolerance result is text with icon; variance has explicit sign ("-4", "+2") and units; table has caption. Responsive: P3 columns (ABC, Counted, Recount) collapse into the Final cell as small text at 768 px.

---

### S20 Lot trace (R7)

**Route** `/inventory/lot-trace?lot=L2611-004` · **Roles** all · **Stories** US-045, US-065 (CSV)

```
Lot trace
Lot number (required)   [ L2611-004 ]  [ Trace lot ]   Example: L2611-004.            [ Export CSV ]
Lot L2611-004 - CRC-2041-B Bracket, Machined
Reconciliation: Received 100 - Shipped 40 - Scrapped 0 - Adjusted 0 = On hand 60                 (1)
-- Where it came from (backward) -----------------------------------------------------------
Supplier              | Supplier PO | Receipt | Part       | Qty | Received
Graystone Metals Supply| PO-S-4102  | RC-0031 | CRC-2041-B | 100 | 16 Mar 2026
-- What happened to it (all movements, oldest first) --------------------------------------
When         | Type    | Location | Qty change | By        | Reference
16 Mar 08:10 | Receipt | RCV-01   | +100       | Demo Receiver | RC-0031
-- Where it went (forward) ------------------------------------------------------------------
Shipment | Customer           | Shipped     | Qty | Carrier        | Tracking
SH-1042  | Aldervale Aerostr. | 25 Nov 2026 | 40  | SwiftLane Parcel| SLP123456789012
```

Annotations: (1) The reconciliation line makes the trace self-checking. Unknown lot: empty state with the example format. Export CSV exports the same rows (US-045). Accessibility: three `<h2>` sections each with a captioned table; quantities carry a sign. Responsive: tables hide P3 (By, Reference) at 768 px.

---

### S21 Reports: index, R1, R3, R4 and CSV

**Routes** `/reports`, `/reports/r1`, `/reports/r3`, `/reports/r4`; R7 is S20 · **Roles** all view and export · **Stories** US-065 (absorbs US-066, US-068, US-069), US-045

```
Reports
 R1 Shipment Log                       R3 Packaging Error and Rework Log
 R4 Inventory On-Hand                  R7 Lot Trace  (opens Lot trace)
-------------------------------------------------------------------------------------------
R1 Shipment Log
[cal] Reporting as of 25 Nov 2026 - demonstration data                                    (1)
Filters: Ship date From [2026-10-27] To [2026-11-25]  Customer [All v]  Carrier [All v]
         [ ] Include cancelled   [Apply]  [Clear]                                          (2)
Rows: 214                                                           [ Export CSV (214 rows) ]  (3)
Shipment | Customer | PO | Promise | Ship date | Carrier | Tracking | Status | On time / Late
```

Annotations
1. The reporting-date label (4.2) appears on every report page; the CSV file name includes the report and the reporting date, e.g. `r1-shipment-log_2026-11-25.csv` (US-065).
2. **Filters per report**: R1 ship-date range, optional customer and carrier (R1 AC), include cancelled (default off). R3 detected-date range, category, severity, stage, status; includes a totals row (errors, rework minutes) and rework frequency figures (KPI-5: rework events ÷ shipments shipped and total minutes) shown above the table as text. R4 part, location, lot, include zero quantities (default off).
3. "Export CSV (214 rows)" is a normal link with the current filters; the caption says "Exports all matching rows, not just this page." Same columns, order and filters as the table. Empty report: CSV has only the header (US-065); the page says so (4.9).
4. R3 shows "None" in text for errors without rework or corrective action (US-068). R1 shows "On time" / "Late (n days)" text, never color alone.

Accessibility: same table rules as 4.5; the export link announces its file type: "Export CSV (214 rows, file download)". Responsive: P3 columns hidden at 768 px; the CSV carries every column. Print: reports repeat the reporting-date label (print stylesheet shows label and filters; R8 printable summary is later).

---

### S22 Settings: KPI targets, reporting date

**Route** `/admin/settings` · **Roles** Admin (all sections), Supervisor (targets only; reporting date read-only text) · **Stories** US-008, US-011 (reset on S23)

```
Settings
-- Reporting date (Admin only) ------------------------------------------------------------
Mode (required)   (x) Fixed demo date   ( ) Live date (use the real calendar date)
Reporting date (required when fixed)   [ 2026-11-25 ]
Preview: "Reporting as of 25 Nov 2026 - demonstration data"                                  (1)
[ Save reporting date ]
-- KPI targets (Supervisor, Admin) --------------------------------------------------------
KPI                                   Target     Unit    Better when
On-Time Shipment %                    [ 95 ]     %       higher
OTIF %                                [ 93 ]     %       higher
Packaging Error Rate % (below)        [ 2 ]      %       lower
Packaging FPY %                       [ 98 ]     %       higher
Rework frequency % (below)            [ 2 ]      %       lower
Shipment cycle time                   [ 24 ]     hours   lower
Inventory Accuracy %                  [ 97 ]     %       higher
Dock-to-stock time (not shown on the dashboard in v1)  [ 8 ]  hours  lower
-- Cycle-count tolerances -----------------------------------------------------------------
Class A [ 0 ] %    Class B [ 2 ] % (plus or minus)    Class C [ 5 ] % (plus or minus)
On-time tolerance [ 0 ] days
[ Save targets ]
-- Demo data (Admin only) -----------------------------------------------------------------
Reset all demo data to the original seed.        [ Reset demo data... ]  (opens S23)       (2)
 (when disabled:) "Demo reset is turned off on this site."
```

Annotations
1. The preview line shows the exact label users will see (4.2). Fixed mode without a valid date is rejected inline ("Enter a valid reporting date."). Every change is audited; a Supervisor sees the reporting-date section as plain text ("Fixed demo date: 25 Nov 2026. Only an Admin can change it.").
2. The reset section is shown only to Admin and only describes availability; the destructive step is a separate page (S23).
3. Targets and tolerances are separate forms (own save buttons, own error summaries) so a mistake in one does not block the other.
4. Hint under targets: "The dashboard uses the new target the next time it loads."

Accessibility: targets table has `th scope`; each input labeled with KPI name and unit ("On-Time Shipment target, percent"). Responsive: single column; table becomes stacked label/input pairs at 768 px.

---

### S23 Demo data reset (confirm)

**Route** `/admin/demo-reset` · **Roles** Admin, only when reset is enabled · **Stories** US-011

```
Reset demo data
[!] Warning: This deletes ALL records created since the last seed (shipments, errors, receipts, counts)
    and rebuilds the original fictional data. It can't be undone. An audit entry is written first.
Type RESET DEMO to confirm (required)   [ ____________ ]
[ Reset demo data ] (danger)     Cancel
```

Annotations (R-9, security plan PD-3)
1. The typed phrase is compared on the server; mismatch shows "Type RESET DEMO exactly to confirm." The page also lists consequences in plain words: `All records are rebuilt from the original seed. Demo users and their passwords are recreated. Everyone, including you, is signed out.`
2. **Cooldown:** at most one reset per 10 minutes. A second attempt shows (429): `A reset ran less than 10 minutes ago. Wait and try again.` (no countdown clock).
3. **Success:** all sessions end, so the user lands on `/login` with `The demo data was reset. Sign in again.` (no dashboard redirect).
4. If the action takes long the page explains "This can take up to a minute. Don't close the page." (static text).
5. **Flag off:** the endpoint returns 404; the Settings section then shows only "Demo reset is turned off on this site." to Admin and nothing to others. Other roles hitting the URL: 403 (when on) or 404 (when off).
6. Deployed `demo.admin` is the only Admin and its password is a Netlify secret that visitors do not know, so on the public site visitors never see this screen.

---

### S24 Lookups (F10)

**Routes** `/admin/lookups` (index) and `/admin/lookups/{customers|suppliers|carriers|parts|locations|reason-codes}` · **Roles** Admin, Supervisor · **Stories** US-007

```
Lookups:  Customers | Suppliers | Carriers | Parts | Locations | Reason codes       (tab-like links, aria-current)
Parts                                                            [ Add part ]
Part number | Revision | Description        | ABC | Unit | Needs C of C | Status    | Actions
CRC-2041    | B        | Bracket, Machined  | A   | EA   | Yes          | Active    | [ Edit ]  [ Deactivate ]
-----------------------------------------------------------------------------------------------
Add part
Part number (required)   [ CRC-2041 ]   Format CRC-####. Must be unique.
Revision (required)      [ B ]
Description              [ ... ]       Unit of measure [ EA ]
ABC class (required)     ( ) A  ( ) B  ( ) C
Packaging instruction reference [ PI-2041 ]   Needs C of C   [ ] Yes
[ Save part ]   Cancel
```

Annotations: the other lookup types use the same list + form template. Fields are exactly those in docs/08 §8.2: customers (code, name, ship-to city/state), suppliers (code, name), carriers (name, mode Parcel/LTL/Truckload/Pickup), locations (code unique, type Stock/Receiving/Hold/Shipping/FG), reason codes (category late/hold/adjust/scrap, code, label). **Deactivate** replaces delete (US-007, no deletes). Deactivated items are labelled "Inactive" in the list and remain on old records. Duplicate part number or location code: inline "A part with number CRC-2041 already exists. Part numbers must be unique." Reason code category is a required select, not editable after use [P]. Deactivate is a one-click form with a confirm sentence on the next page ("Deactivate CRC-2041? It will disappear from new-record dropdowns but stay on existing records.").

Accessibility: the tab-like list is `<nav aria-label="Lookup types">` (not ARIA tabs), standard table and form rules. Responsive: P3 columns hidden at 768 px.

---

### S25 Audit log

**Route** `/admin/audit-log` · **Roles** Admin · **Stories** US-005 (absorbs US-006)

```
Audit log                       [i] Times are real UTC. In fixed-date mode they differ from business dates.   (1)
Filters: User [All v]  Action [All v]  Record [ SH-1042 ]  From [ ]  To [ ]  [Apply][Clear]
Time (UTC)           | User           | Action        | Record      | Changes (old -> new)
2026-11-25 10:07:13  | Demo Quality   | status change | SH-1042     | status: Packing -> Rework
2026-11-25 10:05:41  | Demo Quality   | access denied | SH-1042     | verify refused: VERIFIER_SAME_AS_PACKER
```

Annotations: (1) The page states the time basis, because the business clock is fixed while audit stamps are real. Newest first; no edit or delete controls exist anywhere; passwords never appear. Failed logins show the attempted username only. Accessibility and responsive as S03; the Changes column wraps (no horizontal page scroll) and uses `<code>` for old/new values.

---

### S26 System pages and errors

| Page | Heading | Body | Actions |
|------|---------|------|---------|
| 401 on a page | (redirect to S01) | "Please sign in to continue." | Sign in |
| 403 | You don't have permission to do that | "Your role (Shipping) can't {action}. If you think this is a mistake, ask a Supervisor." Identity refusals (verifier = packer, approver = counter) use their own in-place Problem alert instead (7.2), not this page. | Back to dashboard |
| 404 | We can't find that page | "The shipment or page may not exist. Check the number and try again." | Go to Shipments, Dashboard |
| 409 (in place) | Problem alert on the same page | State reason in plain words (7.2) | link to the correct next step |
| 500 / 503 | Something went wrong on our side | "Your changes were not saved. Try again. If it keeps happening, tell your Supervisor. Reference: 7F3A91." For 503 (database waking): "The system is starting up. Wait a few seconds and try again." | Try again, Dashboard |
| 429 (reset) | Problem alert in place (S23) | cooldown text | none |
| Session expired | (redirect to S01) | see 2.6 | Sign in |

All system pages keep the DEMO banner, top bar and navigation. No stack traces or internal error text (US-075).

---

## 7. Form copy and validation messages

General rules: say what is wrong and how to fix it; use the field's label words; no blame; no codes visible to users (codes are for audit and tests); the same sentence appears in the summary and next to the field.

### 7.1 Generic patterns

| Situation | Message |
|-----------|---------|
| Summary heading | `There is a problem` / "Fix the {n} items below, then submit again." |
| Required text | `Enter {field label in lower case}.` |
| Required select | `Select {field}.` |
| Required radio | `Choose one option for {field}.` |
| Whole number | `Enter a whole number, for example 12.` |
| Quantity | `Enter a quantity greater than 0.` |
| Date | `Enter a date, for example 2026-11-25.` |
| Percent | `Enter a percentage from 0 to 100.` |
| Duplicate | `{Thing} {value} already exists. {Thing} must be unique.` |
| Success flash | `Saved: {what happened}.` (e.g. "Saved: Shipment SH-1043 created as Planned.") |
| Network/server | `Your changes were not saved. Try again.` |

### 7.2 Messages by form

**F1 Shipment (S04)**

| Condition | Message |
|-----------|---------|
| Promise before order | `Promise date can't be earlier than the order date (25 Nov 2026). Choose a later promise date.` |
| No lines | `Add at least one line with a part and a quantity.` |
| Line quantity 0, negative, text | `Enter a quantity greater than 0 for line 2.` |
| Missing part on a line | `Select a part for line 2.` |
| Editing shipped/cancelled | `SH-1042 is Shipped, so it can't be edited.` (409/403) |

**F2 Pack & Verify (S06)**

| Id | Condition | Message |
|----|-----------|---------|
| `E-VER-1` | Packer tries to verify (403 `VERIFIER_SAME_AS_PACKER`) | `Verification refused. You packed SH-1042, so you can't verify it. Ask a different Shipping, Quality or Supervisor user to verify.` |
| `E-VER-2` | Role not allowed (403) | `Your role (Receiving) can't verify shipments. Only Shipping, Quality and Supervisor users can verify.` |
| `E-VER-3` | Unanswered items (422) | `Answer every item: 3 items have no Pass or Fail selected.` |
| `E-VER-4` | Fail without note (422) | `Add a note for each item marked Fail so the rework team knows what to fix. (Item 6: Packing slip matches)` |
| `E-VER-5` | Mark Verified pressed with a Fail (422) | `You marked item 6 as Fail, so this shipment can't be marked Verified. Use "Fail verification and send to Rework", or change the answer.` |
| `E-VER-6` | Fail pressed with no Fail (422) | `No item is marked Fail. Mark the item that failed, or choose "Mark Verified" if every item passes.` |
| `E-VER-7` | Status not Packing (409) | `SH-1042 is Verified, not Packing, so it can't be verified now.` |
| `E-GATE-1` | Start packing again or re-verify, no error logged (409 `REWORK_GATE_NOT_MET`) | `Can't continue yet: no packaging error is logged for the failed verification. Log the error first.` |
| `E-GATE-2` | Start packing again or re-verify, rework not completed (409 `REWORK_GATE_NOT_MET`) | `Can't continue yet: no rework is completed for PE-0107. Log and complete the rework first.` |
| `E-GATE-3` | Ship while Rework/Packing (409) | `SH-1042 can't ship: it is in Rework. It needs a logged error, completed rework, and a passing re-verification.` |
| Info (State B) | Packer opens page | `You packed this shipment, so someone else must verify it.` |
| Button reason | packer | `Unavailable to you: you are the packer of SH-1042. The server also refuses this, even if the page is bypassed.` |

**F3 Ship (S07)**

| Condition | Message |
|-----------|---------|
| Tracking missing | `Enter a tracking number. It is required for SwiftLane Parcel. (Customer Pickup doesn't need one.)` |
| Tracking invalid | `Tracking number can contain only letters, digits and hyphens, up to 40 characters.` [A: maximum 40, Diego to confirm] |
| Packages | `Enter the number of packages (1 or more).` |
| Weight | `Enter a weight greater than 0 lb.` |
| Late reason | `Choose a late reason. SH-1042 ships 4 days after its promise date (21 Nov 2026).` |
| Short ship note | `Add a note explaining why line 1 ships fewer than ordered (30 of 50).` |
| No lot/location | `Choose the lot and location line 1 ships from.` |
| Not enough stock | `Not enough stock: lot L2611-004 at STK-A01 has 40 available and line 1 needs 50. Choose another lot or location, or reduce the shipped quantity.` |
| Not Verified (409) | `SH-1042 is Rework, not Verified. It must be verified before it can ship.` |
| Future ship date | `Ship date can't be after the reporting date (25 Nov 2026).` [A, doc says "future ship date" uses the reporting date] |

**Holds, cancel (S08)**

| Condition | Message |
|-----------|---------|
| Hold reason missing | `Select a hold reason.` |
| Cancel reason missing | `Enter a reason for cancelling SH-1042.` |
| Cancel not confirmed | `Tick the box to confirm you want to cancel SH-1042.` |
| Shipping cancel too late, including On Hold (403 `FORBIDDEN_CANCEL_AT_STATUS`) | `Shipping can cancel only Planned or Ready to Pack shipments. Ask a Supervisor to cancel SH-1042.` |
| Release not allowed (403) | `Only Quality or Supervisor can release a hold.` |

**F4 Error (S10), F5 Rework (S12), F6 Corrective action (S13)**

| Condition | Message |
|-----------|---------|
| Category / severity / detected by / stage missing | `Select a category.` / `Choose a severity.` / `Choose who detected the error.` / `Choose the detected stage.` |
| Paperwork without type | `Select the paperwork type (Packing slip, BOL, C of C, Customer-specific form or Commercial invoice).` |
| Description missing | `Describe what was wrong so the team can fix it.` |
| Customer with Before ship | `"Customer" can only be chosen when the error was found after shipping.` |
| After ship by Shipping (403) | `Only Quality or Supervisor can log errors found after shipping.` |
| Rework end before start | `Completed time can't be earlier than the start time.` |
| Rework start in the future | `Start time can't be later than the current time.` |
| Corrective due before detection | `Due date can't be earlier than the date the error was found (25 Nov 2026).` |
| Owner inactive/missing | `Select an active user as the owner.` |
| Close blocked | `Can't close PE-0107: complete at least one rework event and set a root-cause category first.` |

**F7 Receive (S14), F8 Move (S16)**

| Condition | Message |
|-----------|---------|
| Quantity | `Enter a quantity greater than 0.` |
| Lot missing | `Enter the lot number. Example: L2611-004.` |
| Lot format (contract Q-I: letters, digits, hyphens, 3 to 30 characters, stored upper-case) | `Lot numbers use letters, digits and hyphens, 3 to 30 characters. Example: L2611-004.` The seed pattern `L<yy><ww>-<nnn>` is only a hint on the form, not enforced. |
| Transfer too much | `Only 60 available at STK-A01 for lot L2611-004. Enter 60 or less.` |
| Same location | `Choose a different destination from the source location STK-A01.` |
| Scrap reason | `Select a scrap reason.` |
| Out of Hold, Receiving (403) | `Moving stock out of HOLD-01 needs a Quality or Supervisor user.` |

**F9 Count (S18, S19)**

| Condition | Message |
|-----------|---------|
| Missing count | `Enter the quantity you counted for CRC-2041-B at STK-A01. Enter 0 if none found.` |
| Not a whole number | `Counted quantity must be a whole number, 0 or more.` |
| Recount needed | `Out of tolerance: count this item again and enter the new quantity.` |
| Submit blocked | `Can't submit yet: 3 lines still need a count and 1 line needs a recount.` |
| Approve, adjust reason missing | `Select an adjust reason for CRC-2041-B at STK-A01.` |
| Already approved (409) | `CC-0012 is already approved. No new adjustments were posted.` |
| Approve by non-Supervisor (403) | `Only a Supervisor can approve counts.` |
| Approver entered or recounted a line (R-4, 403) | `You entered this count, so another Supervisor must approve it.` |

**Settings and lookups (S22, S24)**

| Condition | Message |
|-----------|---------|
| Target out of range | `Enter a percentage from 0 to 100. The previous value (95 %) was kept.` |
| Hours | `Enter a number of hours greater than 0.` |
| Invalid reporting date | `Enter a valid reporting date, for example 2026-11-25.` |
| Not Admin (403) | `Only an Admin can change the reporting date.` |
| Duplicate | `A part with number CRC-2041 already exists. Part numbers must be unique.` |
| Reset phrase | `Type RESET DEMO exactly to confirm.` |

**Login (S01)**: `Username or password is incorrect.` (one message for every failure, including unknown and deactivated users and an inactive deployed Admin). Rate limited (429): `Too many sign-in attempts. Wait 15 minutes and try again, or use another demo account.` Expired session: `You were signed out because the session expired. Sign in again to continue.` After a demo reset: `The demo data was reset. Sign in again.` Stale CSRF (403): `We couldn't verify that request. Reload the page and try again.`

---

## 8. Responsive behavior

| Aspect | Laptop 1280–1440 px | Tablet landscape 1024 px | Tablet portrait 768 px | Wall screen ≥1920 px or `?view=wall` |
|--------|--------------------|--------------------------|------------------------|--------------------------------------|
| Navigation | Left nav 220 px | Left nav 220 px (content about 780 px) | "Menu" disclosure above content | Nav hidden in wall view; top bar only |
| Dashboard tiles | 6 in one row | 3 + 3 | 2 × 3 | 6 in one row, larger type |
| Dashboard charts | C1 + C2 side by side, C3 full | same | one column | C1, C2, C3 in one row of 3 or 2 + 1; fonts 18 px+ |
| Data tables | all columns | P1 + P2 (+P3 if room) | P1 + P2, P3 on detail | all columns, 18 px text |
| Forms | single column; short fields paired | single column | single column, line items as cards | not a data-entry target |
| Targets | 44 px | 44 px | 44 px, count inputs 56 px | n/a |
| Root font size | 16 px | 16 px | 16 px | 20 px (125 %) at ≥1920; 24 px (150 %) in `?view=wall` |

Rules
- **No horizontal page scroll** at 768 px or wider (US-078). A wide table never scrolls the whole page; low-priority columns are hidden (P-classes) and their content is available on the detail page.
- Touch: all controls ≥ 44 × 44 CSS px with at least 8 px between targets; no hover-only information; no drag gestures.
- Orientation: both orientations work; do not lock.
- **Wall view** (`/dashboard?view=wall`, link "Wall display view" in the dashboard header) [P]: nav, filters and the data-table details are collapsed; the reporting-date label, six tiles and the three charts are shown at larger sizes with the same text content; no auto-refresh and no animation. It reads from three metres: tile values 56 px, labels 24 px, chart tick labels 18 px or larger. Because no auto-refresh exists, the label shows "Loaded at 10:07" so a stale wall screen is visible.
- Zoom and text size: layout must work at 200 % browser zoom and with 320 CSS px reflow for text content (WCAG 1.4.4, 1.4.10) — one-column fallback applies under 640 px even though phones are out of scope.
- Print: reports and the dashboard print without nav and buttons; reporting-date label and filters print.

---

## 9. Accessibility (WCAG 2.2 AA) — global rules and per-screen checks

### 9.1 Global rules

| Topic | Rule | WCAG |
|-------|------|------|
| Contrast | Section 3.3; text ≥ 4.5:1, large text ≥ 3:1, controls and chart marks ≥ 3:1 | 1.4.3, 1.4.11 |
| Not color alone | Status, severity, KPI direction, pass/fail, tolerance results, chart series: text + icon or pattern | 1.4.1 |
| Keyboard | Everything operable by keyboard; logical order = DOM order; no keyboard traps; skip link first | 2.1.1, 2.4.1, 2.4.3 |
| Focus visible and not obscured | 3 px ring, 2 px offset on every interactive element; no sticky header or footer overlaps (the banner and top bar scroll away); `scroll-padding` set | 2.4.7, 2.4.11 |
| Target size | 44 px minimum for all controls (project rule); never below 24 px | 2.5.8 |
| Labels and errors | Visible `<label>`, `aria-describedby` for hints and errors, error summary with links and focus, `aria-invalid` | 1.3.1, 3.3.1, 3.3.3, 4.1.2 |
| Redundant entry | Failed POST keeps entered values; defaults come from the reporting date and the current user | 3.3.7 |
| Authentication | Paste allowed, `autocomplete` set, no cognitive test | 3.3.8 |
| Consistent help | Footer help link in the same place on every page | 3.2.6 |
| Headings, landmarks, titles | One `<h1>`, ordered headings; `header/nav/main/footer`; unique `<title>` | 1.3.1, 2.4.2, 2.4.6 |
| Tables | `<caption>`, `th scope`, `aria-sort`; no layout tables | 1.3.1 |
| Charts | Summary text + `role="img"` + data table; direct labels; ≥ 14 px | 1.1.1, 1.4.1 |
| Status messages | `role="status"` for success; `role="alert"` for late errors; live counters `aria-live="polite"` | 4.1.3 |
| Motion and time | No timeouts, no auto-refresh, no flashing; animation off under `prefers-reduced-motion` | 2.2.1, 2.3.1, 2.3.3 |
| Language | `<html lang="en">`; abbreviations (OTIF, FPY) expanded on first use in the tile "How is this calculated?" and in the page text where room allows | 3.1.1, 3.1.4 |
| Dragging, pointer | No drag; no multi-point gestures; click-through links not mouse-only | 2.5.1, 2.5.7 |
| Zoom | 200 % zoom and 320 px reflow without loss | 1.4.4, 1.4.10 |

### 9.2 Per-screen focus points (checks for Felix, Maya's review, Quinn's axe pass)

| Screen | Specific checks |
|--------|-----------------|
| S01 Login | Generic error announced; show-password toggle labeled; banner before form; demo table in `<details>` |
| S02 Dashboard | Reporting-date text near top; tile order = reading order; each chart has summary and table; `<details>` "How is this calculated?" keyboard operable; date-range form errors linked |
| S03/S09 Lists | Sort state exposed; filter form labeled; result count announced; row link text includes the identifier |
| S04 Shipment form | Line item inputs have unique accessible names; add/remove line keeps focus on the new row's first field |
| S05 Detail | Status badge text; actions grouped under "Next step" heading; hints explain missing actions |
| S06 Pack & Verify | Fieldset/legend per item; Pass/Fail 44 px; `aria-disabled` buttons focusable and described; summary links; live progress |
| S07 Ship | Late-reason notice live; stock select options readable as text; irreversible button names the record |
| S10–S13 | Radio groups with legends; severity help text associated; date-time inputs labeled with format |
| S14–S16 | "What happens" list described-by; availability hints; unavailable reason pattern |
| S17–S19 | Blind page contains no system quantity in DOM; each count input named by part, location, lot; tolerance text not color-only |
| S20–S21 | Tables captioned; export link names file type; empty states explicit |
| S22–S25 | Targets table headers and units; reset phrase field described; audit timestamps labeled UTC |
| S26 | Error pages keep landmarks; no raw error text |

### 9.3 Automated and manual checks (hand-off to QA)

- axe-core via Playwright on S01–S03, S04, S05, S06, S07, S10, S14, S18, S20, S21, S22 in CI; no critical or serious findings (criterion 9). Record results in the QA report.
- Manual keyboard pass (no mouse) of the acceptance-criterion-1 flow: create → pack (shipper1) → verify (shipper2) → error → rework → ship. Record it in the QA report.
- Contrast: re-check token pairs with a contrast tool on the built CSS (this spec's ratios are hand-calculated).
- Zoom 200 % and 768 px pass; reduced-motion check; JavaScript-disabled pass on S04, S06, S07 (forms must still work).
- Maya reviews built screens (with screenshots at 1366, 1024, 768, 1920) before QA, per her collaboration rules.

---

## 10. Progressive enhancement summary (ADR-001 compliance)

| Feature | Works without JavaScript | JavaScript adds |
|---------|-------------------------|-----------------|
| All forms | HTML POST + server validation + redirect-after-post | live counters, inline hints |
| Add/remove shipment lines | submit buttons re-render the page | in-place row add/remove |
| Verification notes | always visible, labeled "(required if Fail)" | hidden until Fail chosen |
| Ship late reason | field always shown, hint states the rule | live "ships N days late" notice and required marker |
| Menu on tablet | native `<details>` | none |
| KPI definitions | native `<details>` | none |
| Charts | summary + data table | Chart.js drawing (bundled, dashboard only) |
| Unavailable buttons | submit reaches server, which answers 403/409 with same copy | focus moves to reason text |
| Sort, filters, pagination | GET links and forms | none |

Chart.js loads only on the dashboard page. No React/Vue. No CDN assets (CSP `default-src 'self'` from ADR-001).

### 10.1 CSP-friendly front-end rules (security plan §7.2, §8.1)

The policy is `script-src 'self'; style-src 'self'` with **no `unsafe-inline`**, so the design assumes:
- **No inline scripts and no inline event handlers** (`onclick`, `onchange`). All behaviour (live counters, show-password, late-reason notice, hide/show notes, unavailable-button focus, wall view) lives in small external script files loaded by `<script src>`; Chart.js only on the dashboard.
- **No `style="..."` attributes and no `<style>` blocks** in markup. Spacing, widths, the tile grid, "visually hidden" text, hidden/shown states and chart container heights use classes from the one token stylesheet (`.is-hidden`, `.visually-hidden`, `.view-wall`). Progress or percentage bars, if ever needed, use `<progress>`/`<meter>` elements, not inline widths.
- **Chart data** goes in `data-*` attributes or a `<script type="application/json">` block with `<`, `>`, `&` escaped; never `define:vars` or `set:html` with data. Chart labels are canvas text; tooltips are text only. Chart.js sets canvas size via the DOM API (allowed) [A: verify in Playwright with `securitypolicyviolation` listener].
- **Icons** are inline `<svg>` elements or one SVG sprite from the same origin (`<use href>`), colored via `currentColor` (no `style`). No icon fonts from CDNs, no web fonts (system font stack, section 3.2). Images only `'self'` or `data:`.
- **`autofocus`, `<details>`, `aria-*`, native form controls** are CSP-neutral and are the default tools. Nothing relies on `eval`, `innerHTML` or `document.write`.
- **Forms** post to `'self'` only (`form-action 'self'`). Every POST form includes the CSRF token as a hidden field; sign-out and reset are POST forms, never links.
- Without JavaScript every flow still works (section 10 table), so a blocked or failed script never blocks an action.
- QA: the axe run and the keyboard pass also listen for CSP violations (security plan S-21); a violation fails the page.

---

## 11. Story coverage matrix

| Story | Screen(s) | Notes |
|-------|-----------|-------|
| US-083 / US-009 DEMO banner | App shell, S01, S26 | banner on every page |
| US-001, US-002 | S01 | generic error, no default credentials shown |
| US-003 | S26, role rules 2.3–2.4 | 403 pages, role-aware menu |
| US-005 (US-006) | S25 | Admin only |
| US-007 | S24 | add, edit, deactivate |
| US-008 | S22, 4.2 label | targets, tolerances, reporting date |
| US-011 | S23 (and S01 demo table) | Admin reset |
| US-014 (015, 023) | S04 | create, edit, document flags |
| US-016 (017) | S05, S08 | status actions, hold, release, cancel |
| US-019 | S06 | checklist |
| US-020 | S06 states A–D, 5.2, E-VER-1 | verifier ≠ packer explained |
| US-021 (022) | S07 | ship, late reason |
| US-024 (018) | S03, S05 | list, filters, detail |
| US-027 (033) | S10 | error form |
| US-029 | S12 | rework |
| US-030 | 4.10, S05, S06, S07 | gate checklist |
| US-031, US-032 (034) | S09, S11, S13 | error list, root cause, corrective action, close |
| US-035 (039) | S14, S16 | receive, transfer, scrap, production complete |
| US-037 (038) | S15 | on-hand from ledger |
| US-041 | S07 | lot/location select, availability |
| US-043 (042) | S17, S18 | create list, blind entry |
| US-044 | S19 | approval |
| US-045 | S20 | lot trace |
| US-046, US-047, US-049, US-053 | S02 tiles | data from KPI module |
| US-054 | S02, 4.2, 4.3 | tiles, range, label |
| US-056, US-057, US-058 | S02, 4.4 | C1, C2, C3 |
| US-065 (066, 068, 069) | S21 | reports, CSV |
| US-077 (078) | sections 3, 4, 8, 9 | accessibility, responsive |
| US-074, US-075 | S26, 4.7 | generic errors, CSRF token in every form |
| US-012, US-013, US-079, US-080, US-081, US-082 | n/a (no UI of their own) | data, tests, deployment |

## 12. Later (v1.1) register — named, not designed

Reserved but **not built** in V1-CORE: C4 late reasons, C5 rework by week, C6 inventory accuracy by ABC (US-059–061); needs-attention lists (US-062); tile and chart-mark click-through (US-063; chart-level "Open ..." links are in core); KPI-8 dock-to-stock tile (US-064; its target field exists in Settings); dashboard customer and carrier filters (US-084); overdue/due-soon view (US-025, replaced by list view links); delivered date (US-026, so the Delivered badge is defined but unused); pre-filled error form (US-028); held-material release screen and manual adjustment (US-036, US-040); reports R2, R5, R6, R8 (US-067, US-070–072); user-management screen (US-004); archive (US-010). Layout hooks: a free row below the charts, a footer slot in tiles, and an unused Delivered badge.

## 13. Hand-off notes

**Felix (front end).** Implement tokens (3.2) as one CSS file; build the components in section 4 first (`AppShell`, `DemoBanner`, `ReportingDate`, `StatusBadge`, `DataTable`, `FormField`, `ErrorSummary`, `Alert`, `Button`, `GateChecklist`, `ActionPanel`). Every form: POST + CSRF token + 422 re-render with values + redirect-after-post. Do not add client-side-only rules; the UI explains, the server enforces. Stable test hooks: `data-testid` on `verify-pass-button`, `verify-fail-button`, `verify-unavailable-reason`, `ship-button`, `reporting-date-label`, `demo-banner`, `kpi-tile-{key}`, `chart-{c1|c2|c3}`, `error-summary`.
**Kenji (dashboard).** You supply tile values, target, previous value, better/worse flag, null state, "How is this calculated?" text and one summary sentence per chart (examples in S02). Chart.js options: fonts ≥ 14 px, animation off under reduced motion, palette in 3.2, dual axes titled, data-table rows from the same payload. Chart marks click-through is optional; the visible links under each chart are required.
**Diego (API).** Messages `E-VER-1..7`, `E-GATE-1..3` need distinct error codes; 403 for role/identity, 409 for state; server validation messages follow 7.
**Sasha.** Items for review: session and 429 UX (2.6), reset UX (S23), CSP rules (10.1), blind-count display (S18), Admin and Viewer read-only behaviour (2.4).

---

## 14. Open questions

Status as of 2026-11-26. **ANSWERED** = settled by the final permissions matrix, the security plan, or the API contract (Diego's contract is still being finished; items marked "contract" should be re-read when it is final). **OPEN** = still needs a decision.

| # | Question | Status | Answer or owner |
|---|----------|--------|-----------------|
| 14.1 | Time zone for displayed times | **ANSWERED** (contract §1.1, Q-20) | Display UTC by default; table headers say "(UTC)". The business-clock anchor for live-entered records is **OPEN**: contract Q-A (blocking) for Marcus, Kenji, Dana, Olivia |
| 14.2 | Default period and previous period | **ANSWERED** (contract §1.6) | 30 days inclusive ending on the reporting date (27 Oct to 25 Nov 2026). Previous period is the equal-length block before it (27 Sep to 26 Oct); Kenji confirms in the KPI module |
| 14.3 | Who sees system quantities in cycle counts | **ANSWERED** (contract §7.1) | Never for an Open count, for any role, absent from the response. On a Counted count only Supervisor (and Admin read-only); on an Approved count every role. S18, S19 match |
| 14.4 | R-4 approver ≠ counter | **ANSWERED** (matrix R-4, T-15) | Adopted, covers any entered or recounted line. S18, S19 updated. Code name differs, see 14.22 |
| 14.5 | `reverified_ok`; is "Start packing again" gated | **ANSWERED** (contract E-11, E-16) | `reverified_ok` is server-managed; the gate (error logged, rework completed) applies to Start packing again (`REWORK_GATE_NOT_MET`). 4.10, S05, S06 updated |
| 14.6 | Hold owning-department values | **ANSWERED provisionally** (contract §2 [A]) | Shipping, Quality, Receiving, Production, Planning, Customer. Priya/Dana to confirm (contract Q-I) |
| 14.7 | Corrective action owner and due date required | **OPEN** | Priya, Dana (UI requires both; schema allows empty) |
| 14.8 | Lot and tracking formats | **ANSWERED provisionally** (contract Q-I) | Lot: letters, digits, hyphens, 3 to 30, upper-cased; the `L<yy><ww>-<nnn>` pattern is a hint only. Tracking `^[A-Za-z0-9-]{1,40}$`. Messages in 7 updated |
| 14.9 | F8 for Quality; scrap from Hold | **ANSWERED** (matrix R-7, T-13, T-19) | Receiving 403 for any transfer or scrap out of Hold; Quality limited to transfers and scrap into or out of Hold, not production complete. S16 updated |
| 14.10 | Demo passwords on the public login page; Viewer kept | **ANSWERED** (matrix section 4, security plan PD-2) | Published demo-only passwords for six accounts (login page or README); `demo.admin` deployed password is a secret and is not published; Viewer kept and recommended. S01 updated |
| 14.11 | KPI and chart payload shape | **OPEN** | Kenji (contract §9 / Q-P) |
| 14.12 | C1 axis start at 50 % or 0 % | **OPEN** | Kenji |
| 14.13 | Severity definitions wording | **OPEN** | Priya, Quinn |
| 14.14 | Packaging-instruction reference plus revision source fields | **OPEN** | Dana |
| 14.15 | Packer = current packer for all roles | **ANSWERED** (matrix R-1, T-4, T-5; contract E-16) | Yes; reopen sets the caller as the new packer |
| 14.16 | Ship-date rule | **PARTLY ANSWERED** (contract §1.6) | No future ship date relative to the business date; ship date before order date still **OPEN** (Diego) |
| 14.17 | Chart click-through with tile click-through deferred | **OPEN** | Priya, Kenji (design gives keyboard links under each chart) |
| 14.18 | Query-string names, filter state on redirects | **OPEN** | Felix, Diego |
| 14.19 | Page forms: urlencoded POST handlers versus `fetch` JSON (contract Q-O). The no-JavaScript design in section 10 needs urlencoded forms with the hidden CSRF field, including add/remove shipment lines | **OPEN** (important) | Marcus, Felix, Diego |
| 14.20 | Supervisor editing notes on a Shipped or Cancelled shipment (contract Q-G): the UI has no such control yet; if kept, S05 gets a notes form for Supervisor only | **OPEN** | Priya |
| 14.21 | Optional "session ends in 2 minutes, stay signed in" prompt (WCAG 2.2.1 mitigation, 2.6) | **OPEN** | Sasha, Quinn |
| 14.22 | Error code name for R-4: matrix says `APPROVER_SAME_AS_COUNTER`, contract says `APPROVER_ENTERED_COUNT`; UI copy does not depend on it but tests do | **OPEN** | Diego |
| 14.23 | Reset keeps or truncates the audit log (contract Q-M); S23 text says records are rebuilt, audit entry written first | **OPEN** | Sasha, Dana |
| 14.24 | Exact 429 copy and whether to show `Retry-After` for sign-in (design: fixed "15 minutes" text, no clock) | **OPEN** | Sasha, Diego |

