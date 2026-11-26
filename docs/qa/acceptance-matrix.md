# Acceptance matrix — Version 1 (DRAFT, planning phase)

**Task:** T-017 · **Owner:** Quinn (qa-tester) · **Date:** 2026-11-26 · **Status:** DRAFT. No application code exists, so no criterion is "Done". This matrix records which part of each criterion has already been *evidence-checked* (PoC or schema harness) and which tests are *planned*.
**Sources:** `docs/project-scope.md` §5 (11 criteria), `docs/api/contract.md` §13 (permission and security checklist, P-nn / T-n), `docs/security/security-plan.md` (S-01 to S-31), `docs/plan/permissions-matrix.md` (R-1 to R-13, T-1 to T-22), `docs/data-model/seed-plan.md` §11 / §14, `docs/poc/poc-report.md`.
All data is fictional (Cobalt Ridge Components, Inc.).

## How to read this

**Status values**

| Status | Meaning |
|--------|---------|
| Verified in PoC | Checked by the T-007 spike (`spikes/poc-astro-netlify-db`, 17 Vitest tests + build + smoke), run again on 2026-11-26 (17/17). |
| Verified in schema harness | Checked by `spikes/schema-check` (82 Vitest tests, in-memory PGlite 0.3.16 = PostgreSQL 17 engine). This proves the **database layer and the SQL oracle queries only**, not an API, KPI module or UI. |
| Planned | Test ID reserved; nothing to run yet. |
| Not verifiable locally | Needs the user's Netlify account (hosted Postgres, deploy, preview, credits). |

**Test-ID families**

