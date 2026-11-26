# QA test report — planning-phase technical verification (T-017)

**Date:** 2026-11-26 · **Author:** Quinn (qa-tester) · **Branch:** `main` @ `35e7d46` + uncommitted doc edits by Marcus (T-016) · **Node:** 22.23.5
**Scope of this report:** the planning-phase gate (may full implementation start?). It is **not** a release report: no application exists, so the 11 acceptance criteria of `docs/project-scope.md` §5 cannot be verified end to end. Mapping: [`acceptance-matrix.md`](acceptance-matrix.md).
All data is fictional (Cobalt Ridge Components, Inc.). Nothing was committed, pushed or deployed. No application feature code was written or changed.

## 1. Recommendation

**GO** to start full implementation (Foundation phase), with the conditions in section 7.

Reasoning in one paragraph: every check that can be run locally passed (team validation, plugin validation, PoC 17/17, `astro check` 0/0/0, `npm audit` exit 0, schema harness 82/82), no bug was found, and the database layer of the 0001 DDL now has a re-runnable regression harness. What is *not* proven is large and is listed explicitly in section 5: all hosted-Netlify behaviour (criterion 10), every API/KPI-module/UI/accessibility criterion (no code exists), and the non-negotiable open questions in section 7. None of these blocks starting the Foundation phase; several block *later* gates.

## 2. Commands run and exact results

### 2.1 Existing checks (re-run today)

| # | Command (working directory) | Result |
|---|-----------------------------|--------|
| 1 | `python3 .claude/skills/validate-agent-team/validate.py` (repo root) | `Agents: 12  Skills: 19` … `RESULT: PASS with 0 warning(s)`, exit **0** |
| 2 | `claude plugin validate .claude/agents` (repo root) | `√ Validation passed`, exit **0** |
| 3 | `npm test` (`spikes/poc-astro-netlify-db`; `node_modules` already present, `npm ci` not needed) | `Test Files 5 passed (5)`, `Tests 17 passed (17)`, 0 failed, 0 skipped, 13.22 s, exit **0** |
| 4 | `npx astro check` (same dir) | `Result (17 files): 0 errors, 0 warnings, 0 hints`, exit **0** |
| 5 | `npm audit --audit-level=high` (same dir) | exit **0**; **10 moderate**, 0 high, 0 critical (e.g. `minimatch` DoS advisory GHSA-g3hv-75wg-m249 via `archiver` → `readdir-glob`; only fix offered is `npm audit fix --force` which downgrades `@astrojs/netlify` to 6.5.13, a breaking change, so it was **not** applied). Same numbers as the PoC report. |

### 2.2 New schema verification harness

