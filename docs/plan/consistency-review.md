# Phase 2 Architecture Consistency Review (T-016)

**Owner:** Marcus (software-architect) · **Date:** 2026-11-26 · **Requested by:** Olivia (orchestrator) for the user
**Status:** DONE. Reconciliation edits have been applied to the design documents. Nothing is committed by Marcus.
**Baseline reviewed:** `main` at `35e7d46` (T-012 data model), with the T-014 contract DRAFT 2 (`6a3b0c9`) and UI spec rev 2. Olivia's checkpoint commit `f4054c2` contains most of the edits below.
Tags: **[R]** verified (command or document cited), **[A]** assumption, **[P]** proposed. All data is **fictional** (Cobalt Ridge Components, Inc.).

## 1. Scope and method

| Artifact | Version read | Read in full? |
|----------|--------------|---------------|
| `docs/data-model/schema.md`, `migrations-plan.md` (0001 DDL), `seed-plan.md` | T-012 draft | yes |
| `docs/api/contract.md` | DRAFT 2 | yes |
| `docs/plan/permissions-matrix.md` | REVIEWED (final) | yes |
| `docs/security/security-plan.md`, `threat-model.md` | PROPOSED | security plan in full; threat model searched for audit, reset and AR items |
| `docs/design/ui-spec.md` | rev 2 | yes, all S01–S26 and §14 |
| `docs/project-scope.md` §5 (11 AC), `docs/plan/backlog.md` (V1-CORE index, US-019/022/029/032/044/046/047), `docs/ADR-001.md` §8, `docs/poc/poc-report.md` R-1 | | the sections listed |

Method:
1. I cross-checked every entity, field, enum, status, error code, role and endpoint across the four design artifacts.
2. I traced every V1-CORE story and screen to an endpoint.
3. I looked for every database constraint that could turn a request the contract calls valid into a 500.

Authority came from Olivia's brief. I decided the cross-cutting technical questions and edited the design docs. I did **not** change `project-scope.md`, the permissions matrix role decisions or any user decision. Product questions are listed in §6 with a recommended answer.

**Verification run [R]:**
- I extracted the edited 0001 DDL from `migrations-plan.md` and applied it to in-memory PGlite 0.3.16 (Node 22.23.5): 24 tables and 5 views.
- I checked the two DDL changes directly. The generated `completed_business_date` is accepted, equals the UTC date of `completed_at` whatever the session time zone is, and rejects an explicit value. A Supervisor who only submitted a count can now approve it. The R-4 trigger still rejects a counter.
- Quinn's harness `spikes/schema-check` (T-017) was then run against the edited document: **82 passed, 0 failed**.
- Nothing was run on Netlify's hosted database.

