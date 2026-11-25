# Project Scope — Version 1

**Date:** 2026-11-25 (revised 2026-11-25 after user approval, see Changelog) · **Project:** Manufacturing Shipping & Inventory Operations Dashboard
(educational prototype, graduate AI class) · **Builders:** a team of AI software agents (Claude Code)

**Stack:** see ADR-001 (docs/ADR-001.md) — supersedes the Flask/SQLite proposal in docs/07 §7.1.
ADR-001 is **conditionally accepted** (Astro + TypeScript + Chart.js + Netlify Database / Postgres),
conditional on the technical proof of concept in §6 step 0.

> All companies, customers, suppliers, carriers, part numbers, people and records are
> **fictional**. No confidential employer information, real customer data or proprietary
> specifications are used. This is **not** a production or certified aerospace system.

## 1. Goal

Deliver a working web app, hosted on Netlify, that lets a small fictional manufacturer record
outbound shipments, verify packaging, log packaging errors and rework, keep basic lot-traceable
inventory records, and see its shipping and inventory performance on one dashboard — demonstrated
with realistic fictional data. Version 1 is the **smallest complete** product that does this
(the "v1 core" in §3); everything else is labelled deferred (§3.8, §4).

## 2. Users (v1)

Five roles: **Admin, Supervisor, Shipping, Receiving, Quality** (shop-floor names: shipping
associate, receiving/inventory clerk, quality technician, supervisor, administrator), plus an
**optional read-only Viewer** (proposed: keep, because it costs almost nothing and gives a safe
guest login for a public site; it can be dropped without affecting any story). Roles follow
[07-software-design.md](07-software-design.md) §7.2. The role x action matrix is in
[plan/permissions-matrix.md](plan/permissions-matrix.md) (DRAFT until the Security Reviewer
signs off) and is **enforced server-side**; admin functions are restricted to Admin.

**Verification rule (user decision):** Shipping, Quality and Supervisor users may verify a
shipment, but the **verifier must be a different person from the packer**, enforced by the
server. The demo data therefore includes at least two Shipping users plus Quality and Supervisor
users (see §3.6).

## 3. In scope for v1 — the "v1 core"

### 3.1 Shipment entry and tracking
- Create/edit shipments with header (customer, PO, order/requested/promise dates) and lines
  (part, revision, qty ordered, lot); document checklist flags (packing slip, BOL, C of C, labels).
- Status lifecycle: Planned → Ready to Pack → Packing → Verified → Shipped, plus On Hold,
  Rework and Cancelled — with status history. (Delivered is optional and deferred, §3.8.)
- Pack & Verify checklist (enforced; **verifier ≠ packer, server-enforced**).
- Ship step: ship date, carrier (lookup), tracking number, packages, weight; late reason when late.
- Shipment list with search/filters (including late/overdue) and a shipment detail page.

### 3.2 Packaging error and rework logging
- Packaging error form with fixed categories, severity, detection point, before/after-ship flag
  (customer-found errors included); error list and close-out.
- Rework events with action and minutes.
- Root-cause category (6 M), 5 Whys note, simple corrective action with owner/due date/status.
- A failed verification cannot reach Shipped without a logged error, completed rework and a
  passing re-verification.

### 3.3 Basic inventory records
- Parts, locations (incl. Hold), suppliers (maintained as lookups).
- Receiving form with lot number and inspection status.
- Append-only inventory transaction ledger (receipt, ship, transfer, production complete, scrap,
  supervisor-approved adjustment from cycle counts).
- On-hand by part/location/lot (derived).
- Basic blind cycle count with tolerance by ABC class and supervisor approval.
- Lot trace report (backward to receipt, forward to shipment/customer).

### 3.4 Dashboard, charts and reports
- KPI tiles: On-Time Shipment %, OTIF %, Packaging Error Rate %, Packaging FPY %, Median Shipment
  Cycle Time, Inventory Accuracy % — each vs target and previous period
  (formulas in [05-performance-metrics.md](05-performance-metrics.md)). Rework frequency (KPI-5)
  is computed by the same KPI module and shown in the error/rework report.
- **Three charts:** C1 On-time % by week vs target, C2 Shipments per day vs packaging error rate
  (shows the peak period), C3 Packaging errors by category (Pareto)
  ([08-data-model-forms-charts-reports.md](08-data-model-forms-charts-reports.md) §8.4). Each has
  a text/table alternative.
