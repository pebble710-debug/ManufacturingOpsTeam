# Version 1 Product Backlog

**Task:** T-001 (first draft), T-004 (revised for the user decisions of 2026-11-25) · **Owner:** Priya (product-manager) · **Date:** 2026-11-25 · **Status:** Revised: V1-CORE cut applied, pending Orchestrator review
**Release labels:** every story carries `Release: V1-CORE` (build in v1), `Release: V1-CORE (merged into US-xxx)` (its acceptance criteria are built as part of the named host story; no separate card) or `Release: DEFERRED (v1.1)` (kept here, not built until the core is accepted). See section 3.1 and the V1-CORE rationale in section 3.3.
**Source of truth:** [project-scope.md](../project-scope.md) (v1 contract). All data, names and examples are **fictional** (Cobalt Ridge Components, Inc., Riverton plant).

## 1. Purpose and how to read this backlog

This backlog turns scope sections 3 (in scope) and 5 (acceptance criteria) into user stories the team can build and QA can test without asking the author. Stories are ordered by the scope section 6 build order (B1 to B7). Each story has a stable ID (`US-nnn`), a role from [07-software-design.md](../07-software-design.md) section 7.2, Given/When/Then criteria, a priority, a size, its scope reference, doc references and explicit dependencies.

- **Scope refs** point to `project-scope.md` (for example 3.1a means the first bullet of section 3.1; the bullet letters are defined in the traceability matrix, section 6).
- **AC refs** (acceptance criteria) point to scope section 5 items 1 to 9.
- **KPI formulas** are defined only in [05-performance-metrics.md](../05-performance-metrics.md); stories restate them for testing, and any difference is a defect in the story.
- **Acceptance notes:** after QA evidence, Priya records Accepted / Changes requested per story in the index table (column Acceptance).

### Legend

| Term | Meaning |
|------|---------|
| Must | Needed for the v1 acceptance criteria or a named scope item; v1 is not done without it |
| Should | In scope and valuable; may slip if time runs out without failing an acceptance criterion |
| Could | Optional item the research marks optional; build only if time remains |
| S / M / L | Rough size: S about half a day or less, M about 1 to 2 days, L about 3 days or more for one agent (relative, not a commitment) |
| B1 to B7 | Build-order batch from scope section 6 (see section 5) |

### Status of ADR-001 (stack, persistence, hosting)

**ADR-001 is conditionally accepted** (user decision, 2026-11-25): Astro + TypeScript + Chart.js + Netlify Database (Postgres) on Netlify, conditional on a technical proof of concept (new story US-083, build step 0). It supersedes the Flask/SQLite proposal in docs/07 section 7.1. Stories stay **technology-neutral** on purpose ("data store", "ledger", "chart", "server-side check"); technical detail lives in ADR-001. Gate G0 is now: ADR-001 conditionally accepted **and** US-083 (proof of concept) passed. The scope conflict in Q-01 is resolved (project-scope.md section 3.7, section 4).

**Constraints from the user (2026-11-25), apply to every story:** Netlify **Free plan only** (no upgrades, paid add-ons or automatic credit purchases without explicit user approval); develop and test locally as much as possible; the repository is **public** (fictional data only, no secrets); the demo uses a **fixed reporting date** (2026-11-25) labelled on the dashboard.

### Roles used (07 section 7.2)

Viewer, Shipping, Receiving/Inventory, Quality, Supervisor, Admin. Story "As a" lines use the shop-floor names from scope section 2 (Shipping associate, Receiving/inventory clerk, Quality technician, Supervisor, Viewer, Admin) and each maps to the role of the same name. Where a story names a different persona (presenter, QA tester, developer), it describes a team or demo need, not an application role.

**Roles for v1 core (user decision 7):** Admin, Supervisor, Shipping, Receiving, Quality; Viewer is an **optional** read-only guest role (recommended: keep, nearly free, safe for the public site). The authoritative role x action matrix is now [permissions-matrix.md](permissions-matrix.md) (DRAFT, pending Sasha). The table below is the **original T-001 assumption, superseded** (kept for traceability). Verification: Shipping, Quality and Supervisor may verify; verifier must differ from the packer, server-enforced (US-020).

#### Original assumed permission matrix (T-001; superseded by permissions-matrix.md; was Q-11)

| Capability | Viewer | Shipping | Receiving/Inventory | Quality | Supervisor | Admin |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|
| View dashboard, lists, reports, CSV | Y | Y | Y | Y | Y | Y |
| Create/edit shipments, pack, ship, log errors and rework | | Y | | Y (log errors, rework) | Y | |
| Verify (not own pack) | | Y | | Y | Y | |
| Hold / release shipments | | request hold | | Y | Y | |
| Root cause, corrective actions, close errors | | | | Y | Y | |
| Receipts, transfers, scrap, production complete, enter counts | | | Y | | Y | |
| Release / reject held receipts | | | | Y | Y | |
| Create count lists, approve counts, manual adjust, targets, lookups | | | | | Y | |
| Users and roles, audit log view | | | | | | Y |

## 2. Epics

| Epic | Name | Goal |
|------|------|------|
| E0 | Foundation: auth, roles, audit, reference data, seed | Login, server-side roles, audit log, lookups and targets, demo banner, deterministic seed data. |
| E1 | Shipments | Create, track, pack/verify and ship outbound shipments with status history (scope 3.1; forms F1-F3). |
| E2 | Packaging quality and rework | Log errors, rework, root cause and corrective actions; gate shipping on a failed verification (scope 3.2; forms F4-F6). |
| E3 | Inventory | Receipts, append-only ledger, on-hand, cycle counts, lot trace (scope 3.3; forms F7-F9). |
| E4 | KPIs and dashboard | One KPI module, tiles, charts C1-C6, needs-attention lists, filters (scope 3.4). |
| E5 | Reports | Reports R1-R8 with CSV export (scope 3.4; R7 Lot Trace is delivered in E3). |
| E6 | Non-functional: security, accessibility, quality, deployment/demo | Cross-cutting security, accessibility, responsiveness, tests, deployment and documentation (scope 3.5, 5, 6.7). |

## 3. Story index

### 3.1 Release index (authoritative)

