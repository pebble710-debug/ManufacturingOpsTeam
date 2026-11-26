# Demo Script: 10-Minute Class Presentation

**Task:** T-021 · **Owner:** Priya (product-manager) · **Date:** 2026-11-26 · **Audience:** professor and class (graduate AI course) · **Length:** 10 minutes, 7 segments
**Sources:** [project-scope.md](../project-scope.md) §5 (criteria 1 to 13), [permissions-matrix.md](permissions-matrix.md) §4 to §5, [seed-plan.md](../data-model/seed-plan.md) §7 and §8, [backlog.md](backlog.md) §1.1.
All companies, people, parts and records are **fictional** (Cobalt Ridge Components, Inc., Riverton plant). The prototype is not a certified or production system.

The script depends on the seed pins in seed-plan §7 and §8. If Dana changes a pinned number, update this script in the same change. Severity labels follow UD-5 (Low, Medium, High, Critical): the seed plan still says Minor/Major/Critical, so Dana remaps it (open item D-1 below).

## 0. Before you start (5 minutes, not part of the 10)

| Step | Check |
|------|-------|
| 1 | Run the demo reset (`npm run db:reset-seed` locally, or the Admin reset on the deployed site) so SH-1281 to SH-1300 and CC-0011 are in their seeded state. Do **not** rehearse on the demo database after the reset. |
| 2 | Open **two browser profiles** (or one normal and one private window) so you can switch users without logging out: Window A for `demo.shipper1` / `demo.shipper2` / `demo.viewer`, Window B for `demo.quality` / `demo.supervisor`. Demo passwords are on the login page and in the README (demo-only). |
| 3 | Confirm the "DEMO - FICTIONAL DATA" banner and "Reporting date: 25 Nov 2026 (fixed demo date)" are visible. |
| 4 | Write down the printed pins from the seed summary: the S-2 shipment number (customer-found error), the lot numbers L2640-001 and L2646-001, and the KPI values. Paste them into section 4 of this file if they differ. |
| 5 | Browser zoom 100 %. Have the Resources page and the GitHub repository open in tabs as a fallback. |

## 1. Timeline at a glance

| Time | Segment | User | Shows | Criteria |
|------|---------|------|-------|----------|
| 0:00 to 1:30 | 1. Context and dashboard | `demo.supervisor` | six KPI cards, three charts, peak period, fixed reporting date | 11 |
| 1:30 to 3:30 | 2. Shipping and verification rules | `demo.shipper1`, `demo.shipper2` | pack, verifier is not the packer, late reason, locked shipment | 1, 3, 12 |
| 3:30 to 5:30 | 3. SH-1042 and packaging quality | `demo.quality`, `demo.shipper1` | failed verification, error, rework, root cause, severity, containment | 2, 12 |
| 5:30 to 7:00 | 4. Inventory, lot trace, cycle count | `demo.receiver`, `demo.supervisor` | ledger, lot trace, blind count, approval, accuracy | 4, 5 |
| 7:00 to 8:00 | 5. Reports and CSV | `demo.supervisor` | R1, R3, R4, R7, CSV download | 11 |
| 8:00 to 9:00 | 6. Security and roles | `demo.viewer`, `demo.admin` | 403 for non-permitted roles, audit log | 7, 8 |
| 9:00 to 10:00 | 7. Responsive, Resources, close | any | mobile width, Resources page, GitHub, test evidence | 9, 13 |

## 2. Segments

### Segment 1 (0:00 to 1:30): Context and dashboard, signed in as `demo.supervisor`

Say: "Cobalt Ridge Components is a fictional precision-parts maker. This tool lets a small shipping department record shipments, verify packaging, log errors and see performance on one page."

1. Sign in as `demo.supervisor` (Window B). Point to the **DEMO banner** and the **fixed reporting date label** ("the demo always shows 25 November 2026 so the numbers never go empty").
2. Dashboard: six KPI cards (On-Time %, OTIF %, Packaging Error Rate %, FPY %, Median Cycle Time, Inventory Accuracy %). Each shows value, target, change vs previous period, and a **text** status (Meets or Misses target), not colour alone.
3. Chart C2 (shipments per day vs error rate): "volume roughly doubles from 28 October, and the error rate climbs with it: that is the peak period." Chart C1: on-time falls below the 95 % target in the peak. Chart C3 (Pareto): labels and paperwork are the two largest error categories. Point to the text/table alternative under one chart.
4. Expected (bands from seed-plan §10, pin exact values after the first generator run): on-time about 80 to 88 %, error rate about 10 to 16 %, most cards below target and worse than the previous period.

### Segment 2 (1:30 to 3:30): Shipping and verification rules

Say: "A shipment can only move through defined actions, and the person who packs it can never be the person who verifies it."