- Filter: date range. (Customer and carrier filters are deferred, §3.8.)
- **Fixed demonstration reporting date (user decision):** the demo data is anchored on a fixed
  "as of" date, **2026-11-25** (an Admin setting). The dashboard and reports show a clearly
  labelled banner or caption such as "Reporting date: 25 Nov 2026 (fixed demo date)". The default
  period ("last 30 days"), overdue/due logic and form date defaults use this reporting date
  instead of the real calendar date, so KPIs and charts stay meaningful whenever the professor
  opens the site. [P] While the fixed date is active, the business clock used by KPIs (status
  timestamps, ship date defaults) is the reporting date plus the real time of day, so records
  entered live during a demo appear inside the default period; audit-log timestamps stay real UTC.
  An Admin can switch to "live" (real date). Design confirmation: Marcus and Kenji.
- Reports (CSV export): R1 Shipment Log, R3 Packaging Error and Rework Log, R4 Inventory On-Hand,
  and R7 Lot Trace (§3.3).

### 3.5 Security & quality basics
- Login, role-based permissions enforced server-side (403 for non-permitted roles, 401 or redirect
  when not signed in, deny by default), hashed passwords (scrypt), CSRF protection, parameterized
  queries, server-side input validation, append-only audit log with a simple Admin view, secrets
  via Netlify environment variables; end-to-end tests (Playwright) for the acceptance flows.
- Unit tests for every KPI formula; route/permission tests.
- Accessibility and responsiveness (laptop and tablet; status shown as text, not colour alone).

### 3.6 Fictional sample data
A deterministic seed generator (fixed random seed) that creates:

| Data | Volume | Notes |
|------|--------|-------|
| Company | 1 | **Cobalt Ridge Components, Inc.** (fictional precision-parts maker, "Riverton" plant) |
| Customers | 6 | e.g., Aldervale Aerostructures, Brightwater Marine Systems, Pinecrest Robotics, Summit Valley Pumps, Ironleaf Agricultural Equipment, Northgate Rail Services |
| Suppliers | 4 | e.g., Graystone Metals Supply, Kestrel Fasteners, Meridian Polymer Co., Bluefield Packaging |
| Carriers | 4 | SwiftLane Parcel, Harbor Freight Lines LTL, TransAxis Truckload, Customer Pickup |
| Parts | ~25 | Format `CRC-####-<rev>` (e.g., CRC-2041-B Bracket, Machined), ABC mix ≈ 20/30/50 % |
| Locations | ~10 | RCV-01, HOLD-01, STK-A01…, FG-01, SHIP-01 |
| Users | 6 + optional Viewer | Obviously fake names and usernames such as `demo.shipper1` / "Demo Shipper One": **2 Shipping, 1 Receiving, 1 Quality, 1 Supervisor, 1 Admin** (+ optional `demo.viewer`), so verifier ≠ packer can be tested. Demo-only passwords, documented as such, never to be reused. List in [plan/permissions-matrix.md](plan/permissions-matrix.md) |
| Reporting date | 1 | Fixed "as of" date 2026-11-25; seed data spans the 6 months ending on it |
| Shipments | ~300 over 6 months | Includes a simulated **peak period** (≈ 2× volume for 3–4 weeks) with higher error/late rates; includes SH-1042 (paperwork error storyline, docs/06 §6.3) |
| Packaging errors | ~6–8 % of shipments overall, higher during peak | Category mix skewed so the Pareto is meaningful (labels & paperwork largest) |
| Rework events | ~1 per error caught before ship | 10–90 minutes |
| Late shipments | ~8–12 % | Spread across reason codes |
| Receipts | ~150 | ~5 % On Hold |
| Cycle counts | ~12 counts, ~200 lines | Accuracy ≈ 95–98 %, worse for C items |

Tracking numbers are random fictional strings (e.g., `SLP` + 12 digits) that do not follow any
real carrier format. Names should be checked to avoid matching real companies; a "DEMO – FICTIONAL
DATA" banner appears on every page. The repository is **public**, so it must never contain real
data, real credentials or secrets.

### 3.7 Hosting & deployment (v1) — added per ADR-001 §11.1
- One Netlify site (Astro SSR + Netlify Functions), repository public under the owner's personal
  GitHub account.
- Netlify Database (managed Postgres) for all records; Postgres is used locally, in tests and in
  production (no SQLite).
