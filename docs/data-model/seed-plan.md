# Seed Plan — Version 1 (V1-CORE)

**Task:** T-012 · **Owner:** Dana (data-model-specialist) · **Date:** 2026-11-26 · **Status:** DRAFT for review by Diego (generator host, reset endpoint), Kenji (KPI bands), Sasha (passwords), Theo (first production seed), Quinn (fixtures)
**Inputs:** [project-scope.md](../project-scope.md) §3.6, [plan/backlog.md](../plan/backlog.md) (US-011, US-012, US-013), [plan/permissions-matrix.md](../plan/permissions-matrix.md) §4, [security/security-plan.md](../security/security-plan.md) §3, §10, §11, [api/contract.md](../api/contract.md) E-52, [06](../06-lean-six-sigma.md) §6.3, [schema.md](schema.md), [migrations-plan.md](migrations-plan.md).
All data is **fictional** (`fictional-data-guardrails`). **Design only:** no generator exists. Where a number below is an *expected band* rather than an exact value, the generator is to be calibrated until it falls inside the band and the exact output is then pinned in a test (section 10).

## 1. Principles

1. **Deterministic.** Same code + same constants = byte-identical data (except password hashes). No `Math.random()`, `Date.now()`, `new Date()` without an argument, `faker`, or unordered iteration inside `src/lib/seed/` (a CI grep enforces the first three).
2. **Anchored on one constant.** `SEED_ANCHOR_DATE = 2026-11-25` (the reporting date). A test asserts it equals the `reporting_date` default in migration 0001. All times are generated relative to it.
3. **Not a migration.** One TypeScript generator in `src/lib/seed/`, run by `npm run db:reset-seed` (local) and by the Admin demo reset (E-52). Migrations only hold configuration the app cannot run without (settings defaults, `ref_shipment_transition`).
4. **Final state, one transaction.** Every row is inserted in its final state (no later `UPDATE`, except the settings reset; this is also required by the UD-3 lock triggers, which refuse updates to Shipped/Cancelled shipments), in foreign-key order, in batches, inside one transaction. A failed validation rolls back and leaves the previous data intact.
5. **Quotas, not luck.** Where scope or backlog demands a property (error 6-8 %, late 8-12 %, on-hold 5 %, accuracy 95-98 % and worse for C), the generator allocates **exact counts** (largest-remainder quotas) and then shuffles which records receive them. Independent coin flips would not guarantee the property for small n.
6. **Consistent by construction, proven by queries.** The ledger is built by a chronological simulation that throws on a stock-out; section 9 lists the SQL invariants the generator runs before commit.
7. **Real clock model (Option A).** Seed timestamps are the "real" timestamps of the simulated history; `business_date` is the UTC date of the timestamp. All seed events are **before `2026-11-25T00:00:00Z`**, so any live record created on or after the reporting date sorts after them. Option A is confirmed by Marcus (T-016, D-1). `rework_event.completed_business_date` is a **generated** column: the generator never writes it.

## 2. Determinism machinery