1. Window A, sign in as `demo.shipper1`. Open the shipment list, filter status Packing, open **SH-1288** (packed by `demo.shipper1`). Choose Pack & Verify and try to verify. **Expected:** refused with a clear message ("the verifier must be a different person from the packer"); no verification is recorded. (Scenario T-1, criterion 3.)
2. Sign out, sign in as `demo.shipper2`, open SH-1288, verify with all checklist items passed. **Expected:** status Verified. (T-2.) Mention that Quality and Supervisor can also verify, but never their own packing (SH-1290 is packed by `demo.supervisor`: T-4).
3. Open **SH-1287** (Verified, promise date 24 Nov, already past on the reporting date). As `demo.shipper2` choose Ship: enter carrier, tracking, packages, weight, **leave the late reason empty and save**. **Expected:** rejected, "late reason required". Then choose a reason (for example Paperwork) and save. **Expected:** Shipped. Say: "The late reason is required whenever the ship date is after the promise date, even if the KPI tolerance is changed." (UD-1, T-28.)
4. Reload the dashboard (Window B): on-time and cycle-time cards change as hand-calculated. (Criterion 1.)
5. Open SH-1287 again (now Shipped) and try to edit the customer PO. **Expected:** read-only; a direct edit is refused (409). Say: "Shipped shipments are locked. Only a Supervisor can apply an audited correction with a reason." Optional (30 s): as `demo.supervisor` open Correct, change the customer PO with a reason, show the Corrections list and the audit entry. (UD-3, criterion 12.)

### Segment 3 (3:30 to 5:30): SH-1042 and packaging quality

Say: "This is the story from our Lean Six Sigma research: a paperwork error caught at verification."

1. Window B, `demo.quality`. Open **SH-1042** (Aldervale Aerostructures, part CRC-2041-C, shipped June). Walk the history: attempt 1 **failed** (packing slip), error **Paperwork / Packing slip** logged ("packing slip lists revision B; parts packed are revision C"), severity as seeded (expected **High**), rework "Reprint paperwork" 35 min, re-pack, attempt 2 passed by a different user, shipped one day late with reason Paperwork.
2. Show the **root cause** (Method) and the **5 Whys** note, and the corrective action ("add a shipping-document update step to the engineering-change checklist", Closed). Say: "the system forces the gate: a failed shipment cannot reach Shipped without a logged error, completed rework and a passing re-verification; a direct request gets 409." (Criterion 2.)
3. Live reopen: open **SH-1284** (Rework, failed verification, rework completed). As `demo.shipper1` try **Reopen**: **403** (only Supervisor and Quality, UD-4, T-23). As `demo.quality` choose Reopen: status Packing. Then (if time) `demo.shipper2` re-packs and `demo.shipper1` verifies; `demo.shipper2` verifying is refused (T-5). Skip the last part if behind schedule.
4. Customer-found error: open the **S-2 shipment** (printed in the seed summary, Brightwater Marine Systems, "customer count 118, order 120", severity as seeded). As `demo.shipper1` try **Contain**: 403 (UD-4, T-24). As `demo.quality` choose **Contain**: status Contained. Say: "customer-found errors are tracked separately from internal catches."
5. Error list: show severity values **Low, Medium, High, Critical** with their help text (UD-5).

### Segment 4 (5:30 to 7:00): Inventory, lot trace and cycle count

Say: "Stock is an append-only ledger. Nothing is edited; every change is a new transaction."

1. As `demo.supervisor`, open **Lot trace** for **L2640-001** (CRC-2107-A, 400 pieces from Graystone Metals Supply). Show: 1 receipt, 4 shipments to Aldervale (2), Pinecrest and Ironleaf, 5 pieces scrapped; received 400 = shipped + scrapped + on hand. (Criterion 4.)
2. On-hand page: show lot **L2646-001** (CRC-3118-A, On Hold, `HOLD-01`). Say: "moving stock out of Hold needs Quality or Supervisor; Receiving is refused (T-13)." Do not move it unless time allows.
3. Cycle counts: open **CC-0011** (counted by `demo.receiver`, awaiting approval). Show system quantity, counted, variance, tolerance by ABC class. Approve as `demo.supervisor`. **Expected:** Approved, adjustments posted, inventory accuracy card moves. Say: "the person who counted or submitted a count can never approve it (UD-2, T-15, T-26), and the counts are blind: the counter never sees system quantities." Optional: show **CC-0012** (Open) as `demo.receiver` to show the blind entry screen. (Criterion 5.)

### Segment 5 (7:00 to 8:00): Reports and CSV

1. Reports index: R1 Shipment Log, R3 Packaging Error and Rework Log, R4 Inventory On-Hand, R7 Lot Trace. Open R3, filter the peak period (28 Oct to 25 Nov), show severity and rework minutes columns.
2. Click **Export CSV** on R3 and open the file: same rows as on screen. Say: "KPI math lives in one module; the cards, charts and reports all call it, and every formula has a unit test with a hand-calculated fixture." (Criteria 6 and 11.)

