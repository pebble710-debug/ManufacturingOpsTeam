# 8. Data Fields, Forms, Dashboard Charts and Reports (v1)

**Research date:** 2026-11-25 · Everything in this file is **[P] Proposed** design, derived from
files 01–07. Field names are suggestions for the build team.

## 8.1 Entity overview

```
Customer ─┐                          Supplier ─┐
          ▼                                    ▼
      Shipment ──< ShipmentLine >── Part ──< Receipt
          │  │                         │
          │  └──< StatusHistory        └──< InventoryTransaction >── Location
          │                                         ▲
          ├──< PackagingError ──< ReworkEvent       │
          │         └── CorrectiveAction            │
          │                                 CycleCount ──< CycleCountLine
Carrier ──┘
User / Role / AuditLog / Setting (targets) / ReasonCode (lookups)
```

## 8.2 Tables and fields

Legend: **PK** primary key, **FK** foreign key, **req** required.

### Lookups
| Table | Fields |
|-------|--------|
| `customer` | id PK, code req unique, name req, ship_to_city, ship_to_state, active |
| `supplier` | id PK, code req unique, name req, active |
| `carrier` | id PK, name req, mode (Parcel/LTL/Truckload/Pickup) req, active |
| `part` | id PK, part_number req unique, revision req, description, unit_of_measure, abc_class (A/B/C), packaging_instruction_ref, requires_coc (bool), active |
| `location` | id PK, code req unique, type (Stock/Receiving/Hold/Shipping/FG), active |
| `reason_code` | id PK, category (late / hold / adjust / scrap), code, label |
| `setting` | key PK, value (KPI targets, tolerances) |

### Shipping
| Table | Fields |
|-------|--------|
| `shipment` | id PK, shipment_no req unique (e.g., SH-1001), customer_id FK req, customer_po req, order_date req, requested_date req, promise_date req, ship_date, delivered_date, carrier_id FK, tracking_number, service_level, packages_count, total_weight_lb, status req, hold_reason_id FK, late_reason_id FK, doc_packing_slip (bool), doc_bol (bool), doc_coc (bool), doc_labels (bool), packed_by FK user, verified_by FK user, notes, created_at, created_by, updated_at |
| `shipment_line` | id PK, shipment_id FK req, line_no req, part_id FK req, qty_ordered req (>0), qty_shipped (≥0), lot_number req when shipped, location_id FK |
| `shipment_status_history` | id PK, shipment_id FK, from_status, to_status, changed_at, changed_by, note |

### Packaging quality
| Table | Fields |
|-------|--------|
| `packaging_error` | id PK, error_no (PE-0001), shipment_id FK req, shipment_line_id FK, detected_at req, detected_by_role (Packer/Verifier/Quality/Customer) req, detected_stage (Before ship / After ship) req, category req (Wrong part / Wrong qty / Incorrect label / Paperwork / Packaging method / Damage / Traceability / Other), paperwork_subtype, severity (Minor/Major/Critical) req, description req, root_cause_category (Method/People/Material/Machine/Measurement/Environment), root_cause_note, status (Open/Contained/Closed), reported_by FK |
| `rework_event` | id PK, packaging_error_id FK req, shipment_id FK req, action (Relabel/Repack/Reprint paperwork/Replace part/Recount/Other) req, started_at req, completed_at, minutes (computed), performed_by FK, reverified_ok (bool) |
| `corrective_action` | id PK, packaging_error_id FK, action_description req, owner FK user, due_date, status (Open/In Progress/Closed), closed_at |

### Inventory
| Table | Fields |
|-------|--------|
| `receipt` | id PK, receipt_no (RC-0001), supplier_id FK req, supplier_po req, part_id FK req, qty_received req (>0), lot_number req, arrived_at req, putaway_at, location_id FK, inspection_status (Accepted/On Hold/Rejected) req, received_by FK |
| `inventory_transaction` | id PK, txn_type (RECEIPT/ISSUE/PRODUCTION_COMPLETE/SHIP/TRANSFER/ADJUST/SCRAP) req, part_id FK req, location_id FK req, lot_number req, qty_change req (signed, ≠0), reason_code_id FK (req for ADJUST/SCRAP), reference_type (receipt/shipment/cycle_count/manual), reference_id, txn_at req, created_by FK — **append-only** |
| `cycle_count` | id PK, count_no, scheduled_date, status (Open/Counted/Approved), created_by, approved_by, approved_at |
| `cycle_count_line` | id PK, cycle_count_id FK, part_id FK, location_id FK, lot_number, system_qty (snapshot, hidden from counter), counted_qty, variance (computed), within_tolerance (computed), recount_qty |