## 2. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| **D-1** | Q-A business clock (Dana's Option A vs B) | **Option A, refined: two clocks, one owner per column.** **Real `now()`** (server only) for every system and event timestamp: created/updated, audit `at`, sessions, `status_history.changed_at`, `verified_at`, `shipped_at`, `txn_at`, count `submitted_at` / `approved_at` / `counted_at` / `recounted_at`, `closed_at`. **Business dates**: order, requested, promise, ship, due and scheduled dates; `status_history.business_date`, `shipment_verification.business_date` and `cycle_count.approved_business_date` (server writes `business_today`). **User-entered business instants** (default `business_now`, at most `business_now` + 5 min): `detected_at`, rework `started_at` **and `completed_at`**, `arrived_at`. `rework_event.completed_business_date` becomes a **generated column** from `completed_at`. KPI periods filter on business dates only. | **AC-1/AC-11:** live records created on any later real date carry business dates equal to the reporting date. They land in the default window and move KPI-1..7 and C1..C3. **Option B rejected:** `business_now` repeats the same calendar day with the real time of day. An action done on a later real day at an earlier hour gets an *earlier* timestamp, which breaks `status_history_chain_check` and `completed_at >= started_at` with 500s in ordinary multi-day demo use. Option A keeps real time monotonic, so mode switches can never break a constraint. **Mixed-clock rework minutes resolved:** both rework times are on one clock, and the generated date cannot drift. **Accepted limitation:** KPI-6 is real elapsed time, so a *seeded* open shipment shipped months later shows a long cycle time. The demo script uses a new shipment (seed-plan test 7). |
| **D-2** | Late-reason tolerance vs `shipment_late_reason_chk` (mismatch 9) | Late reason **required iff `ship_date > promise_date`**, independent of `on_time_tolerance_days`. The tolerance affects only KPI-1/2 and `on_time_indicator`. A late reason on a not-late shipment is refused (422). The DB CHECK stays. | It matches docs/01 ("late shipments require a late reason"), the R2 definition (ship date after promise date), UI S07 copy and the CHECK, so no valid request can 500. US-022's "(with the configured tolerance of 0 days)" is ambiguous, so Priya should confirm (§6 P-1). If she wants tolerance-aware reasons, one migration drops the CHECK. |
| **D-3** | Part/revision regex vs Zod (mismatch 10) | **Zod mirrors the DB:** upper-case, `^[A-Z0-9][A-Z0-9-]{2,29}$`, revision `^[A-Z0-9]{1,10}$`, part number ends with `-<revision>`. A violation is 422. | The DB rule makes revision part of the part identity (`CRC-####-<rev>`, fictional-data skill). The contract's "3..30 / 1..10" would have let `CRC-2041` + `B` through to a CHECK violation (500). UI S24 showed exactly that example and is corrected. |
| **D-4** | `putaway_at` (mismatch 3) | API returns `putaway_at: null`. The column arrives with migration 0004 (US-064). No change. | Additive later; documented in contract E-29 and schema §11. |
| **D-5** | Demo reset: keep or truncate `audit_log` (mismatch 5, DQ-1, Q-M, UI 14.23) | **Truncate** `audit_log` with the business tables, then re-insert one `DEMO_RESET` row (actor, start time, counts, checksum). The "before" row, written in its own committed transaction, survives only when the reset rolls back, so it records failed attempts. | Security plan PD-9 and threat T14: the reset must wipe visitor free text, and audit `changes` holds old→new free text. `RESTART IDENTITY` re-numbers records, so kept audit `record_id`s would collide with new records on the audit screen. The cooldown reads `setting.last_demo_reset_at`, not the audit log, so nothing functional is lost. The contract already said this; schema and seed plan are aligned to it. |
| **D-6** | Reset cooldown (mismatch 6) | **10 minutes** (matrix R-9). | The contract DRAFT 2 already says 10 min in §1.4, the registry and E-52. Dana's "60 s" note refers to an older draft (60 s is the function limit). Consistent. |
| **D-7** | Failed-login username (mismatch 7) | Record the attempted username **only if the user exists**, otherwise `unknown`. | Contract §1.8 DRAFT 2 already says this (security plan §9). UI S25 annotation aligned. |
| **D-8** | Form submission model (UI 14.19 / contract Q-O) | **Two surfaces, one service layer.** Pages use **plain `application/x-www-form-urlencoded` POST forms** with a hidden `_csrf` field and PRG (303). `/api/v1/*` writes accept **only `application/json`** with `X-CSRF-Token`. `multipart/form-data` is accepted nowhere in v1. Each form route calls the same Zod schema and service function as its API endpoint, and both return the same codes. Route map and form-decoding rules are in contract **§1.12**. | ADR-001 §8 #4 already specifies "SSR form handlers accept only urlencoded". The UI spec's no-JavaScript rule (S04 add/remove line, S06, S07) needs real forms. Matrix T-17 already expects "form write with `application/json` → 415". The contract's "fetch everywhere" answer contradicted all three. `checkOrigin` *does* cover urlencoded posts (PoC R-1), and the token and the 415 allow-list cover JSON. |
| **D-9** | Check order (contract §1.3 vs security plan §4 vs matrix §1) | **Contract §1.3 is authoritative:** 405 → 401 → 403 Origin → 415/413 → 403 token → 403 role → 400/422 → 403 identity / role-by-state → 409 → 429 (login checks its 429 first; E-52 returns 404 when the flag is off, before CSRF). The 64 KB limit moves to step 2b so a form body is bounded before middleware reads `_csrf`. | The security plan's conditional UPDATE plus "follow-up read decides 403 vs 409" gives the same result, and the matrix list is the same order without the details. **Contradiction fixed:** the contract's "Actions: common rules" line put 409 before the 403 identity rules, contrary to §1.3 step 5 and to E-11/E-15/E-40. |
| **D-10** | Seed disables the deferred ledger triggers inside its transaction (DQ-8, SQ-4) | **Not acceptable. Triggers stay enabled.** | `ALTER TABLE … DISABLE TRIGGER` is DDL in application code (the reset runs in a Netlify Function), which security plan §8.2, threat model AR-4 and migrations-plan §6.3 rule out. Both triggers are checked at COMMIT, so insert order does not matter. A few hundred distinct ledger keys are far below the lock table (about 64 × max_connections slots). Seed timing on Netlify is measured in SQ-2. |
| **D-11** | Rework gate G1/G2 by timestamps (Q-K) | Use `shipment.rework_episode` / `packaging_error.rework_episode` (Dana's columns, already in 0001). | Removes the same-transaction timestamp ambiguity. The columns cost nothing. |
| **D-12** | *(new)* Lot numbers and the composite `(part_id, lot_number) → lot` FKs | **Lot registry rule:** receipts and PRODUCTION_COMPLETE create the `lot` row if it is new. Every other lot input must be an existing lot of the same part. A conflict is 422 `LOT_PART_MISMATCH`. | Without it, a new lot on a receipt, an unknown lot on a shipment line, or a lot of another part violates an FK, which is a 500. The contract never said who creates `lot` rows. |
| **D-13** | *(new)* DB CHECK `approved_by <> submitted_by` | **Removed from 0001.** R-4 stays exactly as the matrix states it (entered or recounted any line), enforced by the API (403) and the `cycle_count_approval_guard` trigger. | The CHECK was stricter than the REVIEWED matrix. A Supervisor who only pressed Submit (allowed, P-18) would have got a 500 on approval. I may not change the matrix rule; extending R-4 to the submitter is listed as a recommendation for Priya and Sasha (§6 P-2). |
| **D-14** | *(new)* `shipment_dates_chk` requires `requested_date >= order_date` | Contract E-06/E-08 validate it (422). | The contract validated only promise ≥ order, so a request with an early requested date would have violated the CHECK (500). |
| **D-15** | *(new)* Verification notes and the two outcome buttons (UI S06, E-VER-4/5/6) | **One `note` per attempt, required when any item fails**. An optional `outcome` (`pass`/`fail`, from the pressed button) that disagrees with the checklist is 422. | The DB and contract have one note. The UI had per-item notes (no field, so the request would fail with 400 `UNKNOWN_FIELD`) and messages that needed an outcome field the contract did not define. |
| **D-16** | *(new)* Cycle-count approval reason (UI S19 per line vs E-40 single) | **One adjust reason per approval** (`cycle_count.approval_reason_code_id`). | DB and contract hold one; US-044 says "an adjust reason code". The UI is corrected. |
| **D-17** | *(new)* UI fields that the contract would reject | **S10:** no root-cause section (E-18 rejects it; root cause is P-14 via S13). **S12:** "Performed by" is read-only (R-12) and the note field is removed (no column). **S13:** status on create is text ("Open"). **S07:** short-ship note per line (`lines[].short_note`), lot select limited to Stock/FG/Shipping. **S04:** Rework-trigger fields as E-08. **S23:** phrase `RESET DEMO DATA` (E-52). **S24:** part number `CRC-2041-B` format. **S02:** KPI basis toggle added (US-047 AC; E-48/E-49 `basis`). | Each was a valid UI action that the API would have answered with 400/422, or a V1-CORE acceptance criterion with no control on screen. |
| **D-18** | *(new)* Contract field names and effects | E-13 request `owner_dept` → `hold_owner_dept`; E-41 backward `received_at` → `arrived_at`; E-34 accepts `note`; E-39 sets `submitted_by`; E-22 sets `closed_at`; E-12 sets `shipped_at` (= SHIP `txn_at`); E-25 no longer writes the generated date; `target_*_h` minimum 0.01 (DB range); E-51 `record_id` accepts business keys; §1.11 "422 unknown field" → 400 `UNKNOWN_FIELD`. | Each is a column that is NOT NULL, a CHECK the contract did not fill or respect, or an internal naming contradiction. |

## 3. Cross-artifact matrix

Status: **Consistent** (agreed before this review) · **Fixed** (edited in T-016) · **Open** (owner in §6).

| # | Item | Schema / DDL | Contract | Security / Matrix | UI spec | Status |
|---|------|--------------|----------|-------------------|---------|--------|
| 1 | Roles (Admin, Supervisor, Shipping, Receiving, Quality, Viewer), one per user | `app_user.role` CHECK | §2, R-11 | matrix §1/§4 | 2.3, 2.4 | Consistent |
| 2 | Shipment statuses (8; Delivered deferred) | CHECK + 23 transitions | §1.7, §2 | — | 4.1, S05 | Consistent |
| 3 | Error category / subtype / severity / stage / detected-by / 6M / status | CHECKs | §2 | — | S10, S13 | Consistent |
| 4 | Rework actions, corrective-action statuses, inspection, txn types, location types, carrier modes, reason categories, count statuses, ABC | CHECKs | §2 | — | S12–S19, S24 | Consistent |
| 5 | Hold owner department field | `hold_owner_dept` | E-13 request was `owner_dept` | — | S08 | **Fixed** (D-18) |
| 6 | Business clock (Q-A), all timestamp columns | §3, DDL | §1.6 | — | 4.2, 14.1, S25 | **Fixed** (D-1) |
| 7 | Rework minutes, `completed_business_date` | generated columns | E-24, E-25 | — | S12 | **Fixed** (D-1; DDL change) |
| 8 | Late reason vs tolerance | `shipment_late_reason_chk` | E-12 | — | S07 | **Fixed** (D-2); product confirm P-1 |
| 9 | Part number / revision format | regex + suffix CHECK | E-43/E-44 | security §6 | S24 | **Fixed** (D-3) |
| 10 | Lot format and lot ownership | regex, composite FKs | §7 lot registry, `LOT_PART_MISMATCH` | security §6 | S14 hint | **Fixed** (D-12) |
| 11 | Shipment dates | `shipment_dates_chk` | E-06 | — | S04 | **Fixed** (D-14) |
| 12 | Verifier ≠ packer (R-1) | two CHECKs | E-11 403 | R-1, S-05 | S06 states A–D | Consistent |
| 13 | Approver ≠ counter (R-4), code `APPROVER_SAME_AS_COUNTER` | trigger; submitter CHECK removed | E-40 | R-4, T-15 | S19 (code name) | **Fixed** (D-13, UI 14.22) |
| 14 | Rework gate | `rework_episode` columns | §1.7 G1/G2 | — | 4.10 | **Fixed** (D-11) |
| 15 | Verification checklist keys, attempt history, note | `shipment_verification` | E-11 | — | S06 | **Fixed** (D-15) |
| 16 | Cycle-count blind fields, snapshots, approval reason | `cycle_count(_line)` | §7.1, E-40 | — | S18, S19 | **Fixed** (D-16) |
| 17 | `adjustment_txn_id`, ledger `reference_type/id`, `transfer_group` ↔ `txn_group`, `users`/`sessions` ↔ singular tables | derived / view / mapping | §7, §14.1 | security §3 | — | Consistent (repo-layer mapping, schema §10 #1, #2, #4) |
| 18 | `putaway_at` | not in 0001 | null | — | — | Consistent (D-4) |
| 19 | Rework event performer and note | `performed_by` from session, no note | E-24 | R-12 | S12 | **Fixed** (D-17) |
| 20 | Root cause at error creation | nullable columns | E-18 rejects | P-14 | S10 | **Fixed** (D-17) |
| 21 | Corrective action owner/due required, status on create | NOT NULL | E-27 | — | S13, 14.7 | **Fixed** |
| 22 | Ship: short note per line, SHIP locations, `shipped_at` | CHECKs | E-12 | — | S07 | **Fixed** |
| 23 | Receipts: location iff not Rejected, lot creation, `arrived_at` naming | CHECK, FK | E-30, E-41 | — | S14, S20 | **Fixed** (E-41 name, lot registry) |
| 24 | Inventory move note | `note` column | E-34 | — | S16 | **Fixed** |
| 25 | Count submit actor | `submitted_by` NOT NULL with Counted | E-39 | — | S18 | **Fixed** |
| 26 | Error close timestamp | `closed_at` iff Closed | E-22 | — | S11 | **Fixed** |
| 27 | Settings keys, ranges, defaults | `setting` rows + CHECKs | §8, E-45..E-47 | R-9 (reporting Admin only) | S22 | **Fixed** (hour minimum 0.01). Low/Open: E-45 response keys drop the `target_` prefix while E-46 uses full keys (§6 D-a) |
| 28 | KPI-1 basis toggle (US-047) | `on_time_basis` | E-48, E-49 C1 | — | S02 | **Fixed** (D-17) |
| 29 | Form vs JSON submission, content types | — | §1.3, §1.12 | security §5, T-17 | 2.6, 10, 14.19 | **Fixed** (D-8) |
| 30 | Request check order | — | §1.3, action rules | matrix §1, security §4 | S26 | **Fixed** (D-9) |
| 31 | CSRF token delivery | `session.csrf_token` | E-02, E-04, §1.12 | security §5 | 10.1 | Consistent |
| 32 | Login rate limit, no lockout | `login_attempt`, salt | §1.2 | security §3.3 | 2.6, S01 | Consistent |
| 33 | Failed-login username | `audit_log.changes` | §1.8 | security §9 | S25 | **Fixed** (UI wording, D-7) |
| 34 | Demo reset: flag 404, cooldown 10 min, typed phrase, sessions ended, audit | `last_demo_reset_at`; TRUNCATE list | E-52 | R-9, PD-3, §9 | S23 | **Fixed** (D-5, D-6, phrase) |
| 35 | Seed and deferred triggers | triggers | — | AR-4 | — | **Fixed** (D-10) |
| 36 | Audit log reads and record filter | indexes | E-51 | P-24 | S25 | **Fixed** (business-key filter) |
| 37 | Unknown/actor fields → 400 | — | §1.1, §1.4, §1.11 | R-12, T-16 | — | **Fixed** (§1.11 wording) |
| 38 | Error code registry vs UI copy (E-VER-*, E-GATE-*, 403/409/422 split) | — | §1.4 | matrix §1 | §7 | Consistent (after D-15) |
| 39 | Viewer and Admin read-only (R-2) | — | §3 roles | R-2, T-6, T-10 | 2.4 | Consistent |
| 40 | Endpoint coverage of screens | — | E-02..E-52 | — | S01–S26 | Consistent: every screen action maps to an endpoint (§12.1 + §1.12 route map). S07 lot select reads E-32 data, filtered to Stock/FG/Shipping. |
| 41 | Endpoint coverage of V1-CORE stories and AC-1..AC-11 | — | §12.1, §12.2 | — | §11 | Consistent: all V1-CORE cards traced (US-001…US-083). The AC-1 KPI movement now holds under D-1. |
| 42 | KPI shapes, KPI-7 headline, KPI-3/4 period anchors, P90 method | views, both tolerance columns | §9 [Kenji] | — | 4.3, 14.11 | **Open** (Kenji, §6 K-1..K-4) |
| 43 | First production seed when the deployed Admin may be inactive | — | E-52 | PD-2, S-30 | S23 | **Open** (Theo/Sasha/Diego, §6 T-1) |
| 44 | Seed time and scrypt memory within 60 s on Netlify | — | E-52 | §3.1 | S23 note | **Open**, hosted measurement (SQ-2) |
| 45 | Hosted Netlify behaviour (generated column on Netlify Postgres, migrations on previews, cookies, headers) | PGlite only | — | §14 checklist | — | **Open**: pending the user's account check and go-ahead |

## 4. Change log (edits applied in T-016)

| File | Section(s) | Change |
|------|-----------|--------|
| `docs/data-model/migrations-plan.md` | §2 decision paragraph | Q-A decided; new "DDL changes made by T-016" list |
| | §3 0001 DDL | Header comment; `rework_event.completed_business_date` **GENERATED**; removed its iff CHECK; removed `cycle_count` CHECK `approved_by <> submitted_by` |
| | §6 risks 1, 2 | Q-A decided; seed keeps the deferred triggers (D-10) |
| `docs/data-model/schema.md` | §3.1, §3.2, §3.3 item 1 | Option A decided, real-clock column list corrected, Option B rejection reason, mixed clock resolved |
| | §4.4 `rework_event`, §4.5 `cycle_count` | Generated date; CHECK removal |
| | §10 (after table), §12 | T-016 resolutions per mismatch; Q-A, DQ-1, DQ-6, DQ-7, DQ-8 closed/reassigned |
| `docs/data-model/seed-plan.md` | §1 principle 7, §9, §12, §14 test 7, §15 | Generated column never written; triggers stay on; `audit_log` truncated + one re-inserted row; live-record test uses a new shipment (KPI-6 limitation); SQ-3, SQ-4 closed |
| `docs/api/contract.md` | Status line; §1.3 (2b, 2c, 4, consequences, tests); §1.4 registry (`LOT_PART_MISMATCH`); §1.6 rewritten; §1.7 G1; §1.11; **new §1.12** | D-1, D-8, D-9, D-11, D-12 |
| | E-06, actions common rules, E-11, E-12, E-13, E-22, E-24, E-25, §7 lot registry, E-30, E-34, E-39, E-41, E-43, settings table, E-49, E-51, E-52 | D-2, D-3, D-9, D-12, D-14, D-15, D-18 |
| | §14.2 Q-A, Q-I, Q-K, Q-R, resolved Q-O; §14.3 14.1 | Closed or reassigned |
| `docs/security/security-plan.md` | §4, §5 item 2, §6, §9 | Pointer to the authoritative order (D-9); no multipart, `_csrf` read after the size limit (D-8); formats equal the DB (D-3, D-12); reset truncates audit (D-5) |
| `docs/design/ui-spec.md` | Header, S02, S04, S06 (+ E-VER-4, §10 table), S07, S10, S12, S13, S19 (+ §7.2), S23 (+ §7.2), S24 (+ §7.2), S25, §14 (14.1, 14.7, 14.14, 14.16, 14.18, 14.19, 14.22, 14.23 answered) | D-1, D-2, D-5, D-8, D-13, D-15, D-16, D-17 |
| `docs/plan/consistency-review.md` | new | This document |
| `knowledge/software-architect/README.md` | Lessons | T-016 lessons |

Not edited: `docs/project-scope.md`, `docs/plan/permissions-matrix.md`, `docs/plan/backlog.md`, `docs/security/threat-model.md`, research docs, ADR-001.

### 4.1 DDL delta for QA (re-run the 0001 tests)

```text
rework_event:
-  completed_business_date date,
+  completed_business_date date GENERATED ALWAYS AS ((completed_at AT TIME ZONE 'UTC')::date) STORED,
-  CHECK ((completed_at IS NULL) = (completed_business_date IS NULL))     (removed; now always true)
cycle_count:
-  CHECK (approved_by IS NULL OR approved_by <> submitted_by),            (removed, D-13)
```

Test impact:
- Any test or seed that inserts `completed_business_date` must stop. Postgres answers "cannot insert a non-DEFAULT value into column".
- A test asserting that the submitter cannot approve must be inverted, so the submitter may approve when they entered no line. Quinn's harness already has both changes (SCH-46, SCH-72), and the full suite passes: 82/82 [R].
- The table and view counts (24 / 5), trigger inventory and settings rows are unchanged.

## 5. Readiness verdict

**READY WITH CONDITIONS** for full implementation. The four artifacts now agree; no known contradiction remains that would turn a valid request into a 500 or leave a V1-CORE screen without an endpoint.

Conditions:
1. **Gate (CLAUDE.md rule 3):** the user gives the go-ahead. ADR-001 stays *accepted conditionally*. The local PoC passed, but the **hosted Netlify part is still pending the user's account check (Free plan, credit usage, auto-recharge off) and go-ahead**. No production or preview deploy is implied by this review.
2. **ADR-003 (auth, sessions, CSRF; T-009)** is written and accepted before B1 auth work. It must ratify D-8 (form surface, `_csrf`, content types) and D-9 (check order), and settle O-1 / Q-S. **ADR-002** (deploy, previews, credits) is accepted before the first deploy.
3. **Product confirmations** (§6 Priya items) before the batch that builds each item. P-1 (late-reason reading) is needed before B2 ship. None block B0/B1.
4. **KPI decisions** (Kenji K-1..K-4) before B5. They do not change the schema: both KPI-7 variants are stored and the views cover both KPI-3 anchors.
5. **Before the first production deploy:** decide the first-seed path (T-1), and measure seed and reset time plus scrypt memory on Netlify (SQ-2). Run the migration tests once on a real Netlify database branch. Generated columns and constraint triggers are core PostgreSQL [A: verified on PGlite / PG 17 engine only].
6. The 0001 migration file is created from the §3 text as edited here, and the harness (`spikes/schema-check`) moves into the real Vitest suite against `netlify/database/migrations/` (Quinn/Theo).

## 6. Remaining open items

| ID | Item | Recommended answer | Owner |
|----|------|--------------------|-------|
| P-1 | US-022: is the late reason tolerance-aware? | No. Keep it required whenever ship date > promise date (D-2); the tolerance only changes the KPI. | Priya / user |
| P-2 | Should R-4 also bar the Supervisor who *submitted* the count? | Optional hardening. If accepted: matrix edit, API 403 `APPROVER_SAME_AS_COUNTER`, and the CHECK restored before 0001 is first applied. Otherwise leave as is. | Priya, Sasha |
| P-3 | Q-B: explicit matrix rows for `reopen` (now P-06) and `contain` (now P-14) | Add them as is. | Priya |
| P-4 | Q-G / UI 14.20: Supervisor edits notes on Shipped/Cancelled | Drop it from V1-CORE (no screen exists); notes stay editable before ship. | Priya |
| P-5 | Q-I product part: hold owner departments, no over-shipping, SHIP only from Stock/FG/Shipping | Keep the current values. | Priya |
| P-6 | Q-J edit-after-verify trigger fields; Q-L count snapshot drift as a warning | Keep as specified. | Priya |
| P-7 | SQ-5 peak in the default window (tiles below target on first view); SQ-7 / US-012 "a small number Delivered" | Keep the peak (it tells the story); edit US-012 to drop Delivered. | Priya, Kenji |
| P-8 | UI 14.13 severity wording; 14.17 chart click-through | Accept Maya's wording; keep the links under each chart. | Priya, Quinn |
| K-1..K-4 | DQ-2 / Q-D KPI-7 headline (first count vs after recount); DQ-3 KPI-3 anchors; DQ-4 customer-found error vs FPY; DQ-5 P90 method and ISO weeks; Q-P / UI 14.11–14.12 shapes; tile text noting the KPI-6 limitation (D-1) | First count as the headline, recount as the secondary figure (docs/03 §3.3); keep the anchors and `percentile_cont`. | Kenji |
| S-1 | Q-N `GET /lookups/users` exposure; Q-Q optional abuse controls; Q-S / O-1 login-form token (ADR-003); UI 14.21 timeout prompt; 14.24 429 copy; SQ-8 "deployed" env variable | ADR-003 (T-009) | Sasha, Marcus |
| T-1 | DQ-9 / SQ-1 first production seed | No bootstrap endpoint. After the user's account check and approval, the user runs `npm run db:reset-seed` once from a developer machine against the production database, with `DEMO_ADMIN_PASSWORD` set locally. Record it in ADR-002. | Theo, Sasha, Diego, user |
| T-2 | SQ-2 seed/reset time, scrypt memory (7 × 128 MiB sequential), deferred-trigger commit time on Netlify | Measure on the first approved preview | Theo |
| D-a | Low: E-45 response keys (`targets.on_time_pct`) vs E-46 request keys (`target_on_time_pct`); E-23 filter values lower-case vs response labels; login username lower-cased before lookup | Document the mapping or align, contract author's choice | Diego |
| O-1 | `docs/plan/status.md` still shows Phase 1 rows from 2026-11-25 | Update the board with T-012..T-017 | Olivia |
| O-2 | Skills/agent docs that still mention Node 24 / Astro 5 (from the T-011 lessons) | Route to Ada | Olivia → agent-builder |

*Fictional data only; no real systems were contacted. No external services were used for this review.*