### Segment 6 (8:00 to 9:00): Security and roles

1. Window A, sign in as `demo.viewer` (read-only guest). Show that create, ship and approve buttons are absent, then **paste a direct URL or use the prepared curl/Playwright check** to show a write attempt returns **403**. (T-10, criterion 7: "hiding a button is never the protection".)
2. Sign in as `demo.shipper1` and open the audit log URL: **403**. Sign in as `demo.admin` (password not published; local or presenter-only): open the audit log, show entries with user, time, old to new values, including the earlier correction and the 403 entries. Mention the Admin demo reset (env-gated, cooldown) and that Admin cannot pack or verify (separation of duties).
3. Say: "Seven fictional demo users: Admin, Supervisor, two Shipping, Receiving, Quality, Viewer. Passwords are hashed with scrypt, sessions are server-side, forms use CSRF tokens, queries are parameterized."

### Segment 7 (9:00 to 10:00): Responsive, Resources, close

1. Narrow the browser window to about 390 px (or use device mode): the navigation collapses to a labelled menu, KPI cards stack, the DEMO banner stays visible, the shipment list scrolls inside its own container. Then 768 px. (Criterion 9.)
2. Open **Resources** from the footer. Show the official documentation links (Astro, Netlify Functions and Database, PostgreSQL, Chart.js, Zod, Vitest, Playwright, OWASP Top 10 and ASVS, WCAG 2.2), the GitHub repository, and the research documents (docs/01 to 08, sources, ADR-001, scope). (Criterion 13.)
3. Close: "Version 1 is the smallest complete product that does this: 300 fictional shipments, deterministic seed, one KPI module, role-based access enforced on the server, hosted on Netlify's free plan. Deferred to version 1.1 or 2: user management screen, more charts and reports, carrier integration and a Delivered status, barcode scanning, document generation." Ask for questions.

## 3. Fallbacks

| Problem | Do this |
|---------|---------|
| Deployed site slow (cold start, database wake-up) | Open the dashboard once during the intro; or run the demo locally from the same seed. |
| Seeded state was changed by a rehearsal | Run the demo reset again, then skip the optional steps. |
| A pinned record number differs | Use the shipment list filter (status or customer) and seed summary; update section 4. |
| Behind schedule | Skip in this order: segment 3 step 3 (re-pack), segment 2 step 5 correction, segment 4 step 2, segment 5 CSV open. Never skip segment 2 steps 1 to 3 or segment 6 step 1. |
| Network down | Use the local run and the printed GitHub README; open the Resources page only as a screenshot. |

## 4. Pinned values to fill in from the seed summary before presenting

| Item | Value (copy from `db:reset-seed` summary) |
|------|-------------------------------------------|
| S-2 customer-found error shipment | SH-____ (Brightwater Marine Systems, ship date on or after 9 Nov) |
| KPI-1 / KPI-3 / KPI-4 in the default window | ____ % / ____ % / ____ % |
| KPI-7 inventory accuracy before / after approving CC-0011 | ____ % / ____ % |
| Lots | L2640-001 (traced), L2646-001 (held) |
| Pinned shipments | SH-1042 (story), SH-1284 (Rework), SH-1287 (late ship), SH-1288 (packed by shipper1), SH-1290 (packed by supervisor) |

## 5. Acceptance-criteria coverage by segment

| Scope §5 criterion | Segment |
|--------------------|---------|
| 1 Shipment flow, dashboard changes | 2 |
| 2 Ship gate | 3 |
| 3 Verifier is not the packer | 2 |
| 4 Receiving, ledger, lot trace | 4 |
| 5 Cycle count, approval, accuracy | 4 |
| 6 KPI unit tests | 5 (spoken), test report shown on request |
| 7 Role-based access | 6 |
| 8 Seed and reset, seven demo users | 0, 6 |
| 9 Responsive and accessible | 7 |
| 10 Hosting and persistence | 0 (deployed site), 7 |
| 11 Dashboard, reports, fixed date, fictional data | 1, 5 |
| 12 Rules (late reason, lock, reopen, contain, severity) | 2, 3 |
| 13 Resources page | 7 |

## 6. Open items

| # | Item | Owner |
|---|------|-------|
| D-1 | seed-plan §5 still lists severity Minor/Major/Critical; remap to Low/Medium/High/Critical (SH-1042 expected High) and remove the "SQ-7 Delivered" remark. | Dana |
| D-2 | After a reopen, which Shipping user becomes the current packer (the user who re-packs)? Confirm in the contract (US-016 AC). | Marcus, Diego |
| D-3 | The seed gives shipper1 SH-1288 and shipper2 SH-1287 as demo targets; confirm the roles of verifier and shipper on SH-1287 (packed by shipper2, verified by `demo.quality`) so that `demo.shipper2` may ship it. | Dana |
| D-4 | Quinn rehearses this script end to end once in Playwright and once by hand before the class. | Quinn |