Location: `spikes/schema-check/` (own `package.json`, `package-lock.json`, `.npmrc`, `.gitignore` with `node_modules/`).
Pins: `@electric-sql/pglite` **0.3.16** (same as the PoC's `node_modules`), `vitest` 5.1.1, `vite` 8.3.8 (same as PoC).

Re-run (from the repo root):

```bash
cd spikes/schema-check && npm ci && npm test
```

Result (run 3 times in a row at the end of the session, same output):

```
 Test Files  3 passed (3)
      Tests  82 passed (82)
   Duration  ~4.5 s     exit 0
```

| Test file | Tests | Passed | Failed | Skipped |
|-----------|------:|-------:|-------:|--------:|
| `tests/ddl.test.ts` | 7 | 7 | 0 | 0 |
| `tests/constraints.test.ts` | 49 | 49 | 0 | 0 |
| `tests/fixtures.test.ts` | 26 | 26 | 0 | 0 |
| **Total** | **82** | **82** | **0** | **0** |

How it works (so the result can be trusted and repeated):

- `tests/helpers.ts` reads `docs/data-model/migrations-plan.md` **every run**, takes the single ```` ```sql ```` block under the heading `## 3. 0001_core_schema`, and executes it on a fresh in-memory PGlite. At the final run that block was 741 lines (sha-256 prefix `064db76f71d4e017`). If Marcus or Dana edit the DDL, the next `npm test` tests the edited DDL; if the heading or block disappears the suite fails loudly.
- The KPI oracle queries (schema.md §8) and the lot-trace / on-hand / reconciliation queries (schema.md §5) are **also extracted from the document at run time** and executed unmodified against the fixtures, so a wrong query in the doc fails a test.
- Fixtures A, B and C are rebuilt from the hand calculations in `seed-plan.md` §11 (fictional users, customers, parts, lots).
- Each negative test asserts the database message and SQLSTATE, and that nothing was written.

What the 82 tests cover (IDs are used in the acceptance matrix):

| Area | IDs | Result |
|------|-----|--------|
| DDL shape: 24 tables, 5 views, 18 settings incl. random salt, 23 transitions, trigger inventory (4 append-only, 17 no-delete, 16 updated_at, 2 deferred), text+CHECK enums | SCH-01…07 | pass |
| Append-only: UPDATE and DELETE rejected on `audit_log`, `shipment_status_history`, `shipment_verification`, `inventory_transaction`; TRUNCATE allowed | SCH-10…14 | pass |
| No business-row delete (17 tables); `shipment_line` delete only while Planned / Ready to Pack | SCH-15, 16 | pass |
| Invalid status transition rejected by FK; broken chain, backwards time, wrong first row rejected by trigger; `Delivered` not allowed in v1 | SCH-20…26 | pass |
| Verifier ≠ packer (verification row and shipment row, incl. Supervisor); no `Shipped` without verifier or ship fields; Pass ⇔ no failed items; 7 checklist keys; unique attempt | SCH-30…38 | pass |
| Hold, rework, late-reason, date, short-line, packaging-error and rework-event CHECKs | SCH-40…46 | pass |
| Users (`@example.com` only, hash for active users), part-number/revision rule, upper-case lots, settings CHECKs (range, type, enum, impossible date), `updated_at` trigger | SCH-50…53 | pass |
| Ledger: unknown lot / wrong part, per-type CHECKs, non-negative on-hand at commit (end-state semantics), balanced two-leg TRANSFER, SHIP row matches its line, Rejected receipt has no location | SCH-60…66 | pass |
| Cycle counts: status fields, R-4 trigger (counter and recounter), Approved terminal, one ADJUST per line, generated variance/tolerance columns | SCH-70…76 | pass |
| Reset semantics: TRUNCATE … RESTART IDENTITY CASCADE restarts `SH-1001`, `PE-0001`, `CC-0001`; system settings and `audit_log` survive | SCH-80 | pass |
| Fixture A (KPI-1, 2, 6): 75.0 %, 50.0 %, median 16 h, P90 27.0 h, sub-periods 100.0 / 0.0 / null, boundary days, tolerance 1 day, cancelled and partial shipments | SCH-A00…A08 | pass |
| Fixture B (KPI-3, 4, 5): 60.0 %, 60.0 per 100, 2 internal + 1 escape, FPY 40.0 %, 3 events / 95 min / 31.67 min avg / 60.0 %, empty period | SCH-B01…B05 | pass |
| Fixture C (ledger, lot trace, KPI-7): 100→60→35→30→20/10, backward and forward trace, reconciliation 100 = 65 + 5 + 30, in-house lot, KPI-7 50.0 / 75.0 / 7, adjustments 96/199/52/40, contract reference view | SCH-C01…C12 | pass |

### 2.3 Test-side corrections made while building the harness (transparency)

No test was weakened to get green. The history was:

1. First full run: **3 failures, all mistakes in my tests** (not schema defects): two assertions expected the wrong error text because a trigger fires before a CHECK / FK (SCH-21, SCH-70, SCH-71 regex), and the oracle query for the on-hand view does not select `on_hold` (SCH-C02). I corrected the tests to target the intended rule (e.g. SCH-21 now builds the history chain so that only the transition table can reject the row).
2. While I was working, **Marcus's T-016 edits to `migrations-plan.md` changed the DDL** (the harness picked them up immediately, which is the intended behaviour):
   - `rework_event.completed_business_date` became a **generated column** (D-1). The harness failed on `INSERT` with an explicit value (`cannot insert a non-DEFAULT value into column "completed_business_date"`). I updated SCH-46 and fixture B to the new contract: the explicit value is now asserted to be **rejected**, and the generated value is asserted to equal the UTC date of `completed_at` (also at 23:59:59Z) and to be NULL while open.
   - The `cycle_count` CHECK `approved_by <> submitted_by` was **removed** (D-13). The old SCH-72 asserted that approval by the submitter was rejected. Matrix R-4 forbids approval only by someone who entered or recounted a line, so SCH-72 now asserts the documented behaviour (a Supervisor who only submitted **may** approve) while SCH-71 still proves the trigger rejects any counter or recounter. **Reviewer attention:** this is a deliberate reduction of DB-level protection made by the architect; Priya should confirm that "submitter may approve" is the intended business rule (matrix R-4 wording supports it).
3. After those changes the harness is 82/82 with no skips.

## 3. Bugs

**Open bugs: none (0 Critical, 0 High, 0 Medium, 0 Low).** The harness found no defect in the 0001 DDL or in the doc queries.

Observations and doc follow-ups (not bugs; owners named):

| ID | Severity | Observation | Owner |
|----|----------|-------------|-------|
| OBS-01 | Low (doc) | `migrations-plan.md` §1 ("44 assertions") and §4 describe a scratch script that was never committed. The committed, re-runnable evidence is now `spikes/schema-check` (82 tests). Suggest pointing §4 at it. | Dana |
| OBS-02 | Low (tooling) | In `spikes/schema-check`, a plain `npm install` crashed with `Cannot read properties of null (reading 'edgesOut')`; it works with `.npmrc` `legacy-peer-deps=true` plus `vite` listed explicitly (vitest 5 peer). The real app's CI (`npm ci`) should be checked for the same npm behaviour early. | Theo |
| OBS-03 | Medium (risk) | Several rules are **API-only** and cannot be proven below the API: role permissions, request-time verifier identity (R-1), rework gate G1/G2 (error logged and rework completed before re-verification), R-5, R-7, R-8, carrier/tracking, location-type rules, `shipment.status` = last history row (schema says "invariant checked by seed validation and a data test"; **no DB constraint**, not yet tested). They are listed in the matrix as mandatory `IT-*` tests. | Diego, Quinn |
| OBS-04 | Low | The R-3 rule "only a Supervisor approves a count" is not (and cannot be) a DB rule; SCH-73 uses `demo.quality` as an eligible approver only to prove the DB accepts a non-counter. API test `IT-CNT-02` must cover the role. | Diego |
| OBS-05 | Info | PoC `npm audit`: 10 moderate advisories, no fix without a breaking downgrade. Must be re-evaluated for the real app (S-26 requires exit 0 at `--audit-level=high` only). | Sasha |
| OBS-06 | Info | Open definition questions change expected KPI values: DQ-2 / SQ-6 (KPI-7 first count vs after recount), DQ-3 (KPI-3 denominator), DQ-4 (KPI-4 and customer-found errors), DQ-5 (P90 method). The harness encodes the doc's current choices. | Kenji |

## 4. Verified now (with evidence)

| Claim | Evidence |
|-------|----------|
| Agent team definition is valid | commands 1 and 2 |
| PoC stack builds, type-checks and its 17 tests pass; local persistence, transaction rollback, append-only trigger, seed of ~3,000 rows in 0.57 s locally, middleware in function context, Chart.js bundle | command 3, 4; `docs/poc/poc-report.md` §2 |
| The 0001 DDL (as currently written in the doc) applies to PostgreSQL 17 (PGlite) and enforces: append-only, no-delete, transition table, verifier ≠ packer, no ship without verifier, non-negative on-hand, balanced TRANSFER, one ADJUST per count line, R-4 approver guard, settings guardrails, lot integrity | section 2.2 |
| The documented KPI-1…7 oracle SQL reproduces every hand-calculated fixture value, including edge cases (empty → NULL, boundaries, cancelled, partial) | SCH-A/B/C |
| Lot trace supplier receipt → customer shipment, and on-hand per lot, are correct on fixture C | SCH-C01…C07 |

## 5. Not verified: planned only, or requires Netlify

### 5.1 Planned (needs code that does not exist yet)

KPI module unit tests (`UT-KPI-*`, the oracle values above are their expected numbers); permission map and the 403 / 401 bulk suite (`UT-PERM-01`, `IT-AUTHZ-*`, S-01…S-09); API gates and 409 behaviour (`IT-GATE-*`); race tests for verify and ledger postings; all Playwright demo flows (`E2E-01…08`); seed determinism, counts and bands (`IT-SEED-*`); reset endpoint behaviour (`IT-RESET-01`); accessibility (axe, keyboard, tablet viewports, `A11Y-01…04`); security tests S-10…S-24, S-28…S-31 and CI checks S-18, S-25, S-27. The seed-plan §10 KPI bands (e.g. shipped in window 74–80, KPI-7 88.2 %) are design predictions; no seed has been generated, so they are **unverified**.

### 5.2 Requires the user's Netlify account (cannot be verified locally)

| Item | Why | Matrix ID |
|------|-----|-----------|
| Persistence of hosted Postgres across **redeploys** and **function cold starts** | PoC verified only a local on-disk emulator | DEP-01, DEP-02 |
| Deploy preview data isolated from production | needs preview branch databases | DEP-03 |
| **Remote seed timing** (60 s function limit, scrypt memory for 7 users, DB wake-up, network latency; local 0.57 s is not representative) and remote reset | needs a deployed site | DEP-04 (SQ-2) |
| **Cold-start / DB-wake latency** | measured only on Netlify | DEP-02 |
| **Credit usage** of builds and deploys against the 300 credits/month hard stop | visible only in the Netlify account | DEP-05 |
| Migration apply on preview and production, failed migration blocking publish | Netlify behaviour | DEP-07 |
| Advisory-lock behaviour of the deferred non-negative trigger under two **concurrent** transactions, and commit time of the full ledger seed with the triggers left on (D-10) | PGlite is single-connection | IT-INV-03, SQ-2 |
| Hosted Postgres version/behaviour vs PGlite 0.3 (PostgreSQL 17 engine) | rerun `IT-*` on the first preview | DEP-07 |
| Edge Functions emulation (PoC D6: "fetch failed" in `astro dev`) | non-blocking for v1 | — |

## 6. Totals

| Suite | Command | Passed | Failed | Skipped |
|-------|---------|-------:|-------:|--------:|
| PoC Vitest | `npm test` in `spikes/poc-astro-netlify-db` | 17 | 0 | 0 |
| Schema harness Vitest | `npm test` in `spikes/schema-check` | 82 | 0 | 0 |
| Team validation | `validate.py` | PASS | | |
| Plugin validation | `claude plugin validate .claude/agents` | PASS | | |
| `astro check` | | 0 errors, 0 warnings, 0 hints | | |
| `npm audit --audit-level=high` | | exit 0 (10 moderate) | | |
| **Automated tests total** | | **99** | **0** | **0** |

Playwright, axe, API and KPI-module suites: **not run, not yet written** (no application code).

## 7. GO conditions and next steps

GO for Foundation phase (B1: skeleton, CI, migration 0001, seed, auth), provided:

1. **User approval** of full implementation (CLAUDE.md rule 3). This report is the QA input, not the approval.
2. Dana/Marcus keep `spikes/schema-check` green when the DDL changes and, once the first migration file exists, Diego/Dana move the same assertions to run against `netlify/database/migrations/0001_core_schema/migration.sql` through `applyMigrations()` (the doc-extraction step is then replaced by reading the file; the assertions stay).
3. Kenji answers DQ-2…DQ-5 **before** `UT-KPI-*` are written; Priya confirms the R-4 reading ("a submitter who counted nothing may approve").
4. Theo plans `DEP-01…07` as a **single, minimal** deploy sequence, with credit usage recorded before and after (Free plan, hard stop).
5. Release gate (later, not this report): all `IT-*`, `E2E-*`, `A11Y-*`, S-nn green, zero open Critical/High bugs, and `DEP-*` done by the user.

Next suggested tasks: Diego to implement the permission map from matrix §2 with `UT-PERM-01` first; Kenji the KPI module against the fixture numbers in the acceptance matrix §6; Quinn to add the Playwright skeleton once `astro dev` serves a login page.