- **Netlify Free plan only.** No plan upgrades, paid add-ons or automatic credit purchases
  without the user's explicit approval (auto-recharge stays off). Fallbacks named in ADR-001
  (Personal plan, external Postgres, static snapshot) each need explicit user approval first.
- **Develop and test locally as much as possible** (local emulator, local tests); keep production
  deploys few and usage monitored (weekly).
- Deploy previews per PR with isolated DB branches, used sparingly because of the credit budget.
- Demo data reset available locally (`npm run db:reset-seed`) and on the deployed site via an
  Admin-only, env-gated action.

### 3.8 v1.1 / later (deferred from v1 core)
These were in the original v1 draft and are **kept in the backlog, labelled deferred**. They are
not v2 (no new platform or integration is needed) and may be built after the v1 core is accepted,
in the order Priya sets. Story IDs refer to [plan/backlog.md](plan/backlog.md).

| Deferred item | Stories | Why it can wait |
|---------------|---------|-----------------|
| Admin user-management screen (create/deactivate/change role) | US-004 | Users are seeded; role rules are still enforced and tested |
| Archive instead of delete | US-010 | No delete actions exist in the core; history is preserved by status |
| Overdue/due-soon view, needs-attention lists, click-through from tiles | US-025, US-062, US-063 | Shipment list filters (late/overdue) cover the need |
| Optional delivered date | US-026 | KPIs use ship date |
| Pre-filled error form from a failed verification | US-028 | Error is logged with the same form |
| Release/reject held material screen, manual stock adjustment outside a count | US-036, US-040 | Held stock released by a transfer; adjustments come from approved counts |
| Charts C4 late reasons, C5 rework by week, C6 accuracy by ABC; KPI-8 dock-to-stock | US-059, US-060, US-061, US-064 | Core has three charts and six tiles |
| Dashboard customer and carrier filters | US-084 | Date range is enough for the demo |
| Reports R2 Late Shipments, R5 Inventory Transactions, R6 Cycle Count Accuracy, R8 KPI Summary | US-067, US-070, US-071, US-072 | Core has R1, R3, R4, R7 |

## 4. Out of scope / postponed to version 2

| Feature | Reason for postponing |
|---------|----------------------|
| Carrier API / real-time tracking, delivered-date import | External integration & credentials; v1 measures on-time *shipment* |
| EDI (856 ASN), ERP integration | Complex standards; not needed to demo the workflow |
| Barcode / scanner verification and label printing | Hardware & label formats; v1 uses checklist poka-yoke |
| Generating packing slips, BOLs, C of C from data | Valuable (removes paperwork discrepancies) but large |
| Serial-number traceability, multi-level genealogy | Lot-level is enough for demo |
| Full CAPA / 8D workflow, MRB disposition workflow | v1 has simple corrective action and Hold status |
| Packaging instruction authoring with photos / document control | v1 stores reference + revision only |
| Purchasing, production scheduling, MRP | Different system domains |
| Multi-site / multi-company, multi-currency, costing & inventory valuation | Scope |
| SSO, MFA, fine-grained permissions, encryption at rest, formal security testing | Proportionate security for a prototype (v1 uses the simple role matrix) |
| Mobile app / offline mode, email/SMS alerts | Responsive web is enough for v1 |
| Advanced analytics: SPC control charts, forecasting peak volume, staffing models | Good v2 Six Sigma extension |
| Packer experience / training records, labor productivity | Sensitive; v2 with care |
| Docker deployment, multiple long-lived environments (staging), custom domain, paid hosting tiers | One Netlify site + Netlify Database on the free tier is enough for v1 (see ADR-001). PostgreSQL and cloud hosting (Netlify) are now **in** v1 (§3.7) |
| Regulatory compliance (AS9100, ITAR, CMMC) | Explicitly not claimed |

## 5. Acceptance criteria for v1 (core)

1. A user can create a shipment, pack it (user A), verify it (user B), log an error, rework it,
   and ship it — and the dashboard KPIs change accordingly.
2. A failed verification cannot proceed to Shipped without a logged error, completed rework and a
   passing re-verification (direct requests are refused with 409).
3. **Verifier ≠ packer:** the server refuses verification by the person recorded as packer
   (UI and direct request); a different Shipping, Quality or Supervisor demo user can verify.
4. A receipt creates inventory; a shipment consumes it; on-hand per lot is correct; lot trace
   shows supplier receipt → customer shipment for a seeded lot.