| Prefix | Layer | Owner (writes) | Runs with |
|--------|-------|----------------|-----------|
| `SCH-nn`, `SCH-A/B/Cnn` | schema harness (exists) | Quinn | `npm test` in `spikes/schema-check` |
| `POC-n` | PoC check numbers in `docs/poc/poc-report.md` §2 | Marcus / Theo | `npm test` in `spikes/poc-astro-netlify-db` |
| `UT-…` | unit (Vitest): KPI module, Zod, auth helpers, permission map | Kenji, Diego (Quinn reviews) | `npm test` |
| `IT-…` | integration (Vitest + `@netlify/database-dev`, migrations via `applyMigrations()`) | Diego, Dana (Quinn adds role/403 and fixture tests) | `npm test` |
| `E2E-nn` | Playwright (Chromium) against `astro dev` | Quinn | `npx playwright test` |
| `A11Y-nn` | axe-core in Playwright + manual keyboard pass | Quinn | `npx playwright test --grep @a11y` |
| `S-nn` | security-plan §11 test list (S-01 to S-31); `T-n` permissions-matrix scenarios; `P-nn` contract §13 rows | Diego, Sasha, Quinn | as noted there |
| `DEP-nn` | deployed-site check (manual, user's Netlify account) | Theo + Quinn | manual checklist |

## Summary

| # | Scope §5 criterion (short) | Verified now | Planned | Not verifiable locally |
|---|----------------------------|--------------|---------|------------------------|
| 1 | Core demo flow, KPIs change | partial (DB rules + KPI oracles) | yes | — |
| 2 | Failed verification cannot ship (409) | partial (DB backstops) | yes | — |
| 3 | Verifier ≠ packer | partial (DB backstop) | yes | — |
| 4 | Receipt → on-hand → ship → lot trace | mostly (ledger, trace, fixtures) | API/UI | — |
| 5 | Cycle count → approved adjustment → accuracy % | mostly (ledger, R-4, KPI-7 oracle) | API/UI | — |
| 6 | KPI-1 to KPI-7 unit tests | oracle values only (SQL), not the KPI module | yes | — |
| 7 | 403 / 401 for every restricted action | DB-level rules only | yes (bulk) | — |
| 8 | `npm run db:reset-seed` + Admin reset | reset SQL semantics, PoC seed timing | yes | deployed reset |
| 9 | Laptop/tablet, text status, a11y | nothing | yes | — |
| 10 | Runs on Netlify, persistence, preview isolation | local persistence only | — | **yes (all hosted parts)** |
| 11 | Fixed reporting date, non-empty KPIs | settings defaults only | yes | — |

---

## 1. Create → pack (A) → verify (B) → error → rework → ship → KPIs change

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-20 to SCH-25 | schema | status transitions only along `ref_shipment_transition`; broken chain / backwards time rejected; valid next step accepted | Verified in schema harness |
| SCH-34, SCH-35, SCH-36 | schema | `Shipped` needs verifier, ship date, timestamp, carrier, packages, weight | Verified in schema harness |
| SCH-A01 to SCH-A08, SCH-B01 to SCH-B05 | schema | KPI-1/2/3/4/5/6 oracle values for fixtures A and B, boundary dates, partial shipment, cancelled | Verified in schema harness |
| POC-4 | PoC | ship = status + ledger + audit in one postgres.js transaction, rollback shown | Verified in PoC |
| UT-FLOW-01 | unit | domain state machine (all 23 transitions, each forbidden one) | Planned |
| IT-SHIP-01 | integration | create → start-packing → verify(fail) → log error → rework → complete → re-verify → ship through the repo layer; history, ledger and audit rows written together | Planned |
| IT-SHIP-02 | integration | live-record test (seed-plan §14 item 7): ship `SH-1286` on a real date after 2026-11-25 and see KPI-1, KPI-4, KPI-5, KPI-6 change on the default period (needs `business_date` columns working end to end) | Planned |
| E2E-01 | Playwright | the whole scope §5 demo flow in the browser with two users (`demo.shipper1` packs, `demo.shipper2` verifies), then the dashboard tiles and the weekly chart change | Planned |

## 2. A failed verification cannot reach Shipped without error + rework + passing re-verification (409)

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-04, SCH-21 | schema | no `Packing → Shipped`, `Rework → Shipped`, `Rework → Verified`, no `Shipped → *` | Verified in schema harness |
| SCH-34 | schema | no un-verified shipment can be `Shipped` | Verified in schema harness |
| IT-GATE-01 | integration | gate G1 (a Before-ship error with `rework_episode` = shipment episode) and G2 (a completed rework event) enforced in the API: each missing piece → **409** with the contract error code; nothing changes | Planned |
| IT-GATE-02 | integration | direct `POST` to ship / re-verify while in `Rework` → 409 (not only hidden buttons) | Planned |
| E2E-02 | Playwright | failed verification → UI offers only "log error"; ship button absent; direct request from the page context → 409 | Planned |

Observation (not a bug): gates G1/G2 (error logged, rework completed before `Rework → Packing`) are **API rules**, not database constraints (`schema.md` §6 does not list them). Criterion 2 therefore cannot be fully proven below the API layer; `IT-GATE-01` is mandatory.

## 3. Verifier ≠ packer (UI and direct request)

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-30, SCH-31 | schema | DB backstop: `shipment_verification.verified_by <> packer_id` for every role incl. Supervisor; Shipping / Quality / Supervisor other than the packer accepted | Verified in schema harness |
| SCH-32, SCH-33 | schema | `shipment.verified_by <> packed_by`, and `verified_by` with `verified_at` together | Verified in schema harness |
| SCH-37, SCH-38 | schema | Pass ⇔ empty failed items; 7 checklist keys; one row per attempt | Verified in schema harness |
| IT-VER-01 (T-1 to T-5, S-05) | integration | 403 `VERIFIER_SAME_AS_PACKER`; Supervisor packer cannot verify (T-4); after rework the new packer is current (T-5); **no verification row written** by a refused attempt | Planned |
| IT-VER-02 (S-05) | integration | two concurrent verify requests (packer and another user) cannot produce a self-verification (race, conditional UPDATE / row lock) | Planned |
| IT-VER-03 (T-16, S-06) | integration | body containing `verifierId` / `packerId` → 400 `UNKNOWN_FIELD`, nothing changes | Planned |
| E2E-03 | Playwright | `demo.shipper1` packs; verify control as `demo.shipper1` refused (UI message + direct fetch 403); `demo.shipper2`, `demo.quality`, `demo.supervisor` succeed | Planned |

## 4. Receipt → inventory → shipment consumes → on-hand per lot → lot trace (supplier receipt → customer shipment)

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-60, SCH-61, SCH-65, SCH-66 | schema | unknown lot, lot/part mismatch, per-type ledger CHECKs, SHIP row must match its shipment line, Rejected receipt creates no stock | Verified in schema harness |
| SCH-62, SCH-63, SCH-64 | schema | non-negative on-hand at commit (end-state semantics), balanced two-leg TRANSFER | Verified in schema harness |
| SCH-C01 to SCH-C07, SCH-C12 | schema | fixture C: 100 → 60 → 35 → 30 → STK-A01 20 / FG-01 10; backward trace RC-0001 Graystone 100; forward SH-3001 Aldervale 40 and SH-3002 Pinecrest 25; reconciliation 100 = 65 + 5 + 30; in-house lot; contract `reference_type/id` view | Verified in schema harness |
| POC-4 | PoC | ledger write inside a shipping transaction with rollback | Verified in PoC |
| IT-INV-01 | integration | receipt API creates RECEIPT row and on-hand; ship API consumes lot; ship of 70 more → 409 `INSUFFICIENT_STOCK` with `available` (contract §13 ship fixture) | Planned |
| IT-INV-02 | integration | transfer fixture (receipt 100, ship 30, transfer 20 out, scrap 5 → source 45, destination 20) | Planned |
| IT-INV-03 | integration | concurrent postings to one (part, location, lot) serialised by the advisory lock; no negative stock (see "Not verifiable locally" for the hosted-Postgres part) | Planned |
| IT-TRACE-01 | integration | lot trace endpoint / R7 for seeded lot returns receipt → shipment chain equal to the schema.md §5 queries; R1 row count equals list count | Planned |
| E2E-04 | Playwright | receive 100 of a lot, ship 40 on a shipment, on-hand page shows 60, lot trace page shows both ends | Planned |

## 5. Cycle count with variance → Supervisor-approved adjustment → inventory accuracy %

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-70 to SCH-73 | schema | status fields; R-4 trigger (counter / recounter cannot approve); a Supervisor who only submitted may approve (D-13); Approved is terminal | Verified in schema harness |
| SCH-74 | schema | one ADJUST per count line (second rejected), on-hand updated by the first | Verified in schema harness |
| SCH-75, SCH-76, SCH-C08 | schema | generated variance and tolerance flags (A 0 %, B 2 %, C 5 %) | Verified in schema harness |
| SCH-C09 to SCH-C11 | schema | CC-0001 fixture: first-count hit rate 50.0 %, after recount 75.0 %, absolute variance 7; ADJUSTs give 96 / 199 / 52 / 40 | Verified in schema harness |
| IT-CNT-01 (T-7, T-8, T-15) | integration | API: count 96 vs 100 (class A, recount 96) → approve by Supervisor → ADJUST −4 → on-hand 96 (contract §13 AC-5 fixture); repeat approve → 409 `ALREADY_APPROVED`; `system_qty` hidden from counters on Open counts | Planned |
| IT-CNT-02 (T-15, S-06) | integration | `APPROVER_SAME_AS_COUNTER` 403 for a Supervisor who entered or recounted a line; no ledger row | Planned |
| UT-KPI-07 | unit | KPI-7 formula in the KPI module equals the fixture value (see criterion 6) | Planned |
| E2E-05 | Playwright | `demo.receiver` counts; `demo.supervisor` approves; inventory accuracy tile changes | Planned |

## 6. KPI-1 to KPI-7 have passing unit tests against hand-calculated fixtures

The **KPI module does not exist yet**. The harness verifies that the *oracle SQL in schema.md §8 reproduces the hand-calculated values*; the module's own tests are still to be written and must hit the same numbers.

| KPI | Hand-calculated expected value (seed-plan §11) | Oracle checked by | Module unit test | Status |
|-----|-----------------------------------------------|-------------------|------------------|--------|
| KPI-1 on-time % | A: 75.0 %; 100.0; 0.0; null (empty); boundary 11-30 / 12-01; tolerance 1 day → 100.0 | SCH-A01 to SCH-A05, SCH-A07 | UT-KPI-01 | oracle: Verified in schema harness; module: Planned |
| KPI-2 OTIF % | A: 50.0 % (partial SH-1003, late SH-1002) | SCH-A01, SCH-A06 | UT-KPI-02 | same |
| KPI-3 packaging error rate, per 100, internal vs escape | B: 60.0 %, 60.0 per 100, 2 internal, 1 escape | SCH-B01 | UT-KPI-03 | same |
| KPI-4 FPY % | B: 40.0 % (SH-2004 first pass but later customer error) | SCH-B02 | UT-KPI-04 | same |
| KPI-5 rework frequency, minutes | B: 3 / 5 = 60.0 %, 95 min, avg 31.67 | SCH-B03 | UT-KPI-05 | same |
| KPI-6 cycle time median / P90 | A: median 16 h, P90 27.0 h (linear interpolation) | SCH-A01, SCH-A08 | UT-KPI-06 | same |
| KPI-7 inventory accuracy % | C: first count 50.0 %, after recount 75.0 %, variance 7 | SCH-C09, SCH-C10 | UT-KPI-07 | same |
| Edge cases required by `kpi-definitions` | empty period → null; all on time; none on time; cancelled excluded; partial shipment; boundary date | SCH-A02 to SCH-A06, SCH-B04, SCH-C10 | UT-KPI-EDGE-01..06 | same |

Open definition questions that change expected values and must be answered by Kenji before `UT-KPI-*` are written: DQ-2 / SQ-6 (KPI-7 headline: first count or after recount), DQ-3 (KPI-3 denominator anchors), DQ-4 (KPI-4 with a customer-found error), DQ-5 (P90 method).

## 7. Non-permitted roles get 403, unauthenticated 401, for every restricted action

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-10 to SCH-14 | schema | R-10: UPDATE / DELETE on audit, history, verification, ledger rejected (restrict_violation); TRUNCATE allowed | Verified in schema harness |
| SCH-15, SCH-16 | schema | no business-row delete; line delete only while Planned / Ready to Pack | Verified in schema harness |
| SCH-50 | schema | emails only `@example.com`; active user needs a hash | Verified in schema harness |
| UT-PERM-01 (S-01) | unit | `permissions.ts` map equals permissions-matrix §2 for every action × role; a route without an entry is denied | Planned |
| IT-AUTHZ-01 (S-02, S-06, contract §13 P-04 to P-25) | integration | generated from the §13 table: every write endpoint × every role not allowed → 403, **row-count / ledger checksum unchanged**, one `ACCESS_DENIED` audit row; the Viewer calls every write endpoint (T-10) | Planned |
| IT-AUTHZ-02 (S-03, T-12) | integration | every protected page / endpoint without session → 401 / redirect; public allow-list is exactly `/login`, assets, `robots.txt` | Planned |
| IT-AUTHZ-03 (T-6, T-9, T-13, T-18, T-19, T-22) | integration | special rules: Admin is not an operator (R-2), Shipping cancels only early (R-5), hold release by Quality/Supervisor (R-6), R-7 hold-location moves, R-8 after-ship errors | Planned |
| IT-CSRF-01 (S-07, S-08, S-09, T-14, T-17, T-21) | integration | forged Origin + JSON → 403; wrong content type → 415; GET of a write URL → 405; no `Access-Control-Allow-Origin` | Planned |
| E2E-06 (S-04) | Playwright | hidden buttons are also blocked server-side: direct POST from a Viewer / Shipping browser session | Planned |
| S-10 to S-24, S-28 | security tests | password storage, cookie flags, rotation, expiry, rate limit, Zod limits, XSS, CSV, headers, error leakage, audit content | Planned (Sasha / Diego) |
| S-18, S-25, S-27 | CI static checks | banned APIs grep, secret scan, workflow lint | Planned (Theo) |
| S-26 | dependency audit | `npm audit --audit-level=high` exits 0 | Verified in PoC (exit 0, 0 high / critical, 10 moderate, re-run 2026-11-26) for the PoC lockfile only; Planned for the real app |

## 8. `npm run db:reset-seed` rebuilds deterministically; Admin-only reset on the deployed site

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-80 | schema | the reset `TRUNCATE … RESTART IDENTITY CASCADE` restarts `SH-1001 / PE-0001 / CC-0001`, ids restart at 1, system settings (salt) survive, config settings return to defaults, `ref_shipment_transition` untouched, `audit_log` untouched | Verified in schema harness |
| POC-6 | PoC | batched seed of ~3,000 rows in one transaction in 0.57 s locally | Verified in PoC (local only) |
| IT-SEED-01 (seed-plan §14.1) | integration | seed twice → equal checksums; counts equal seed-plan §5; every V-query returns zero rows | Planned |
| IT-SEED-02 (§14.2) | integration | after seeding, next numbers are `SH-1301`, `RC-0151`, `PE-0022`, `CC-0013` | Planned |
| IT-SEED-03 (§14.3) | integration | fixtures A, B, C reproduce the expected values through the KPI module and repo layer (not only SQL) | Planned |
| IT-SEED-04 (S-31) | integration | fictional-only scan: cast names, `example.com`, tracking prefixes `SLP/HFL/TAX`, no outbound `fetch` in `src/lib/seed/` | Planned |
| IT-RESET-01 (S-28, S-29, S-30, T-11, T-20) | integration | Supervisor → 403; flag off → 404; second reset in 10 min → 429; sessions ended; `DEMO_RESET` audit rows exist; `demo.admin` inactive without `DEMO_ADMIN_PASSWORD` | Planned |
| DEP-04 | deployed | reset on the deployed site, duration within the function limit | Not verifiable locally |

## 9. Laptop and tablet usable; status not by colour alone; no critical / serious axe findings

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| A11Y-01 | Playwright + axe | zero critical / serious violations on login, dashboard, shipment list, shipment form, shipment detail, inventory pages | Planned |
| A11Y-02 | manual | keyboard-only pass of the demo flow (focus visible, no trap, dialogs, tables) recorded in the QA report | Planned |
| A11Y-03 | Playwright | viewports 1366×768 and 1024×768 (tablet): no horizontal clipping of primary actions, targets ≥ 24 px (44 px primary) | Planned |
| A11Y-04 | Playwright | every status badge and KPI direction has text, not only colour; each chart has a text summary and a data-table alternative | Planned |
| S-21 | Playwright | zero `securitypolicyviolation` events on every page including charts (CSP) | Planned |
| POC-9b | PoC | one smoke page renders a Chart.js chart with no page errors under `astro dev` | Verified in PoC (smoke only; not an accessibility result) |

## 10. Runs on Netlify; records persist across redeploys and cold starts; preview data isolated from production

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| POC-5 | PoC | data persists across restart of the **local** on-disk emulator | Verified in PoC (local) |
| DEP-01 | deployed | record created on the deployed site survives a redeploy | Not verifiable locally |
| DEP-02 | deployed | record survives a function cold start (idle > 15 min) and DB wake-up latency is acceptable | Not verifiable locally |
| DEP-03 | deployed | a deploy preview's writes do not appear in production (separate DB branch) | Not verifiable locally |
| DEP-05 | deployed | credit usage of build + test deploys within the 300 credits / month budget; hard stop not hit | Not verifiable locally |
| DEP-06 | deployed | `astro build` output runs as Netlify Functions; middleware (auth/CSRF) executes in the function context | Planned; build + local middleware verified in PoC (POC-1, POC-7); hosted run not verifiable locally |
| DEP-07 | deployed | migrations apply on a preview and on production deploy; failed migration blocks publish | Not verifiable locally |

## 11. Fixed, labelled reporting date; default view non-empty regardless of real date

| Test ID | Layer | What it proves | Status |
|---------|-------|----------------|--------|
| SCH-03 | schema | defaults `reporting_mode = fixed`, `reporting_date = 2026-11-25`, targets and tolerances present | Verified in schema harness |
| SCH-52 | schema | impossible / out-of-range reporting dates and modes rejected by CHECK | Verified in schema harness |
| IT-SEED-05 (seed-plan §10) | integration | the generated seed produces the documented KPI bands for the default window (non-null KPI-1…7; shipped in window 74–80) — the bands are design predictions, not yet generated data | Planned |
| UT-CLOCK-01 | unit | `business_today` / `business_now` helper: fixed mode returns the reporting date for any real date (fake clock at 2026-11-26, 2027-03-01, 2030-01-01) | Planned |
| E2E-07 | Playwright | dashboard shows the "as of 2026-11-25" label and non-empty tiles / charts with the real clock faked to a later date | Planned |
| E2E-08 | Playwright | Admin changes the reporting date; dashboard and default period move; audit row written | Planned |

---

## Cross-cutting traceability

| Item | Where |
|------|-------|
| DB backstops proven now | SCH-10…SCH-16, SCH-20…SCH-26, SCH-30…SCH-38, SCH-60…SCH-66, SCH-70…SCH-76, SCH-80 |
| Doc queries executed as written (extracted at run time) | schema.md §5 (lot trace, on-hand, reconciliation) and §8 (KPI oracles) |
| Rules that are API-only and therefore **need** `IT-*` tests | role permissions, R-1 identity at request time, G1/G2 rework gate, R-5, R-7, R-8, carrier/tracking rule, location-type rules, tolerance days, `due_date` rules, "5 minute future" limits (schema.md §6 last paragraph) |
| Contract §13 fixtures owned by domain tests | AC-5 count, transfer, ship (INSUFFICIENT_STOCK), R1 count, CSV guard, forced DB error, no secrets in audit/logs |