On-hand view: `SELECT part, location, lot, SUM(qty_change) FROM inventory_transaction GROUP BY …`

### System
| Table | Fields |
|-------|--------|
| `user` | id PK, username unique, display_name, password_hash, role, active |
| `audit_log` | id PK, user_id, action, table_name, record_id, changes (JSON old→new), at |

## 8.3 Forms (v1)

| # | Form | Key behavior |
|---|------|-------------|
| F1 | **New / Edit Shipment** | Header + dynamic lines; validates promise ≥ order date; qty > 0 |
| F2 | **Pack & Verify** | Shows packaging instruction ref; checklist (part no., rev, qty, lot, labels, packing slip, C of C if required, method); verifier ≠ packer; any ✗ → opens F4 pre-filled and sets status Rework |
| F3 | **Ship Shipment** | Ship date (default today), carrier (dropdown), tracking number (required unless Pickup), packages, weight; late reason required if ship_date > promise_date; posts SHIP inventory transactions |
| F4 | **Log Packaging Error** | Category, severity, detected by/stage, description; optional root cause |
| F5 | **Log Rework** | Linked error, action, start/end, re-verified OK |
| F6 | **Corrective Action** | Root cause (6 M + 5 Whys note), action, owner, due date |
| F7 | **Receive Material** | Supplier, PO, part, qty, lot, arrival time, inspection status → RECEIPT txn (to Hold location if On Hold) |
| F8 | **Inventory Transaction** | Transfer / scrap / production complete / adjust (adjust = Supervisor only) |
| F9 | **Cycle Count Entry** | Blind count entry; recount prompt if out of tolerance; Supervisor approval posts ADJUST |
| F10 | **Admin lookups & targets** | Customers, suppliers, carriers, parts, locations, reason codes, KPI targets |

## 8.4 Dashboard (home page)

**Row 1 – KPI tiles** (value · target · Δ vs previous period · text arrow):
On-Time Shipment % · OTIF % · Packaging Error Rate % · Packaging FPY % · Median Shipment Cycle
Time (h) · Inventory Accuracy %

**Row 2–3 – Charts** (Chart.js, ≤ 6):

| # | Chart | Type | Question it answers |
|---|-------|------|--------------------|
| C1 | On-time shipment % by week vs target | Line + target line | Are we delivering on time, and trending which way? |
| C2 | Shipments per day vs packaging error rate | Bars (volume) + line (error %) | Do errors rise during high-volume periods? |
| C3 | Packaging errors by category | Pareto (sorted bars + cumulative %) | Which few problems cause most errors? |
| C4 | Late shipments by reason | Horizontal bar | Why are we late? |
| C5 | Rework events & minutes by week | Bars | Is rework effort shrinking? |
| C6 | Inventory accuracy by ABC class (last counts) | Bar vs target | Where is stock accuracy weak? |

**Row 4 – Needs attention lists:** shipments overdue / due in next 3 days not yet Ready · shipments
On Hold (reason, owner dept) · open packaging errors & overdue corrective actions · cycle counts
awaiting approval.

Filters on the dashboard: date range, customer, carrier.

## 8.5 Reports (v1, on-screen tables with CSV export)

| # | Report | Contents |
|---|--------|----------|
| R1 | Shipment Log | All shipments in range with dates, carrier, tracking, status, on-time flag |
| R2 | Late Shipment Report | Late shipments, days late, reason code |
| R3 | Packaging Error & Rework Log | Errors with category, severity, rework minutes, corrective action status |
| R4 | Inventory On-Hand | By part / location / lot (from ledger) |
| R5 | Inventory Transaction History | Filter by part, lot, type, date |
| R6 | Cycle Count Accuracy | Per count and per ABC class, variances |
| R7 | Lot Trace | Enter lot → supplier receipt(s) backward, shipments/customers forward |
| R8 | KPI Summary | All KPIs for the period vs target (printable for a weekly review) |