5. A cycle count with a variance produces a Supervisor-approved adjustment and updates
   inventory accuracy %.
6. KPI-1 to KPI-7 (the six tile KPIs plus rework frequency) have passing unit tests against
   hand-calculated fixtures.
7. **Non-permitted roles get HTTP 403** on restricted actions and unauthenticated requests get
   401/redirect, per the permission matrix (tested for every restricted action).
8. One command (`npm run db:reset-seed`) rebuilds the demo database deterministically from
   scratch locally, and an Admin-only reset does the same on the deployed Netlify site.
9. Pages are usable on a laptop and a tablet; status is conveyed with text, not colour alone;
   no critical or serious automated accessibility findings.
10. The app runs on Netlify; records created on the deployed site **persist** across redeploys and
    function cold starts, and a deploy preview's data changes do not affect production
    (verified by QA).
11. The dashboard and reports show a clearly labelled **fixed reporting date**, and with the
    seeded data the default view shows non-empty KPIs and charts regardless of the real date.

## 6. Suggested build order (agent hand-off)

0. **Walking skeleton and proof of concept per ADR-001:** Astro + Netlify adapter, first
   migration, CI, first deploy on the Free plan with login + DEMO banner; confirm persistence,
   cold-start/DB-wake latency, seed time and credit usage (ADR-001 §12.1). If the proof of
   concept fails, stop and ask the user before using any fallback.
1. Schema + seed data (reference data, demo users) + auth/roles/audit.
2. Shipments (F1–F3) + status history.
3. Packaging errors, rework, corrective actions (F4–F6).
4. Inventory: receipts, ledger, on-hand, cycle counts (F7–F9), lot trace.
5. KPI service + tests.
6. Dashboard (tiles, three charts, reporting date) + reports; full seed (shipments, inventory).
7. Hardening: security checklist, accessibility pass, deployed-demo check, README/demo script.

## 7. Key assumptions & risks

- **[A]** Targets (95 % OTD, < 2 % error rate, 97 % accuracy) are illustrative, not benchmarks for
  any real company.
- **[A]** One shipment = one customer order release; partial shipments are separate shipments.
- **Risk:** KPI definitions drifting between agents → mitigated by single KPI service + tests.
- **Risk:** Scope creep into v2 or v1.1 items → this file is the contract; changes need an
  explicit update here.
- **Risk:** Netlify Free plan credits (300/month, hard limit) are exhausted and the site pauses →
  mitigated by local-first development, limited production deploys, sparing previews, weekly
  usage checks; the Personal plan or an external Postgres are fallbacks only with explicit user
  approval (ADR-001 §12).
- **Risk:** The fixed reporting date and live-entered records interact (new records dated after
  the reporting date would fall outside the default period) → mitigated by the business-clock
  rule in §3.4; to be confirmed in design (Marcus, Kenji).
- **Risk:** A public site with documented demo passwords and write access can be abused → banner,
  one-step Admin reset, read-only Viewer guest account, Security Reviewer review of the hosting
  configuration (Sasha, Theo).
- **Risk:** The public repository could receive real data or secrets by mistake → fictional-data
  guardrails, secret scan in CI, no secrets in the repo.

## Changelog

- 2026-11-25 — Approved by user: (1) ADR-001 conditionally accepted (Astro + TypeScript +
  Chart.js + Netlify Database/Postgres), conditional on a technical proof of concept, keeping the
  project simple; (2) PostgreSQL and Netlify hosting moved into v1 and the Flask/SQLite
  recommendation superseded by ADR-001 (applied ADR-001 §11.1: header, §3.5, new §3.7, §4 row,
  §5 criteria 8 and 10, §6 step 0, §7 risk); (3) Netlify Free plan only, no upgrades, paid add-ons
  or automatic credit purchases without explicit approval, local development first; (4) repository
  stays public under the user's personal GitHub account, fictional data only; (5) Quality and
  Supervisor (and Shipping) may verify, verifier must differ from packer (server-enforced), with
  enough demo users to test it; (6) fixed demonstration reporting date, clearly labelled; (7)
  roles Admin, Supervisor, Shipping, Receiving, Quality (Viewer optional) with a simple
  server-enforced permission matrix; (8) scope reduced to the smallest complete "v1 core" (§3);
  cut items are kept as v1.1 / later (§3.8) and §5 acceptance criteria rewritten (11 criteria).
  Applied by Priya (T-004).