Core dependencies below point **only to V1-CORE stories** (a merged story is built inside its host, so its dependencies are folded into the host's). Where the per-story "Depends on" line further down differs, **this table wins**. Batch B0 is the new walking-skeleton step (scope section 6 step 0).

| ID | Title | Epic | Release | Core depends on | Batch |
|----|-------|------|---------|-----------------|-------|
| US-083 | Walking skeleton and proof of concept (new; also delivers the DEMO banner, US-009) | E6 | V1-CORE | none (gate G0) | B0 |
| US-001 | Login and logout | E0 | V1-CORE | US-083 | B1 |
| US-002 | Hashed passwords and no default credentials | E0 | V1-CORE (merged into US-001) | | B1 |
| US-003 | Server-side role enforcement (HTTP 403) | E0 | V1-CORE | US-001 | B1 |
| US-004 | Manage users and roles | E0 | DEFERRED (v1.1) | | |
| US-005 | Append-only audit log (absorbs US-006 Admin view) | E0 | V1-CORE | US-001 | B1 |
| US-006 | View and filter the audit log | E0 | V1-CORE (merged into US-005) | | B1 |
| US-007 | Maintain lookup data (F10) | E0 | V1-CORE | US-003 | B1 |
| US-008 | Edit KPI targets, tolerances and the fixed reporting date | E0 | V1-CORE | US-003 | B1 |
| US-009 | DEMO - FICTIONAL DATA banner | E0 | V1-CORE (merged into US-083) | | B0 |
| US-010 | Archive instead of delete | E0 | DEFERRED (v1.1) | | |
| US-011 | One-command deterministic seed: reference data, demo users and Admin reset | E0 | V1-CORE | US-003, US-007, US-008, US-083 | B1 |
| US-012 | Seed shipments, errors, rework and the peak-period storyline | E0 | V1-CORE | US-011, US-016, US-021, US-027, US-029, US-032 | B6 |
| US-013 | Seed receipts, ledger and cycle counts | E0 | V1-CORE | US-012, US-035, US-041, US-044, US-045 | B6 |
| US-014 | Create and edit a shipment (F1; absorbs US-015, US-023) | E1 | V1-CORE | US-003, US-007 | B2 |
| US-015 | Edit a shipment before it ships | E1 | V1-CORE (merged into US-014) | | B2 |
| US-016 | Status lifecycle, history, hold, release and cancel (absorbs US-017) | E1 | V1-CORE | US-014 | B2 |
| US-017 | Hold, release and cancel with reason | E1 | V1-CORE (merged into US-016) | | B2 |
| US-018 | Shipment detail page | E1 | V1-CORE (merged into US-024) | | B2 |
| US-019 | Pack and Verify checklist (F2) | E1 | V1-CORE | US-016 | B2 |
| US-020 | Verifier must differ from packer | E1 | V1-CORE | US-019 | B2 |
| US-021 | Ship a verified shipment (F3; absorbs US-022) | E1 | V1-CORE | US-019, US-020, US-007 | B2 |
| US-022 | Late reason required when late | E1 | V1-CORE (merged into US-021) | | B2 |
| US-023 | Document checklist flags | E1 | V1-CORE (merged into US-014) | | B2 |
| US-024 | Shipment list, search, filters and detail page (absorbs US-018) | E1 | V1-CORE | US-016 | B2 |
| US-025 | Overdue and due-soon views | E1 | DEFERRED (v1.1) | | |
| US-026 | Record delivered date (optional) | E1 | DEFERRED (v1.1) | | |
| US-027 | Log a packaging error (F4; absorbs US-033 customer-found errors) | E2 | V1-CORE | US-016, US-007, US-021 | B3 |
| US-028 | Failed verification opens a pre-filled error | E2 | DEFERRED (v1.1) | | |
| US-029 | Log rework (F5) | E2 | V1-CORE | US-027 | B3 |
| US-030 | Cannot ship after failed verification without error, rework and re-verification | E2 | V1-CORE | US-019, US-027, US-029, US-021 | B3 |
| US-031 | Root cause 6M and 5 Whys | E2 | V1-CORE (merged into US-032) | | B3 |
| US-032 | Root cause, corrective action (F6), error list and close-out (absorbs US-031, US-034) | E2 | V1-CORE | US-027, US-029 | B3 |
| US-033 | Log a customer-found error after shipment | E2 | V1-CORE (merged into US-027) | | B3 |
| US-034 | Packaging error list and close-out | E2 | V1-CORE (merged into US-032) | | B3 |
| US-035 | Receive material and move stock (F7, F8; absorbs US-039) | E3 | V1-CORE | US-007, US-037 | B4 |
| US-036 | Release or reject held material | E3 | DEFERRED (v1.1) | | |
| US-037 | Append-only inventory ledger and on-hand (absorbs US-038) | E3 | V1-CORE | US-003, US-007, US-005 | B4 |
| US-038 | On-hand by part, location and lot | E3 | V1-CORE (merged into US-037) | | B4 |
| US-039 | Transfer, scrap and production complete (F8) | E3 | V1-CORE (merged into US-035) | | B4 |
| US-040 | Supervisor-approved manual adjustment | E3 | DEFERRED (v1.1) | | |
| US-041 | Shipping consumes inventory | E3 | V1-CORE | US-021, US-037 | B4 |
| US-042 | Create a cycle-count list | E3 | V1-CORE (merged into US-043) | | B4 |
| US-043 | Cycle-count list and blind count entry (F9; absorbs US-042) | E3 | V1-CORE | US-037 | B4 |
| US-044 | Approve a count and post adjustments | E3 | V1-CORE | US-043, US-037 | B4 |
| US-045 | Lot trace report (R7) | E3 | V1-CORE | US-035, US-041 | B4 |
| US-046 | Single KPI module and common rules | E4 | V1-CORE | US-016 | B5 |
| US-047 | Delivery KPIs: KPI-1 On-Time %, KPI-2 OTIF %, KPI-6 Cycle time (absorbs US-048, US-052) | E4 | V1-CORE | US-046, US-021 | B5 |
| US-048 | KPI-2 OTIF % | E4 | V1-CORE (merged into US-047) | | B5 |
| US-049 | Packaging KPIs: KPI-3 Error rate, KPI-4 FPY, KPI-5 Rework (absorbs US-050, US-051) | E4 | V1-CORE | US-046, US-019, US-027, US-029 | B5 |
| US-050 | KPI-4 Packaging first-pass yield | E4 | V1-CORE (merged into US-049) | | B5 |
| US-051 | KPI-5 Rework frequency and minutes | E4 | V1-CORE (merged into US-049) | | B5 |
| US-052 | KPI-6 Shipment cycle time | E4 | V1-CORE (merged into US-047) | | B5 |
| US-053 | KPI-7 Inventory accuracy % | E4 | V1-CORE | US-046, US-044 | B5 |
| US-054 | Dashboard KPI tiles, date range and fixed reporting date label (absorbs US-055 date range) | E4 | V1-CORE | US-047, US-049, US-053, US-008 | B6 |
| US-055 | Dashboard filters: date range, customer, carrier | E4 | V1-CORE (merged into US-054; date range only) | | B6 |
| US-056 | C1 On-time shipment % by week vs target | E4 | V1-CORE | US-047, US-054 | B6 |
| US-057 | C2 Shipments per day vs packaging error rate | E4 | V1-CORE | US-049, US-054 | B6 |
| US-058 | C3 Packaging errors by category (Pareto) | E4 | V1-CORE | US-032, US-054 | B6 |
| US-059 | C4 Late shipments by reason | E4 | DEFERRED (v1.1) | | |
| US-060 | C5 Rework events and minutes by week | E4 | DEFERRED (v1.1) | | |
| US-061 | C6 Inventory accuracy by ABC class | E4 | DEFERRED (v1.1) | | |
| US-062 | Needs-attention lists | E4 | DEFERRED (v1.1) | | |
| US-063 | Click-through from KPI tiles to records | E4 | DEFERRED (v1.1) | | |
| US-064 | KPI-8 Dock-to-stock time (optional) | E4 | DEFERRED (v1.1) | | |
| US-084 | Dashboard customer and carrier filters (new; split from US-055) | E4 | DEFERRED (v1.1) | | |
| US-065 | Report framework, CSV export, R1 Shipment Log, R3 Error and Rework Log, R4 On-Hand (absorbs US-066, US-068, US-069) | E5 | V1-CORE | US-003, US-046, US-021, US-029, US-032, US-037 | B6 |
| US-066 | R1 Shipment Log | E5 | V1-CORE (merged into US-065) | | B6 |
| US-067 | R2 Late Shipment Report | E5 | DEFERRED (v1.1) | | |
| US-068 | R3 Packaging Error and Rework Log | E5 | V1-CORE (merged into US-065) | | B6 |
| US-069 | R4 Inventory On-Hand | E5 | V1-CORE (merged into US-065) | | B6 |
| US-070 | R5 Inventory Transaction History | E5 | DEFERRED (v1.1) | | |
| US-071 | R6 Cycle Count Accuracy | E5 | DEFERRED (v1.1) | | |
| US-072 | R8 KPI Summary (printable) | E5 | DEFERRED (v1.1) | | |
| US-073 | CSRF and request forgery protection | E6 | V1-CORE (merged into US-074) | | B7 |
| US-074 | Request security: CSRF, server-side validation and safe data access (absorbs US-073) | E6 | V1-CORE | US-003 | B7 |
| US-075 | Secrets, debug off, generic errors, pinned dependencies and audit (absorbs US-076) | E6 | V1-CORE | US-001 | B7 |
| US-076 | Pinned dependencies and vulnerability check | E6 | V1-CORE (merged into US-075) | | B7 |
| US-077 | Accessible and responsive interface (absorbs US-078) | E6 | V1-CORE | US-014, US-054, US-056, US-024 | B7 |
| US-078 | Usable on laptop and tablet | E6 | V1-CORE (merged into US-077) | | B7 |
| US-079 | KPI unit tests with hand-calculated fixtures | E6 | V1-CORE | US-047, US-049, US-053 | B5 |
| US-080 | Route and permission tests | E6 | V1-CORE | US-003, US-020, US-044, US-007, US-008 | B7 |
| US-081 | Deployed demo with persistent data and README (absorbs US-082) | E6 | V1-CORE | US-011, US-075, US-083 | B7 |
| US-082 | README, run steps and demo notes | E6 | V1-CORE (merged into US-081) | | B7 |

### 3.2 Original draft index (T-001; kept for traceability)

This is the first-draft index. Its **Priority** and **Depends on** columns are superseded by section 3.1 and the per-story Release lines; do not use them for planning.

| ID | Title | Epic | Priority | Size | Batch | Depends on | Acceptance |
|----|-------|------|----------|------|-------|-----------|-----------|
| US-001 | Login and logout | E0 | Must | M | B1 | none | Not yet reviewed |
| US-002 | Hashed passwords and no default credentials | E0 | Must | S | B1 | US-001 | Not yet reviewed |
| US-003 | Server-side role enforcement (HTTP 403) | E0 | Must | L | B1 | US-001 | Not yet reviewed |
| US-004 | Manage users and roles | E0 | Must | S | B1 | US-003 | Not yet reviewed |
| US-005 | Append-only audit log | E0 | Must | M | B1 | US-001 | Not yet reviewed |
| US-006 | View and filter the audit log | E0 | Should | S | B6 | US-005 | Not yet reviewed |
| US-007 | Maintain lookup data (F10) | E0 | Must | M | B1 | US-003 | Not yet reviewed |
| US-008 | Edit KPI targets and tolerances | E0 | Must | S | B1 | US-003 | Not yet reviewed |
| US-009 | DEMO - FICTIONAL DATA banner | E0 | Must | S | B1 | US-001 | Not yet reviewed |
| US-010 | Archive instead of delete | E0 | Should | S | B6 | US-005 | Not yet reviewed |
| US-011 | One-command deterministic seed: reference data and users | E0 | Must | M | B1 | US-003, US-007, US-008 | Not yet reviewed |
| US-012 | Seed shipments, errors, rework and the peak-period storyline | E0 | Must | L | B6 | US-011, US-016, US-021, US-027, US-029, US-031, US-032, US-022 | Not yet reviewed |
| US-013 | Seed receipts, ledger and cycle counts | E0 | Must | L | B6 | US-012, US-035, US-041, US-044, US-045 | Not yet reviewed |
| US-014 | Create a shipment (F1) | E1 | Must | M | B2 | US-003, US-007 | Not yet reviewed |
| US-015 | Edit a shipment before it ships | E1 | Must | S | B2 | US-014 | Not yet reviewed |
| US-016 | Status lifecycle and history | E1 | Must | L | B2 | US-014 | Not yet reviewed |
| US-017 | Hold, release and cancel with reason | E1 | Must | S | B2 | US-016, US-007 | Not yet reviewed |
| US-018 | Shipment detail page | E1 | Must | M | B2 | US-016 | Not yet reviewed |
| US-019 | Pack and Verify checklist (F2) | E1 | Must | L | B2 | US-016 | Not yet reviewed |
| US-020 | Verifier must differ from packer | E1 | Must | S | B2 | US-019 | Not yet reviewed |
| US-021 | Ship a verified shipment (F3) | E1 | Must | M | B2 | US-019, US-020 | Not yet reviewed |
| US-022 | Late reason required when late | E1 | Must | S | B2 | US-021, US-007 | Not yet reviewed |
| US-023 | Document checklist flags | E1 | Must | S | B2 | US-014 | Not yet reviewed |
| US-024 | Shipment list with search and filters | E1 | Must | M | B2 | US-016 | Not yet reviewed |
| US-025 | Overdue and due-soon views | E1 | Must | S | B2 | US-024 | Not yet reviewed |
| US-026 | Record delivered date (optional) | E1 | Could | S | B6 | US-021 | Not yet reviewed |
| US-027 | Log a packaging error (F4) | E2 | Must | M | B3 | US-016, US-007 | Not yet reviewed |
| US-028 | Failed verification opens a pre-filled error | E2 | Must | S | B3 | US-019, US-027 | Not yet reviewed |
| US-029 | Log rework (F5) | E2 | Must | M | B3 | US-027 | Not yet reviewed |
| US-030 | Cannot ship after failed verification without error, rework and re-verification | E2 | Must | M | B3 | US-028, US-029, US-021 | Not yet reviewed |
| US-031 | Root cause 6M and 5 Whys | E2 | Must | S | B3 | US-027 | Not yet reviewed |
| US-032 | Corrective action (F6) | E2 | Must | M | B3 | US-031 | Not yet reviewed |
| US-033 | Log a customer-found error after shipment | E2 | Must | S | B3 | US-027, US-021 | Not yet reviewed |
| US-034 | Packaging error list and close-out | E2 | Must | S | B3 | US-029, US-032 | Not yet reviewed |
| US-035 | Receive material (F7) | E3 | Must | M | B4 | US-007, US-037 | Not yet reviewed |
| US-036 | Release or reject held material | E3 | Must | S | B4 | US-035, US-039 | Not yet reviewed |
| US-037 | Append-only inventory ledger | E3 | Must | M | B4 | US-003, US-007, US-005 | Not yet reviewed |
| US-038 | On-hand by part, location and lot | E3 | Must | M | B4 | US-037 | Not yet reviewed |
| US-039 | Transfer, scrap and production complete (F8) | E3 | Must | M | B4 | US-037, US-038 | Not yet reviewed |
| US-040 | Supervisor-approved manual adjustment | E3 | Must | S | B4 | US-037, US-038 | Not yet reviewed |
| US-041 | Shipping consumes inventory | E3 | Must | M | B4 | US-021, US-038 | Not yet reviewed |
| US-042 | Create a cycle-count list | E3 | Must | S | B4 | US-038 | Not yet reviewed |
| US-043 | Blind count entry and recount (F9) | E3 | Must | M | B4 | US-042 | Not yet reviewed |
| US-044 | Approve a count and post adjustments | E3 | Must | M | B4 | US-043, US-040 | Not yet reviewed |
| US-045 | Lot trace report (R7) | E3 | Must | M | B4 | US-035, US-041 | Not yet reviewed |
| US-046 | Single KPI module and common rules | E4 | Must | M | B5 | US-016 | Not yet reviewed |
| US-047 | KPI-1 On-Time Shipment % | E4 | Must | S | B5 | US-046, US-021 | Not yet reviewed |
| US-048 | KPI-2 OTIF % | E4 | Must | S | B5 | US-047 | Not yet reviewed |
| US-049 | KPI-3 Packaging error rate | E4 | Must | M | B5 | US-046, US-027, US-033 | Not yet reviewed |
| US-050 | KPI-4 Packaging first-pass yield | E4 | Must | S | B5 | US-046, US-019, US-027 | Not yet reviewed |
| US-051 | KPI-5 Rework frequency and minutes | E4 | Must | S | B5 | US-046, US-029 | Not yet reviewed |
| US-052 | KPI-6 Shipment cycle time | E4 | Must | M | B5 | US-046, US-016 | Not yet reviewed |
| US-053 | KPI-7 Inventory accuracy % | E4 | Must | M | B5 | US-046, US-044 | Not yet reviewed |
| US-054 | Dashboard KPI tiles with target and previous period | E4 | Must | M | B6 | US-047, US-048, US-049, US-050, US-052, US-053, US-008 | Not yet reviewed |
| US-055 | Dashboard filters: date range, customer, carrier | E4 | Must | M | B6 | US-054 | Not yet reviewed |
| US-056 | C1 On-time shipment % by week vs target | E4 | Must | M | B6 | US-047, US-055 | Not yet reviewed |
| US-057 | C2 Shipments per day vs packaging error rate | E4 | Must | M | B6 | US-049, US-055 | Not yet reviewed |
| US-058 | C3 Packaging errors by category (Pareto) | E4 | Must | M | B6 | US-034, US-055 | Not yet reviewed |
| US-059 | C4 Late shipments by reason | E4 | Must | S | B6 | US-022, US-055 | Not yet reviewed |
| US-060 | C5 Rework events and minutes by week | E4 | Must | S | B6 | US-051, US-055 | Not yet reviewed |
| US-061 | C6 Inventory accuracy by ABC class | E4 | Must | S | B6 | US-053, US-055 | Not yet reviewed |
| US-062 | Needs-attention lists | E4 | Must | M | B6 | US-025, US-017, US-032, US-044 | Not yet reviewed |
| US-063 | Click-through from KPI tiles to records | E4 | Must | M | B6 | US-054, US-024, US-034 | Not yet reviewed |
| US-064 | KPI-8 Dock-to-stock time (optional) | E4 | Could | S | B6 | US-035, US-046 | Not yet reviewed |
| US-065 | Report framework and CSV export | E5 | Must | M | B6 | US-003, US-046 | Not yet reviewed |
| US-066 | R1 Shipment Log | E5 | Must | S | B6 | US-065, US-021 | Not yet reviewed |
| US-067 | R2 Late Shipment Report | E5 | Must | S | B6 | US-065, US-022 | Not yet reviewed |
| US-068 | R3 Packaging Error and Rework Log | E5 | Must | S | B6 | US-065, US-029, US-032 | Not yet reviewed |
| US-069 | R4 Inventory On-Hand | E5 | Must | S | B6 | US-065, US-038 | Not yet reviewed |
| US-070 | R5 Inventory Transaction History | E5 | Must | S | B6 | US-065, US-037 | Not yet reviewed |
| US-071 | R6 Cycle Count Accuracy | E5 | Must | S | B6 | US-065, US-044, US-053 | Not yet reviewed |
| US-072 | R8 KPI Summary (printable) | E5 | Must | M | B6 | US-065, US-054, US-051 | Not yet reviewed |
| US-073 | CSRF and request forgery protection | E6 | Must | S | B7 | US-003 | Not yet reviewed |
| US-074 | Server-side validation and safe data access | E6 | Must | M | B7 | US-003 | Not yet reviewed |
| US-075 | Secrets, debug off and generic errors | E6 | Must | S | B7 | US-001 | Not yet reviewed |
| US-076 | Pinned dependencies and vulnerability check | E6 | Should | S | B7 | US-075 | Not yet reviewed |
| US-077 | Accessibility: text status, contrast, keyboard | E6 | Must | M | B7 | US-054, US-056, US-024 | Not yet reviewed |
| US-078 | Usable on laptop and tablet | E6 | Must | M | B7 | US-054, US-014 | Not yet reviewed |
| US-079 | KPI unit tests with hand-calculated fixtures | E6 | Must | M | B5 | US-047, US-048, US-049, US-050, US-051, US-052, US-053 | Not yet reviewed |
| US-080 | Route and permission tests | E6 | Must | M | B7 | US-003, US-004, US-040, US-044, US-007, US-008 | Not yet reviewed |
| US-081 | Deployed demo with persistent data | E6 | Must | L | B7 | US-011, US-075 | Not yet reviewed |
| US-082 | README, run steps and demo notes | E6 | Should | S | B7 | US-011, US-079 | Not yet reviewed |

### 3.3 V1-CORE rationale (why this cut)

**Rule used:** keep a story in the core only if removing it would leave the assignment or a scope section 5 criterion unmet; otherwise defer it. Then merge very small stories into the story that must be built with them, so the team plans and reviews fewer cards. Nothing is dropped: every story keeps its text and acceptance criteria and carries a release label.

| User priority (decision 8) | What stays in the core | Main stories |
|----------------------------|------------------------|--------------|
| Shipment tracking | Create/edit, status lifecycle with history, hold/cancel, ship step with late reason, list with search/filters and detail | US-014, US-016, US-021, US-024 |
| Packaging verification | Pack and Verify checklist, verifier is not the packer (server-enforced), ship gate | US-019, US-020, US-030 |
| Packaging errors and rework | Error log (incl. customer-found), rework, root cause, corrective action, error list and close-out | US-027, US-029, US-032 |
| Basic inventory | Receive and move stock, append-only ledger and on-hand, ship consumes stock, blind cycle count with Supervisor approval, lot trace | US-035, US-037, US-041, US-043, US-044, US-045 |
| Useful KPIs and charts | KPI module, six tiles (plus rework in the report), three charts (C1, C2, C3), three reports plus lot trace, fixed reporting date | US-046, US-047, US-049, US-053, US-054, US-056, US-057, US-058, US-065, US-008 |
| Fictional demo data | Deterministic seed, seven demo users, peak-period storyline, SH-1042, Admin reset | US-011, US-012, US-013 |
| Reliable saved records | Walking skeleton and proof of concept on Netlify, persistent Postgres, deployed demo | US-083, US-081 |
| Professional, accessible interface | DEMO banner, text status, keyboard, tablet, laptop; secure by default | US-077, US-074, US-075, US-001, US-003 |

**What was cut (18 stories deferred, none silently dropped):** user-management screen, archive, overdue/due-soon view, delivered date, pre-filled error form, held-material release screen, manual adjustment, charts C4, C5, C6, needs-attention lists, click-through, KPI-8, customer/carrier dashboard filters, reports R2, R5, R6, R8. For each, the core already has a workable substitute (see the Release line of each story).

**What was merged (26 stories):** small stories built inside a host story (for example hashing into login, edit and document flags into create shipment, hold/cancel into the status lifecycle, KPI-2 and KPI-6 into KPI-1, four reports into the report framework). Their acceptance criteria stay valid and are tested; the saving is in planning, hand-offs and review, not in testing.

**Result:** 82 stories (76 Must) became 84 stories (two new: US-083 walking skeleton, US-084 deferred filters) of which **40 are V1-CORE build cards**, 26 are merged into a core card and 18 are deferred. The real reduction in work comes from the 18 deferred stories plus the narrower reports and charts; the merged stories are bigger cards, so Priya expects more L-sized cards in B2, B3 and B6 (flag to Olivia for task splitting).

**Honest risks of the cut:** (1) no manage-users screen, so users can only change by reseeding or the database; (2) no needs-attention panel, so the demo story depends on the shipment list filters; (3) only three charts, with no inventory chart (first candidate to bring back: US-061).

### 3.4 New stories added in T-004

US-083 (core, E6) and US-084 (deferred, E4) are defined at the end of section 4.

## 4. User stories

### E0 Foundation: auth, roles, audit, reference data, seed

_Login, server-side roles, audit log, lookups and targets, demo banner, deterministic seed data._

#### US-001 Login and logout

> **Release: V1-CORE** · Core depends on: US-083 · Absorbs US-002 (its criteria below are built here). Sign-in works for the demo users in permissions-matrix.md section 4; unauthenticated data requests get 401.

As a **user of any role**, I want to sign in with a username and password and sign out so that only authorised people use the system.

- **Scope ref:** project-scope.md section 3 (item 3.5a); **Scope section 5 criteria:** 7
- **Docs:** 07 §7.2; 08 §8.2 user
- **Priority:** Must · **Size:** M · **Batch:** B1
- **Depends on:** none
- **Acceptance criteria (Given/When/Then):**
  - Given an unauthenticated visitor, when they request any page or data endpoint other than the login page, then they are sent to login (pages) or receive 401 (data requests) and no data is returned.
  - Given a seeded active user and the correct demo password, when they submit the login form, then they land on the dashboard and their display name and role are shown in the page header.
  - Given a wrong password or an unknown username, when they submit the form, then login fails with one generic message that does not reveal which of the two was wrong, and no session is created.
  - Given a deactivated user, when they submit correct credentials, then login fails with the same generic message.
  - Given a signed-in user, when they choose Sign out, then the session ends and back-navigation to a protected page requires login again.
- **Out of scope:** SSO, MFA, password reset by email, lockout policy (scope §4).

#### US-002 Hashed passwords and no default credentials

> **Release: V1-CORE (merged into US-001)** · Folded into the login story: salted scrypt hashes, no plain-text passwords, no default credentials outside the demo seed.

As a **Admin**, I want passwords stored only as salted one-way hashes and no built-in default credentials outside demo seed data so that a data leak does not expose passwords.

- **Scope ref:** project-scope.md section 3 (item 3.5b); **Scope section 5 criteria:** none
- **Docs:** 07 §7.2 checklist #5
- **Priority:** Must · **Size:** S · **Batch:** B1
- **Depends on:** US-001
- **Acceptance criteria (Given/When/Then):**
  - Given the seeded database, when QA inspects the stored user records, then no password appears in plain text and every stored password value differs from the documented demo password.
  - Given two users with the same password, when their stored values are compared, then the values differ (salted).
  - Given the application started in non-demo (production) mode with no seeded users, when it starts, then no account exists until an Admin is created through a documented bootstrap step.
  - Given the demo passwords, when QA reads the README, then each is labelled demo-only and the README states they must never be reused.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-003 Server-side role enforcement (HTTP 403)

> **Release: V1-CORE** · Core depends on: US-001 · **Authoritative matrix: [permissions-matrix.md](permissions-matrix.md)** (replaces the matrix quoted in section 1 and the role examples below; Admin is not an operator; Viewer optional; 401 when not signed in; deny by default). Where an AC below names a role that differs from the matrix, the matrix wins.

As a **Admin**, I want every write and restricted read checked against the signed-in user's role on the server so that hiding a button is never the only protection.

- **Scope ref:** project-scope.md section 3 (item 3.5a); **Scope section 5 criteria:** 7
- **Docs:** 07 §7.2; 04 §4.2
- **Priority:** Must · **Size:** L · **Batch:** B1
- **Depends on:** US-001
- **Acceptance criteria (Given/When/Then):**
  - Given the permission matrix in this story's notes, when a user whose role is not permitted calls a restricted action directly (bypassing the UI), then the response is HTTP 403, nothing is changed, and an access-denied audit entry is written.
  - Given a Viewer, when they attempt any create, edit, approve or delete action, then the response is 403.
  - Given a Shipping user, when they attempt to post a cycle-count approval or an inventory adjustment, then the response is 403.
  - Given a Receiving/Inventory user, when they attempt to approve an adjustment, change KPI targets or edit lookups, then the response is 403.
  - Given a Quality user, when they attempt to approve an inventory adjustment or manage users, then the response is 403.
  - Given a Supervisor, when they attempt to manage users or roles, then the response is 403 (Admin only).
  - Given an action not listed in the matrix, when any role calls it, then access is denied by default.
- **Out of scope:** Fine-grained custom permissions (scope §4).

#### US-004 Manage users and roles

> **Release: DEFERRED (v1.1)** · Reason: users are seeded in the core; the rule "only Admin manages users" stays in the matrix (P-23) and is tested as 403 for other roles once the screen exists. Decision for the user: confirm this cut.

As a **Admin**, I want to create, deactivate and change the role of users so that the right people have the right access.

- **Scope ref:** project-scope.md section 3 (item 3.5a); **Scope section 5 criteria:** 7
- **Docs:** 07 §7.2; 08 §8.2 user
- **Priority:** Must · **Size:** S · **Batch:** B1
- **Depends on:** US-003
- **Acceptance criteria (Given/When/Then):**
  - Given an Admin, when they create a user with a username, display name, role and initial password, then the user can log in and has exactly that role's permissions.
  - Given a duplicate username, when the Admin saves, then an inline validation error is shown and no user is created.
  - Given an Admin, when they deactivate a user, then that user's next request is rejected and historical records still show their name.
  - Given an Admin editing their own account, when they would remove the last active Admin role, then the change is refused with a message.
  - Given any user create/role-change/deactivate, when it completes, then an audit entry records who, what and old to new value (never the password).
- **Out of scope:** Self-service password reset, MFA.

#### US-005 Append-only audit log

> **Release: V1-CORE** · Core depends on: US-001 · Absorbs US-006 (simple Admin-only list with user and date filters). Append-only is also enforced by database triggers (ADR-001).

As a **Admin**, I want every write, login result and access denial recorded with user, time, action, record and old-to-new values so that changes are attributable.

- **Scope ref:** project-scope.md section 3 (item 3.5e); **Scope section 5 criteria:** none
- **Docs:** 07 §7.2 checklist #9; 08 §8.2 audit_log
- **Priority:** Must · **Size:** M · **Batch:** B1
- **Depends on:** US-001
- **Acceptance criteria (Given/When/Then):**
  - Given any create, update, status change, approval or archive performed through the application, when it succeeds, then one audit entry exists with user, UTC timestamp, action, table/record identifier and the changed fields as old to new values.
  - Given a successful login, a failed login and a 403 response, when each occurs, then each writes an audit entry (failed logins record the attempted username, never the password).
  - Given the application's own interface and API, when QA looks for any way to edit or delete an audit entry, then none exists.
  - Given a validation failure that rejects a write, when it occurs, then no audit entry for a change is written.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-006 View and filter the audit log

> **Release: V1-CORE (merged into US-005)** · Built with the audit log; Admin only (P-24).

As a **Admin**, I want to browse the audit log filtered by user, record and date range so that I can investigate who changed what.

- **Scope ref:** project-scope.md section 3 (item 3.5e); **Scope section 5 criteria:** none
- **Docs:** 08 §8.2 audit_log
- **Priority:** Should · **Size:** S · **Batch:** B6
- **Depends on:** US-005
- **Acceptance criteria (Given/When/Then):**
  - Given an Admin, when they open the audit log and filter by user and date range, then only matching entries are listed newest first with old to new values readable.
  - Given a non-Admin role, when they request the audit log, then the response is 403.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-007 Maintain lookup data (F10)

> **Release: V1-CORE** · Core depends on: US-003 · Editable by **Supervisor and Admin** (P-20), 403 for everyone else. Core minimum: add/edit/deactivate; nothing is ever deleted.

As a **Supervisor**, I want to manage customers, suppliers, carriers, parts, locations and reason codes so that forms offer controlled dropdowns and reports group cleanly.

- **Scope ref:** project-scope.md section 3 (item 3.3a); **Scope section 5 criteria:** none
- **Docs:** 08 §8.2 lookups, F10; 01 §1.3, §1.7; 03
- **Priority:** Must · **Size:** M · **Batch:** B1
- **Depends on:** US-003
- **Acceptance criteria (Given/When/Then):**
  - Given a Supervisor, when they add a part with a unique part number, revision, ABC class (A/B/C), unit of measure and requires-C-of-C flag, then it appears in part dropdowns; a duplicate part number is rejected with an inline message.
  - Given a Supervisor, when they add a location of type Stock, Receiving, Hold, Shipping or FG, then it is available in inventory forms; a location code must be unique.
  - Given customers, suppliers and carriers (carrier mode Parcel/LTL/Truckload/Pickup), when a Supervisor deactivates one, then it disappears from new-record dropdowns but remains visible on existing records and reports.
  - Given reason codes, when a Supervisor adds one, then it must belong to exactly one category (late, hold, adjust, scrap) and appears only in forms using that category.
  - Given the seeded late-reason list, when QA opens the late category, then it contains at least: material shortage, quality hold, paperwork, carrier, packaging rework, capacity/peak volume, customer change.
  - Given any non-Supervisor, non-Admin role, when they attempt to change a lookup, then the response is 403.
- **Out of scope:** Packaging instruction authoring with photos (scope §4); only a reference string and revision are stored.

#### US-008 Edit KPI targets, tolerances and the fixed reporting date

> **Release: V1-CORE** · Core depends on: US-003 · Targets and tolerances: Supervisor and Admin (P-21). **Absorbs the fixed reporting date (user decision 6), Admin only (P-22).** Additional acceptance criteria:
> - Given the seeded settings, when QA opens settings, then the reporting date is 2026-11-25 in "fixed demo date" mode.
> - Given the fixed mode, when any user opens the dashboard or a report on any real calendar date, then the default period is the 30 days ending on the reporting date, overdue and "today" logic use the reporting date, and the page shows a text label such as "Reporting date: 25 Nov 2026 (fixed demo date)".
> - Given an Admin, when they switch to live mode, then the real date is used and the label says "Live date"; a non-Admin attempt gets 403; an invalid date is rejected inline; every change is audited.
> - Given fixed mode and a record created live (for example a shipment shipped during the demo), when the dashboard is reloaded, then the record falls inside the default period (business-clock rule, scope section 3.4; design confirmation Marcus/Kenji).

As a **Supervisor**, I want to change KPI targets and cycle-count tolerances by ABC class so that the dashboard compares against our current goals.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** none
- **Docs:** 05 §5.3; 08 §8.2 setting; kpi-definitions
- **Priority:** Must · **Size:** S · **Batch:** B1
- **Depends on:** US-003
- **Acceptance criteria (Given/When/Then):**
  - Given the seeded settings, when QA opens the settings page, then the defaults are: on-time 95 %, OTIF 93 %, packaging error rate < 2 %, FPY 98 %, rework < 2 %, cycle time 24 h, inventory accuracy 97 %, dock-to-stock 8 h, tolerances A 0 %, B +/-2 %, C +/-5 %, on-time tolerance 0 days.
  - Given a Supervisor, when they save a new target value, then the dashboard tile uses it on the next load.
  - Given a non-numeric or out-of-range value (for example a percentage over 100 or below 0), when saved, then it is rejected with an inline message and the old value stays.
  - Given any target change, when saved, then an audit entry records the old and new value.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-009 DEMO - FICTIONAL DATA banner

> **Release: V1-CORE (merged into US-083)** · Delivered by the walking skeleton; the banner also shows the deploy context (production or preview).

As a **Viewer**, I want a banner on every page saying the data is fictional so that nobody mistakes the prototype for a real system.

- **Scope ref:** project-scope.md section 3 (item 3.6b); **Scope section 5 criteria:** none
- **Docs:** project-scope §3.6; fictional-data-guardrails
- **Priority:** Must · **Size:** S · **Batch:** B1
- **Depends on:** US-001
- **Acceptance criteria (Given/When/Then):**
  - Given any page including the login and error pages, when it renders, then the text "DEMO - FICTIONAL DATA" is visible without scrolling at laptop and tablet width.
  - Given the banner, when QA reads it with a screen reader or text-only view, then it is real text (not an image).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-010 Archive instead of delete

> **Release: DEFERRED (v1.1)** · Reason: the core has no delete action (cancel and close statuses keep history), so archiving is not needed to be complete.

As a **Supervisor**, I want to archive shipments, errors and similar records rather than delete them so that history and audit trail stay intact.

- **Scope ref:** project-scope.md section 3 (item 3.5e); **Scope section 5 criteria:** none
- **Docs:** 07 §7.4
- **Priority:** Should · **Size:** S · **Batch:** B6
- **Depends on:** US-005
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment, packaging error or lookup record, when a permitted user archives it, then it is hidden from default lists, still reachable through an "include archived" filter, and an audit entry is written.
  - Given inventory transactions and audit entries, when QA looks for archive or delete actions, then none exist for them.
  - Given an archived record referenced by other records, when those records are shown, then the reference still displays.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-011 One-command deterministic seed: reference data, demo users and Admin reset

> **Release: V1-CORE** · Core depends on: US-003, US-007, US-008, US-083 · **Changes from the first draft:** (a) demo users are the seven accounts in permissions-matrix.md section 4 (2 Shipping, 1 Receiving, 1 Quality, 1 Supervisor, 1 Admin, optional Viewer), not "one per role"; (b) the command is `npm run db:reset-seed` locally; (c) additional criterion: given `DEMO_RESET_ENABLED=true`, when an Admin confirms the reset action on the deployed site, then the data is rebuilt from the seed within the platform time limit, an audit entry is written first, and every other role gets 403; when the flag is not set, the action is unavailable.

As a **developer or QA tester**, I want one command that rebuilds the demo data store from scratch with the same result every time so that demos and tests are repeatable.

- **Scope ref:** project-scope.md section 3 (item 3.6a); **Scope section 5 criteria:** 8
- **Docs:** project-scope §3.6; schema-and-seed-data
- **Priority:** Must · **Size:** M · **Batch:** B1
- **Depends on:** US-003, US-007, US-008
- **Acceptance criteria (Given/When/Then):**
  - Given an empty or existing data store, when the documented single seed command is run, then the store is reset and rebuilt without manual steps and the command exits successfully.
  - Given the command run twice, when QA compares counts and a checksum of key tables (and a sample of ten named records), then the results are identical (fixed random seed).
  - Given the seeded reference data, when counted, then there are 1 company (Cobalt Ridge Components, Inc., Riverton plant), 6 customers, 4 suppliers, 4 carriers, about 25 parts (ABC mix about 20/30/50 %, format CRC-####-<rev>), about 10 locations (including RCV-01, HOLD-01, FG-01, SHIP-01), and the late/hold/adjust/scrap reason codes.
  - Given the seeded users, when counted, then there is one demo user per role (6) with obviously fake names (for example demo.shipper / Demo Shipper), example.com emails, and demo-only passwords documented in the README.
  - Given all seeded text, when reviewed against fictional-data-guardrails, then no real company, person, carrier format or part number is used and tracking numbers use the fictional prefixes SLP, HFL or TAX.
- **Out of scope:** Importing real data; connecting to any external system.

#### US-012 Seed shipments, errors, rework and the peak-period storyline

> **Release: V1-CORE** · Core depends on: US-011, US-016, US-021, US-027, US-029, US-032 · The "seed anchor date" below is the fixed reporting date 2026-11-25. Seed includes shipments packed by `demo.shipper1`/`demo.shipper2` and verified by a different user (consistent with the verifier rule).

As a **presenter**, I want about 300 fictional shipments over 6 months with a peak period, errors, rework and late shipments so that the dashboard tells a realistic story in the demo.

- **Scope ref:** project-scope.md section 3 (item 3.6b); **Scope section 5 criteria:** 8
- **Docs:** project-scope §3.6; 06 §6.3 (SH-1042); 02 §2.6
- **Priority:** Must · **Size:** L · **Batch:** B6
- **Depends on:** US-011, US-016, US-021, US-027, US-029, US-031, US-032, US-022
- **Acceptance criteria (Given/When/Then):**
  - Given a freshly seeded store, when QA counts shipments, then there are about 300 (270 to 330) spread over 6 months ending on the seed anchor date, in a realistic mix of statuses (most Shipped, a few Planned/Ready/Packing/Verified/On Hold/Rework/Cancelled, a small number Delivered).
  - Given the seed, when volume per day is compared, then a 3 to 4 week peak period has about twice the daily volume of other weeks and higher error and late rates than outside the peak.
  - Given the seed, when counted, then packaging errors are 6 to 8 % of shipments overall, labels and paperwork are the two largest categories, and customer-found (after ship) errors exist.
  - Given the seed, when counted, then there is about one rework event per error caught before ship, each 10 to 90 minutes, and 8 to 12 % of shipments are late spread across several late reason codes.
  - Given shipment SH-1042, when QA opens it, then it shows the paperwork error (packing slip lists revision B, parts are revision C), a completed rework, and a 5 Whys note and corrective action matching docs/06 §6.3.
  - Given the seeded shipments, when status history is inspected, then every shipment's history is consistent with the allowed transitions and timestamps increase over time.
  - Given the seed, when counted, then open and overdue corrective actions and at least one On Hold shipment exist so the needs-attention lists are not empty.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-013 Seed receipts, ledger and cycle counts

> **Release: V1-CORE** · Core depends on: US-012, US-035, US-041, US-044, US-045

As a **presenter**, I want about 150 fictional receipts, a consistent ledger and about 12 cycle counts so that the inventory screens and accuracy KPI have realistic data and lot traces work.

- **Scope ref:** project-scope.md section 3 (item 3.6b); **Scope section 5 criteria:** 3, 5, 8
- **Docs:** project-scope §3.6; 03 §3.3-3.5
- **Priority:** Must · **Size:** L · **Batch:** B6
- **Depends on:** US-012, US-035, US-041, US-044, US-045
- **Acceptance criteria (Given/When/Then):**
  - Given a freshly seeded store, when counted, then there are about 150 receipts of which about 5 % are On Hold, every receipt has a lot number in format L<yy><ww>-<nnn>, and receipts are numbered RC-####.
  - Given the seeded ledger, when on-hand is derived for every part/location/lot, then no quantity is negative and every shipped line has a lot whose on-hand covered the shipped quantity at ship time.
  - Given the seed, when counted, then there are about 12 cycle counts with about 200 lines, overall accuracy about 95 to 98 % and visibly worse for C items, including at least one count awaiting Supervisor approval and one approved count with an adjustment.
  - Given at least one seeded lot, when QA runs the lot trace for it, then it shows a supplier receipt and one or more customer shipments (supports acceptance criterion 5).
  - Given the seed, when run, then it still completes in a single command and is deterministic (identical results on repeat).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

### E1 Shipments

_Create, track, pack/verify and ship outbound shipments with status history (scope 3.1; forms F1-F3)._

#### US-014 Create a shipment (F1)

> **Release: V1-CORE** · Core depends on: US-003, US-007 · Absorbs US-015 (edit before ship) and US-023 (document flags). Create/edit: Shipping and Supervisor (P-04). "Today" means the reporting date when fixed mode is on.

As a **Shipping associate**, I want to create a shipment with a header and one or more lines so that the outbound order release is recorded.

- **Scope ref:** project-scope.md section 3 (item 3.1a); **Scope section 5 criteria:** 1
- **Docs:** 01 §1.2, §1.4; 08 §8.3 F1, shipment/shipment_line
- **Priority:** Must · **Size:** M · **Batch:** B2
- **Depends on:** US-003, US-007
- **Acceptance criteria (Given/When/Then):**
  - Given a Shipping user on the new-shipment form, when they enter customer (dropdown), customer PO, order date, requested date, promise date and at least one line (part, revision, quantity ordered, optional lot), then the shipment is saved with the next number SH-#### and status Planned and the initial status history entry exists.
  - Given promise date earlier than order date, when saved, then it is rejected with an inline message and nothing is saved.
  - Given a line quantity of 0, negative or non-numeric, when saved, then it is rejected inline.
  - Given a missing customer, PO, order date, requested date, promise date or lines, when saved, then each missing field is flagged inline and nothing is saved.
  - Given a shipment with several lines, when saved, then line numbers are assigned in order and each line can reference a different part.
  - Given a Viewer or Receiving/Inventory user, when they try to create a shipment, then the response is 403.
- **Out of scope:** Importing orders from an ERP or EDI (scope §4).

#### US-015 Edit a shipment before it ships

> **Release: V1-CORE (merged into US-014)**

As a **Shipping associate**, I want to correct header and line details while the shipment is not yet shipped so that the record matches the real order.

- **Scope ref:** project-scope.md section 3 (item 3.1a); **Scope section 5 criteria:** 1
- **Docs:** 08 §8.3 F1; 07 §7.4
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-014
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment in Planned, Ready to Pack, Packing, Verified, On Hold or Rework, when a Shipping user edits header or lines and saves valid data, then the changes are saved and an audit entry records old to new values.
  - Given a shipment in Verified, when header or line quantity, part, revision or lot is changed, then the shipment returns to Rework (it must be verified again) and the status history shows why.
  - Given a shipment in Shipped, Delivered or Cancelled, when anyone edits header or lines, then the form is read-only and a direct request is rejected (409 or 403) with a message; only notes remain editable by Supervisor.
  - Given the same validation rules as creation, when an edit violates them, then it is rejected inline.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-016 Status lifecycle, history, hold, release and cancel

> **Release: V1-CORE** · Core depends on: US-014 · Absorbs US-017. Role rules per permissions-matrix.md: hold by Shipping, Quality or Supervisor; release by Quality or Supervisor (R-6); cancel by Supervisor, and by Shipping only while Planned or Ready to Pack (R-5). The Delivered transition is not built in the core (US-026 deferred); ignore it in the transitions below.

As a **Shipping associate**, I want status changes only through defined actions, each recorded in a history so that the shipment's progress and timings are trustworthy.

- **Scope ref:** project-scope.md section 3 (item 3.1b); **Scope section 5 criteria:** 1
- **Docs:** 01 §1.5; 07 §7.4; 08 §8.2 shipment_status_history
- **Priority:** Must · **Size:** L · **Batch:** B2
- **Depends on:** US-014
- **Acceptance criteria (Given/When/Then):**
  - Given the allowed transitions Planned to Ready to Pack, Ready to Pack to Packing, Packing to Verified, Verified to Shipped, Shipped to Delivered (optional), any non-final status to On Hold and back to its prior status, a failed verification or a before-ship error to Rework, Rework to Packing, and any status before Shipped to Cancelled, when a user performs one via its action button, then the status changes and one history entry records from, to, user, UTC time and optional note.
  - Given a transition not in the allowed list (for example Planned directly to Shipped, or Cancelled to anything), when attempted through the UI or a direct request, then it is rejected with a clear message (409) and status is unchanged.
  - Given a shipment, when its detail page is opened, then the full status history is shown in time order with user and note.
  - Given a shipment that moves Planned to Ready to Pack, when the history is read, then the first Ready to Pack timestamp is stored for later cycle-time use (never overwritten by later re-entry).
  - Given the status field on screens, when rendered, then it is not editable as a free dropdown anywhere.
  - Given a Viewer, when they attempt any transition, then the response is 403.
- **Out of scope:** Automatic status updates from carriers (scope §4).

#### US-017 Hold, release and cancel with reason

> **Release: V1-CORE (merged into US-016)** · The cancel and hold roles in the ACs below are replaced by the rules stated on US-016 and permissions-matrix.md.

As a **Quality technician**, I want to put a shipment On Hold with a reason and later release it, and to cancel shipments so that blocked work is visible and cancelled work is excluded from KPIs.

- **Scope ref:** project-scope.md section 3 (item 3.1b); **Scope section 5 criteria:** none
- **Docs:** 01 §1.5; 04 §4.2; 08 §8.4
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-016, US-007
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment before Shipped, when a Quality, Supervisor or Shipping user puts it On Hold, then a hold reason (from the hold reason codes) is required and the owning department is recorded; without a reason the action is rejected.
  - Given a shipment On Hold, when a Quality or Supervisor user releases it, then it returns to the status it had before the hold and both actions appear in history.
  - Given a shipment before Shipped, when a Shipping or Supervisor user cancels it with a note, then status is Cancelled, it is read-only, and it is excluded from every KPI and chart count.
  - Given a Shipped or Delivered shipment, when cancel or hold is attempted, then it is rejected.
- **Out of scope:** Full MRB disposition workflow (scope §4).

#### US-018 Shipment detail page

> **Release: V1-CORE (merged into US-024)** · Built together with the shipment list.

As a **Viewer**, I want a page showing one shipment with lines, dates, checklist results, errors, rework, documents flags and history so that I can see everything about it in one place.

- **Scope ref:** project-scope.md section 3 (item 3.1b, 3.1f); **Scope section 5 criteria:** none
- **Docs:** 08 §8.3; 07 §7.3
- **Priority:** Must · **Size:** M · **Batch:** B2
- **Depends on:** US-016
- **Acceptance criteria (Given/When/Then):**
  - Given any shipment, when its detail page is opened by any signed-in role, then it shows header, lines (ordered and shipped quantity, lot), status with text label, dates, carrier and tracking when present, document flags, status history, and (when they exist) linked packaging errors, rework and corrective actions.
  - Given a late shipment, when its page is shown, then days late and the late reason appear.
  - Given a non-existent shipment number, when requested, then a generic not-found page is shown.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-019 Pack and Verify checklist (F2)

> **Release: V1-CORE** · Core depends on: US-016 · Packing: Shipping and Supervisor. **Verifying: Shipping, Quality and Supervisor (user decision 5)**, always subject to US-020 (verifier is not the packer). Admin and Receiving get 403.

As a **Shipping associate**, I want to pack a shipment and have it verified against a checklist so that errors are caught before the shipment leaves.

- **Scope ref:** project-scope.md section 3 (item 3.1c); **Scope section 5 criteria:** 1, 2
- **Docs:** 02 §2.4; 08 §8.3 F2; 06
- **Priority:** Must · **Size:** L · **Batch:** B2
- **Depends on:** US-016
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment in Ready to Pack, when a Shipping user starts packing, then the status is Packing, the packing user is recorded as packer, and the packaging instruction reference and revision of each part are shown.
  - Given a shipment in Packing, when a verifier opens Pack & Verify, then the checklist lists: part number matches, revision matches, quantity matches, lot recorded, labels match, packing slip matches, C of C present (shown only when any part requires it), packaging method per instruction.
  - Given every applicable checklist item is ticked pass, when the verifier confirms, then the status becomes Verified and the verifier and verification time are recorded.
  - Given the verifier tries to confirm with any item not passed or unanswered, when submitted, then the shipment cannot become Verified; if any item is marked fail the status becomes Rework and the failed items are stored.
  - Given a verification attempt (pass or fail), when saved, then the attempt number, result, user and timestamp are stored so first-pass result is distinguishable from later attempts.
  - Given a shipment not in Packing, when verification is attempted, then it is rejected.
- **Out of scope:** Barcode or scanner verification and label printing (scope §4).

#### US-020 Verifier must differ from packer

> **Release: V1-CORE** · Core depends on: US-019 · Server-enforced (user decision 5). Additional criteria: (a) the refusal applies to every verifying role, including Supervisor and Quality, when that user is the recorded packer; (b) the refusal is HTTP 403 with a clear message and a distinct error code, and an audit entry is written; (c) the seed provides at least two Shipping users (`demo.shipper1`, `demo.shipper2`) plus Quality and Supervisor so QA can test it (permissions-matrix.md scenarios T-1 to T-5). The "Viewer or Receiving/Inventory" AC below becomes "Admin, Receiving or Viewer".

As a **Supervisor**, I want the system to refuse verification by the same person who packed so that the second check is independent.

- **Scope ref:** project-scope.md section 3 (item 3.1c); **Scope section 5 criteria:** 2
- **Docs:** 02 §2.4 item 2; 08 §8.3 F2
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-019
- **Acceptance criteria (Given/When/Then):**
  - Given user A recorded as packer of a shipment, when user A attempts to verify the same shipment (UI or direct request), then it is rejected with a clear message and no verification attempt is recorded as passed.
  - Given a different user with a role allowed to verify (Shipping, Quality or Supervisor), when they verify, then it is accepted.
  - Given a Viewer or Receiving/Inventory user, when they attempt to verify, then the response is 403.
  - Given a shipment that goes back to Rework and is re-packed by user B, when user A (the earlier packer) verifies, then it is accepted because the current packer is B, while B is refused.
- **Out of scope:** A configurable on/off switch for this rule (docs/02 says configurable; v1 enforces it always, Q-12).

#### US-021 Ship a verified shipment (F3)

> **Release: V1-CORE** · Core depends on: US-019, US-020, US-007 · Absorbs US-022 (late reason). Ship: Shipping and Supervisor (P-08); Admin gets 403. "Today" and "future ship date" use the reporting date in fixed mode.

As a **Shipping associate**, I want to record ship date, carrier, tracking, packages, weight and shipped quantities so that the shipment is completed and measurable.

- **Scope ref:** project-scope.md section 3 (item 3.1d); **Scope section 5 criteria:** 1, 2
- **Docs:** 01 §1.3-1.4; 08 §8.3 F3
- **Priority:** Must · **Size:** M · **Batch:** B2
- **Depends on:** US-019, US-020
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment in Verified, when a Shipping user opens Ship, then ship date defaults to today and qty shipped per line defaults to qty ordered.
  - Given carrier selected from the dropdown, tracking number, packages count >= 1 and weight > 0, when saved, then status becomes Shipped and ship date, carrier, tracking, packages and weight are stored.
  - Given the carrier is Customer Pickup, when saved without a tracking number, then it is accepted; for any other carrier a missing tracking number is rejected inline.
  - Given a tracking number longer than the allowed maximum or containing characters outside letters, digits and hyphen, when saved, then it is rejected inline.
  - Given a line shipped short (qty shipped less than qty ordered), when saved, then it is accepted, a note is required, and the shipment will count as not in full for OTIF.
  - Given a line shipped, when saved, then the lot number is required on the line.
  - Given a shipment not in Verified (for example Rework or On Hold), when Ship is attempted by UI or direct request, then it is rejected.
- **Out of scope:** Carrier API calls, label printing, generating shipping documents (scope §4).

#### US-022 Late reason required when late

> **Release: V1-CORE (merged into US-021)**

As a **Shipping associate**, I want to be forced to state why a shipment is late so that late causes show up in the late-reason chart.

- **Scope ref:** project-scope.md section 3 (item 3.1d); **Scope section 5 criteria:** none
- **Docs:** 01 §1.7 item 4; 08 §8.3 F3
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-021, US-007
- **Acceptance criteria (Given/When/Then):**
  - Given ship date later than promise date (with the configured tolerance of 0 days), when the Ship form is saved with no late reason, then it is rejected inline.
  - Given ship date on or before promise date, when saved, then no late reason is required and the field is hidden or optional.
  - Given a late reason chosen, when saved, then it is stored from the late reason-code list and appears on the shipment, R2 and chart C4.
  - Given a ship date later than today, when saved, then it is rejected (no future ship dates).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-023 Document checklist flags

> **Release: V1-CORE (merged into US-014)**

As a **Shipping associate**, I want to tick packing slip, BOL, C of C and labels as ready so that paperwork gaps are visible before shipping.

- **Scope ref:** project-scope.md section 3 (item 3.1e); **Scope section 5 criteria:** none
- **Docs:** 01 §1.6; 08 §8.2 shipment doc_* fields
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-014
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment before Shipped, when a Shipping user ticks or unticks Packing slip, BOL, C of C or Labels, then the flags are saved with an audit entry.
  - Given a part on the shipment that requires a C of C, when the shipment is verified, then the C of C flag must be ticked or the verification checklist item fails.
  - Given the shipment list and detail, when shown, then the four flags display as text (Yes/No), not colour alone.
  - Given the flags, when QA looks for document generation, then none exists in v1.
- **Out of scope:** Generating packing slips, BOLs and C of C (scope §4).

#### US-024 Shipment list, search, filters and detail page

> **Release: V1-CORE** · Core depends on: US-016 · Absorbs US-018 (detail page). Adds an "Overdue" filter (promise date before the reporting date, not Shipped or Cancelled) and shows the hold reason, which replaces the deferred US-025 view.

As a **Shipping associate**, I want to search and filter shipments so that I can find work quickly.

- **Scope ref:** project-scope.md section 3 (item 3.1f); **Scope section 5 criteria:** none
- **Docs:** 01 §1.7 item 3; 08 §8.4
- **Priority:** Must · **Size:** M · **Batch:** B2
- **Depends on:** US-016
- **Acceptance criteria (Given/When/Then):**
  - Given the list, when a user filters by status, customer, carrier, date range (on a chosen date field) or late only, then only matching shipments appear and a result count is shown.
  - Given the search box, when a user enters part of a shipment number, customer PO or tracking number, then matching shipments appear (case-insensitive).
  - Given more than one page of results, when paged or sorted by promise date or status, then order and totals stay correct.
  - Given the list, when rendered, then each row shows shipment no., customer, promise date, status (text), carrier and on-time/late indicator in text.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-025 Overdue and due-soon views

> **Release: DEFERRED (v1.1)** · Reason: the shipment list "Overdue" and "Late only" filters (US-024) cover the core need.

As a **Shipping associate**, I want a view of shipments overdue or due in the next 3 days that are not yet Ready to Pack so that I can plan the day.

- **Scope ref:** project-scope.md section 3 (item 3.1f); **Scope section 5 criteria:** none
- **Docs:** 01 §1.7 item 3; 08 §8.4
- **Priority:** Must · **Size:** S · **Batch:** B2
- **Depends on:** US-024
- **Acceptance criteria (Given/When/Then):**
  - Given today's date, when the view is opened, then Overdue lists shipments with promise date before today that are not Shipped, Delivered or Cancelled.
  - Given today's date, when the view is opened, then Due soon lists shipments with promise date from today to today + 3 days still in Planned (not yet Ready to Pack).
  - Given a shipment On Hold, when it is overdue, then it appears in Overdue and shows the hold reason.
  - Given a click on a row, when activated, then the shipment detail page opens.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-026 Record delivered date (optional)

> **Release: DEFERRED (v1.1)** · Reason: optional; no KPI uses it.

As a **Shipping associate**, I want to optionally record a delivered date on a shipped shipment so that delivery can be noted when I know it.

- **Scope ref:** project-scope.md section 3 (item 3.1b); **Scope section 5 criteria:** none
- **Docs:** 01 §1.2; 05 KPI-1 note
- **Priority:** Could · **Size:** S · **Batch:** B6
- **Depends on:** US-021
- **Acceptance criteria (Given/When/Then):**
  - Given a Shipped shipment, when a Shipping user enters a delivered date on or after the ship date, then status becomes Delivered and history records it.
  - Given a delivered date earlier than the ship date, when saved, then it is rejected inline.
  - Given the dashboard KPIs, when delivered dates exist or not, then no KPI value changes (v1 KPIs use ship date).
- **Out of scope:** Importing delivered dates from carriers; on-time delivery KPI (scope §4).

### E2 Packaging quality and rework

_Log errors, rework, root cause and corrective actions; gate shipping on a failed verification (scope 3.2; forms F4-F6)._

#### US-027 Log a packaging error (F4)

> **Release: V1-CORE** · Core depends on: US-016, US-007, US-021 · Absorbs US-033 (customer-found errors). Shipping, Quality and Supervisor log before-ship errors; after-ship (customer-found) errors are logged by Quality or Supervisor (R-8); Admin, Receiving and Viewer get 403.

As a **Shipping associate**, I want to log a packaging error with category, severity and where and when it was found so that errors are counted and analysed.

- **Scope ref:** project-scope.md section 3 (item 3.2a); **Scope section 5 criteria:** 1
- **Docs:** 02 §2.2; 08 §8.2 packaging_error, F4
- **Priority:** Must · **Size:** M · **Batch:** B3
- **Depends on:** US-016, US-007
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment, when a Shipping, Quality or Supervisor user opens Log Packaging Error, then they must choose category (Wrong part, Wrong quantity, Incorrect label, Paperwork, Packaging method, Damage, Traceability, Other), severity (Minor, Major, Critical), detected by (Packer, Verifier, Quality, Customer), detected stage (Before ship, After ship) and enter a description.
  - Given category Paperwork, when saving, then a paperwork sub-type (Packing slip, BOL, C of C, Customer-specific form, Commercial invoice) is required.
  - Given a valid form, when saved, then an error number PE-#### is assigned, status Open is set, and the error appears on the shipment detail page.
  - Given a required field missing or an unlisted category value sent directly to the server, when saved, then it is rejected.
  - Given category Other, when saved, then it is accepted and flagged in the error list as needing recategorisation.
  - Given an error logged before ship on a shipment in Packing or Verified, when saved, then the shipment moves to Rework and history records the error number.
  - Given a Viewer, when they try to log an error, then the response is 403.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-028 Failed verification opens a pre-filled error

> **Release: DEFERRED (v1.1)** · Reason: convenience; the verifier logs the error with the normal form (US-027). The gate (US-030) does not depend on it.

As a **Shipping associate**, I want a failed verification to open the error form already filled in so that I do not retype what the checklist already told us.

- **Scope ref:** project-scope.md section 3 (item 3.2a, 3.1c); **Scope section 5 criteria:** 1, 2
- **Docs:** 08 §8.3 F2; 02 §2.4 item 4
- **Priority:** Must · **Size:** S · **Batch:** B3
- **Depends on:** US-019, US-027
- **Acceptance criteria (Given/When/Then):**
  - Given a verifier marks one or more checklist items as fail, when they confirm, then the shipment goes to Rework and the error form opens pre-filled with the shipment, detected by Verifier, stage Before ship, and a category suggested from the failed item (part/revision to Wrong part, quantity to Wrong quantity, labels to Incorrect label, packing slip or C of C to Paperwork, method to Packaging method).
  - Given the pre-filled form, when the verifier adds severity and description and saves, then the error is linked to the shipment and to the failed verification attempt.
  - Given the verifier closes the form without saving, when the shipment is reopened, then it is still in Rework and a banner reminds that a failed verification has no logged error yet.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-029 Log rework (F5)

> **Release: V1-CORE** · Core depends on: US-027 · Shipping, Quality, Supervisor (P-13).

As a **Shipping associate**, I want to log what rework was done, when, and whether it re-verified OK so that rework effort and frequency are measured.

- **Scope ref:** project-scope.md section 3 (item 3.2b); **Scope section 5 criteria:** 1, 2
- **Docs:** 02 §2.3; 08 §8.2 rework_event, F5
- **Priority:** Must · **Size:** M · **Batch:** B3
- **Depends on:** US-027
- **Acceptance criteria (Given/When/Then):**
  - Given a packaging error, when a Shipping, Quality or Supervisor user logs rework, then they choose an action (Relabel, Repack, Reprint paperwork, Replace part, Recount, Other), start time, and later end time.
  - Given start and end times, when saved, then rework minutes are computed (end minus start, whole minutes) and end earlier than start is rejected inline.
  - Given an error with several rework events, when displayed, then each event and the total minutes show on the error and shipment pages.
  - Given a rework event with no end time, when viewed, then it is shown as In progress and is excluded from minute totals until completed.
  - Given a rework event, when saved, then it is linked to its error and shipment; a rework event cannot exist without an error.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-030 Cannot ship after failed verification without error, rework and re-verification

> **Release: V1-CORE** · Core depends on: US-019, US-027, US-029, US-021 (no longer depends on the deferred US-028)

As a **Supervisor**, I want the system to block shipping until a failed shipment has a logged error, completed rework and a passing re-verification so that defects cannot leave the dock.

- **Scope ref:** project-scope.md section 3 (item 3.2a, 3.2b, 3.1c); **Scope section 5 criteria:** 2
- **Docs:** 02 §2.4; 08 §8.3 F2-F3; project-scope §5.2
- **Priority:** Must · **Size:** M · **Batch:** B3
- **Depends on:** US-028, US-029, US-021
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment in Rework from a failed verification with no packaging error logged, when Ship or re-verification is attempted, then it is rejected with a message naming the missing error.
  - Given an error is logged but no rework event is completed, when re-verification is attempted, then it is rejected with a message naming the missing rework.
  - Given an error and a completed rework event, when the shipment is moved back to Packing and a different user (not the current packer) passes verification, then it becomes Verified and Ship becomes available.
  - Given a shipment that failed verification, when Ship is attempted by direct request while status is Rework or Packing, then the response is 409 and status is unchanged (end-to-end check of acceptance criterion 2).
  - Given the first verification attempt failed and the second passed, when the shipment is later counted, then FPY treats it as not first-pass (first attempt only).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-031 Root cause 6M and 5 Whys

> **Release: V1-CORE (merged into US-032)** · Quality and Supervisor only.

As a **Quality technician**, I want to record a root-cause category and a 5 Whys note on an error so that we learn why errors happen.

- **Scope ref:** project-scope.md section 3 (item 3.2c); **Scope section 5 criteria:** none
- **Docs:** 06 §6.2-6.3; 08 §8.2 packaging_error, F6
- **Priority:** Must · **Size:** S · **Batch:** B3
- **Depends on:** US-027
- **Acceptance criteria (Given/When/Then):**
  - Given a packaging error, when a Quality or Supervisor user edits it, then they can set root-cause category (Method, People, Material, Machine, Measurement, Environment) and enter a free-text 5 Whys note up to the documented maximum length.
  - Given a Shipping user, when they try to edit root-cause fields, then the response is 403 (they can log the error but not its root cause).
  - Given a saved root cause, when the error page is shown, then both fields display and an audit entry records old to new values.
  - Given an invalid category value sent directly, when saved, then it is rejected.
- **Out of scope:** Fishbone diagram tool, full 8D/CAPA workflow (scope §4).

#### US-032 Root cause, corrective action (F6), error list and close-out

> **Release: V1-CORE** · Core depends on: US-027, US-029 · Absorbs US-031 (root cause, 5 Whys) and US-034 (error list, close-out). Quality and Supervisor (P-14).

As a **Quality technician**, I want to create a simple corrective action with owner, due date and status so that fixes are followed through.

- **Scope ref:** project-scope.md section 3 (item 3.2c); **Scope section 5 criteria:** none
- **Docs:** 06 §6.4; 08 §8.2 corrective_action, F6
- **Priority:** Must · **Size:** M · **Batch:** B3
- **Depends on:** US-031
- **Acceptance criteria (Given/When/Then):**
  - Given a packaging error, when a Quality or Supervisor user adds a corrective action with description, owner (user), due date and status Open, then it is saved and linked to the error.
  - Given a corrective action, when its status is changed to In Progress then Closed, then closed-at is stamped on Closed and the action becomes read-only.
  - Given a corrective action past its due date and not Closed, when lists are shown, then it is marked Overdue in text and appears in the needs-attention list.
  - Given a due date earlier than the error's detected date, when saved, then it is rejected inline.
  - Given the owner field, when saved, then only active users can be chosen.
- **Out of scope:** Verification-of-effectiveness steps, 8D workflow (scope §4).

#### US-033 Log a customer-found error after shipment

> **Release: V1-CORE (merged into US-027)**

As a **Quality technician**, I want to record an error found by the customer after the shipment shipped so that escapes are tracked separately from internal catches.

- **Scope ref:** project-scope.md section 3 (item 3.2a); **Scope section 5 criteria:** none
- **Docs:** 02 §2.2 note on escapes; 05 KPI-3
- **Priority:** Must · **Size:** S · **Batch:** B3
- **Depends on:** US-027, US-021
- **Acceptance criteria (Given/When/Then):**
  - Given a Shipped or Delivered shipment, when a Quality or Supervisor user logs an error with detected stage After ship and detected by Customer, then it is saved without changing the shipment status.
  - Given a Before ship error on a Shipped shipment, when saved, then it is rejected (stage must be After ship).
  - Given an After ship error, when KPI-3 is computed, then it is counted as a customer escape in the internal vs escape split.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-034 Packaging error list and close-out

> **Release: V1-CORE (merged into US-032)**

As a **Quality technician**, I want to list, filter and close packaging errors so that open issues are managed.

- **Scope ref:** project-scope.md section 3 (item 3.2a, 3.2c); **Scope section 5 criteria:** none
- **Docs:** 08 §8.2 packaging_error status; 08 §8.4
- **Priority:** Must · **Size:** S · **Batch:** B3
- **Depends on:** US-029, US-032
- **Acceptance criteria (Given/When/Then):**
  - Given the error list, when filtered by status, category, severity, detected stage, shipment or date range, then only matching errors appear with rework minutes and corrective action status columns.
  - Given an error, when a Quality or Supervisor user moves it Open to Contained to Closed, then closing is rejected unless at least one rework event is completed (before-ship errors) and a root-cause category is set.
  - Given an Open error, when it is older than 7 days, then it shows as Overdue in text and appears in the needs-attention list.
  - Given the list, when rendered, then status and severity are shown as text.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

### E3 Inventory

_Receipts, append-only ledger, on-hand, cycle counts, lot trace (scope 3.3; forms F7-F9)._

#### US-035 Receive material (F7)

> **Release: V1-CORE** · Core depends on: US-007, US-037 · Absorbs US-039 (transfer, scrap, production complete). Receive: Receiving and Supervisor (P-15). Held receipts go to a Hold location and are released by a **transfer out of Hold done by Quality or Supervisor** (R-7), which replaces the deferred release/reject screen (US-036).

As a **Receiving/inventory clerk**, I want to record a receipt with supplier, PO, part, quantity, lot and inspection status so that stock and traceability start at the dock.

- **Scope ref:** project-scope.md section 3 (item 3.3b, 3.3c); **Scope section 5 criteria:** 3, 5
- **Docs:** 03 §3.1-3.2, §3.5; 08 §8.3 F7
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-007, US-037
- **Acceptance criteria (Given/When/Then):**
  - Given a Receiving/Inventory user, when they enter supplier, supplier PO, part, quantity > 0, lot number, arrival time and inspection status (Accepted, On Hold, Rejected), then a receipt RC-#### is saved.
  - Given a receipt saved as Accepted, when saved, then a RECEIPT ledger transaction for that part, lot and the chosen stock/receiving location is posted for the received quantity.
  - Given a receipt saved as On Hold, when saved, then the RECEIPT transaction is posted to a Hold-type location (HOLD-01).
  - Given a receipt saved as Rejected, when saved, then no on-hand is created and the receipt is visible with that status.
  - Given a missing lot number, quantity of 0 or negative, or unknown part, when saved, then it is rejected inline.
  - Given a Shipping or Viewer user, when they try to post a receipt, then the response is 403.
- **Out of scope:** Purchasing, supplier ASN, scanning of labels (scope §4).

#### US-036 Release or reject held material

> **Release: DEFERRED (v1.1)** · Reason: a transfer out of the Hold location (US-035, R-7) releases material in the core; a formal release/reject screen is not needed to be complete.

As a **Quality technician**, I want to release On Hold receipts to stock or reject them so that held material becomes available only after Quality decides.

- **Scope ref:** project-scope.md section 3 (item 3.3b); **Scope section 5 criteria:** 3
- **Docs:** 03 §3.1; 04 §4.1
- **Priority:** Must · **Size:** S · **Batch:** B4
- **Depends on:** US-035, US-039
- **Acceptance criteria (Given/When/Then):**
  - Given a receipt On Hold, when a Quality or Supervisor user releases it, then inspection status becomes Accepted and a TRANSFER from the Hold location to a chosen stock location is posted for the remaining held quantity.
  - Given a receipt On Hold, when rejected, then status becomes Rejected and the quantity is moved out of available stock by a SCRAP or transfer to a reject location with a required reason code.
  - Given a non-Quality, non-Supervisor user, when they attempt release or reject, then the response is 403.
- **Out of scope:** Full MRB disposition (scope §4).

#### US-037 Append-only inventory ledger

> **Release: V1-CORE** · Core depends on: US-003, US-007, US-005 · Absorbs US-038 (on-hand by part, location and lot). Ledger rows are never edited or deleted (also enforced by database triggers).

As a **Supervisor**, I want every stock change recorded as a signed transaction that can never be edited or deleted so that inventory history is trustworthy.

- **Scope ref:** project-scope.md section 3 (item 3.3c); **Scope section 5 criteria:** 3
- **Docs:** 03 §3.2; 08 §8.2 inventory_transaction; schema-and-seed-data
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-003, US-007, US-005
- **Acceptance criteria (Given/When/Then):**
  - Given any transaction, when posted, then it stores type (RECEIPT, SHIP, TRANSFER, PRODUCTION_COMPLETE, SCRAP, ADJUST), part, location, lot, signed non-zero quantity, UTC time, creating user, and reference type and id.
  - Given a quantity of 0 or a missing lot, when posting, then it is rejected.
  - Given the application interface and API, when QA looks for any way to edit or delete a transaction, then none exists; corrections are made only by posting a new opposing transaction.
  - Given ADJUST or SCRAP, when posted, then a reason code from the adjust or scrap category is required.
  - Given a transfer, when posted, then it creates two linked transactions (minus at source, plus at destination) in one atomic operation; if either fails neither is stored.
- **Out of scope:** Cost, valuation, multi-currency (scope §4); ISSUE_TO_PRODUCTION transaction type (not needed in v1).

#### US-038 On-hand by part, location and lot

> **Release: V1-CORE (merged into US-037)**

As a **Receiving/inventory clerk**, I want to see current on-hand derived from the ledger so that I always know what is where.

- **Scope ref:** project-scope.md section 3 (item 3.3d); **Scope section 5 criteria:** 3
- **Docs:** 03 §3.2; 08 §8.2 on-hand view; R4
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-037
- **Acceptance criteria (Given/When/Then):**
  - Given ledger transactions for a part/location/lot, when the on-hand screen is opened, then quantity equals the signed sum of all its transactions.
  - Given the screen, when filtered by part, location or lot, then only matching rows show; zero-quantity rows are hidden by default with an option to show them.
  - Given a hand-calculated fixture (receipt 100, ship 30, transfer 20 out, scrap 5), when computed, then on-hand at source is 45 and at destination 20 for that lot.
  - Given any role, when viewing the screen, then Viewer and above can read it; no edit control exists on it.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-039 Transfer, scrap and production complete (F8)

> **Release: V1-CORE (merged into US-035)** · Receiving and Supervisor (P-16); transfers out of Hold need Quality or Supervisor.

As a **Receiving/inventory clerk**, I want to move stock between locations, scrap stock, and record finished-goods production so that the ledger reflects physical moves.

- **Scope ref:** project-scope.md section 3 (item 3.3c); **Scope section 5 criteria:** 3
- **Docs:** 03 §3.2; 08 §8.3 F8
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-037, US-038
- **Acceptance criteria (Given/When/Then):**
  - Given a Receiving/Inventory user, when they post a TRANSFER of a quantity not exceeding on-hand at the source for the part and lot, then both legs post; a quantity greater than on-hand is rejected with a message showing available quantity.
  - Given SCRAP with a scrap reason code and quantity not exceeding on-hand, when posted, then a negative transaction is stored; without a reason it is rejected.
  - Given PRODUCTION_COMPLETE with part, lot, quantity > 0 and a finished-goods location, when posted, then a positive transaction is stored.
  - Given a Shipping or Viewer user, when they attempt any of these, then the response is 403.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-040 Supervisor-approved manual adjustment

> **Release: DEFERRED (v1.1)** · Reason: in the core, adjustments exist only as the result of an approved cycle count (US-044). Stand-alone manual adjustment adds a second approval path to build and test.

As a **Supervisor**, I want to post a manual inventory adjustment with a reason so that errors found outside a cycle count can be corrected with a trace.

- **Scope ref:** project-scope.md section 3 (item 3.3c); **Scope section 5 criteria:** 4
- **Docs:** 03 §3.2; 08 §8.3 F8
- **Priority:** Must · **Size:** S · **Batch:** B4
- **Depends on:** US-037, US-038
- **Acceptance criteria (Given/When/Then):**
  - Given a Supervisor, when they post an ADJUST with part, location, lot, signed quantity and an adjust reason code, then the transaction is stored and on-hand changes accordingly.
  - Given any role other than Supervisor, when they attempt a manual adjust, then the response is 403.
  - Given an adjust that would make on-hand negative, when posted, then it is rejected.
  - Given an adjust, when saved, then an audit entry records who and why.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-041 Shipping consumes inventory

> **Release: V1-CORE** · Core depends on: US-021, US-037

As a **Shipping associate**, I want the ship step to post SHIP ledger transactions for the lots shipped so that on-hand falls when product leaves.

- **Scope ref:** project-scope.md section 3 (item 3.3c, 3.3d); **Scope section 5 criteria:** 3
- **Docs:** 03 §3.2; 08 §8.3 F3
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-021, US-038
- **Acceptance criteria (Given/When/Then):**
  - Given a shipment line with part, lot and qty shipped, when the shipment becomes Shipped, then a SHIP transaction of minus qty shipped is posted for that part, lot and the line's location, referencing the shipment, in the same atomic operation as the status change.
  - Given on-hand for the line's part, lot and location is less than qty shipped, when Ship is saved, then it is rejected with a message showing available quantity, and neither status nor ledger changes.
  - Given a fixture of receipt 100 for lot L2611-004 and a shipment line shipping 40 from it, when shipped, then on-hand for the lot is 60 (supports acceptance criterion 3).
  - Given a shipment line with no location, when Ship is saved, then a location with available lot stock must be chosen.
  - Given the Ship step fails after posting one line, when the error occurs, then no SHIP transactions remain (all-or-nothing).
- **Out of scope:** Backorders created automatically for short lines; allocation or reservation of stock (v2).

#### US-042 Create a cycle-count list

> **Release: V1-CORE (merged into US-043)** · Supervisor only (P-17).

As a **Supervisor**, I want to generate a count list by ABC class or location so that counting is scheduled.

- **Scope ref:** project-scope.md section 3 (item 3.3e); **Scope section 5 criteria:** 4
- **Docs:** 03 §3.4; 08 §8.2 cycle_count
- **Priority:** Must · **Size:** S · **Batch:** B4
- **Depends on:** US-038
- **Acceptance criteria (Given/When/Then):**
  - Given a Supervisor, when they create a count by ABC class or by location with a scheduled date, then a count CC-#### with status Open is created containing one line per part/location/lot with non-zero on-hand matching the filter.
  - Given each line, when created, then system quantity is stored as a snapshot and is not shown to counters.
  - Given a non-Supervisor role, when they try to create a count, then the response is 403.
- **Out of scope:** Automatic ABC-based scheduling, opportunity counts (v2).

#### US-043 Blind count entry and recount (F9)

> **Release: V1-CORE** · Core depends on: US-037 · Absorbs US-042 (create the count list). Entry by Receiving and Supervisor (P-18).

As a **Receiving/inventory clerk**, I want to enter physical counts without seeing system quantities and recount when out of tolerance so that counts are unbiased.

- **Scope ref:** project-scope.md section 3 (item 3.3e); **Scope section 5 criteria:** 4
- **Docs:** 03 §3.3-3.4; 08 §8.3 F9
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-042
- **Acceptance criteria (Given/When/Then):**
  - Given an Open count, when a Receiving/Inventory user opens it, then each line shows part, location and lot but no system quantity (also absent from the page source and API response for this role).
  - Given a counted quantity entered, when saved, then variance (counted minus system) and within-tolerance are computed using the tolerance for the part's ABC class (A 0 %, B +/-2 %, C +/-5 % by default from settings).
  - Given a line out of tolerance, when saved, then the user is prompted to enter a recount quantity before the count can be submitted; the first counted quantity is kept unchanged.
  - Given all lines have a counted (and where required recounted) quantity, when submitted, then count status becomes Counted.
  - Given a negative or non-numeric quantity, when saved, then it is rejected inline.
  - Given a Shipping or Viewer user, when they try to enter counts, then the response is 403.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-044 Approve a count and post adjustments

> **Release: V1-CORE** · Core depends on: US-043, US-037 (no longer depends on the deferred US-040; the adjustment posting is built here). Supervisor only (P-19, R-3); proposed R-4: approver is not the person who entered the count (pending Sasha).

As a **Supervisor**, I want to review a counted cycle count and approve it so adjustments post so that stock matches reality with approval.

- **Scope ref:** project-scope.md section 3 (item 3.3e); **Scope section 5 criteria:** 4
- **Docs:** 03 §3.4 step 4; 08 §8.3 F9
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-043, US-040
- **Acceptance criteria (Given/When/Then):**
  - Given a Counted count, when a Supervisor opens it, then they see system quantity, counted, recount, variance and in-tolerance per line.
  - Given the Supervisor approves, when confirmed, then for each line with a variance an ADJUST transaction is posted for the final quantity difference with an adjust reason code, status becomes Approved, and approved-by and approved-at are stored.
  - Given a fixture where system quantity 100 and counted 96 (recount 96) for an A item, when approved, then on-hand becomes 96 and an ADJUST of minus 4 exists (supports acceptance criterion 4).
  - Given the approval, when KPI-7 is computed after it, then the count's lines are included in Inventory Accuracy % (approved-at in the period).
  - Given any non-Supervisor, when they attempt to approve, then the response is 403.
  - Given an already Approved count, when approval is repeated, then no second adjustment is posted.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-045 Lot trace report (R7)

> **Release: V1-CORE** · Core depends on: US-035, US-041

As a **Quality technician**, I want to enter a lot and see where it came from and where it went so that I can answer a customer or supplier quality question.

- **Scope ref:** project-scope.md section 3 (item 3.3f, 3.4d); **Scope section 5 criteria:** 5
- **Docs:** 03 §3.5; 08 §8.5 R7
- **Priority:** Must · **Size:** M · **Batch:** B4
- **Depends on:** US-035, US-041
- **Acceptance criteria (Given/When/Then):**
  - Given a lot number, when a user runs the report, then it lists backward: supplier, supplier PO, receipt number, part, quantity and receive date; and forward: shipment number, customer, ship date, quantity shipped, and carrier and tracking.
  - Given a seeded lot received once and shipped to two customers, when traced, then both shipments and customers appear and quantities reconcile with the receipt.
  - Given a lot with transfers, scrap or adjustments, when traced, then those transactions are also shown in chronological order.
  - Given a lot number that does not exist, when entered, then a clear no-results message appears.
  - Given the report, when exported to CSV, then the same rows are exported.
- **Out of scope:** Serial-number and multi-level genealogy (scope §4).

### E4 KPIs and dashboard

_One KPI module, tiles, charts C1-C6, needs-attention lists, filters (scope 3.4)._

#### US-046 Single KPI module and common rules

> **Release: V1-CORE** · Core depends on: US-016 · "Today" and the default period use the reporting date (US-008). Computes KPI-1 to KPI-7; KPI-8 is deferred.

As a **Supervisor**, I want all KPI math to live in one place with common period and edge-case rules so that every screen shows the same numbers.

- **Scope ref:** project-scope.md section 3 (item 3.4a, 3.5g); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 §5.1, §5.4; kpi-definitions
- **Priority:** Must · **Size:** M · **Batch:** B5
- **Depends on:** US-016
- **Acceptance criteria (Given/When/Then):**
  - Given a period (default last 30 days, inclusive of both ends), when any tile, chart, report or test requests a KPI, then it calls the same module and receives the same value.
  - Given a denominator of zero, when a KPI is computed, then the result is null ("no data") and screens display "No data", never 0 % or 100 %.
  - Given a cancelled shipment, when any shipment KPI is computed, then it is excluded.
  - Given a value, when displayed, then percentages show one decimal place while internal precision is kept.
  - Given a period and its previous period of equal length, when requested, then the module returns both values for the previous-period comparison.
  - Given the KPI module, when QA searches the code for the same formula elsewhere, then none is re-implemented outside it.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-047 KPI-1 On-Time Shipment %

> **Release: V1-CORE** · Core depends on: US-046, US-021 · Host for the delivery KPIs: also builds US-048 (OTIF) and US-052 (cycle time).

As a **Supervisor**, I want on-time shipment % by ship date against promise date, with a toggle to requested date so that I can see delivery performance.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-1; 01 §1.2
- **Priority:** Must · **Size:** S · **Batch:** B5
- **Depends on:** US-046, US-021
- **Acceptance criteria (Given/When/Then):**
  - Given shipments shipped in the period, when computed, then value = shipments with ship_date <= promise_date + tolerance days divided by shipments shipped x 100 (tolerance default 0).
  - Given the toggle set to requested date, when computed, then requested date replaces promise date.
  - Given a boundary case (ship date equal to promise date), when computed, then it counts as on time.
  - Given an empty period, when computed, then the result is null; given all on time, 100 %; given none on time, 0 %.
  - Given a cancelled shipment in the period, when computed, then it is not counted.
  - Given a shipment shipped but not yet Delivered, when computed, then it still counts (period by ship date).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-048 KPI-2 OTIF %

> **Release: V1-CORE (merged into US-047)**

As a **Supervisor**, I want on-time and in-full % per shipment so that short shipments do not look successful.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-2; 01 §1.4
- **Priority:** Must · **Size:** S · **Batch:** B5
- **Depends on:** US-047
- **Acceptance criteria (Given/When/Then):**
  - Given shipments shipped in the period, when computed, then value = shipments that are on time AND have every line qty_shipped >= qty_ordered divided by shipments shipped x 100.
  - Given a partial shipment (one line short) shipped on time, when computed, then it counts as on time but not OTIF.
  - Given an over-shipped line (qty shipped greater than ordered) on time, when computed, then it counts as in full.
  - Given empty period, cancelled shipments, and boundary date cases, when computed, then results follow the common rules.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-049 KPI-3 Packaging error rate

> **Release: V1-CORE** · Core depends on: US-046, US-019, US-027, US-029 · Host for the packaging KPIs: also builds US-050 (FPY) and US-051 (rework frequency).

As a **Quality technician**, I want packaging error rate with errors per 100 shipments and internal-vs-escape split so that I can see how often errors happen.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-3; 02 §2.2
- **Priority:** Must · **Size:** M · **Batch:** B5
- **Depends on:** US-046, US-027, US-033
- **Acceptance criteria (Given/When/Then):**
  - Given the period, when computed, then rate = distinct shipments with at least 1 packaging error divided by distinct shipments verified or shipped in the period x 100, each shipment counted once in the denominator.
  - Given a shipment with 3 errors, when computed, then it adds 1 to the numerator but 3 to errors per 100 shipments.
  - Given errors with detected stage Before ship vs After ship, when computed, then the result is split into internal catches and customer escapes.
  - Given an empty period or only cancelled shipments, when computed, then the result is null.
  - Given a hand-calculated fixture of 20 shipments with 3 shipments in error (4 errors, 1 escape), when computed, then rate is 15.0 %, errors per 100 is 20.0, and the split is 3 internal and 1 escape.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-050 KPI-4 Packaging first-pass yield

> **Release: V1-CORE (merged into US-049)**

As a **Quality technician**, I want FPY % = shipments passing first verification with no error so that hidden rework is visible.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-4; 02 §2.3
- **Priority:** Must · **Size:** S · **Batch:** B5
- **Depends on:** US-046, US-019, US-027
- **Acceptance criteria (Given/When/Then):**
  - Given shipments whose first verification attempt falls in the period, when computed, then FPY = shipments whose first attempt passed with no error divided by shipments verified x 100.
  - Given a shipment that failed first and passed second, when computed, then it counts as a first-pass failure.
  - Given a shipment that passed first but a customer error was logged later, when computed, then it is a failure only if the error is attributed to the shipment (see Q-08).
  - Given an empty period, when computed, then the result is null.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-051 KPI-5 Rework frequency and minutes

> **Release: V1-CORE (merged into US-049)** · Shown in the R3 report; its chart C5 is deferred (US-060).

As a **Supervisor**, I want rework events per 100 shipments plus total and average minutes so that rework effort is visible.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-5; 02 §2.3
- **Priority:** Must · **Size:** S · **Batch:** B5
- **Depends on:** US-046, US-029
- **Acceptance criteria (Given/When/Then):**
  - Given completed rework events with completed_at in the period, when computed, then frequency = rework events divided by shipments shipped x 100, total minutes = sum, average minutes = total divided by events.
  - Given rework events still in progress, when computed, then they are excluded.
  - Given no shipped shipments, when computed, then frequency is null; given no events, total is 0 and average is null.
  - Given a hand-calculated fixture (2 events of 30 and 60 minutes, 50 shipped), when computed, then frequency 4.0 %, total 90, average 45.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-052 KPI-6 Shipment cycle time

> **Release: V1-CORE (merged into US-047)**

As a **Supervisor**, I want median and P90 hours from first Ready to Pack to Shipped so that I can see how long shipping takes.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 6
- **Docs:** 05 KPI-6; 01 §1.5
- **Priority:** Must · **Size:** M · **Batch:** B5
- **Depends on:** US-046, US-016
- **Acceptance criteria (Given/When/Then):**
  - Given shipments shipped in the period, when computed, then each cycle = shipped_at minus first ready_to_pack_at in hours (from status history); report the median and the 90th percentile.
  - Given an even number of values, when computed, then the median is the mean of the middle two; the percentile method is documented and tested.
  - Given a shipment that went to Rework or On Hold, when computed, then elapsed wall-clock time including those periods is used.
  - Given a shipment lacking a Ready to Pack entry, when computed, then it is excluded and the exclusion count is reported.
  - Given an empty period, when computed, then the result is null.
  - Given a fixture of cycle times 10, 20, 30, 40 and 100 hours, when computed, then the median is 30 h.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-053 KPI-7 Inventory accuracy %

> **Release: V1-CORE** · Core depends on: US-046, US-044

As a **Supervisor**, I want hit-rate accuracy by ABC class from approved counts so that I can see how reliable our stock records are.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 4, 6
- **Docs:** 05 KPI-7; 03 §3.3
- **Priority:** Must · **Size:** M · **Batch:** B5
- **Depends on:** US-046, US-044
- **Acceptance criteria (Given/When/Then):**
  - Given approved counts with approved-at in the period, when computed, then accuracy = lines whose first counted quantity is within tolerance divided by lines counted x 100, with tolerance A 0 %, B +/-2 %, C +/-5 %.
  - Given a line out of tolerance on first count but within tolerance on recount, when computed, then it still counts as a miss (first-count rule, Q-10).
  - Given the same data, when computed by ABC class, then the result per class is available for chart C6.
  - Given counts not yet approved, when computed, then they are excluded.
  - Given a count line with system quantity 0 and counted quantity 0, when computed, then it is within tolerance; system 0 and counted > 0 is a miss.
  - Given an empty period, when computed, then the result is null.
  - Given a count approved with a variance, when the approval posts, then the next KPI-7 value reflects that count (supports acceptance criterion 4).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-054 Dashboard KPI tiles with target and previous period

> **Release: V1-CORE** · Core depends on: US-047, US-049, US-053, US-008 · Absorbs the date-range filter of US-055 (customer and carrier filters moved to deferred US-084). Additional criterion: the dashboard shows the fixed reporting date label from US-008 (acceptance criterion 11) and the "previous period" is the equal-length period before the reporting-date period. Tiles show text status.

As a **Viewer**, I want six KPI tiles showing value, target, change vs previous period and a text arrow so that I see at a glance whether we need to act.

- **Scope ref:** project-scope.md section 3 (item 3.4a); **Scope section 5 criteria:** 1, 9
- **Docs:** 07 §7.3; 08 §8.4 row 1; dashboard-charts
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-047, US-048, US-049, US-050, US-052, US-053, US-008
- **Acceptance criteria (Given/When/Then):**
  - Given the dashboard home, when it loads, then one row of six tiles is shown in order: On-Time Shipment %, OTIF %, Packaging Error Rate %, Packaging FPY %, Median Shipment Cycle Time (h), Inventory Accuracy %.
  - Given each tile, when rendered, then it shows current value, target, difference from previous period, and a direction arrow with a text label (Up, Down, Flat) plus a text status (Meets target / Misses target), never colour alone.
  - Given each tile, when hovered, focused or tapped, then a "How is this calculated?" definition from docs/05 is shown.
  - Given a null KPI value, when shown, then "No data" appears and no arrow.
  - Given a target changed by a Supervisor, when the dashboard reloads, then the tile uses the new target.
  - Given a seeded store, when the dashboard loads, then tile values equal the KPI module outputs for the same period (no separate calculation).
  - Given a shipment created, packed, verified with an error, reworked and shipped in one session, when the dashboard is reloaded, then affected tile values change as hand-calculated (supports acceptance criterion 1).
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-055 Dashboard filters: date range, customer, carrier

> **Release: V1-CORE (merged into US-054; date range only)** · The customer and carrier filter criteria below are **not** core: see deferred US-084.

As a **Viewer**, I want to filter the dashboard by date range, customer and carrier so that I can focus on one customer or period.

- **Scope ref:** project-scope.md section 3 (item 3.4c); **Scope section 5 criteria:** none
- **Docs:** 08 §8.4; 07 §7.3
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-054
- **Acceptance criteria (Given/When/Then):**
  - Given the dashboard, when the user picks a date range, customer or carrier, then tiles, charts and lists update to the filter and the filter is shown in the page and the URL.
  - Given the default state, when loaded, then the date range is the last 30 days, customer and carrier are All.
  - Given a start date after the end date, when applied, then it is rejected inline.
  - Given the inventory accuracy tile and chart C6, when a customer or carrier filter is set, then they ignore it and display a text note that the filter does not apply.
  - Given the filter, when cleared, then defaults return.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-056 C1 On-time shipment % by week vs target

> **Release: V1-CORE** · Core depends on: US-047, US-054 · Ignore any customer/carrier filter criterion (deferred).

As a **Supervisor**, I want a line chart of weekly on-time % with the target line so that I can see whether delivery is trending the right way.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 08 §8.4 C1; dashboard-charts
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-047, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given the filtered period, when the chart renders, then one point per ISO week shows KPI-1 for that week and a horizontal target line is drawn.
  - Given weeks with no data, when rendered, then they show a gap (no point), not 0.
  - Given the chart, when used with a keyboard or screen reader, then a title, axis labels and an equivalent data table or text summary are available.
  - Given a click on a point, when activated, then the shipment list opens filtered to that week's shipped shipments.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-057 C2 Shipments per day vs packaging error rate

> **Release: V1-CORE** · Core depends on: US-049, US-054 · Shows the seeded peak period; ignore any customer/carrier filter criterion (deferred).

As a **Supervisor**, I want bars for shipments per day with a line for error rate so that I can see whether errors rise with volume.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 08 §8.4 C2; 02 §2.6
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-049, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given the period, when rendered, then bars show shipments shipped per day and a line shows packaging error rate on a second labelled axis (weekly if daily rates have fewer than 5 shipments).
  - Given the seeded peak period, when viewed, then volume bars are visibly higher and the error line is higher than outside the peak.
  - Given accessibility rules, when rendered, then both series are distinguishable without colour alone (pattern or label) and a data table alternative exists.
  - Given a click on a bar, when activated, then the shipment list opens for that day.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-058 C3 Packaging errors by category (Pareto)

> **Release: V1-CORE** · Core depends on: US-032, US-054 (US-034 is now part of US-032) · Ignore any customer/carrier filter criterion (deferred).

As a **Quality technician**, I want sorted bars of errors by category with cumulative % so that I can focus on the vital few causes.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 08 §8.4 C3; 06 (Pareto)
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-034, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given the filtered period, when rendered, then categories are sorted by count descending with a cumulative percentage line ending at 100 %.
  - Given the seed, when viewed, then labels and paperwork are the two largest categories.
  - Given a fixture of 10 errors (5 label, 3 paperwork, 2 other), when rendered, then bars are 5, 3, 2 and cumulative 50 %, 80 %, 100 %.
  - Given a click on a bar, when activated, then the error list opens filtered to that category and period.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-059 C4 Late shipments by reason

> **Release: DEFERRED (v1.1)** · Reason: the core has three charts; late reasons are captured and visible on the shipment record.

As a **Supervisor**, I want a horizontal bar chart of late shipments by reason code so that I can see why we are late.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 08 §8.4 C4; 01 §1.7
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-022, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given the filtered period, when rendered, then each late reason has a horizontal bar of late shipments sorted descending, with count labels.
  - Given late shipments with a reason, when summed, then bar counts total the late shipments in the period.
  - Given a click on a bar, when activated, then the shipment list opens filtered to that reason and period.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-060 C5 Rework events and minutes by week

> **Release: DEFERRED (v1.1)** · Reason: rework figures are available in the R3 report; chart is a repeat of the C2/C3 pattern.

As a **Quality technician**, I want bars of rework events and minutes per week so that I can see whether rework effort is shrinking.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 08 §8.4 C5; 05 KPI-5
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-051, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given the filtered period, when rendered, then each week shows rework events and total rework minutes with clearly different labelled axes or paired charts.
  - Given in-progress rework, when rendered, then it is excluded.
  - Given a click on a bar, when activated, then the error list opens filtered to that week's rework.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-061 C6 Inventory accuracy by ABC class

> **Release: DEFERRED (v1.1)** · Reason: inventory accuracy is still shown as a KPI tile (US-053/US-054); the by-class chart is an extra. First candidate to bring back if time allows, because it gives the dashboard an inventory visual.

As a **Supervisor**, I want a bar chart of inventory accuracy per ABC class against target so that I can see where stock accuracy is weak.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** 4, 9
- **Docs:** 08 §8.4 C6; 03 §3.3
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-053, US-055
- **Acceptance criteria (Given/When/Then):**
  - Given approved counts in the period, when rendered, then there is one bar per class A, B, C with accuracy % and the target line.
  - Given the seed, when viewed, then class C is visibly worse than class A.
  - Given a class with no counted lines, when rendered, then it shows "No data".
  - Given a click on a bar, when activated, then the cycle count accuracy report (R6) opens for that class.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-062 Needs-attention lists

> **Release: DEFERRED (v1.1)** · Reason: the shipment list filters (overdue, late, On Hold) and the error list show the same items.

As a **Supervisor**, I want four lists on the dashboard of things needing action so that I know what to do next.

- **Scope ref:** project-scope.md section 3 (item 3.4b); **Scope section 5 criteria:** none
- **Docs:** 08 §8.4 row 4
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-025, US-017, US-032, US-044
- **Acceptance criteria (Given/When/Then):**
  - Given the dashboard, when it loads, then four lists appear: (1) shipments overdue or due in the next 3 days not yet Ready to Pack, (2) shipments On Hold with reason and owning department, (3) open packaging errors and overdue corrective actions, (4) cycle counts awaiting approval.
  - Given each list, when it has more than 5 items, then the top 5 show with a "View all" link to the filtered list.
  - Given a list with no items, when shown, then it says "Nothing needs attention".
  - Given a click on an item, when activated, then the record's detail page opens.
  - Given the lists, when the dashboard filters are applied, then lists 1 to 3 respect customer and carrier filters; list 4 does not and says so.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-063 Click-through from KPI tiles to records

> **Release: DEFERRED (v1.1)** · Reason: navigation convenience; lists and reports are reachable from the menu.

As a **Viewer**, I want tiles and chart elements to open the records behind them so that I can verify and act on the numbers.

- **Scope ref:** project-scope.md section 3 (item 3.4c); **Scope section 5 criteria:** none
- **Docs:** 07 §7.3 UX rule 2
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-054, US-024, US-034
- **Acceptance criteria (Given/When/Then):**
  - Given any KPI tile, when clicked, then the matching record list opens (shipments for tiles 1, 2, 5 and 6; errors for tiles 3 and 4; cycle count lines for tile 7) already filtered to the same period, customer and carrier.
  - Given the opened list, when counted, then the number of rows used in the numerator or denominator matches what the tile definition says (QA can reconcile the tile to the list).
  - Given keyboard-only use, when tabbing to a tile and pressing Enter, then it opens the list.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-064 KPI-8 Dock-to-stock time (optional)

> **Release: DEFERRED (v1.1)** · Reason: optional KPI (docs/05); not in the scope tile list.

As a **Receiving/inventory clerk**, I want to optionally record putaway time on a receipt and see mean dock-to-stock hours so that receiving speed can be monitored.

- **Scope ref:** project-scope.md section 3 (item 3.3b); **Scope section 5 criteria:** none
- **Docs:** 05 KPI-8; 08 §8.2 receipt putaway_at
- **Priority:** Could · **Size:** S · **Batch:** B6
- **Depends on:** US-035, US-046
- **Acceptance criteria (Given/When/Then):**
  - Given a receipt, when putaway time and location are entered later (not earlier than arrival), then they are saved and a rejected earlier time is refused inline.
  - Given receipts with putaway in the period, when KPI-8 is computed, then the result is the mean of putaway minus arrival in hours; receipts without putaway are excluded.
  - Given the KPI, when displayed, then it appears only in the KPI Summary report (R8) and not as a dashboard tile.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

### E5 Reports

_Reports R1-R8 with CSV export (scope 3.4; R7 Lot Trace is delivered in E3)._

#### US-065 Report framework and CSV export

> **Release: V1-CORE** · Core depends on: US-003, US-046, US-021, US-029, US-032, US-037 · Host for the core reports: also builds US-066 (R1), US-068 (R3) and US-069 (R4). R7 Lot Trace is US-045.

As a **Viewer**, I want report tables with filters and a CSV download so that I can use the data elsewhere.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** none
- **Docs:** 08 §8.5
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-003, US-046
- **Acceptance criteria (Given/When/Then):**
  - Given any report, when a user applies its filters and chooses Export CSV, then a file downloads whose header row and rows equal the on-screen table (same filters, same order).
  - Given text cells beginning with =, +, - or @, when exported, then they are escaped so spreadsheet software does not execute them.
  - Given the export, when opened, then it is UTF-8, comma-separated, dates are ISO format, and the file name includes report name and date.
  - Given an unauthenticated request for a CSV, when made, then it is rejected (401); every signed-in role can export reports they can view.
  - Given a report with no rows, when exported, then a CSV with only the header is returned.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-066 R1 Shipment Log

> **Release: V1-CORE (merged into US-065)**

As a **Viewer**, I want a log of all shipments in range with dates, carrier, tracking, status and on-time flag so that I can review shipping activity.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** none
- **Docs:** 08 §8.5 R1
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-021
- **Acceptance criteria (Given/When/Then):**
  - Given a date range (on ship date) and optional customer/carrier filters, when run, then each shipment shows number, customer, PO, promise date, ship date, carrier, tracking, status and an On time / Late text flag.
  - Given cancelled shipments, when the Include cancelled option is off (default), then they are hidden.
  - Given the row count, when compared with the dashboard drill-down for the same filters, then they match.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-067 R2 Late Shipment Report

> **Release: DEFERRED (v1.1)** · Reason: R1 can be filtered to late shipments (US-024 filter and R1 columns).

As a **Supervisor**, I want a report of late shipments with days late and reason so that I can discuss late causes at the weekly review.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** none
- **Docs:** 08 §8.5 R2
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-022
- **Acceptance criteria (Given/When/Then):**
  - Given a date range, when run, then only shipments with ship date after promise date are listed with days late (ship minus promise) and late reason.
  - Given a fixture shipment promised 10 Nov and shipped 13 Nov, when run, then days late shows 3.
  - Given totals, when shown, then a count by reason is displayed beneath the table.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-068 R3 Packaging Error and Rework Log

> **Release: V1-CORE (merged into US-065)**

As a **Quality technician**, I want a log of errors with category, severity, rework minutes and corrective action status so that quality can review errors and follow-up.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** none
- **Docs:** 08 §8.5 R3
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-029, US-032
- **Acceptance criteria (Given/When/Then):**
  - Given a date range, when run, then each error shows number, shipment, category, severity, detected stage, root-cause category, total rework minutes and corrective action status.
  - Given an error with no rework or corrective action, when shown, then those columns show "None" in text.
  - Given the totals row, when shown, then error count and total rework minutes equal the sums of the rows.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-069 R4 Inventory On-Hand

> **Release: V1-CORE (merged into US-065)**

As a **Receiving/inventory clerk**, I want an on-hand report by part, location and lot so that I can reconcile and export stock.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** 3
- **Docs:** 08 §8.5 R4
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-038
- **Acceptance criteria (Given/When/Then):**
  - Given filters part, location and lot, when run, then rows equal the on-hand derived from the ledger and match the on-hand screen.
  - Given the seed fixture of lot L2611-004, when run, then the per-location quantities equal the ledger sums.
  - Given the report, when exported, then zero-quantity rows are excluded unless the option is chosen.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-070 R5 Inventory Transaction History

> **Release: DEFERRED (v1.1)** · Reason: the core on-hand screen (US-037) lists the transactions behind a lot.

As a **Receiving/inventory clerk**, I want a transaction history filtered by part, lot, type and date so that I can see every movement.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** 3
- **Docs:** 08 §8.5 R5
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-037
- **Acceptance criteria (Given/When/Then):**
  - Given filters part, lot, transaction type and date range, when run, then matching ledger rows show date, type, part, location, lot, signed quantity, reference and user, newest first.
  - Given a running balance option, when selected for one part and lot, then the balance after each row is shown and ends at the current on-hand.
  - Given the report, when exported, then it equals the on-screen rows.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-071 R6 Cycle Count Accuracy

> **Release: DEFERRED (v1.1)** · Reason: accuracy % is on the dashboard tile; count detail is on the count screens.

As a **Supervisor**, I want a report of accuracy and variances per count and per ABC class so that I can see counting performance.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** 4
- **Docs:** 08 §8.5 R6
- **Priority:** Must · **Size:** S · **Batch:** B6
- **Depends on:** US-065, US-044, US-053
- **Acceptance criteria (Given/When/Then):**
  - Given approved counts in the range, when run, then per count and per ABC class it shows lines counted, lines in tolerance, accuracy % and absolute variance units.
  - Given the report accuracy for the same range, when compared with the KPI-7 tile, then the overall value is equal.
  - Given a count line, when its row is selected, then system quantity, counted, recount and variance are shown.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-072 R8 KPI Summary (printable)

> **Release: DEFERRED (v1.1)** · Reason: the dashboard already summarises the KPIs.

As a **Supervisor**, I want all KPIs for the period against target on one printable page so that I can bring it to the weekly review.

- **Scope ref:** project-scope.md section 3 (item 3.4d); **Scope section 5 criteria:** 1, 6
- **Docs:** 08 §8.5 R8
- **Priority:** Must · **Size:** M · **Batch:** B6
- **Depends on:** US-065, US-054, US-051
- **Acceptance criteria (Given/When/Then):**
  - Given a period, when run, then it lists KPI-1 to KPI-7 (and KPI-8 when data exists) with value, target, status text (Meets / Misses target), previous period value and sample size n.
  - Given the report, when printed or saved to PDF from the browser, then navigation is hidden, the table fits one page width and the period and generation date appear in the header.
  - Given the same period, when compared with the dashboard tiles, then the values are identical.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

### E6 Non-functional: security, accessibility, quality, deployment/demo

_Cross-cutting security, accessibility, responsiveness, tests, deployment and documentation (scope 3.5, 5, 6.7)._

#### US-073 CSRF and request forgery protection

> **Release: V1-CORE (merged into US-074)** · Mechanism per ADR-001 (Astro origin check plus synchronizer token).

As a **Admin**, I want state-changing requests to be refused unless they carry valid proof of origin so that a malicious page cannot act as a signed-in user.

- **Scope ref:** project-scope.md section 3 (item 3.5c); **Scope section 5 criteria:** 7
- **Docs:** 07 §7.2 checklist #4
- **Priority:** Must · **Size:** S · **Batch:** B7
- **Depends on:** US-003
- **Acceptance criteria (Given/When/Then):**
  - Given any create, update, approve or delete request, when sent without the valid anti-forgery proof (token or equivalent), then it is rejected (403 or 400) and nothing changes.
  - Given a form loaded by a signed-in user, when submitted normally, then it succeeds.
  - Given a token from another user's session, when used, then it is rejected.
- **Out of scope:** Mechanism is decided by ADR-001; the requirement is the outcome.

#### US-074 Server-side validation and safe data access

> **Release: V1-CORE** · Core depends on: US-003 · Absorbs US-073 (CSRF protection).

As a **Admin**, I want all input validated on the server and all data access parameterised so that injection and bad data are blocked.

- **Scope ref:** project-scope.md section 3 (item 3.5d); **Scope section 5 criteria:** none
- **Docs:** 07 §7.2 checklist #2, #3, #8
- **Priority:** Must · **Size:** M · **Batch:** B7
- **Depends on:** US-003
- **Acceptance criteria (Given/When/Then):**
  - Given any form field, when a value of the wrong type, out of range, too long, or not in the allowed list is sent directly to the server, then it is rejected with a field-level message and nothing is saved.
  - Given the payload ' OR 1=1 -- or <script>alert(1)</script> typed into text fields, when saved and displayed, then it is stored and shown as plain text with no query change or script execution.
  - Given a code review (Security Reviewer), when searching for string-built queries, then none exist.
  - Given a rejected request, when answered, then the message does not reveal stack traces or internals.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-075 Secrets, debug off and generic errors

> **Release: V1-CORE** · Core depends on: US-001 · Absorbs US-076 (pinned dependencies, audit). The repository is **public**: the secret scan must pass and no real data may be committed.

As a **Admin**, I want secrets read from environment variables, debug off by default, and generic error pages so that configuration is safe to publish.

- **Scope ref:** project-scope.md section 3 (item 3.5f); **Scope section 5 criteria:** none
- **Docs:** 07 §7.2 checklist #6, #10; netlify-deployment
- **Priority:** Must · **Size:** S · **Batch:** B7
- **Depends on:** US-001
- **Acceptance criteria (Given/When/Then):**
  - Given the repository and its history, when scanned (for example with the secret scanner), then no secret key, token or real credential is committed; an example environment file lists names only.
  - Given a missing required secret, when the app starts, then it fails fast with a clear message rather than using a default.
  - Given an unhandled error, when it occurs in the deployed mode, then the user sees a generic error page with no stack trace and a reference id, and the detail is logged.
  - Given the deployed mode, when started with defaults, then debug features are off.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-076 Pinned dependencies and vulnerability check

> **Release: V1-CORE (merged into US-075)** · Audit command per ADR-001: `npm audit --audit-level=high`.

As a **Admin**, I want dependencies pinned and checked for known vulnerabilities so that supply-chain risk is visible.

- **Scope ref:** project-scope.md section 3 (item 3.5f); **Scope section 5 criteria:** none
- **Docs:** 07 §7.2 checklist #7
- **Priority:** Should · **Size:** S · **Batch:** B7
- **Depends on:** US-075
- **Acceptance criteria (Given/When/Then):**
  - Given the dependency manifest, when inspected, then every dependency has an exact or locked version.
  - Given the documented audit command, when run, then its result is recorded in the hand-off and any high or critical finding is either fixed or listed with an owner.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-077 Accessibility: text status, contrast, keyboard

> **Release: V1-CORE** · Core depends on: US-014, US-054, US-056, US-024 · Absorbs US-078 (laptop and tablet). Applies to the three core charts (text/table alternative each) and the fixed reporting date label.

As a **Viewer**, I want status, charts and forms usable without colour or a mouse so that everyone can use the app.

- **Scope ref:** project-scope.md section 3 (item 3.4a, 3.4b); **Scope section 5 criteria:** 9
- **Docs:** 07 §7.3; accessibility-check
- **Priority:** Must · **Size:** M · **Batch:** B7
- **Depends on:** US-054, US-056, US-024
- **Acceptance criteria (Given/When/Then):**
  - Given any status, severity or KPI state, when rendered, then it is conveyed by text (and optionally icon) as well as colour.
  - Given each page, when checked with an automated accessibility scan, then there are no critical or serious WCAG 2.2 AA violations (contrast, labels, focus) and results are recorded.
  - Given every interactive element, when reached by keyboard only, then focus is visible and the order is logical; every form field has a programmatic label and errors are announced.
  - Given each chart, when assessed, then a text or table alternative exists.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-078 Usable on laptop and tablet

> **Release: V1-CORE (merged into US-077)** · Reports R2, R5, R6, R8 in the page list below are deferred; test the core pages only.

As a **Shipping associate**, I want pages to work on a laptop and a tablet so that I can use the app on the shop floor.

- **Scope ref:** project-scope.md section 3 (item 3.4c); **Scope section 5 criteria:** 9
- **Docs:** 07 §7.3 item 4
- **Priority:** Must · **Size:** M · **Batch:** B7
- **Depends on:** US-054, US-014
- **Acceptance criteria (Given/When/Then):**
  - Given widths 1280 px (laptop) and 768 px (tablet portrait), when each main page is opened (dashboard, shipment list, shipment form, Pack & Verify, Ship, error form, receipt form, cycle count entry, reports), then there is no horizontal page scroll and all controls are usable.
  - Given touch input on the tablet, when using buttons and checkboxes, then touch targets are at least 44 x 44 CSS px.
  - Given the dashboard on tablet, when viewed, then tiles wrap and charts resize without overlap.
- **Out of scope:** Phone layout, native app, offline mode (scope §4).

#### US-079 KPI unit tests with hand-calculated fixtures

> **Release: V1-CORE** · Core depends on: US-047, US-049, US-053 (covers KPI-1 to KPI-7 via the merged stories)

As a **QA tester**, I want passing automated tests for every KPI formula so that KPI math is provably right.

- **Scope ref:** project-scope.md section 3 (item 3.5g); **Scope section 5 criteria:** 6
- **Docs:** 05; kpi-definitions testing requirement; test-strategy
- **Priority:** Must · **Size:** M · **Batch:** B5
- **Depends on:** US-047, US-048, US-049, US-050, US-051, US-052, US-053
- **Acceptance criteria (Given/When/Then):**
  - Given each of KPI-1 to KPI-7, when the test suite is run, then there is at least one test with a hand-calculated expected value documented beside the fixture.
  - Given each KPI, when the suite is inspected, then it covers: empty period, all on time (or all pass), none on time, a cancelled shipment, a partial shipment (where relevant) and a boundary date.
  - Given the suite, when run with the documented command, then it passes and the command and result are recorded in the hand-off.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-080 Route and permission tests

> **Release: V1-CORE** · Core depends on: US-003, US-020, US-044, US-007, US-008 (US-004 and US-040 are deferred and removed) · Matrix-driven: every row of permissions-matrix.md and scenarios T-1 to T-14 must be tested.

As a **QA tester**, I want automated tests proving restricted actions return 403 for non-permitted roles so that access control is verified.

- **Scope ref:** project-scope.md section 3 (item 3.5g); **Scope section 5 criteria:** 7
- **Docs:** 07 §7.2; test-strategy
- **Priority:** Must · **Size:** M · **Batch:** B7
- **Depends on:** US-003, US-004, US-040, US-044, US-007, US-008
- **Acceptance criteria (Given/When/Then):**
  - Given the permission matrix, when the test suite runs, then every restricted action is tested with at least one permitted and one non-permitted role and the non-permitted role gets 403.
  - Given an unauthenticated client, when each protected route is requested, then it gets 401 or a redirect to login.
  - Given the suite, when run with the documented command, then it passes and the output is recorded.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

#### US-081 Deployed demo with persistent data

> **Release: V1-CORE** · Core depends on: US-011, US-075, US-083 · Absorbs US-082 (README). Additional criteria: (a) runs on the **Netlify Free plan**; credit usage is read after each production deploy and recorded, and no plan upgrade, add-on or automatic credit purchase is made without explicit user approval; (b) a deploy preview's data changes do not affect production; (c) the public site shows the DEMO banner and the fixed reporting date label; (d) the README lists the demo users and states the repository is public and fictional-only.

As a **presenter**, I want the demo reachable at a public web address with data that survives restarts and redeploys so that the class can try it without installing anything.

- **Scope ref:** project-scope.md section 3 (item 3.6a); **Scope section 5 criteria:** 8
- **Docs:** software-team.md; netlify-deployment; architecture-decision-records
- **Priority:** Must · **Size:** L · **Batch:** B7
- **Depends on:** US-011, US-075
- **Acceptance criteria (Given/When/Then):**
  - Given ADR-001 accepted and the scope change in Q-01 approved, when deployed, then the app is reachable at a public HTTPS address on the chosen host (Netlify) and the DEMO banner is shown.
  - Given a record created in the deployed demo, when the page is reloaded after a deploy or idle period, then the record is still there (persistent store).
  - Given the documented reset step, when run against the deployed demo, then the data store is rebuilt from the seed in one step and tests for the seeded numbers pass.
  - Given the deployment configuration, when reviewed, then no secret is committed and settings come from the host's environment variables.
  - Given the deployed demo, when QA runs the smoke checklist (login, dashboard, create shipment, ship, report), then all pass.
- **Out of scope:** Docker, multi-environment pipelines, custom domain (not required).

#### US-082 README, run steps and demo notes

> **Release: V1-CORE (merged into US-081)** · Local-first run steps (`nvm use && npm ci && npm run dev`, migrations, `npm run db:reset-seed`).

As a **developer or QA tester**, I want README instructions for running, testing, seeding and the deliberate omissions so that anyone can reproduce and judge the project.

- **Scope ref:** project-scope.md section 3 (item 3.5g); **Scope section 5 criteria:** 8
- **Docs:** 07 §7.2 note; definition-of-done
- **Priority:** Should · **Size:** S · **Batch:** B7
- **Depends on:** US-011, US-079
- **Acceptance criteria (Given/When/Then):**
  - Given a clean checkout, when a person follows the README, then they can install, seed, run and test using documented commands.
  - Given the README, when read, then it lists demo users and demo-only passwords, the fictional-data statement, and the explicitly deferred items (SSO, MFA, encryption at rest, penetration test, AS9100/ITAR/CMMC compliance).
  - Given the README, when read, then it states that the prototype is not a certified or production system.
- **Out of scope:** Anything listed in scope section 4 (deferred to v2).

### New stories added in T-004 (user decisions of 2026-11-25)

#### US-083 Walking skeleton and proof of concept on Netlify

> **Release: V1-CORE** · Core depends on: none (this is gate G0) · Epic E6 · Batch B0 · Priority: Must · Size: L · Scope ref: project-scope.md sections 3.7, 5 (criteria 8, 10), 6 step 0 · Absorbs US-009 (DEMO banner)

As a **developer or QA tester**, I want a minimal deployed app (login page, DEMO banner, one saved record) built on the chosen stack so that the stack, persistence and the Free-plan budget are proven before any feature is built.

- **Docs:** ADR-001 sections 5, 10, 12 and 12.1; netlify-deployment
- **Acceptance criteria (Given/When/Then):**
  - Given a clean checkout, when the documented local steps are followed (install, apply migration, seed, run), then the app runs locally against local Postgres with no paid service and no login to Netlify needed for local development.
  - Given the first deploy to the Netlify Free plan, when a test record is saved and the site is redeployed, then the record is still present (persistence across redeploys and cold starts).
  - Given a deploy preview, when its data is changed, then production data is unchanged.
  - Given the seed run on the deployed database, when timed, then it finishes within the platform's synchronous limit, or the fallback in ADR-001 R4 is chosen and recorded.
  - Given any page including login and error pages, when it renders, then the text "DEMO - FICTIONAL DATA" and the deploy context (production or preview) are visible without scrolling at laptop and tablet width, as real text.
  - Given the continuous-integration run, when it executes, then type check, lint, unit tests and the first end-to-end test pass.
  - Given the spike is complete, when credit usage is read from the Netlify account, then it is recorded in the hand-off with a projection for the term; no upgrade, add-on or credit purchase has been made.
  - Given any ADR-001 assumption marked [A] fails (for example cold-start latency, emulator in CI), when found, then the hand-off reports **BLOCKED** and asks the user before using any fallback (fallbacks need explicit approval).
- **Out of scope:** Any feature story; custom domain; paid plans.

#### US-084 Dashboard customer and carrier filters

> **Release: DEFERRED (v1.1)** · Epic E4 · Split from US-055 · Priority: Should · Size: M · Scope ref: project-scope.md section 3.8

As a **Supervisor**, I want to filter the dashboard by customer and carrier so that I can see performance for one account or one carrier.

- **Acceptance criteria (Given/When/Then):**
  - Given a customer or carrier selected, when the dashboard loads, then shipment KPIs, tiles and charts C1 to C3 apply the filter and the active filters are shown in text.
  - Given the inventory accuracy tile, when a customer or carrier filter is active, then the tile ignores the filter and says so in text (Q-16).
- **Out of scope:** Anything beyond the date, customer and carrier filters.

## 5. Dependency summary (scope section 6 build order)

### 5.1 Core build order (authoritative)

**Gate G0:** ADR-001 conditionally accepted (done, 2026-11-25) **and** US-083 (proof of concept) passed. If the proof of concept fails, stop and ask the user; no fallback without approval.

| Batch | V1-CORE cards (in build order) | Needs first |
|-------|--------------------------------|-------------|
| B0 Walking skeleton and proof of concept | US-083 | G0 |
| B1 Auth, roles, audit, lookups, targets and reporting date, seed framework | US-001, US-003, US-005, US-007, US-008, US-011 | US-083 |
| B2 Shipments (F1-F3), status history, list and detail | US-014, US-016, US-019, US-020, US-021, US-024 | US-003, US-007 |
| B3 Packaging errors, rework, corrective actions, ship gate (F4-F6) | US-027, US-029, US-030, US-032 | US-016, US-019, US-021 |
| B4 Inventory: receipts, ledger, ship posts to ledger, counts, lot trace (F7-F9) | US-037, US-035, US-041, US-043, US-044, US-045 | US-003, US-005, US-007, US-021 |
| B5 KPI module and tests | US-046, US-047, US-049, US-053, US-079 | US-016, US-019, US-021, US-027, US-029, US-044 |
| B6 Full seed, dashboard, three charts, reports | US-012, US-013, US-054, US-056, US-057, US-058, US-065 | B2 to B5 |
| B7 Hardening: security, accessibility, permission tests, deployed demo, README | US-074, US-075, US-077, US-080, US-081 | US-001, US-003, B2 to B6 |

Dependency check done in T-004: no V1-CORE card depends on a deferred story. Removed dependencies: US-004 and US-040 (from US-080 and US-044), US-028 (from US-030), US-022, US-031, US-034, US-038, US-042, US-048, US-050 to US-052, US-055, US-066, US-068, US-069, US-073, US-076, US-078, US-082 (now inside their hosts). Critical path: US-083, auth, roles, lookups, shipment create, status, verify, ship, error, rework, ship gate, ledger, receive, ship posts to ledger, KPI module, tiles, charts, full seed, hardening, deploy.

### 5.2 Original dependency summary (T-001; superseded by 5.1)

**Gate G0:** ADR-001 (stack, persistence, hosting) must be Accepted by Marcus, with Theo and Sasha consulted, before any story below is implemented. Q-01 must be settled with the user at the same time.

| Batch | Stories (in build order) | Needs first |
|-------|-------------------------|-------------|
| B1 Schema, seed framework, auth and roles | US-001, US-002, US-003, US-004, US-005, US-007, US-008, US-009, US-011 | G0 only |
| B2 Shipments (F1-F3) and status history | US-014, US-015, US-016, US-017, US-018, US-019, US-020, US-021, US-022, US-023, US-024, US-025 | US-003, US-007 |
| B3 Packaging errors, rework, corrective actions (F4-F6) | US-027, US-028, US-029, US-030, US-031, US-032, US-033, US-034 | US-007, US-016, US-019, US-021 |
| B4 Inventory: receipts, ledger, on-hand, counts (F7-F9) | US-035, US-036, US-037, US-038, US-039, US-040, US-041, US-042, US-043, US-044, US-045 | US-003, US-005, US-007, US-021 |
| B5 KPI service and tests | US-046, US-047, US-048, US-049, US-050, US-051, US-052, US-053, US-079 | US-016, US-019, US-021, US-027, US-029, US-033, US-044 |
| B6 Dashboard, charts and reports (plus late seed data) | US-006, US-010, US-012, US-013, US-026, US-054, US-055, US-056, US-057, US-058, US-059, US-060, US-061, US-062, US-063, US-064, US-065, US-066, US-067, US-068, US-069, US-070, US-071, US-072 | US-003, US-005, US-008, US-011, US-016, US-017, US-021, US-022, US-024, US-025, US-027, US-029, US-031, US-032, US-034, US-035, US-037, US-038, US-041, US-044, US-045, US-046, US-047, US-048, US-049, US-050, US-051, US-052, US-053 |
| B7 Hardening: security, accessibility, deployment, README and demo script | US-073, US-074, US-075, US-076, US-077, US-078, US-080, US-081, US-082 | US-001, US-003, US-004, US-007, US-008, US-011, US-014, US-024, US-040, US-044, US-054, US-056, US-079 |

Notes on ordering:
- Cross-batch loops from the scope order are broken as follows: US-028 *Failed verification opens a pre-filled error* (B3) joins the verify story (US-019, B2) to the error story (US-027, B3); US-041 *Shipping consumes inventory* (B4) adds the ledger posting to the ship step (B2); the seed of shipments and inventory (B6) waits until all entities exist, while the seed framework and reference data stay in B1.
- Sequencing inside B1: authentication, then roles and audit, then lookups and targets, then the seed framework.
- Critical path: Auth, Roles, Lookups, Shipment create, Status, Verify, Ship, Error, Rework, Ship gate, Ledger, Receive, Ship posts to ledger, KPI module and KPIs, Tiles, Charts, Seed, Hardening, Deploy.
- Could and Should stories sit at the end of their epic and nothing Must depends on a Could story.

## 6. Counts summary

### 6.1 By release and epic (T-004, authoritative)

| Epic | V1-CORE cards | Merged into a core card | Deferred (v1.1) | Total |
|------|--------------:|------------------------:|----------------:|------:|
| E0 Foundation | 8 | 3 | 2 | 13 |
| E1 Shipments | 6 | 5 | 2 | 13 |
| E2 Packaging quality and rework | 4 | 3 | 1 | 8 |
| E3 Inventory | 6 | 3 | 2 | 11 |
| E4 KPIs and dashboard | 8 | 5 | 7 | 20 |
| E5 Reports | 1 | 3 | 4 | 8 |
| E6 Non-functional | 7 | 4 | 0 | 11 |
| **Total** | **40** | **26** | **18** | **84** |

V1-CORE cards: US-001, 003, 005, 007, 008, 011, 012, 013 (E0); 014, 016, 019, 020, 021, 024 (E1); 027, 029, 030, 032 (E2); 035, 037, 041, 043, 044, 045 (E3); 046, 047, 049, 053, 054, 056, 057, 058 (E4); 065 (E5); 074, 075, 077, 079, 080, 081, 083 (E6).
Merged (26): US-002, 006, 009, 015, 017, 018, 022, 023, 031, 033, 034, 038, 039, 042, 048, 050, 051, 052, 055, 066, 068, 069, 073, 076, 078, 082.
Deferred (18): US-004, 010, 025, 026, 028, 036, 040, 059, 060, 061, 062, 063, 064, 084, 067, 070, 071, 072.
Stories counted in the first draft: 82 (76 Must); new in T-004: US-083 (core) and US-084 (deferred).

### 6.2 Original counts (T-001; superseded)

| Epic | Must | Should | Could | Total |
|------|-----:|-------:|------:|------:|
| E0 Foundation | 11 | 2 | 0 | 13 |
| E1 Shipments | 12 | 0 | 1 | 13 |
| E2 Packaging quality and rework | 8 | 0 | 0 | 8 |
| E3 Inventory | 11 | 0 | 0 | 11 |
| E4 KPIs and dashboard | 18 | 0 | 1 | 19 |
| E5 Reports | 8 | 0 | 0 | 8 |
| E6 Non-functional | 8 | 2 | 0 | 10 |
| **Total** | **76** | **4** | **2** | **82** |

Sizes: S = 38, M = 38, L = 6.

## 7. Traceability matrix

### 7.1 Scope section 3 items to stories

| Item | Scope section 3 text | Stories |
|------|----------------------|---------|
| 3.1a | Create/edit shipments with header and lines | US-014, US-015 |
| 3.1b | Status lifecycle (incl. On Hold, Rework, Cancelled, Delivered) with status history | US-016, US-017, US-018, US-026 |
| 3.1c | Pack & Verify checklist, enforced, verifier differs from packer | US-019, US-020, US-028, US-030 |
| 3.1d | Ship step: date, carrier, tracking, packages, weight, late reason | US-021, US-022 |
| 3.1e | Document checklist flags | US-023 |
| 3.1f | Shipment list with search/filters; overdue and due-soon views | US-018, US-024, US-025 |
| 3.2a | Packaging error form (categories, severity, detection point, before/after ship) | US-027, US-028, US-030, US-033, US-034 |
| 3.2b | Rework events with action and minutes | US-029, US-030 |
| 3.2c | Root cause (6M), 5 Whys note, corrective action with owner/due/status | US-031, US-032, US-034 |
| 3.3a | Parts, locations (incl. Hold), suppliers | US-007 |
| 3.3b | Receiving form with lot and inspection status | US-035, US-036, US-064 |
| 3.3c | Append-only inventory ledger (receipt, ship, transfer, production complete, scrap, supervisor-approved adjust) | US-035, US-037, US-039, US-040, US-041 |
| 3.3d | On-hand by part/location/lot (derived) | US-038, US-041 |
| 3.3e | Blind cycle count with ABC tolerance and supervisor approval | US-042, US-043, US-044 |
| 3.3f | Lot trace report (backward and forward) | US-045 |
| 3.4a | KPI tiles (6) vs target and previous period | US-008, US-046, US-047, US-048, US-049, US-050, US-052, US-053, US-054, US-077 |
| 3.4b | Charts C1-C6 and needs-attention lists | US-051, US-056, US-057, US-058, US-059, US-060, US-061, US-062, US-077 |
| 3.4c | Filters (date range, customer, carrier) and click-through to records | US-055, US-063, US-078 |
| 3.4d | Reports R1-R8 with CSV export | US-045, US-065, US-066, US-067, US-068, US-069, US-070, US-071, US-072 |
| 3.5a | Login and role-based permissions enforced server-side | US-001, US-003, US-004 |
| 3.5b | Hashed passwords | US-002 |
| 3.5c | CSRF protection | US-073 |
| 3.5d | Parameterized queries and input validation | US-074 |
| 3.5e | Audit log | US-005, US-006, US-010 |
| 3.5f | Secrets via environment variables | US-075, US-076 |
| 3.5g | Unit tests for every KPI formula; route tests for permissions | US-046, US-079, US-080, US-082 |
| 3.6a | Deterministic seed script (fixed random seed) | US-011, US-081 |
| 3.6b | Fictional sample data: cast, volumes, peak period, banner | US-009, US-012, US-013 |

Every story carries at least one section 3 item; the Could/optional items (delivered date, dock-to-stock) trace to 3.1b and 3.3b. Foundation stories without a direct bullet trace to 3.5 or 3.6.

### 7.0 Update for T-004

Scope section 3 was rewritten as the "v1 core"; section 3 item letters in 7.1 keep their meaning, with these changes: 3.1b no longer includes Delivered (deferred US-026); 3.1f no longer includes overdue/due-soon views (US-025 deferred; the list "Overdue" filter is in US-024); 3.3a-c: US-036 and US-040 deferred; 3.4a/b: charts C4 to C6 and needs-attention lists deferred; 3.4c: only the date range filter (US-084 deferred); 3.4d: reports R2, R5, R6, R8 deferred; 3.5a: US-004 deferred; 3.5e: US-010 deferred. New items: **3.4e fixed reporting date** (US-008, US-054), **3.7 hosting and deployment** (US-083, US-081), **3.6c demo users and Admin reset** (US-011). Items covered only by deferred stories are listed in scope section 3.8. Every core item still has at least one V1-CORE story.

### 7.2 Scope section 5 acceptance criteria to stories (T-004, authoritative; 11 criteria)

| AC | Criterion (project-scope.md section 5) | Stories (primary evidence first) |
|----|----------------------------------------|----------------------------------|
| 1 | Create, pack (A), verify (B), log error, rework, ship; dashboard KPIs change | US-054, US-030, US-014, US-016, US-019, US-021, US-027, US-029, US-046, US-047, US-049 |
| 2 | Failed verification cannot reach Shipped without error, rework and re-verification | US-030, US-019, US-021, US-027, US-029 |
| 3 | Verifier is not the packer (server-enforced); other roles can verify | US-020, US-019, US-011 (two Shipping demo users), US-080 |
| 4 | Receipt creates inventory; shipment consumes it; on-hand per lot; lot trace | US-041, US-035, US-037, US-045, US-013 |
| 5 | Count variance gives approved adjustment and updates accuracy % | US-044, US-043, US-053, US-054 |
| 6 | KPI-1 to KPI-7 unit tests with hand-calculated fixtures | US-079, US-046, US-047, US-049, US-053 |
| 7 | Non-permitted roles get 403, unauthenticated get 401 (tested) | US-003, US-080, US-001, US-074 |
| 8 | One command reset-seed locally; Admin reset on the deployed site | US-011, US-012, US-013, US-081 |
| 9 | Usable on laptop and tablet; text status; accessibility scan | US-077, US-054, US-056, US-057, US-058 |
| 10 | Runs on Netlify; records persist; previews isolated | US-083, US-081 |
| 11 | Fixed reporting date labelled; non-empty KPIs and charts on any real date | US-008, US-054, US-012, US-013 |

### 7.3 Original acceptance criteria mapping (T-001; superseded by 7.2)

| AC | Criterion | Stories (primary evidence first) |
|----|-----------|----------------------------------|
| 1 | Create shipment, pack/verify, log error, rework, ship; dashboard KPIs change | US-054, US-030, US-014, US-015, US-016, US-019, US-021, US-027, US-028, US-029, US-046, US-047, US-048, US-049, US-050, US-051, US-052, US-072 |
| 2 | Failed verification cannot reach Shipped without logged error and rework | US-030, US-019, US-020, US-021, US-028, US-029 |
| 3 | Receipt creates inventory; shipment consumes it; on-hand per lot correct | US-041, US-013, US-035, US-036, US-037, US-038, US-039, US-069, US-070 |
| 4 | Cycle count variance gives approved adjustment and updates accuracy % | US-044, US-040, US-042, US-043, US-053, US-061, US-071 |
| 5 | Lot trace shows supplier receipt to customer shipment for a seeded lot | US-045, US-013, US-035 |
| 6 | All KPI formulas have passing unit tests with hand-calculated fixtures | US-079, US-046, US-047, US-048, US-049, US-050, US-051, US-052, US-053, US-072 |
| 7 | Non-permitted roles get HTTP 403 on restricted actions (tested) | US-003, US-080, US-001, US-004, US-073 |
| 8 | Seed script rebuilds the demo database from scratch in one command | US-011, US-012, US-013, US-081, US-082 |
| 9 | Usable on laptop and tablet; status conveyed with text, not colour alone | US-077, US-078, US-054, US-056, US-057, US-058, US-059, US-060, US-061 |

Primary evidence stories end-to-end: AC1 is verified by one scripted walk-through (create, pack/verify with a failure, log error, rework, re-verify, ship, then reload the dashboard) specified in the tiles story; AC2 by the ship gate story; AC3 by the ship-consumes-inventory story with a receipt fixture; AC4 by the count approval story; AC5 by the lot trace story on a seeded lot; AC6 by the KPI test story; AC7 by the role and permission test stories; AC8 by the seed command and deployment reset; AC9 by the accessibility and responsive stories.

## 8. Deferred to v1.1 and to v2

### 8.1 Deferred to v1.1 / later (in this backlog, labelled `Release: DEFERRED (v1.1)`)

US-004 Manage users and roles · US-010 Archive · US-025 Overdue/due-soon views · US-026 Delivered date · US-028 Pre-filled error from failed verification · US-036 Release/reject held material · US-040 Manual adjustment · US-059 C4 · US-060 C5 · US-061 C6 · US-062 Needs-attention lists · US-063 Click-through · US-064 KPI-8 · US-067 R2 · US-070 R5 · US-071 R6 · US-072 R8 · US-084 Customer and carrier filters. Reasons are on each story and in project-scope.md section 3.8.

### 8.2 Deferred to v2 (scope section 4, not in this backlog)

- Carrier API / real-time tracking; delivered-date import (manual optional delivered date is US-026 only)
- EDI 856 ASN; ERP integration
- Barcode/scanner verification; label printing
- Generating packing slips, BOLs, C of C
- Serial-number traceability; multi-level genealogy
- Full CAPA / 8D; MRB disposition workflow
- Packaging instruction authoring with photos / document control
- Purchasing, production scheduling, MRP
- Multi-site, multi-company, multi-currency, costing and valuation
- SSO, MFA, fine-grained permissions, encryption at rest, formal security testing
- Mobile app, offline mode, email/SMS alerts
- Advanced analytics (SPC, forecasting, staffing)
- Packer experience / training records; labor productivity
- Docker deployment, multiple long-lived environments, custom domain, paid hosting tiers (PostgreSQL and Netlify hosting are now **in** v1, see Q-01 resolution)
- Regulatory compliance claims (AS9100, ITAR, CMMC)

## 9. Scope questions and conflicts

Priya does **not** edit `docs/project-scope.md`. Proposed resolutions below follow the scope-change procedure (reason, user approval via Olivia, then edit with a changelog line). Items marked **Blocking** need an answer before the stories listed can be built.

### Q-01
- **Issue:** Hosting and persistence: scope section 4 defers PostgreSQL, Docker and cloud hosting ("SQLite + local run is enough"), but the user now requires a Netlify deployment. Docs 07 section 7.1 also names Flask, SQLite and Chart.js, and SQLite files do not persist inside Netlify Functions.
- **Where:** project-scope §4 last-but-one row; §3.5; docs/07 §7.1; software-team.md
- **Proposed resolution:** Scope change (needs user approval): (a) amend the §4 row to defer only Docker and self-managed hosting, keeping local run supported; (b) add to §3 a bullet "Demo deployment on Netlify with a persistent managed data store"; (c) add acceptance criterion 10 "the demo is reachable at a public HTTPS address and data persists across redeploys" (covered now by US-081); (d) mark docs/07 §7.1 stack as superseded by ADR-001; (e) add a changelog line. ADR-001 decides the store; stories stay neutral.
- **Decision / blocking:** **RESOLVED 2026-11-25 by user decisions 1 and 2:** ADR-001 conditionally accepted (Astro, TypeScript, Chart.js, Netlify Database/Postgres), PostgreSQL and Netlify hosting moved into v1, Flask/SQLite superseded. Scope edited (project-scope.md section 3.7, section 4, section 5 criteria 8 and 10, changelog). Remaining condition: proof of concept US-083.

### Q-02
- **Issue:** Delivered date is optional: scope 3.1 lists "(Delivered)" in parentheses, research treats it as optional, and v1 KPIs use ship date.
- **Where:** scope §3.1, §4; docs/01 §1.2; docs/05 KPI-1
- **Proposed resolution:** Keep a Could story (US-026) for manual entry; no KPI depends on it; Delivered never blocks any flow.
- **Decision / blocking:** Non-blocking.

### Q-03
- **Issue:** Dock-to-stock is optional: scope does not list KPI-8; docs/05 marks it optional.
- **Where:** docs/05 KPI-8; scope §3.4
- **Proposed resolution:** Keep as Could (US-064), shown only in R8, not as a tile; dropped first if time is short.
- **Decision / blocking:** Non-blocking.

### Q-04
- **Issue:** Scope section 5 criterion 6 says "all six KPI formulas", but docs/05 defines seven v1 KPIs plus optional KPI-8, and the six dashboard tiles omit rework frequency (needed by chart C5 and R3/R8).
- **Where:** scope §3.4, §5.6; docs/05 §5.3; kpi-definitions
- **Proposed resolution:** Interpret criterion 6 as KPI-1 to KPI-7 (the six tile KPIs plus rework); KPI-8 tested only if built. US-079 reflects this.
- **Decision / blocking:** Confirm with user at next scope edit. Non-blocking.

### Q-05
- **Issue:** Seed users: scope 3.6 says six users, one per role, but verification must be done by someone other than the packer; with a single Shipping user the demo flow (AC1) cannot pass verification without a second person.
- **Where:** scope §3.1, §3.6; docs/02 §2.4
- **Proposed resolution:** Allow Shipping, Quality and Supervisor to verify (US-020); the demo storyline has Demo Shipper pack and Demo Quality or Demo Supervisor verify. Alternative: add a seventh user (second Shipping user). Prefer no scope change.
- **Decision / blocking:** **RESOLVED 2026-11-25 by user decision 5:** Shipping, Quality and Supervisor may verify; the verifier must differ from the packer (server-enforced); the seed has at least two Shipping users plus Quality and Supervisor (seven demo users incl. optional Viewer, see permissions-matrix.md section 4). Scope section 2, 3.6 and 5 criterion 3 updated.

### Q-06
- **Issue:** Seed volume versus inventory: about 300 shipments but only about 150 receipts; shipping must not drive stock negative.
- **Where:** scope §3.6; US-041
- **Proposed resolution:** Seed generator sizes receipt quantities (and adds production-complete transactions) so every shipped lot has enough on-hand at ship time; receipts count stays about 150. Ship blocks on insufficient lot stock in the live app.
- **Decision / blocking:** Owner: Dana. Non-blocking for B1-B3.

### Q-07
- **Issue:** Default "last 30 days" period versus a seed that ends on a fixed date: viewed weeks later, the default dashboard (and the deployed demo) would be empty.
- **Where:** docs/05 §5.2; kpi-definitions; scope §3.6
- **Proposed resolution:** Seed anchors on a fixed "as of" date (2026-11-25); add a setting `demo_as_of_date` the dashboard treats as today when set. Today's real date otherwise. Needs a small story if accepted.
- **Decision / blocking:** Decide with user; Owner: Kenji and Dana. Non-blocking until B6.

### Q-08
- **Issue:** KPI period attribution: KPI-3 says "verified or shipped" and "verification/ship date"; customer escapes are found after the period; FPY uses first verification date.
- **Where:** docs/05 KPI-3/4; kpi-definitions
- **Proposed resolution:** Use first-verification date for KPI-3 and KPI-4 denominators (each shipment once); an After ship error counts against the shipment's own period regardless of when found, so values can change slightly after the fact. Documented in US-049 and US-050.
- **Decision / blocking:** Confirm with Kenji; propose a one-line clarification in docs/05.

### Q-09
- **Issue:** Cycle time: start is first Ready to Pack, but holds and rework add time; hours are wall clock or working hours?
- **Where:** docs/05 KPI-6; docs/01 §1.5
- **Proposed resolution:** Wall-clock hours including holds and rework; first Ready to Pack timestamp. Shipments missing it are excluded and counted.
- **Decision / blocking:** Confirm with Kenji. Non-blocking.

### Q-10
- **Issue:** Inventory accuracy: counted on first count or after recount? docs/03 says out-of-tolerance lines need a recount, which could otherwise hide errors.
- **Where:** docs/03 §3.3-3.4; docs/05 KPI-7
- **Proposed resolution:** First-count hit-rate (recount only determines the adjustment quantity). US-053.
- **Decision / blocking:** Confirm with user or Dana. Non-blocking.

### Q-11
- **Issue:** Role permissions: docs/07 §7.2 lists capabilities per role but not whether Supervisor inherits Shipping/Receiving/Quality rights, who may put a shipment On Hold, or who may verify.
- **Where:** docs/07 §7.2; docs/04 §4.2
- **Proposed resolution:** Use the matrix in section 1: Supervisor is a superset except user management; Admin manages users and the audit log and can view everything; Quality may verify and hold/release. Marked [A].
- **Decision / blocking:** Confirm; Owner: Priya with Sasha. Blocking for US-003 and US-080.

### Q-12
- **Issue:** Verifier differs from packer: scope says enforced, docs/02 says configurable.
- **Where:** scope §3.1; docs/02 §2.4
- **Proposed resolution:** Always enforced in v1 (no setting); a switch is a v2 candidate.
- **Decision / blocking:** Non-blocking.

### Q-13
- **Issue:** Partial shipments: scope §7 says partial shipments are separate shipments, yet OTIF needs qty_shipped below qty_ordered on a shipment.
- **Where:** scope §7; docs/01 §1.4; docs/05 KPI-2
- **Proposed resolution:** Allow a line to ship short with a required note (OTIF fails); the remainder is a new shipment created manually. No automatic backorder (v2).
- **Decision / blocking:** Confirm. Non-blocking.

### Q-14
- **Issue:** Paperwork-only fixes: SH-1042 storyline needs a packing slip wrong in revision; v1 has flags only, no document content.
- **Where:** docs/06 §6.3; scope §3.1, §4
- **Proposed resolution:** Seed stores the discrepancy in the error description and rework action "Reprint paperwork"; no document generation.
- **Decision / blocking:** Non-blocking.

### Q-15
- **Issue:** Needs-attention list 2 shows "owner dept" for holds, but docs/08 has only hold_reason_id on shipment.
- **Where:** docs/08 §8.2, §8.4
- **Proposed resolution:** Give hold reason codes an owning-department attribute (Shipping, Quality, Production, Customer) on the reason_code lookup; US-017 and the lists use it.
- **Decision / blocking:** Owner: Dana. Non-blocking until B2.

### Q-16
- **Issue:** Dashboard filters (customer, carrier) do not apply to inventory accuracy, C6 or cycle-count approvals.
- **Where:** scope §3.4; docs/08 §8.4
- **Proposed resolution:** Those widgets ignore the filters and say so in text (US-055).
- **Decision / blocking:** Non-blocking.

### Q-17
- **Issue:** Ledger transaction types: docs/03 and docs/08 include ISSUE (to production), scope §3.3 does not.
- **Where:** docs/03 §3.2; docs/08 §8.2; scope §3.3
- **Proposed resolution:** Omit ISSUE in v1; the six types in the scope list only. Use PRODUCTION_COMPLETE for finished goods.
- **Decision / blocking:** Owner: Dana. Non-blocking.

### Q-18
- **Issue:** After-ship (customer-found) errors: docs/01 diagram suggests Shipped can reopen as Rework; scope 3.1 does not say.
- **Where:** docs/01 §1.5; docs/02 §2.2
- **Proposed resolution:** Customer escapes are logged against the shipped shipment with no status change; corrective action tracks the fix. A replacement shipment is a normal new shipment.
- **Decision / blocking:** Non-blocking.

### Q-19
- **Issue:** Public deployment security: a public demo with documented demo passwords and write access can be abused; scope accepts a minimal security posture but this is new exposure.
- **Where:** scope §3.5, §4; docs/07 §7.2 #5
- **Proposed resolution:** Show demo-only passwords on the login page, keep the banner, provide a one-step reset (US-081), and ask Sasha to review the hosting configuration. Optional host-level access control if available.
- **Decision / blocking:** Owner: Sasha and Theo.

### Q-20
- **Issue:** Time zone: UTC storage is proposed, display zone for the fictional Riverton plant is unspecified.
- **Where:** docs/07 §7.4
- **Proposed resolution:** Display in a single configurable demo time zone, defaulting to UTC; ship date is a calendar date, other times are timestamps.
- **Decision / blocking:** Non-blocking.

## 10. Revision log

| Date | Change | By |
|------|--------|----|
| 2026-11-25 | First draft of v1 backlog (T-001) | Priya |
