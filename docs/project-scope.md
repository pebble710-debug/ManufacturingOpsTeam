# Project Scope — Version 1

**Date:** 2026-11-25 · **Project:** Manufacturing Shipping & Inventory Operations Dashboard
(educational prototype, graduate AI class) · **Builders:** a team of AI software agents (Claude Code)

> All companies, customers, suppliers, carriers, part numbers, people and records are
> **fictional**. No confidential employer information, real customer data or proprietary
> specifications are used. This is **not** a production or certified aerospace system.

## 1. Goal

Deliver a working web app that lets a small fictional manufacturer record outbound shipments,
log packaging errors and rework, keep basic lot-traceable inventory records, and see its
shipping and inventory performance on one dashboard — demonstrated with realistic fictional data.

## 2. Users (v1)

Shipping associate · Receiving/inventory clerk · Quality technician · Supervisor · Viewer · Admin
(roles detailed in [07-software-design.md](07-software-design.md) §7.2).

## 3. In scope for v1

### 3.1 Shipment entry and tracking
- Create/edit shipments with header (customer, PO, order/requested/promise dates) and lines
  (part, revision, qty ordered, lot).
- Status lifecycle: Planned → Ready to Pack → Packing → Verified → Shipped → (Delivered), plus
  On Hold, Rework, Cancelled — with status history.
- Pack & Verify checklist (enforced; verifier ≠ packer).
- Ship step: ship date, carrier (lookup), tracking number, packages, weight; late reason when late.
- Document checklist flags (packing slip, BOL, C of C, labels).
- Shipment list with search/filters; overdue and due-soon views.

### 3.2 Packaging error and rework logging
- Packaging error form with fixed categories, severity, detection point, before/after-ship flag.
- Rework events with action and minutes.
- Root-cause category (6 M), 5 Whys note, simple corrective action with owner/due date/status.

### 3.3 Basic inventory records
- Parts, locations (incl. Hold), suppliers.
- Receiving form with lot number and inspection status.
- Append-only inventory transaction ledger (receipt, ship, transfer, production complete, scrap,
  supervisor-approved adjust).
- On-hand by part/location/lot (derived).
- Basic blind cycle count with tolerance by ABC class and supervisor approval.
- Lot trace report (backward to receipt, forward to shipment/customer).

### 3.4 Dashboard
- KPI tiles: On-Time Shipment %, OTIF %, Packaging Error Rate %, Packaging FPY %, Median Shipment
  Cycle Time, Inventory Accuracy % — each vs target and previous period
  (formulas in [05-performance-metrics.md](05-performance-metrics.md)).
- Six charts C1–C6 and "needs attention" lists ([08-data-model-forms-charts-reports.md](08-data-model-forms-charts-reports.md) §8.4).
- Filters: date range, customer, carrier. Click-through to records.
- Reports R1–R8 with CSV export.

### 3.5 Security & quality basics
- Login, role-based permissions enforced server-side, hashed passwords, CSRF protection,
  parameterized queries, input validation, audit log, secrets via environment variables.
- Unit tests for every KPI formula; route tests for permissions.

### 3.6 Fictional sample data
A deterministic seed script (fixed random seed) that creates:

| Data | Volume | Notes |
|------|--------|-------|
| Company | 1 | **Cobalt Ridge Components, Inc.** (fictional precision-parts maker, "Riverton" plant) |
| Customers | 6 | e.g., Aldervale Aerostructures, Brightwater Marine Systems, Pinecrest Robotics, Summit Valley Pumps, Ironleaf Agricultural Equipment, Northgate Rail Services |
| Suppliers | 4 | e.g., Graystone Metals Supply, Kestrel Fasteners, Meridian Polymer Co., Bluefield Packaging |
| Carriers | 4 | SwiftLane Parcel, Harbor Freight Lines LTL, TransAxis Truckload, Customer Pickup |
| Parts | ~25 | Format `CRC-####-<rev>` (e.g., CRC-2041-B Bracket, Machined), ABC mix ≈ 20/30/50 % |
| Locations | ~10 | RCV-01, HOLD-01, STK-A01…, FG-01, SHIP-01 |
| Users | 6 | One per role, obviously fake names (e.g., "Demo Shipper"), demo passwords documented as demo-only |
| Shipments | ~300 over 6 months | Includes a simulated **peak period** (≈ 2× volume for 3–4 weeks) with higher error/late rates |
| Packaging errors | ~6–8 % of shipments overall, higher during peak | Category mix skewed so the Pareto is meaningful (labels & paperwork largest) |
| Rework events | ~1 per error caught before ship | 10–90 minutes |
| Late shipments | ~8–12 % | Spread across reason codes |
| Receipts | ~150 | ~5 % On Hold |
| Cycle counts | ~12 counts, ~200 lines | Accuracy ≈ 95–98 %, worse for C items |

Tracking numbers are random fictional strings (e.g., `SLP` + 12 digits) that do not follow any
real carrier format. Names should be checked to avoid matching real companies; a "DEMO – FICTIONAL
DATA" banner appears on every page.

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
| SSO, MFA, fine-grained permissions, encryption at rest, formal security testing | Proportionate security for a prototype |
| Mobile app / offline mode, email/SMS alerts | Responsive web is enough for v1 |
| Advanced analytics: SPC control charts, forecasting peak volume, staffing models | Good v2 Six Sigma extension |
| Packer experience / training records, labor productivity | Sensitive; v2 with care |
| PostgreSQL, Docker deployment, cloud hosting | SQLite + local run is enough |
| Regulatory compliance (AS9100, ITAR, CMMC) | Explicitly not claimed |

## 5. Acceptance criteria for v1

1. A user can create a shipment, pack/verify it, log an error, rework it, and ship it — and the
   dashboard KPIs change accordingly.
2. A failed verification cannot proceed to Shipped without a logged error and rework.
3. A receipt creates inventory; a shipment consumes it; on-hand per lot is correct.
4. A cycle count with a variance produces an approved adjustment and updates accuracy %.
5. Lot trace shows supplier receipt → customer shipment for a seeded lot.
6. All six KPI formulas have passing unit tests against hand-calculated fixtures.
7. Non-permitted roles get HTTP 403 on restricted actions (tested).
8. Seed script rebuilds the demo database from scratch in one command.
9. Pages are usable on a laptop and a tablet; status is conveyed with text, not color alone.

## 6. Suggested build order (agent hand-off)

1. Schema + seed data + auth/roles.
2. Shipments (F1–F3) + status history.
3. Packaging errors, rework, corrective actions (F4–F6).
4. Inventory: receipts, ledger, on-hand, cycle counts (F7–F9).
5. KPI service + tests.
6. Dashboard charts + reports.
7. Hardening: security checklist, accessibility pass, README/demo script.

## 7. Key assumptions & risks

- **[A]** Targets (95 % OTD, < 2 % error rate, 97 % accuracy) are illustrative, not benchmarks for
  any real company.
- **[A]** One shipment = one customer order release; partial shipments are separate shipments.
- **Risk:** KPI definitions drifting between agents → mitigated by single KPI service + tests.
- **Risk:** Scope creep into v2 items → this file is the contract; changes need an explicit update here.