| Item | Design |
|------|--------|
| Generator | `mulberry32(seed32)` returning floats in [0,1). Helpers: `int(lo, hi)`, `pick(list)`, `weighted([[v,w]...])`, `chance(p)`, `lognormal(median, sigma)` (Box-Muller from two draws), `shuffle(list)` (Fisher-Yates), `quota(total, weights)` (largest remainder, ties by index). |
| Seed value | `SEED = 20261125` (documented constant). Sub-streams: `rng(name) = mulberry32(fnv1a32(SEED + ':' + name))` for `shipments`, `quality`, `receipts`, `ledger`, `counts`, `text`. Changing one domain does not shift draws in another. |
| Ordering | All lists are sorted by an explicit key before use; no reliance on `Object` key order, `Map`/`Set` insertion of unsorted data, or database return order (the generator never reads rows back, it assigns ids itself). |
| Ids | The generator assigns `id` = 1..n per table in insertion order and inserts with `OVERRIDING SYSTEM VALUE`, then `setval(pg_get_serial_sequence(t,'id'), max(id))` and `setval` for the four number sequences (`shipment_no_seq` to 1300, `packaging_error_no_seq`, `receipt_no_seq`, `cycle_count_no_seq` to their maxima). Test: after seeding, creating a shipment returns `SH-1301`. |
| Timestamps | `created_at` and `updated_at` are set explicitly (to the record's creation time) so they do not depend on `now()`. The generator never calls `now()`. |
| Checksum | Section 11. Excludes `app_user.password_hash`, `app_user.last_login_at`, `setting.updated_at`. |
| Passwords | `scrypt$...` strings use a random per-user salt (security plan 3.1), so hashes differ between runs; that is the only non-determinism and is excluded from the checksum. Hash sequentially (about 128 MiB each; do not parallelize). |

## 3. Time frame

| Item | Value |
|------|-------|
| Reporting date | 2026-11-25 (Wednesday). Seed events end **2026-11-24 evening**. |
| Shipments | `order_date` from 2026-05-12; `ship_date` 2026-05-26 .. 2026-11-24, Monday-Friday only (no holiday calendar). 131 working days. |
| Receipts and production | from 2026-05-04 (opening stock three weeks before the first shipment) to 2026-11-23. |
| Peak period | **2026-10-28 .. 2026-11-20** (18 working days, 3.6 weeks) by ship date, about **2.2x** the daily volume of other weeks, with higher error and late rates. It lies inside the default 30-day window (2026-10-27 .. 2026-11-25), so the first dashboard view shows it (C2) and the on-time and error tiles are visibly worse than the previous period (2026-09-27 .. 2026-10-26). |
| Time of day | 06:00-18:00 UTC (the demo plant runs on UTC). |
| Lot numbers | `L<yy><ww>-<nnn>`: `yy` = 26, `ww` = ISO week of `arrived_at` (week 40 starts Mon 2026-09-28, week 48 starts Mon 2026-11-23), `nnn` = running count within that week from 001. |

## 4. Reference data

**Users (7, from the matrix; security plan 11).** Emails `<username>@example.com`.

| Username | Display name | Role | Password source |
|----------|--------------|------|-----------------|
| `demo.admin` | Demo Admin | Admin | Deployed: env `DEMO_ADMIN_PASSWORD` (secret). Unset on a deployed site -> account created `active = false` with no hash. Local/CI: the documented demo password. |
| `demo.supervisor` | Demo Supervisor | Supervisor | published demo-only |
| `demo.shipper1` | Demo Shipper One | Shipping | published demo-only |
| `demo.shipper2` | Demo Shipper Two | Shipping | published demo-only |
| `demo.receiver` | Demo Receiver | Receiving | published demo-only |
| `demo.quality` | Demo Quality | Quality | published demo-only |
| `demo.viewer` | Demo Viewer | Viewer | published demo-only |

The published passwords live **only** in the README and on the login page and are chosen by Diego/Sasha; this document does not choose them and the seed code reads them from one demo-config module, never from a database. "Deployed" is detected from the Netlify environment (`NETLIFY` set) [A: Sasha/Theo to confirm the variable that is present at function run time]; anything else is local. Stored hashes must not equal the demo password and equal passwords must give different hashes (security plan test S-10). No real names, emails or phone numbers.

**Customers (6):** `ALDERVALE` Aldervale Aerostructures · `BRIGHTWATER` Brightwater Marine Systems · `PINECREST` Pinecrest Robotics · `SUMMITVALLEY` Summit Valley Pumps · `IRONLEAF` Ironleaf Agricultural Equipment · `NORTHGATE` Northgate Rail Services (invented cities and states for `ship_to_*`). Order weights 22/18/18/16/14/12 %.
**Suppliers (4):** `GRAYSTONE` Graystone Metals Supply · `KESTREL` Kestrel Fasteners · `MERIDIAN` Meridian Polymer Co. · `BLUEFIELD` Bluefield Packaging.
**Carriers (4):** SwiftLane Parcel (Parcel, tracking `SLP` + 12 digits, 55 % of shipments) · Harbor Freight Lines LTL (LTL, `HFL` + 10 digits, 20 %) · TransAxis Truckload (Truckload, `TAX` + 10 digits, 10 %) · Customer Pickup (Pickup, no tracking number, 15 %). Digits are random and do not follow any real carrier format.
**Locations (10):** `RCV-01` Receiving · `HOLD-01` Hold · `STK-A01`, `STK-A02`, `STK-A03` Stock (A items) · `STK-B01`, `STK-B02` Stock (B) · `STK-C01` Stock (C) · `FG-01` FG · `SHIP-01` Shipping.
**Reason codes (16):** late (7, per the contract list): `LATE_MATERIAL`, `LATE_QUALITY_HOLD`, `LATE_PAPERWORK`, `LATE_CARRIER`, `LATE_PKG_REWORK`, `LATE_CAPACITY`, `LATE_CUST_CHANGE` · hold (4): `HOLD_QUALITY_INSPECTION`, `HOLD_CUSTOMER_REQUEST`, `HOLD_AWAITING_MATERIAL`, `HOLD_AWAITING_DOCS` · adjust (2): `ADJ_COUNT_VARIANCE`, `ADJ_MISPICK_CORRECTION` · scrap (3): `SCR_DAMAGED`, `SCR_NONCONFORMING`, `SCR_OBSOLETE`.
**Parts (25 active + 1 inactive superseded revision), ABC mix 5 / 8 / 12 = 20 / 32 / 48 %:**

| Class | Part numbers (description) |
|-------|---------------------------|
| A (5) | `CRC-2041-C` Bracket, Machined (requires C of C); `CRC-2107-A` Flange, Turned; `CRC-2230-B` Housing, Pump (requires C of C, in-house); `CRC-2315-A` Spindle, Ground (in-house); `CRC-2488-A` Manifold Block (in-house) |
| A, inactive | `CRC-2041-B` Bracket, Machined (superseded; used by early shipments and the "revision B" in the SH-1042 story) |
| B (8) | `CRC-3102-A` Clamp Plate; `CRC-3118-A` Cover, Polymer; `CRC-3205-B` Gear Blank (in-house); `CRC-3290-A` Coupling Sleeve; `CRC-3344-A` Mounting Plate; `CRC-3401-A` Guide Rail (in-house); `CRC-3467-C` Bushing, Flanged; `CRC-3512-A` Cap, Sealed |
| C (12) | `CRC-4102-A` Clip, Retaining; `CRC-4110-A` Bolt M8; `CRC-4115-A` Nut, Locking; `CRC-4120-A` Pin, Dowel; `CRC-4133-A` Spacer; `CRC-4140-A` Grommet, Polymer; `CRC-4151-A` Insert, Threaded; `CRC-4166-A` Standoff; `CRC-4172-A` Mount, Cable Tie; `CRC-4188-A` Seal Ring; `CRC-4195-A` Plug, Cap; `CRC-4203-A` Holder, Label |

`packaging_instruction_ref` = `PKG-<part digits>-<n>` (text only). In-house parts (5) gain stock through `PRODUCTION_COMPLETE` into `FG-01`; the other 20 through supplier receipts (metal parts Graystone, fasteners Kestrel, polymer parts Meridian, three C items Bluefield). A lot trace for a bought lot ends at a supplier receipt; for an in-house lot it ends at a production-complete row.
**Settings:** `UPDATE setting SET value = default_value, updated_by = NULL WHERE scope = 'config'` (no inserts; defaults live in 0001).

## 5. Volumes and distributions (scope 3.6)

"Exact" means the generator allocates this number; "band" means the result must fall in the range (checked by section 9).

| Data | Target | Notes |
|------|--------|-------|
| Customers / suppliers / carriers / parts / locations / users | 6 / 4 / 4 / 26 rows (25 active) / 10 / 7 | exact |
| Shipments | **300 exact**, `SH-1001`..`SH-1300` | numbered by `order_date`, with the open shipments last (section 7) |
| Status at the reporting date | **Shipped 274, Cancelled 6, open 20** (Planned 6, Ready to Pack 4, Packing 3, Verified 2, On Hold 3, Rework 2); no Delivered (removed from v1, UD-6) | exact |
| Shipment lines | 1-4 per shipment, weights 40/30/20/10 % (mean 1.9), about 570 lines; about 520 shipped lines | band 540-600 |
| Shipped volume | peak (10-28 .. 11-20): **70** shipped; other weeks: **204** shipped; daily ratio 3.9 versus 1.8 (about 2.2x) | exact |
| Late shipments | **28** of 274 shipped (**10.2 %**): peak 12 (17 %), other 16 (7.8 %); reasons: MATERIAL 5, QUALITY_HOLD 4, PAPERWORK 4, CARRIER 4, PKG_REWORK 5, CAPACITY 4, CUST_CHANGE 2 | exact; scope 8-12 % |
| Short-shipped (not in full) | 5 shipments with one short line each (note required) | exact |
| Packaging errors | **21** (7.0 % of 300; 20 shipments affected, one shipment has two): detected in peak 9, other 12 | exact; scope 6-8 % |
| Error categories | Incorrect label 6, Paperwork 5, Wrong quantity 3, Packaging method 2, Wrong part 2, Damage 1, Traceability 1, Other 1 (labels + paperwork = 52 %: the two largest) | exact |
| Stage | Before ship 18 (internal catches), After ship (customer-found) 3 | exact |
| `packaging_related` *(UD-9, kpi-spec S-5)* | all 21 errors keep the default `true` (the 3 After-ship errors count against KPI-3/KPI-4/C3) | exact |
| Detected by (Before ship) | Verifier 10, Packer 4, Quality 4 | exact |
| Severity *(UD-5)* | **Low 5, Medium 6, High 8, Critical 2** (former Minor 11 split into Low 5 / Medium 6; former Major 8 = High) | exact |
| Error status | Closed 12, Contained 3, Open 6 (at least 3 Open older than 7 days) | exact |
| Rework events | **20** (18 Before-ship errors x 1 plus 2 second events), 10-90 min (triangular, mode 35), 19 completed, **1 in progress** (SH-1285); actions Relabel 7, Reprint paperwork 5, Repack 4, Replace part 2, Recount 1, Other 1 | exact counts |
| Corrective actions | 14: Closed 8, In Progress 4, Open 2; at least 3 **overdue** at the reporting date (`due_date` before it, not Closed) | exact |
| Root cause (6M) | set on every Closed or Contained error (15) and on 2 Open ones; Method 5, People 4, Material 2, Machine 2, Measurement 1, Environment 3 (peak errors favour People and Environment) | exact |
| Verification attempts | about 290: every shipped shipment has a passing attempt; **first attempts fail** for 10 shipped shipments (verifier-detected errors) plus SH-1284 | band 285-295 |
| Status history rows | about 1,500 | band 1,400-1,600 |
| Verifier / packer | packer: shipper1 45 %, shipper2 45 %, supervisor 10 %; verifier: a different user, weights shipper1/shipper2 (whoever is not the packer) 60 %, quality 25 %, supervisor 15 %; rework performed by shipper1/shipper2/quality | constraint `verified_by <> packer_id` holds on every row |
| Receipts | **150 exact**: Accepted 140, On Hold 8 (**5.3 %**), Rejected 2; numbered `RC-0001`.. by arrival time | the 140 accepted receipts are sized to cover demand; the 8 held and 2 rejected are extra |
| Held receipts | 8 in `HOLD-01`; 5 released later by a TRANSFER pair posted by `demo.quality` or `demo.supervisor` (R-7); 3 remain held (one is the story lot L2646-001) | exact |
| Receipts into RCV-01 | the last 8 accepted receipts (arrived 11-19 .. 11-23) sit in `RCV-01`; 3 of them are transferred to stock | exact |
| Ledger rows | about 760: RECEIPT 148, SHIP about 520, PRODUCTION_COMPLETE 12, TRANSFER 46 (23 pairs), SCRAP 6, ADJUST about 15 | band 720-800 |
| Cycle counts | **12**: CC-0001..CC-0010 Approved, CC-0011 Counted (awaiting approval), CC-0012 Open | exact |
| Cycle-count lines | **200** (CC-0012 has 12 uncounted lines, CC-0011 18, approved counts 170) | exact |
| Count accuracy (188 counted lines: A 75, B 65, C 48) | first-count misses A 2, B 1, C 5 (8) = **95.7 %**; after recount misses A 1, B 1, C 3 (5) = **97.3 %**; by class (first count) A 97.3 %, B 98.5 %, **C 89.6 %** (worst) | exact |
| Adjustments | one ADJUST per approved line with a non-zero final variance: 5 misses + about 10 in-tolerance variances | about 15 |
| Lots | one lot per receipt (some lots receive two receipts) plus the production lots | band 150-165 |

Peak versus other weeks (by design): on-time about 83 % versus 92 %; error rate about 13 % versus 6 %; median cycle time about 30 h versus 20 h (cycle time: lognormal, sigma 0.45, clamp 4-120 h; a shipment that would be ready on a weekend is moved to the previous Friday 15:00, which lengthens it).

## 6. Generation phases (all in one process, one write transaction)

| Phase | Work | Stream |
|-------|------|--------|
| P0 | Guard: refuse to run if `setting` is missing (migrations not applied) or, on a deployed site, `DEMO_RESET_ENABLED` is not true for the endpoint path. | |
| P1 | Build reference rows, 7 users (hash passwords), settings reset. | `text` |
| P2 | **Shipment plan** (300 records): working-day grid with peak, quota-allocated shipped counts per day, then per record backwards: `shipped_at` -> `verified_at` -> `packing` -> `ready_to_pack_at` (cycle time) -> `order_date` and promise/requested dates (on-time: promise 0-3 days after the ship date; late: ship 1-6 days after the promise date); customer, carrier, lines (part by weights 25 % A / 30 % B / 45 % C; quantities A 5-40, B 10-120, C 50-600), packer/verifier, documents flags. Shipped shipments with `ship_date >= 2026-11-17` get `order_date <= 2026-11-18`. Open and cancelled records follow section 7. | `shipments` |
| P3 | **Quality plan:** quota-allocate the 21 errors to shipped (and the two open Rework) shipments by period, category, stage, severity, detected-by; derive failed first verifications, reworks, corrective actions; patch the affected shipment records (extra verification attempt, Rework episode in history with the Rework -> Packing row `changed_by` = demo.quality or demo.supervisor (UD-4), later `shipped_at`, packer change (the re-packer), late flag where the rework caused lateness). Story records (section 8) are placed first and excluded from random assignment. | `quality` |
| P4 | **Supply plan:** for each bought part, `n_p` receipts (budget summing to 140 accepted) sized `ceil(1.15 x demand / n_p)` rounded to 10, arriving 5 days before the cumulative demand needs them; in-house parts get `PRODUCTION_COMPLETE` events the same way (12 total); 8 held and 2 rejected receipts added as extras; lot numbers assigned in arrival order. | `receipts` |
| P5 | **Ledger simulation** in chronological order (by `txn_at`, then a fixed event-type order): receipts, putaways, shipments (each line takes the **oldest lot with enough balance in a Stock/FG location**; if none has enough, split into two lines of the same shipment), transfers (hold releases, 3 RCV-01 putaways), 6 scrap events, cycle counts (snapshot `system_qty` from the running balances at the count's creation time, apply planned variances, post ADJUST at approval). **Any negative balance or lot-less shipment throws** (fix the parameters, never patch the data). | `ledger`, `counts` |
| P6 | Write: batched `INSERT ... SELECT FROM unnest(...)`, FK order: `app_user`, lookups, `lot`, `shipment`, `shipment_line`, `receipt`, `packaging_error`, `rework_event`, `corrective_action`, `shipment_status_history`, `shipment_verification`, `cycle_count`, `cycle_count_line`, `inventory_transaction`. Then `setval` on all sequences. | |
| P7 | Validate (section 9), write the summary and checksum, commit. | |

Cost: about 4,100 rows in about 30 statements; the PoC loaded 3,000 rows in 0.57 s locally. Remote latency, scrypt for 7 users (about 1-3 s) and DB wake-up are the unknowns for the 60-second function limit (ADR-001 R4): **measure on Netlify**.

## 7. Open and cancelled shipments (pinned numbers)

Open shipments take the last 20 numbers; their `order_date` falls in 2026-11-19 .. 11-24. "Today" for open ones is 11-24 evening (real timestamps), the reporting date is 11-25.

| No | Status | Packer / verifier | Purpose |
|----|--------|-------------------|---------|
| SH-1281 | On Hold (from Packing; `HOLD_QUALITY_INSPECTION`, owner Quality; held by demo.quality); **promise 2026-11-20: overdue** | packer shipper2 | hold + overdue list, release by Quality (T-22) |
| SH-1282 | On Hold (from Ready to Pack; `HOLD_CUSTOMER_REQUEST`, owner Customer) | | |
| SH-1283 | On Hold (from Planned; `HOLD_AWAITING_DOCS`, owner Shipping) | | |
| SH-1284 | **Rework** (origin VERIFICATION_FAILED): packed by **shipper1**, attempt 1 **failed** by demo.quality (labels), error logged, rework (Relabel) **completed**, ready for `reopen` | packer shipper1 | *(UD-4)* T-23: shipper1 reopen → 403; demo.quality (or supervisor) reopens (packer cleared); T-5: shipper2 re-packs (E-10) and becomes the packer, shipper1 verifies, shipper2 verifying is refused |
| SH-1285 | **Rework** (origin ERROR_LOGGED): attempt 1 passed, Quality logged a Before-ship error, rework **in progress** | packer shipper2 | in-progress rework display |
| SH-1286 | Verified | packed shipper1, verified shipper2 | ready to ship; promise 11-27 (on time) |
| SH-1287 | Verified | packed shipper2, verified demo.quality | promise 11-24 (past): **shipping it requires a late reason** |
| SH-1288 | Packing | packer **shipper1** | T-1 (shipper1 verify -> 403), T-2 (shipper2 verifies) |
| SH-1289 | Packing | packer shipper2 | |
| SH-1290 | Packing | packer **demo.supervisor** | T-4 |
| SH-1291..SH-1294 | Ready to Pack | | start-packing demo |
| SH-1295..SH-1300 | Planned | | SH-1295 and SH-1296 have no document flags set (checklist contradiction demo) |

**Cancelled (6):** four from Planned / Ready to Pack (by Shipping, R-5) and two from Packing / Rework (by Supervisor), spread across the six months, never among the story or pinned numbers. Each has a cancel reason in the history note. Cancelled shipments are excluded from every KPI.

Verification demo (matrix T-1..T-5) therefore works on SH-1284, SH-1288, SH-1290 without any set-up.

## 8. Demo-story records

| ID | Record | Content |
|----|--------|---------|
| S-1 | **SH-1042** (the 42nd shipment by order date; the generator forces the 42nd record to be the story and asserts its ship date lies in 2026-06-15 .. 06-30) | Customer Aldervale Aerostructures, part `CRC-2041-C` x 120 (requires C of C). Packed by shipper1; attempt 1 **failed** by demo.quality (`packing_slip` fail); error **Paperwork / Packing slip**, **High** (UD-5), detected by Verifier, Before ship, description "Packing slip lists revision B; the parts packed are revision C."; rework **Reprint paperwork** 35 min by shipper2; reopened by demo.quality (UD-4) and re-packed by shipper2; attempt 2 passed by shipper1; shipped **1 day late**, reason `LATE_PAPERWORK`. Root cause **Method**; 5 Whys note (five lines from docs/06 section 6.3: reopened to replace the packing slip -> slip listed rev B, parts rev C -> template pulled the revision from an old customer PO line -> revision changes are not pushed to the template -> no step in the engineering-change process updates shipping documents). Corrective action: "Add a shipping-document update step to the engineering-change checklist and add 'revision matches' to the verification checklist", owner demo.quality, due 30 days after detection, **Closed**; error **Closed**. |
| S-2 | Customer-found error (recent, peak) | The first Shipped shipment to Brightwater Marine Systems with `ship_date >= 2026-11-09`: After ship, detected by Customer, **Wrong quantity**, **High** (UD-5), "Customer count shows 118 pieces; packing slip and order show 120." Logged by demo.quality, status **Open**. Corrective action owner demo.supervisor, due 2026-11-20, **In Progress -> overdue**. The shipment number is printed in the seed summary and pinned in the README demo script. |
| S-3 | Story lot **L2640-001** (traced end to end) | `CRC-2107-A`, received 2026-09-28 from Graystone Metals Supply, 400 pieces, `STK-A01`; shipped to **Aldervale (2 shipments), Pinecrest and Ironleaf** between 2026-10-01 and 11-12; 5 pieces scrapped (`SCR_DAMAGED`) on 10-20; it also appears as a count line in CC-0010 (first count off, recount matches, so no adjustment, see S-5). Lot trace shows 1 receipt, 4 SHIP rows and 1 scrap row; totals reconcile (received 400 = shipped + scrapped + on hand). |
| S-4 | Held lot **L2646-001** | `CRC-3118-A` x 120 from Meridian Polymer Co., arrived 2026-11-09, **On Hold**, still in `HOLD-01`; never shipped (Quality can release it by TRANSFER in the demo). |
| S-5 | Cycle counts | CC-0010 (approved 2026-11-04 by demo.supervisor, counted by demo.receiver): 17 lines, first-count misses 2 (one A line = S-3 lot, recount fixes it; one C line stays out) -> first 88.2 %, after recount 94.1 %. **CC-0011** Counted 2026-11-18 by demo.receiver, awaiting approval (the Supervisor can approve it live; demo.receiver cannot, R-3). **CC-0012** Open, scheduled 2026-11-25, 12 lines: blind counting demo with `demo.receiver`. All counts are entered **and submitted** by demo.receiver and approved by demo.supervisor (R-4 widened by UD-2: approver ≠ counter and ≠ submitter). |
| S-6 | Quality and overdue lists | 6 Open errors (3 older than 7 days), 3 overdue corrective actions, 3 On Hold shipments (one overdue), 2 Rework shipments. |
| S-7 | Peak story | C2 shows volume roughly doubling from 2026-10-28 with the error rate rising; C1 shows on-time dropping below the 95 % target during the peak. |

## 9. Consistency rules and validation (run before commit; any non-empty result aborts and rolls back)

All queries return **zero rows** unless stated.

```sql
-- V-1 on-hand never negative at any point in time (ledger replayed in time order)
SELECT id, part_id, location_id, lot_number, running FROM (
  SELECT t.id, t.part_id, t.location_id, t.lot_number,
         SUM(t.qty_change) OVER (PARTITION BY t.part_id, t.location_id, t.lot_number ORDER BY t.txn_at, t.id) AS running
    FROM inventory_transaction t) x WHERE running < 0;

-- V-2 nothing ships a lot that has not been received (or produced) before the ship
SELECT t.id FROM inventory_transaction t
 WHERE t.txn_type = 'SHIP' AND NOT EXISTS (
   SELECT 1 FROM inventory_transaction r
    WHERE r.part_id = t.part_id AND r.lot_number = t.lot_number
      AND r.txn_type IN ('RECEIPT','PRODUCTION_COMPLETE') AND r.txn_at <= t.txn_at);

-- V-3 nothing ships from a Hold, Receiving or non-stock location
SELECT t.id FROM inventory_transaction t JOIN location l ON l.id = t.location_id
 WHERE t.txn_type = 'SHIP' AND l.type NOT IN ('Stock','FG','Shipping');

-- V-4 quantities reconcile: receipt qty = RECEIPT row; shipped qty = SHIP row
SELECT r.id FROM receipt r LEFT JOIN inventory_transaction t ON t.receipt_id = r.id
 WHERE (r.inspection_status = 'Rejected' AND t.id IS NOT NULL)
    OR (r.inspection_status <> 'Rejected' AND (t.id IS NULL OR t.qty_change <> r.qty_received));
SELECT sl.id FROM shipment_line sl JOIN shipment s ON s.id = sl.shipment_id
  LEFT JOIN inventory_transaction t ON t.shipment_line_id = sl.id
 WHERE s.status = 'Shipped' AND COALESCE(-t.qty_change, 0) <> sl.qty_shipped;

-- V-5 status equals the last history row; history chain and times are in order (the trigger enforces the pairs)
SELECT s.id FROM shipment s JOIN LATERAL (SELECT to_status FROM shipment_status_history
   WHERE shipment_id = s.id ORDER BY changed_at DESC, id DESC LIMIT 1) h ON true WHERE h.to_status <> s.status;

-- V-6 timestamps are in a believable order
SELECT s.id FROM shipment s WHERE s.order_date >
   (SELECT (MIN(changed_at) FILTER (WHERE to_status = 'Ready to Pack') AT TIME ZONE 'UTC')::date
      FROM shipment_status_history WHERE shipment_id = s.id);
SELECT r.id FROM rework_event r JOIN packaging_error e ON e.id = r.packaging_error_id WHERE r.started_at < e.detected_at;
SELECT c.id FROM cycle_count c WHERE c.approved_at < c.submitted_at OR c.submitted_at < c.created_at;
SELECT t.id FROM inventory_transaction t JOIN shipment_line sl ON sl.id = t.shipment_line_id
  JOIN shipment s ON s.id = sl.shipment_id WHERE t.txn_at <> s.shipped_at;
SELECT 1 WHERE (SELECT MAX(x) FROM (SELECT MAX(changed_at) x FROM shipment_status_history
   UNION ALL SELECT MAX(txn_at) FROM inventory_transaction UNION ALL SELECT MAX(verified_at) FROM shipment_verification) m)
   >= TIMESTAMPTZ '2026-11-25 00:00:00+00';           -- every seed event is before the reporting date

-- V-7 verification rules (the CHECK also enforces verified_by <> packer_id)
SELECT s.id FROM shipment s WHERE s.status = 'Shipped' AND NOT EXISTS (
   SELECT 1 FROM shipment_verification v WHERE v.shipment_id = s.id AND v.result = 'Pass'
      AND v.attempt_no = (SELECT MAX(attempt_no) FROM shipment_verification WHERE shipment_id = s.id));
SELECT s.id FROM shipment s WHERE s.status = 'Shipped' AND s.verified_by IS NULL;

-- V-8 rework only after an error; a Shipped shipment's Before-ship errors all have completed rework
SELECT e.id FROM packaging_error e JOIN shipment s ON s.id = e.shipment_id
 WHERE e.detected_stage = 'Before ship' AND s.status = 'Shipped'
   AND NOT EXISTS (SELECT 1 FROM rework_event r WHERE r.packaging_error_id = e.id AND r.completed_at IS NOT NULL);

-- V-9 tracking numbers use the fictional prefixes; Pickup has none
SELECT s.id FROM shipment s JOIN carrier c ON c.id = s.carrier_id
 WHERE s.status = 'Shipped' AND ((c.mode = 'Pickup' AND s.tracking_number IS NOT NULL)
    OR (c.mode <> 'Pickup' AND s.tracking_number !~ '^(SLP[0-9]{12}|HFL[0-9]{10}|TAX[0-9]{10})$'));

-- V-10 count lines: system_qty equals the ledger balance at the count's creation time;
--      each Approved line with a variance has exactly one ADJUST of the variance
SELECT l.id FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
 WHERE l.system_qty <> COALESCE((SELECT SUM(qty_change) FROM inventory_transaction t
     WHERE t.part_id = l.part_id AND t.location_id = l.location_id AND t.lot_number = l.lot_number
       AND t.txn_at < c.created_at), 0);
SELECT l.id FROM cycle_count_line l JOIN cycle_count c ON c.id = l.cycle_count_id
  LEFT JOIN inventory_transaction t ON t.cycle_count_line_id = l.id
 WHERE c.status = 'Approved' AND COALESCE(t.qty_change, 0) <> l.variance_qty;

-- V-11 fictional only: every customer / supplier / carrier / user is in the cast; emails end in @example.com (CHECK)
```

Distribution checks (band tests run by the generator and again by Vitest on the seeded database): the counts in section 5 (exact rows), `KPI` bands in section 10, peak versus other-week volume ratio between 1.9 and 2.5, labels + paperwork = the two largest categories, at least one error per severity, at least one On Hold shipment, at least one overdue corrective action, C-class first-count accuracy lower than A and B. A failed band is a generator calibration problem: adjust constants, never edit rows.

**The deferred ledger triggers stay enabled (decided T-016, D-10).** The seed must not run `ALTER TABLE ... DISABLE TRIGGER`. That would be DDL in application code: the demo reset runs in a Netlify Function, and security plan 8.2 / AR-4 keep DDL in migrations only. Both triggers are checked at COMMIT, so insert order inside the transaction does not matter. The lock budget is fine: a few hundred distinct ledger keys against a lock table of about 64 x max_connections slots. V-1 and the transfer query below still run before commit, so the generator fails with a readable message instead of a trigger exception. Measure the commit time on Netlify (SQ-2).

```sql
SELECT txn_group FROM inventory_transaction WHERE txn_group IS NOT NULL
 GROUP BY txn_group HAVING COUNT(*) <> 2 OR SUM(qty_change) <> 0;   -- zero rows
```

## 10. Expected KPI values (bands; exact values are pinned after the first generator run)

Default window **2026-10-27 .. 2026-11-25**, previous period **2026-09-27 .. 2026-10-26**, basis promise date, tolerance 0.

| KPI | Default window | Previous period | Target |
|-----|----------------|-----------------|--------|
| KPI-1 on-time % | 80-88 | 90-96 | 95 |
| KPI-2 OTIF % | 77-86 | 88-95 | 93 |
| KPI-3 packaging error rate % | 10-16 | 4-8 | < 2 |
| KPI-4 FPY % | 80-88 | 90-95 | 98 |
| KPI-5 rework frequency % (events / shipped) | 8-14 | 3-7 | < 2 |
| KPI-6 median cycle time (h) | 26-34 | 18-24 | 24 |
| KPI-7 inventory accuracy % (first count; CC-0010 only in window) | 88.2 exact | 90-100 (CC-0008, CC-0009) | 97 |
| Shipped in window / previous | 74-80 / 42-48 | | |

Result: the first dashboard load is non-empty (acceptance criterion 11), most tiles are **below target and worse than the previous period** (the peak story), and KPI-7 is non-null in both periods. Whole-six-month values: on-time about 90 %, error rate about 7 %.

The generator's summary output (`seed-summary.json`, printed by `db:reset-seed`) lists the counts of section 5, the KPI values above, the pinned shipment numbers of S-2, the lot numbers, and the checksum; Quinn copies them into the acceptance matrix.

## 11. Small hand-checkable fixtures (unit and integration tests)

These are separate from the big seed (tests never depend on it). They are TypeScript objects (`tests/fixtures/delivery.ts`, `packaging.ts`, `inventory.ts`) loaded into a fresh `@netlify/database-dev` after `applyMigrations()`. Each fixture was loaded into PGlite with the 0001 DDL and the section-8 queries of schema.md and **all expected values below were reproduced** (44 assertions passed). Fixed demo users and lookups: the 7 demo users, customers Aldervale Aerostructures and Pinecrest Robotics, supplier Graystone Metals Supply, carriers SwiftLane Parcel and Customer Pickup, parts `CRC-2041-B` (A), `CRC-3310-A` (B), `CRC-4102-A` (C), `CRC-5005-A` (A), locations `STK-A01`, `HOLD-01`, `FG-01`.

### Fixture A: delivery KPIs (KPI-1, KPI-2, KPI-6); period 2026-11-01 .. 2026-11-30, tolerance 0, basis promise

| Shipment | Promise | Ready to Pack | Shipped at | Ship date | Lines (ordered / shipped) | Hours | On time | In full |
|----------|---------|---------------|-----------|-----------|---------------------------|------:|:-------:|:-------:|
| SH-1001 | 11-03 | 11-03 02:00 | 11-03 12:00 | 11-03 | 10 / 10 | 10 | yes | yes |
| SH-1002 | 11-03 | 11-03 08:00 | 11-04 14:00 | 11-04 | 10 / 10 | 30 | **no** (1 day) | yes |
| SH-1003 | 11-10 | 11-04 12:00 | 11-05 08:00 | 11-05 | 10 / 10 and 10 / **8** (short note) | 20 | yes | **no** |
| SH-1004 | 11-10 | (Cancelled 11-04) | | | | | excluded | |
| SH-1005 | 11-30 | 11-30 00:00 | 11-30 12:00 | 11-30 | 5 / 5 | 12 | yes (boundary: last day inclusive) | yes |
| SH-1006 | 11-30 | 11-30 20:00 | 12-01 08:00 | 12-01 | 5 / 5 | 12 | outside period (boundary: next day) | |

Expected, period 11-01..11-30: shipped **4**; on-time 3 -> **KPI-1 = 75.0 %**; on time and in full = SH-1001, SH-1005 -> **KPI-2 = 50.0 %**; cycle hours {10, 12, 20, 30} -> **median 16 h, P90 27.0 h** (linear interpolation). Sub-periods: 11-03..11-03 -> 100.0 % (all on time); 11-04..11-04 -> 0.0 % (none on time); 11-15..11-20 -> `null` (empty); 11-30..11-30 -> 1 shipment; 12-01..12-01 -> 0.0 % (the boundary shipment is late). Cancelled SH-1004 and the partial SH-1003 are covered.

### Fixture B: packaging KPIs (KPI-3, KPI-4, KPI-5); period 2026-11-01 .. 2026-11-30

| Shipment | First verification | Error | Rework | Shipped |
|----------|--------------------|-------|--------|---------|
| SH-2001 | attempt 1 Pass 11-05 | none | none | 11-05 |
| SH-2002 | attempt 1 Pass 11-06 | none | none | 11-06 |
| SH-2003 | attempt 1 **Fail** (labels) 11-08; re-packed; attempt 2 Pass | PE Incorrect label, Before ship, Verifier | 30 min | 11-08 |
| SH-2004 | attempt 1 Pass 11-10 | **After ship**, Customer, Wrong quantity (11-14) | none | 11-10 |
| SH-2005 | (Cancelled) | | | excluded |
| SH-2006 | attempt 1 **Fail** 11-12; attempt 2 Pass | PE Paperwork / Packing slip, Before ship | **45 min and 20 min** (two events) | 11-13 |

Expected: verified or shipped = 5; shipments with an error 3 -> **KPI-3 = 60.0 %**; errors 3 -> **60.0 per 100 shipments**; internal catches **2**, customer escapes **1**; first verification passed with no error = SH-2001, SH-2002 (SH-2004 passed first time but later has a customer-found error) -> **KPI-4 FPY = 2 / 5 = 40.0 %**; rework events 3 / shipped 5 -> **KPI-5 = 60.0 %**, total **95 min**, average **31.67 min**. (Numbers are deliberately extreme so every formula is visible.)

### Fixture C: ledger, lot trace, counts (KPI-7)

Receipt RC-0001: `CRC-2041-B`, lot `L2611-004`, 100, `STK-A01`, Graystone Metals Supply (the lot number is an example from the project docs). Receipt RC-0002: same part, lot `L2611-005`, 50, `HOLD-01`, On Hold.

| Step | Ledger row | On-hand lot L2611-004 |
|------|-----------|-----------------------|
| 1 | RECEIPT +100 at STK-A01 | 100 |
| 2 | SHIP -40 (SH-3001, Aldervale) | **60** (US-041) |
| 3 | SHIP -25 (SH-3002, Pinecrest) | 35 |
| 4 | SCRAP -5 (`SCR_DMG`) | 30 |
| 5 | TRANSFER -10 STK-A01 / +10 FG-01 | 30 total: **STK-A01 20, FG-01 10** |

Lot trace L2611-004: backward **RC-0001, Graystone Metals Supply, 100**; forward **SH-3001 Aldervale 40, SH-3002 Pinecrest 25**; summary received 100 = shipped 65 + scrapped 5 + on hand 30. Rejected by the database: a SCRAP of -21 at STK-A01 (would go to -1), a one-legged TRANSFER, an UPDATE of the ledger, a ledger row for an unknown lot, a second ADJUST for one count line.

Cycle count CC-0001 (counted by demo.receiver, approved by demo.supervisor, tolerances A 0 %, B 2 %, C 5 %), each line stocked by a receipt equal to its system quantity at `STK-A01`:

| Line | Class | System | Counted | Recount | First in tolerance | Final in tolerance | Final variance | Adjust |
|------|:----:|-------:|--------:|--------:|:------------------:|:------------------:|---------------:|-------:|
| L1 `CRC-2041-B` lot L2611-010 | A | 100 | 96 | 96 | no | no | -4 | -4 -> on hand **96** (US-044) |
| L2 `CRC-3310-A` lot L2611-011 | B | 200 | 195 | 199 | no (2.5 % > 2 %) | yes (0.5 %) | -1 | -1 -> 199 |
| L3 `CRC-4102-A` lot L2611-012 | C | 50 | 52 | | yes (4 % <= 5 %) | yes | +2 | +2 -> 52 |
| L4 `CRC-5005-A` lot L2611-013 | A | 40 | 40 | | yes | yes | 0 | none (40) |

**KPI-7:** first-count hit rate **2 / 4 = 50.0 %**; after recount **3 / 4 = 75.0 %**; absolute variance **7 units**. Also verified: approval by the person who submitted is rejected; approval by a Supervisor who recounted a line is rejected; an Approved count cannot be changed; a repeat ADJUST for the same line is rejected.

## 12. Reset procedure

**Local:** `npm run db:migrate` (once), then `npm run db:reset-seed`. **Deployed:** E-52 (Admin only, `DEMO_RESET_ENABLED=true`, CSRF, typed confirmation, cooldown per matrix R-9). Both call the same function `resetAndSeed()`.

```sql
-- 1. (deployed) own committed transaction: audit row DEMO_RESET started (before anything is cleared), by Diego's endpoint.
-- 2. One transaction:
BEGIN;
TRUNCATE inventory_transaction, cycle_count_line, cycle_count, receipt, lot,
         rework_event, corrective_action, packaging_error,
         shipment_verification, shipment_status_history, shipment_line, shipment,
         session, login_attempt, part, location, reason_code, carrier, supplier, customer, app_user,
         audit_log
  RESTART IDENTITY CASCADE;
-- NOT truncated: setting (config rows are reset with UPDATE ... SET value = default_value; the two
--   system rows survive) and ref_shipment_transition (owned by migration 0001).
-- audit_log IS truncated (decided T-016, D-5; contract E-52, security plan PD-9): visitor free text inside
--   `changes` is wiped, and old record_ids cannot collide with the re-numbered records. The step-1 row
--   survives only if this transaction rolls back, so it is evidence of failed attempts.
-- 3. generate and insert everything (phases P1-P6), setval all sequences,
--    run the section-9 validation queries (any row -> RAISE -> ROLLBACK, old data stays),
--    UPDATE setting SET value = <now ISO> WHERE key = 'last_demo_reset_at',
--    INSERT audit_log DEMO_RESET (actor id, started_at, completed counts, checksum): the only audit row after a reset,
COMMIT;
```

- `TRUNCATE` is allowed on the append-only tables (triggers are row-level; PoC-verified, and re-verified on the 0001 DDL).
- The reset **ends all sessions including the caller's** (`session` is truncated), restores `reporting_mode = fixed` and `reporting_date = 2026-11-25`, targets and tolerances, and rebuilds users with their passwords (undoing vandalism of users, lookups and targets, security plan PD-3).
- `TRUNCATE` takes `ACCESS EXCLUSIVE` locks: concurrent requests wait or fail for the reset's duration (seconds); acceptable for a demo.
- A second reset while one runs is blocked by the advisory lock (409, contract E-52). The cooldown reads `setting.last_demo_reset_at`.
- Idempotent: running it twice yields the same checksum (section 13).

## 13. Determinism checksum

```sql
-- one row per table; the seed summary stores the md5 of the concatenation
SELECT 'shipment' AS t, md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) FROM shipment x
UNION ALL SELECT 'shipment_line', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) FROM shipment_line x
-- ... same for every seeded table: app_user (to_jsonb(x) - 'password_hash' - 'last_login_at'), customer, supplier, carrier,
--     part, location, reason_code, lot, shipment_status_history, shipment_verification, packaging_error, rework_event,
--     corrective_action, receipt, inventory_transaction, cycle_count, cycle_count_line,
--     setting (to_jsonb(x) - 'updated_at' - 'updated_by', config rows only; ORDER BY key)
;
```

Tests: (1) reset twice -> equal checksums (US-011, S-29); (2) checksum equals the value pinned in the repository after calibration (changes only with a deliberate generator change); (3) ten named records (SH-1042, S-2 shipment, L2640-001, L2646-001, CC-0011, SH-1281, SH-1284, SH-1288, SH-1290, `demo.admin`) are identical across runs.

## 14. Test list for Quinn / Diego

1. Seed twice -> same checksum; counts equal section 5; every V-query returns zero rows.
2. After seeding, `POST /shipments` returns `SH-1301`; a new receipt `RC-0151`; a new error `PE-0022`; a new count `CC-0013`.
3. Fixtures A, B, C reproduce the expected values above through the KPI module and the repo layer (not only the SQL).
4. Reset with a Supervisor session -> 403; with `DEMO_RESET_ENABLED` unset -> 404; second reset inside the cooldown -> 429; after a reset the caller's session is gone and the re-inserted `DEMO_RESET` audit row exists (the only audit row after a successful reset, D-5); a reset forced to fail leaves the old audit rows plus the "started" row.
5. Seed with `DEMO_ADMIN_PASSWORD` unset in "deployed" mode -> `demo.admin` inactive; set -> can log in; the value is never printed (S-30).
6. Fictional-only scan (S-31): customer/supplier/carrier names are the cast; emails `@example.com`; tracking prefixes `SLP`/`HFL`/`TAX`; no outbound network call in `src/lib/seed/`.
7. Live-record test (fake clock at any real date after 2026-11-25): create a new shipment, pack, verify (fail), log an error, complete a rework, reopen (Quality, UD-4), re-pack (Shipping), verify, ship. KPI-1, KPI-3, KPI-4 (verification business date), KPI-5 (`completed_business_date`) and KPI-6 change on the default period (acceptance criteria 1 and 11), and C3 gains the new error. Shipping the seeded `SH-1286` on a later real date also moves KPI-1, but its KPI-6 cycle time measures real elapsed time since the seeded Ready-to-Pack timestamp, which can be very long. This is an accepted limitation (D-1), so do not pin its KPI-6 value.

## 15. Open questions

| # | Question | Owner |
|---|----------|-------|
| SQ-1 | **First production seed** (DQ-9): a new deployed database has migrations only; the reset needs an Admin and `demo.admin` may be inactive. Options: run `db:reset-seed` once from a developer machine against the production connection string (needs `DEMO_ADMIN_PASSWORD` and the URL locally) or a one-time bootstrap path that works only while `app_user` is empty. | Theo, Sasha, Diego |
| SQ-2 | Measure the seed on Netlify (60-second limit, scrypt memory of 128 MiB x 7 sequentially, DB wake-up). | Theo |
| SQ-3 | **Decided T-016:** truncate and re-insert (D-5) | closed |
| SQ-4 | **Decided T-016:** no (D-10) | closed |
| SQ-5 | Confirm the band values in section 10 are acceptable for the demo story (tiles below target in the default window). If Priya prefers a "healthy" first view, move the peak to 2026-09-14 .. 10-09 so the default window is the recovery period. | Priya, Kenji |
| SQ-6 | Which KPI-7 variant is the tile (first count 88.2 % or after recount 94.1 % in the window)? | Kenji |
| SQ-7 | **Closed (UD-6):** Delivered is removed from v1; none seeded. | closed |
| SQ-8 | Detect "deployed" for the Admin password rule: which environment variable is reliably present in Netlify functions? | Sasha, Theo |
