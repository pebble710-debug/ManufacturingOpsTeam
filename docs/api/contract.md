# API Contract — Version 1 (V1-CORE)

**Status:** DRAFT 2 (reconciled with the REVIEWED permissions matrix and the security plan, 2026-11-26), plus **T-016 architecture reconciliation** (Marcus, 2026-11-26: decisions D-1 to D-18 in [consistency-review.md](../plan/consistency-review.md), each edit tagged *(T-016)*), plus **T-022 reconciliation** (Marcus, 2026-11-27: user decisions UD-1 to UD-6, matrix P-26 to P-29 / R-14 / R-15, Kenji's kpi-spec CE-1 to CE-5, and ADR-003; each edit tagged *(UD-n)*, *(CE-n)* or *(ADR-003)*). For review by Dana, Kenji, Felix, Maya · **Task:** T-014 · **Owner:** Diego (backend-developer) · **Date:** 2026-11-26
**Inputs:** `docs/project-scope.md` · `docs/plan/backlog.md` §3.1 (V1-CORE only) · `docs/plan/permissions-matrix.md` (**REVIEWED**, incl. R-1 to R-13 and T-1 to T-22) · `docs/security/security-plan.md` · `docs/design/ui-spec.md` §14 · `docs/ADR-001.md` §5, §8 · `docs/poc/poc-report.md` (finding R-1) · `docs/01` §1.5 · `docs/02` §2.4 · `docs/03` · `docs/05` + `kpi-definitions` · `docs/08` §8.2 (field names).
All companies, people, parts and records are **fictional** (Cobalt Ridge Components, Inc.). This contract is design only; no application code exists yet.

Tags: **[R]** researched in the cited doc · **[A]** assumption · **[P]** proposed convention. Anything tagged [P] or [A] and listed in §9 needs a decision from the named owner.

Reference notation used throughout:
- **P-nn** = action ID in the permissions matrix; **Matrix R-n** = special rule in the matrix §3. (Not to be confused with *PoC R-1*, the CSRF finding.) If Sasha renumbers the matrix, only these references change.
- **US-nnn** = backlog story; **AC-n** = scope §5 acceptance criterion; **E-nn** = endpoint ID in this file.
- Roles: **ADM** Admin, **SUP** Supervisor, **SHP** Shipping, **RCV** Receiving, **QUA** Quality, **VWR** Viewer (read-only guest, kept and seeded). **One role per user** (Matrix R-11).

---

## 1. Conventions

### 1.1 Transport, versioning, formats
- JSON over HTTPS, all paths under `/api/v1`. Response bodies are UTF-8 JSON (`application/json`) except CSV downloads (§1.10). Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `X-Request-Id`.
- Resources are plural nouns. **Status changes are actions** (`POST /shipments/{id}/actions/{name}`), never field edits. **Ledger, status history and audit are append-only**: no PUT/PATCH/DELETE exists for them; corrections are new ADJUST rows. **No DELETE exists anywhere in v1 core** (deactivate or cancel instead). Unsupported methods return 405 `METHOD_NOT_ALLOWED`; unknown paths return 404 `NOT_FOUND`; deny by default.
- IDs are integers. Business keys (`shipment_no` `SH-####`, `error_no` `PE-####`, `receipt_no` `RC-####`, `count_no` `CC-####`) are returned next to `id`. For shipments, packaging errors, receipts and cycle counts, the `{id}` path segment accepts **either** the integer id or the business key (formats cannot collide). Numbers, never strings, for quantities (integers), weights (≤ 2 decimals) and ids.
- **Timestamps** are ISO 8601 UTC with `Z` (`2026-11-25T14:03:22.123Z`); timestamp inputs may carry an offset and are normalised to UTC. **Dates** are `YYYY-MM-DD` (ship date, promise date, etc. are calendar dates, not timestamps). Display time zone is a UI concern (Q-20: default UTC).
- Unknown JSON body fields are **rejected with 400 `UNKNOWN_FIELD`** (Zod `.strict()`; this is also the Matrix R-12 guard: a body containing `packed_by`, `verified_by`, `counted_by`, `approved_by`, `created_by`, `user_id`, `verifierId` etc. is refused and nothing changes). Unknown query parameters are rejected with 422. Strings are trimmed; empty string = missing for required fields. Lot numbers are trimmed and **upper-cased** on write [P].
- Body limit **64 KB** (security plan §6; else 413 `PAYLOAD_TOO_LARGE`). No CORS headers are ever sent (same-origin only). No `Idempotency-Key` in v1: actions are state-guarded (repeating one returns 409), create endpoints are not idempotent and the UI must disable the submit button after the first click.

### 1.2 Authentication and sessions (ADR-001 §8, ADR-003 will finalise) [P]
- Cookie `__Host-sid`: random 32-byte token, `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`. Server stores only its SHA-256. Idle timeout 30 min (sliding; `last_seen_at` is written at most once every 5 minutes), absolute 8 h, rotated on login, deleted on logout.
- **Every endpoint except E-02 requires a valid session** (E-01 is withdrawn, §4). A request with no cookie is refused with 401 **without a DB query**. No session, expired session, or deactivated user (checked on every request) → **401 `UNAUTHENTICATED`** (API) or redirect to `/login` (pages; outside this contract). 401 is never audited (no identity); failed logins are (§1.8).
- The role is read from the user row on every request (never from the cookie or the client). A role change or deactivation takes effect on the next request.
- **Login rate limit** (security plan §3.3): DB-backed, **5 failures per (username, client key) and 30 per client key per 15 min**; over the limit → 429 `TOO_MANY_ATTEMPTS` with `Retry-After`, the generic message, and **no scrypt work** (cheap rejection, so this check runs before password verification). No account lockout. The client key is a salted SHA-256 of the client IP; raw IPs are never stored or audited. A successful login clears the (username, client) counter.
- **Roles and accounts (Matrix R-11):** a user has exactly one role; role and `active` are read from the `users` row on every request; a role change or deactivation deletes that user's sessions at once. User-management endpoints are not built in v1 core (P-23, §11.1 records the rules for v1.1).

### 1.3 Request pipeline, check order, CSRF and content-type enforcement
PoC finding R-1: Astro `checkOrigin` does not stop cross-origin JSON POSTs, so every state-changing request (**POST, PATCH, PUT, DELETE**, including E-02, E-03 and E-52 and every HTML form post of §1.12) must pass **all** of the checks below, **in this fixed order** (permissions matrix §1, security plan §4/§5). Steps 1 to 4 run in middleware before the handler, before any DB write. *(T-016, D-9: this table is the single authoritative order; the matrix §1 list and security plan §4 give the same result.)*

| # | Check | Failure |
|---|-------|---------|
| 0 | Method allowed for the path (GET never reaches a write handler; Matrix R-13). *(ADR-003 D-9)* A non-GET request to a path with no route-table entry is refused here without running any handler. | 405 `METHOD_NOT_ALLOWED` / 404 |
| 1 | Valid session (not for E-02). No cookie is refused without a DB query. | **401** `UNAUTHENTICATED` |
| 2a | If an `Origin` header is present it must equal the site origin; *(ADR-003 D-5)* if `Origin` is absent and `Sec-Fetch-Site` is present it must be `same-origin` or `none`. | **403** `CSRF_INVALID` + audit |
| 2b | `Content-Type` matches the **surface** *(T-016, D-8)*: `/api/v1/*` writes accept exactly `application/json` (optional `; charset=utf-8`); HTML form routes (§1.12) accept exactly `application/x-www-form-urlencoded`. Anything else (missing, `text/plain`, `multipart/form-data`, JSON on a form route, a form type on an API route) is refused. The 64 KB body limit (413) is also enforced here, before any body is read. | **415** `UNSUPPORTED_MEDIA_TYPE` / **413** |
| 2c | The synchronizer token equals the session's token (constant-time compare; a token from another session fails): the `X-CSRF-Token` header on API routes, the hidden `_csrf` field on form routes (the only field middleware reads from the form body). Absent `Origin` (non-browser client) does not skip this. | **403** `CSRF_INVALID` + audit |
| 3 | Role allowed for the action (P-nn). | **403** `FORBIDDEN_ROLE` + audit |
| 4 | JSON parse and object, or form decode (§1.12) (400 `BAD_REQUEST`); **unknown or actor fields** (R-12) → 400 `UNKNOWN_FIELD`; Zod type/range/required/enum/cross-field validation (state-independent) → **422** `VALIDATION_ERROR`. Query-parameter validation is 422. | 400 / 413 / 422 |
| 5 | Load the resource (404 `NOT_FOUND`, same body for any missing or malformed id), then **identity and role-by-state rules read from the locked DB row**: R-1 verifier ≠ packer, R-4 approver ≠ counter, R-5 Shipping cancel only early, R-7 moves out of Hold, R-8 after-ship errors. | **403** with a distinct code + audit |
| 6 | State/conflict: invalid transition, locked record, rework gate, insufficient stock, duplicate key. Data-dependent rules that are not state conflicts (checklist, late reason, tracking number) stay **422**. | **409** (or 422 as listed) |
| 7 | Rate or cooldown limits (login attempts, demo-reset cooldown, optional write cap). **Login is the exception:** its limit is checked **first**, before any password work, so a throttled client costs almost nothing. | **429** |

Consequences (matrix §1, decided here): (a) the identity and role-by-state rules are **403 and are evaluated before the 409** checks, so a Shipping user cancelling any shipment that is not Planned or Ready to Pack (even a Shipped one) gets 403 `FORBIDDEN_CANCEL_AT_STATUS`, and a packer verifying gets 403 `VERIFIER_SAME_AS_PACKER` whatever the status (a shipment with no packer cannot trigger R-1); (b) a signed-in caller who is **not** allowed by role learns nothing about the resource (403 precedes 404 and validation); (c) a 422 never reveals state.
Every API POST sends a JSON object body (a zero-length body with the right content type is read as `{}`). **GET and HEAD never change state**, with one exception: the throttled `last_seen_at` update of the session. Sign-out and demo reset are POST; a GET to any write URL is 405 (T-21). Where this file says "the service returns X", the HTML form handler of §1.12 calls the same Zod schema and the same service function and obeys the same codes. *(T-016, D-8: Q-O is answered with **plain HTML form posts** for every page, as ADR-001 §8 #4 and the UI spec's no-JavaScript rule require. `fetch` JSON is optional enhancement only and is not needed by any V1-CORE screen.)*
Required test per write route (S-07, S-08), **on both surfaces** (API route and its form route): forged `Origin` + no token → 403; wrong or missing content type (including JSON on a form route and urlencoded on an API route, T-17) → 415; valid token + correct type → success; and the Viewer, as the least privileged signed-in role, gets 403 on every write (T-10).

**Token delivery:** the per-session token is returned by E-02 (login response) and E-04 (`GET /me`); pages receive it from `Astro.locals`. **Login form (pre-session):** protected by the Origin check (2a) and the content-type allow-list (2b) only; no pre-login token is built (security plan §5; **decided in ADR-003 O-3/D-5**). Login order: 2a → 2b → 4 (Zod) → 429 → credentials. Cookie names, scrypt parameters, session lookup and the permission map are specified in [ADR-003](../adr/ADR-003-auth-sessions-csrf.md). The CSRF token rotates with the session at login.

**Optional abuse controls [P, "Should" in security plan PD-5/PD-7; not in V1-CORE unless Olivia adds them]:** per-session write cap of 60 writes/minute → 429 `WRITE_RATE_LIMITED`; Admin-toggled "demo read-only mode" → all writes 503 `DEMO_READ_ONLY` (reads unaffected).

### 1.4 Error envelope
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "One or more fields are invalid.",
             "fields": { "qty_ordered": "must be an integer >= 1" },
             "details": { }, "request_id": "01J..." } }
```
`code` is stable and machine-readable; `message` is safe to show; `fields` (field path → message) is present for 422/409-duplicate; `details` is optional and structured per code; `request_id` equals the `X-Request-Id` header and the function log line. **Never** a stack trace, SQL text, constraint name, file path or secret. 500 → `INTERNAL_ERROR` with a generic message only.

| HTTP | When |
|------|------|
| 200 / 201 / 204 | OK / created (`Location` header) / no body (logout) |
| 400 | malformed JSON (`BAD_REQUEST`) or unknown/actor body field (`UNKNOWN_FIELD`, Matrix R-12) |
| 401 | no/expired session; wrong credentials (`INVALID_CREDENTIALS`) |
| 403 | CSRF failure, role refusal, identity and role-by-state rules (R-1, R-4, R-5, R-7, R-8); never for a pure state conflict |
| 404 | unknown path/resource, disabled feature (`FEATURE_DISABLED`) |
| 405 / 413 / 415 | method / size / content type |
| 409 | state conflict: invalid transition, locked record, insufficient stock, duplicate key |
| 422 | validation: type, range, required, cross-field and data-dependent rules |
| 429 | login rate limit, demo-reset cooldown (10 min) |
| 500 / 503 | unexpected / database unavailable or waking (`SERVICE_UNAVAILABLE`, `Retry-After`) |

**Error code registry** (all codes used in this file):

| Code | HTTP | Meaning |
|------|------|---------|
| `BAD_REQUEST` | 400 | body is not valid JSON / not an object |
| `UNKNOWN_FIELD` | 400 | body has a field the schema does not define, including actor fields (`packed_by`, `verified_by`, `counted_by`, `approved_by`, `created_by`, `user_id`, `verifierId`, `packerId`); `fields` lists the names; nothing changes (R-12, T-16) |
| `UNAUTHENTICATED` | 401 | no valid session (`details.reason` = `missing`, `expired`, `inactive`) |
| `INVALID_CREDENTIALS` | 401 | wrong password, unknown user and deactivated user all return this one generic message |
| `FORBIDDEN_ROLE` | 403 | role not allowed for the action (matrix P-nn in `details.required`) |
| `CSRF_INVALID` | 403 | missing/wrong token or foreign `Origin` |
| `VERIFIER_SAME_AS_PACKER` | 403 | Matrix R-1: caller is the recorded current packer |
| `FORBIDDEN_CANCEL_AT_STATUS` | 403 | Matrix R-5: Shipping cancelling outside Planned / Ready to Pack |
| `FORBIDDEN_HOLD_RELEASE` | 403 | Matrix R-7: Receiving transferring or scrapping stock whose source is a Hold location (decided by the DB type of the source location) |
| `FORBIDDEN_NON_HOLD_TXN` | 403 | Matrix R-7: Quality (P-16 Y\*) posting anything other than a transfer or scrap into/out of a Hold location (e.g., PRODUCTION_COMPLETE) |
| `FORBIDDEN_AFTER_SHIP_ERROR` | 403 | Matrix R-8: Shipping logging an error with stage After ship or against a Shipped shipment |
| `APPROVER_SAME_AS_COUNTER` | 403 | Matrix R-4: Supervisor approving a count in which they entered or recounted any line |
| `APPROVER_SAME_AS_SUBMITTER` | 403 | *(UD-2)* Matrix R-4 widened: Supervisor approving a count they submitted |
| `NOT_FOUND` / `FEATURE_DISABLED` | 404 | unknown resource / `DEMO_RESET_ENABLED` is not `true` (Matrix R-9; same for every signed-in role) |
| `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` | 405, 413, 415 | |
| `INVALID_TRANSITION` | 409 | status does not allow the action; `details.status`, `details.allowed_from` |
| `REWORK_GATE_NOT_MET` | 409 | failed verification / error logged, but error, completed rework or reopen missing; `details.missing` ⊂ [`packaging_error`, `completed_rework`, `reopen`] |
| `SHIPMENT_LOCKED` | 409 | *(UD-3, R-14)* ordinary edit (E-08, any field including notes and lines) of a Shipped or Cancelled shipment; use the correction action E-53 |
| `LINE_IN_USE` | 409 | removing a shipment line referenced by a packaging error |
| `INSUFFICIENT_STOCK` | 409 | on-hand lower than requested; `details.available`, `details.requested`, `details.line_id` |
| `STAGE_STATUS_MISMATCH` | 409 | error stage vs shipment status (Before ship on a Shipped shipment, After ship on an unshipped one) |
| `ERROR_CLOSED` / `ACTION_CLOSED` / `ALREADY_COMPLETED` | 409 | edit of a Closed error / Closed corrective action / completed rework event |
| `CLOSE_PRECONDITION_FAILED` | 409 | closing an error without completed rework or root cause; `details.missing` |
| `INVALID_COUNT_STATE` | 409 | cycle-count action in the wrong state |
| `ALREADY_COUNTED` / `ALREADY_APPROVED` | 409 | second first-count / second approval (no second adjustment) |
| `ADJUST_WOULD_GO_NEGATIVE` | 409 | approval would push on-hand below zero |
| `DUPLICATE` | 409 | unique business key exists; `fields` names the key |
| `LOOKUP_IN_USE` | 409 | identity field of a referenced lookup row cannot change |
| `RESET_IN_PROGRESS` | 409 | a demo reset is already running |
| `VALIDATION_ERROR` | 422 | generic field validation (`fields`) |
| `CORRECTION_FIELD_NOT_ALLOWED` | 422 | *(UD-3)* E-53 request names a ledger- or status-affecting field (`status`, `customer_id`, `order_date`, line `part_id`, `qty_ordered`, `qty_shipped`, `lot_number`, `location_id`); message: "Inventory and status are not changed by a correction; use a cycle count." `fields` lists them |
| `CHECKLIST_INCOMPLETE` | 422 | an applicable checklist item is missing or `not_applicable` was sent for a required item |
| `CHECKLIST_CONTRADICTS_RECORD` | 422 | a "pass" contradicts the data (lot missing, C of C flag off) |
| `INACTIVE_REFERENCE` | 422 | deactivated customer/part/carrier/etc. used on a new record |
| `LOT_PART_MISMATCH` | 422 | *(T-016, D-12)* the lot number is registered to a different part, or (outside receipt / production) the lot does not exist for this part; `fields` names the lot field |
| `COUNT_INCOMPLETE` | 422 | submitting a count with uncounted or un-rechecked lines; `details.line_ids` |
| `NO_COUNT_LINES` / `COUNT_TOO_LARGE` | 422 | scope matches zero / more than 500 stock rows |
| `EXPORT_TOO_LARGE` | 422 | CSV export above 20,000 rows |
| `TOO_MANY_ATTEMPTS` | 429 | login rate limit |
| `RESET_COOLDOWN` | 429 | demo reset within 10 minutes of the last accepted reset (`Retry-After`) |
| `WRITE_RATE_LIMITED`, `DEMO_READ_ONLY` | 429, 503 | optional abuse controls (§1.3) |
| `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` | 500, 503 | generic |

### 1.5 Lists, pagination, sorting, filters
- `?page=` (1-based, default 1), `?page_size=` (default 25, max 100), `?sort=field` or `?sort=-field` (single key, allow-listed per endpoint, `id` is the implicit tie-breaker; a non-listed field → 422, never interpolated into SQL), filters as named query parameters.
- Response: `{ "data": [ ... ], "page": 1, "page_size": 25, "total": 137 }`. A single resource: `{ "data": { ... } }`. Lookups return the whole set (≤ 500 rows) with `page=1`.
- Booleans are `true|false`; multi-value filters are comma-separated (`status=Packing,Verified`). Text search `q` is case-insensitive, min 2 chars, `%`/`_` escaped, parameterised.

### 1.6 Business clock and reporting date (Q-23; **decided in T-016, D-1**)
Settings hold `reporting_mode` (`fixed` | `live`) and `reporting_date` (seeded `fixed` / `2026-11-25`). The server defines two helpers in one module, used everywhere; no SQL function duplicates them:
- `business_today` = `reporting_date` when fixed, else the real UTC date.
- `business_now` = `business_today` + the real UTC time of day (fixed mode), else real `now()`.

Uses: ship-date default and the "no future ship date" rule, defaults for the user-entered instants (below), "overdue" logic (promise date before `business_today`), cycle-count `scheduled_date` default, **KPI default period = 30 days inclusive ending on `business_today`** (E-48), CSV file-name dates, `GET /me` and `GET /settings` (`business_today`, `reporting_label`).

**Two clocks, one owner per column (Option A).**
| Clock | Columns | Written by |
|-------|---------|-----------|
| **Real** `now()` | `created_at`, `updated_at`, audit `at`, session and login times, `status_history.changed_at`, `shipment_verification.verified_at`, `shipment.verified_at`, `shipment.shipped_at`, `txn_at`, cycle-count `submitted_at` / `approved_at` / `counted_at` / `recounted_at`, error and corrective-action `closed_at` | server only; never accepted from a request |
| **Business date** | `order_date`, `requested_date`, `promise_date`, `ship_date`, `due_date`, `scheduled_date`; `status_history.business_date`, `shipment_verification.business_date`, `cycle_count.approved_business_date` (server writes `business_today`); `rework_event.completed_business_date` (generated by the DB from `completed_at`) | server defaults / user input |
| **Business instant** (user-entered, default `business_now`, at most `business_now + 5 min`) | `packaging_error.detected_at`, `rework_event.started_at` **and `completed_at`**, `receipt.arrived_at` | user input, server default |

KPI periods filter on business dates only (ship date, first-verification business date, `completed_business_date`, `approved_business_date`, `detected_at` date), so live records created on any real date after the reporting date land in the default period and move the KPIs and charts (AC-1, AC-11). Rework minutes use two instants on the same clock. Real timestamps stay monotonic, so the status-history chain trigger and ordering never break, even when the Admin switches modes.
**Known limitation (accepted):** KPI-6 measures `shipped_at − first Ready-to-Pack changed_at` on the real clock. A **seeded** open shipment shipped months later therefore shows a long cycle time. Shipments created live show their true elapsed time. The demo script uses a newly created shipment (seed-plan test 7).
Option B (store event timestamps as `business_now`) was rejected. Business time of day repeats across real days, so a later action can get an earlier timestamp, and that breaks the history chain and `completed_at >= started_at`.

### 1.7 State machine (docs/01 §1.5, backlog US-016)
```
Planned --mark-ready--> Ready to Pack --start-packing--> Packing --verify(pass)--> Verified --ship--> Shipped
                                                         |  ^                       |
                                         verify(fail) or |  | reopen                | error logged / edited after verify
                                         error logged    v  |                       v
                                                        Rework <----------------- Rework
Any non-final status (not Shipped, Cancelled, On Hold) --hold--> On Hold --release--> status it had before the hold
Any status before Shipped (including On Hold, Rework) --cancel--> Cancelled
```
| Action | From | To | Roles (matrix) |
|--------|------|----|----------------|
| `mark-ready` | Planned | Ready to Pack | SHP, SUP (P-05) |
| `start-packing` | Ready to Pack | Packing (caller becomes **packer**) | SHP, SUP (P-06) |
| `verify` | Packing | Verified, or Rework on any failed item | SHP, QUA, SUP (P-07\*) + Matrix R-1 |
| `ship` | Verified | Shipped (+ SHIP ledger rows) | SHP, SUP (P-08) |
| `hold` | Planned, Ready to Pack, Packing, Verified, Rework | On Hold | SHP, QUA, SUP (P-09) |
| `release` | On Hold | status before hold | QUA, SUP (P-10, Matrix R-6) |
| `cancel` | Planned, Ready to Pack, Packing, Verified, Rework, On Hold | Cancelled | SUP any of those; SHP only from Planned / Ready to Pack, otherwise **403** (P-11, Matrix R-5) |
| `reopen` | Rework | Packing **with no current packer** (`packed_by` cleared) | *(UD-4)* **QUA, SUP** (P-26, Matrix R-15); SHP, RCV, ADM, VWR 403 `FORBIDDEN_ROLE` |
| `start-packing` (re-pack) | Packing with `packed_by` null (only right after a reopen) | Packing (no status change; caller becomes the **current packer**) | SHP, SUP (P-06) *(UD-4: the re-packing user becomes the current packer)* |
| `correct` | Shipped, Cancelled | unchanged (no history row) | *(UD-3)* **SUP** only (P-28, R-14), E-53 |
| (edit) | Verified | Rework, when `customer_id`, `customer_po` or a line's part/qty/lot/location changes (US-015) | SHP, SUP (P-04) |
| (error) | Packing, Verified | Rework, when a Before-ship packaging error is logged (US-027) | P-12 |

*(UD-6)* **Delivered is removed from v1** (no status, column, transition or UI; it returns only with a v2 carrier integration). Shipped and Cancelled are terminal and locked (UD-3, R-14). Every transition writes exactly one `shipment_status_history` row in the same transaction. The **first** Ready-to-Pack history row is the KPI-6 start and is never overwritten by later re-entry.

**Rework gate (US-030, AC-2).** The shipment stores `rework_origin` ∈ {`VERIFICATION_FAILED`, `ERROR_LOGGED`, `EDITED_AFTER_VERIFY`} on entry to Rework. For the first two origins, *reopen* requires:
- **G1** at least one packaging error on the shipment with `detected_stage = 'Before ship'` and `rework_episode = shipment.rework_episode` *(T-016, D-11: Q-K adopted; the server increments `shipment.rework_episode` in the transaction that enters Rework, and stamps the current episode on a Before-ship error logged while the shipment is in, or enters, Rework; otherwise the error's episode is null)*, and
- **G2** at least one **completed** rework event (`completed_at` set) linked to a G1 error.

Failing → 409 `REWORK_GATE_NOT_MET`, `details.missing` = [`packaging_error`] and/or [`completed_rework`], message names them. `verify` or `ship` attempted while the shipment is in Rework returns the same code if G1/G2 are unmet, otherwise 409 `INVALID_TRANSITION` with `details.required_action = "reopen"`. `ship` attempted while Packing (after a failed verification) is 409 `INVALID_TRANSITION` (status must be Verified). `EDITED_AFTER_VERIFY` has no error/rework requirement; only a reopen by a (possibly new) packer and a fresh verification.

### 1.8 Audit log (US-005; ADR-001 §8 #9)
- Every successful write inserts its `audit_log` rows **in the same transaction** as the change: `{ user_id, action, table_name, record_id, changes: { field: [old, new] }, at (real UTC) }`. One shipment action = one audit row for the shipment (+ one per other record created, e.g. the error, the receipt). Ledger rows are not duplicated into audit; the audit row carries `changes.ledger_txn_ids`.
- **No audit row** for a request rejected by validation (422) or state (409) (US-005 AC-4). Passwords, tokens and CSRF values never appear in `changes`.
- **Access denials** (every 403, including `CSRF_INVALID`, `VERIFIER_SAME_AS_PACKER`) write `ACCESS_DENIED` with `changes = { method, path, code, required, role }`, in a separate short transaction so it survives the aborted request. Anonymous 401s are not audited. Failed login: `LOGIN_FAILED` with the attempted username **only if it matches an existing user, otherwise the literal `unknown`** (people type passwords into the username box), never the password. Successful login `LOGIN_SUCCESS`, `LOGOUT`. **Never logged or stored in audit:** passwords (even wrong ones), session tokens or hashes, CSRF tokens, `NETLIFY_DB_URL`, env values, full request bodies, **IP addresses** (security plan §9).
- Audit action names are given per endpoint below. Enumeration: `LOGIN_SUCCESS LOGIN_FAILED LOGOUT ACCESS_DENIED SHIPMENT_CREATE SHIPMENT_UPDATE SHIPMENT_MARK_READY SHIPMENT_START_PACKING SHIPMENT_VERIFY SHIPMENT_SHIP SHIPMENT_HOLD SHIPMENT_RELEASE SHIPMENT_CANCEL SHIPMENT_REOPEN SHIPMENT_CORRECT PACKAGING_ERROR_CREATE PACKAGING_ERROR_UPDATE PACKAGING_ERROR_CONTAIN PACKAGING_ERROR_CLOSE REWORK_CREATE REWORK_COMPLETE CORRECTIVE_ACTION_CREATE CORRECTIVE_ACTION_UPDATE RECEIPT_CREATE INVENTORY_TXN_CREATE CYCLE_COUNT_CREATE CYCLE_COUNT_ENTRY CYCLE_COUNT_SUBMIT CYCLE_COUNT_APPROVE LOOKUP_CREATE LOOKUP_UPDATE SETTINGS_TARGETS_UPDATE SETTINGS_REPORTING_UPDATE DEMO_RESET`.

### 1.9 Concurrency and atomicity [P]
- Each action runs in one `sql.begin()` transaction: lock the main row (`SELECT … FOR UPDATE`), re-check status under the lock, write, then audit. Retried/duplicated requests therefore hit 409 instead of double-posting.
- Ledger postings (ship, scrap, transfer, adjust) first take `pg_advisory_xact_lock(part_id, hash(lot_number))` for every distinct (part, lot) in **sorted order** (no deadlocks), then re-read on-hand inside the transaction.
- A failure at any step rolls back everything (status, ledger, history, audit); the caller sees one error and no partial state (US-041).

### 1.10 CSV export (US-065)
`GET /reports/{id}?format=csv` (all roles that can view, P-03): `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<id>-<slug>_<business_today>.csv"` (fixed template, no user input in the name), RFC 4180 (comma, CRLF, `"` doubled), UTF-8 without BOM [A], ISO dates and timestamps, header row = the JSON `columns[].label`, same filters and same fixed order as the JSON view, **all rows** (no paging; > 20,000 rows → 422 `EXPORT_TOO_LARGE`). An empty result returns only the header.
**Formula-injection guard:** for every **text-typed** cell whose first character (after any leading spaces) is `=`, `+`, `-`, `@`, TAB (0x09) or CR (0x0D), prefix a single quote `'` **before** CSV quoting. Numeric and date cells are written as numbers/dates and are never prefixed (so `-4` as a number stays `-4`; the text `-4 units` becomes `'-4 units`). Applies to every string column, including those derived from user input (descriptions, notes, names, tracking numbers).

### 1.11 Security checklist hooks (security-review-checklist)
Zod on every body and query; allow-listed sort columns; `sql.unsafe` and `set:html` banned; no stack traces; generic login failure; secrets only in env; a write never trusts `role`, `user_id`, `*_by`, `status` or timestamps from the client (they are server-set; sending them is a 400 `UNKNOWN_FIELD`, *T-016*).

### 1.12 HTML form surface (T-016, D-8; answers Q-O and UI §14.19)
There are two surfaces and **one service layer** (`src/lib/services/`). Each write has a JSON API route (this contract, used by integration tests and any optional `fetch` enhancement) and, where a screen needs it, an HTML form route (used by the pages and working without JavaScript, per ADR-001 §8 #4 and UI spec §10). Both routes run the §1.3 pipeline, the same Zod schema and the same service function, and return the same status codes.

| Surface | Content type accepted (2b) | CSRF token (2c) | Success | Failure |
|---------|---------------------------|-----------------|---------|---------|
| `/api/v1/*` (POST/PATCH) | `application/json` only | `X-CSRF-Token` header | 200/201/204 JSON | JSON error envelope §1.4 |
| Form routes below (POST only) | `application/x-www-form-urlencoded` only | hidden `_csrf` field | **303** redirect to the next page with a flash message (PRG) | 422: re-render the same page with the entered values and the error summary; 403/409/429: the same page with an in-place Problem alert (status code kept); 401: 303 to `/login`; 400/413/415/500: the generic error page S26 |

`multipart/form-data` is accepted nowhere in v1 (there are no uploads). Form routes (paths follow UI spec §2.1; Felix and Diego may rename them, but not change the mapping):

| Form route (POST) | Same service as | Screen |
|-------------------|-----------------|--------|
| `/login` (pre-session: checks 2a and 2b only, rate limit first) | E-02 | S01 |
| `/logout` | E-03 | top bar |
| `/shipments/new`, `/shipments/{no}/edit` | E-06, E-08 | S04 |
| `/shipments/{no}/actions/{mark-ready,start-packing,hold,release,cancel,reopen}` | E-09, E-10, E-13, E-14, E-15, E-16 | S05, S08 |
| `/shipments/{no}/pack-verify` | E-11 | S06 |
| `/shipments/{no}/ship` | E-12 | S07 |
| `/shipments/{no}/correct` *(UD-3)* | E-53 | S05a |
| `/quality/errors/new` | E-18 | S10 |
| `/quality/errors/{PE-no}/root-cause`, `.../contain`, `.../close` | E-20, E-21, E-22 | S11, S13 |
| `/quality/errors/{PE-no}/rework/new`, `.../rework/{id}/complete` | E-24, E-25 | S12 |
| `/quality/errors/{PE-no}/corrective-actions/new`, `.../corrective-actions/{id}` | E-27, E-28 | S13 |
| `/inventory/receipts/new` | E-30 | S14 |
| `/inventory/move` | E-34 | S16 |
| `/inventory/cycle-counts/new`, `.../{CC-no}/entries`, `.../{CC-no}/submit`, `.../{CC-no}/approve` | E-36, E-38, E-39, E-40 | S17, S18, S19 |
| `/admin/lookups/{type}/new`, `/admin/lookups/{type}/{id}` | E-43, E-44 | S24 |
| `/admin/settings/targets`, `/admin/settings/reporting` | E-46, E-47 | S22 |
| `/admin/demo-reset` | E-52 (same 404-when-disabled rule) | S23 |

**Form decoding (one adapter, `src/lib/http/form.ts`).** Before Zod runs, the adapter turns the form into the same input object the JSON schema expects:
- Empty strings count as missing values. Integer and number fields are parsed strictly, with no silent coercion of text.
- Declared boolean fields are `true` when present and `false` when absent.
- Rows use indexed names (`lines[0][part_id]`, `entries[3][counted_qty]`), and checklist radios use `checklist[labels]=pass`.
- Reserved control names are removed first: `_csrf`; `intent`, the value of the pressed submit button, mapped where the endpoint defines it (E-11 `outcome`); and `add_line` / `remove_line`. The last two re-render S04 without any write, but they still pass checks 1 to 3.
- Any other unknown name, including every actor field (R-12), → 400 `UNKNOWN_FIELD`.

---

## 2. Enumerations

| Name | Values |
|------|--------|
| `role` | Admin, Supervisor, Shipping, Receiving, Quality, Viewer |
| `shipment.status` | Planned, Ready to Pack, Packing, Verified, Shipped, On Hold, Rework, Cancelled (no Delivered, UD-6) |
| `rework_origin` | VERIFICATION_FAILED, ERROR_LOGGED, EDITED_AFTER_VERIFY |
| `hold_owner_dept` [A] | Shipping, Quality, Receiving, Production, Planning, Customer |
| `checklist keys` (docs/02 §2.4) | `part_number`, `revision`, `quantity`, `lot`, `labels`, `packing_slip`, `coc` (only when any line's part has `requires_coc`), `packaging_method`; each `pass` or `fail` |
| `error.category` | Wrong part, Wrong quantity, Incorrect label, Paperwork, Packaging method, Damage, Traceability, Other (docs/08 lists "Wrong qty"; the backlog's "Wrong quantity" is used) |
| `paperwork_subtype` | Packing slip, BOL, C of C, Customer-specific form, Commercial invoice |
| `error.severity` | Low, Medium, High, Critical *(UD-5; definitions in backlog §1.1)* |
| `detected_by_role` | Packer, Verifier, Quality, Customer |
| `detected_stage` | Before ship, After ship |
| `root_cause_category` (6M) | Method, People, Material, Machine, Measurement, Environment |
| `error.status` | Open, Contained, Closed |
| `rework.action` | Relabel, Repack, Reprint paperwork, Replace part, Recount, Other |
| `corrective_action.status` | Open, In Progress, Closed |
| `inspection_status` | Accepted, On Hold, Rejected |
| `txn_type` (ledger) | RECEIPT, SHIP, TRANSFER, PRODUCTION_COMPLETE, SCRAP, ADJUST (ISSUE exists in docs/08 but is unused in v1) |
| `location.type` | Stock, Receiving, Hold, Shipping, FG |
| `carrier.mode` | Parcel, LTL, Truckload, Pickup |
| `abc_class` | A, B, C |
| `reason_code.category` | late, hold, adjust, scrap |
| `cycle_count.status` | Open, Counted, Approved |

---

## 3. Endpoint index

| ID | Method and path | Roles | Matrix | Stories |
|----|-----------------|-------|--------|---------|
| E-01 | (withdrawn, see §4) | | | |
| E-02 | POST `/auth/login` | anonymous | P-01 | US-001 |
| E-03 | POST `/auth/logout` (POST only; GET is 405, R-13) | any signed-in | P-01 | US-001 |
| E-04 | GET `/me` | any signed-in | P-01 | US-001, US-003 |
| E-05 | GET `/shipments` | all | P-03 | US-024 |
| E-06 | POST `/shipments` | SHP, SUP | P-04 | US-014 |
| E-07 | GET `/shipments/{id}` | all | P-03 | US-024 (absorbs US-018) |
| E-08 | PATCH `/shipments/{id}` | SHP, SUP | P-04 | US-014 (absorbs US-015, US-023) |
| E-09 | POST `/shipments/{id}/actions/mark-ready` | SHP, SUP | P-05 | US-016 |
| E-10 | POST `/shipments/{id}/actions/start-packing` | SHP, SUP | P-06 | US-019 |
| E-11 | POST `/shipments/{id}/actions/verify` | SHP\*, QUA\*, SUP\* (not the packer, R-1) | P-07 | US-019, US-020, US-030 |
| E-12 | POST `/shipments/{id}/actions/ship` | SHP, SUP | P-08 | US-021 (absorbs US-022), US-041, US-030 |
| E-13 | POST `/shipments/{id}/actions/hold` | SHP, QUA, SUP | P-09 | US-016 (absorbs US-017) |
| E-14 | POST `/shipments/{id}/actions/release` | QUA, SUP | P-10 | US-016 |
| E-15 | POST `/shipments/{id}/actions/cancel` | SUP; SHP\* early only (R-5) | P-11 | US-016 |
| E-16 | POST `/shipments/{id}/actions/reopen` | QUA, SUP *(UD-4)* | P-26 | US-016, US-019, US-020, US-030 |
| E-17 | GET `/packaging-errors` | all | P-03 | US-032 (absorbs US-034) |
| E-18 | POST `/packaging-errors` | SHP\* (Before ship only, R-8), QUA, SUP | P-12 | US-027 (absorbs US-033) |
| E-19 | GET `/packaging-errors/{id}` | all | P-03 | US-032 |
| E-20 | PATCH `/packaging-errors/{id}` | QUA, SUP | P-14 | US-032 (absorbs US-031) |
| E-21 | POST `/packaging-errors/{id}/actions/contain` | QUA, SUP *(UD-4)* | P-27 | US-032 |
| E-22 | POST `/packaging-errors/{id}/actions/close` | QUA, SUP | P-14 | US-032 |
| E-23 | GET `/rework-events` | all | P-03 | US-029 |
| E-24 | POST `/rework-events` | SHP, QUA, SUP | P-13 | US-029 |
| E-25 | PATCH `/rework-events/{id}` | SHP, QUA, SUP | P-13 | US-029 |
| E-26 | GET `/corrective-actions` | all | P-03 | US-032 |
| E-27 | POST `/corrective-actions` | QUA, SUP | P-14 | US-032 |
| E-28 | PATCH `/corrective-actions/{id}` | QUA, SUP | P-14 | US-032 |
| E-29 | GET `/receipts` | all | P-03 | US-035 |
| E-30 | POST `/receipts` | RCV, SUP | P-15 | US-035 |
| E-31 | GET `/receipts/{id}` | all | P-03 | US-035 |
| E-32 | GET `/inventory/on-hand` | all | P-03 | US-037 (absorbs US-038) |
| E-33 | GET `/inventory-transactions` | all | P-03 | US-037 |
| E-34 | POST `/inventory-transactions` (TRANSFER, SCRAP, PRODUCTION_COMPLETE) | RCV\* (R-7), QUA\* (Hold moves only), SUP | P-16 | US-035 (absorbs US-039), US-037 |
| E-35 | GET `/cycle-counts` | all | P-03 | US-043 |
| E-36 | POST `/cycle-counts` | SUP | P-17 | US-043 (absorbs US-042) |
| E-37 | GET `/cycle-counts/{id}` | all (fields restricted, §5.4) | P-03 | US-043, US-044 |
| E-38 | POST `/cycle-counts/{id}/entries` | RCV, SUP | P-18 | US-043 |
| E-39 | POST `/cycle-counts/{id}/actions/submit` | RCV, SUP | P-18 | US-043 |
| E-40 | POST `/cycle-counts/{id}/actions/approve` | SUP\* (R-3; not the counter, R-4) | P-19 | US-044 |
| E-41 | GET `/lot-trace/{lot_number}` | all | P-03 | US-045 |
| E-42 | GET `/lookups/{type}` | all | P-03 | US-007 |
| E-43 | POST `/lookups/{type}` | ADM, SUP | P-20 | US-007 |
| E-44 | PATCH `/lookups/{type}/{id}` | ADM, SUP | P-20 | US-007 |
| E-45 | GET `/settings` | all | P-02 | US-008, US-054 |
| E-46 | PATCH `/settings/targets` | ADM, SUP | P-21 | US-008 |
| E-47 | PATCH `/settings/reporting` | ADM | P-22 | US-008 |
| E-48 | GET `/kpis` | all | P-02 | US-046 to US-054 |
| E-49 | GET `/kpis/charts/{C1|C2|C3}` | all | P-02 | US-056, US-057, US-058 |
| E-50 | GET `/reports/{R1|R3|R4|R7}` (+ `?format=csv`) | all | P-03 | US-065 (absorbs US-066, US-068, US-069), US-045 |
| E-51 | GET `/admin/audit-log` | ADM | P-24 | US-005 (absorbs US-006) |
| E-52 | POST `/admin/demo-reset` | ADM\* (flag, cooldown, R-9) | P-25 | US-011, US-081 |
| E-53 | POST `/shipments/{id}/actions/correct` *(UD-3)* | SUP\* (reason ≥ 10 chars, correctable fields only) | P-28 | US-086 |

Roles in this table were regenerated on 2026-11-26 from the REVIEWED matrix §2 (`*` = special rule, §1.3 step 5). "all" = every signed-in role including Viewer (P-02/P-03 read). Admin holds **no** operational action (Matrix R-2, T-6).

P-29 (Resources page, US-085) is a static page for every signed-in role and has no API endpoint. Not built in v1 core (404/405; deferred): user management P-23 (US-004), archive (US-010), delivered date (US-026, **removed** by UD-6), prefilled error form (US-028), release/reject screen (US-036), manual adjustment (US-040), R2/R5/R6/R8, C4–C6, KPI-8, dashboard customer/carrier filters (US-084) at dashboard level (R1 keeps its own customer/carrier filters).

---

## 4. Auth and session

### E-01 (not built)
The draft's pre-login token endpoint is withdrawn: security plan §5 protects the login form with the Origin check and the content-type allow-list only, and a state-creating GET would break Matrix R-13. ID kept so numbering stays stable; ADR-003 may reintroduce a pre-session token as a POST.

### E-02 POST /api/v1/auth/login
Roles: anonymous (checks 2a and 2b of §1.3 apply; no CSRF token exists yet). Matrix P-01. **The rate-limit check (429) runs first**, before any scrypt work.
Request: `{ "username": string 1..64, "password": string 1..200 }`
Rules: look up the user; if unknown, still run one scrypt verification against a dummy hash; `INVALID_CREDENTIALS` is returned identically (same status, same message) for wrong password, unknown username and deactivated user; the failed-attempt counters are DB-backed (§1.2: 5 per username+client and 30 per client per 15 min, no lockout). scrypt parameters per security plan §3.1 (ADR-003 confirms).
Effects: on success create the authenticated session (new random token; any pre-login cookie is ignored and replaced; new CSRF token), clear the (username, client) counter, `LOGIN_SUCCESS` audit. On failure increment the counters and write `LOGIN_FAILED` audit (§1.8).
Responses: 200 `{ "data": { "user": { "id", "username", "display_name", "role" }, "csrf_token", "session": { "expires_at", "idle_expires_at" } } }` | 401 `INVALID_CREDENTIALS` ("Username or password is incorrect.") | 403 `CSRF_INVALID` | 415 | 422 (missing field) | 429 `TOO_MANY_ATTEMPTS`.

### E-03 POST /api/v1/auth/logout
Roles: any signed-in. Effects: delete the session row, clear cookie, audit `LOGOUT`. Responses: 204 | 401 | 403 `CSRF_INVALID`. Back-navigation to a protected page then requires login (US-001).

### E-04 GET /api/v1/me
Roles: any signed-in. Used by pages and the front end for header, capability hints and the CSRF token.
Response 200:
```json
{ "data": { "user": { "id": 3, "username": "demo.shipper1", "display_name": "Demo Shipper One", "role": "Shipping" },
  "csrf_token": "...", "session": { "expires_at": "...", "idle_expires_at": "..." },
  "capabilities": ["P-01","P-02","P-03","P-04","P-05","P-06","P-07","P-08","P-09","P-11","P-12","P-13"],
  "reporting": { "mode": "fixed", "reporting_date": "2026-11-25", "business_today": "2026-11-25",
                 "label": "Reporting date: 25 Nov 2026 (fixed demo date)" } } }
```
`capabilities` lists the matrix actions the role holds in principle (Y or Y*) so the UI can hide buttons; it is a hint only. Every handler re-checks (a hidden button is never the protection).

---

## 5. Shipments

**ShipmentSummary** (list row): `id, shipment_no, customer {id, code, name}, customer_po, promise_date, requested_date, ship_date, status, carrier {id, name}|null, hold_reason {id, label}|null, hold_owner_dept|null, is_overdue, on_time_indicator ("On time" | "Late" | null), days_late|null`.
**ShipmentDetail** = summary + `order_date, tracking_number, service_level, packages_count, total_weight_lb, late_reason {id,label}|null, doc_packing_slip, doc_bol, doc_coc, doc_labels, packed_by {id, display_name}|null, verified_by|null, verified_at|null, rework_origin|null, held_from_status|null, notes, created_at, created_by, updated_at, lines[], status_history[], verifications[], packaging_errors[] (summary), rework_events[], corrective_actions[], corrections[], allowed_actions[]`. *(UD-3)* `corrections[]` = the shipment's `SHIPMENT_CORRECT` audit rows in time order, `{ at, by {id, display_name}, reason, changes: {field: [old, new]}, lines: [{line_id, short_note: [old, new]}] }`, visible to every role that can view the shipment (P-03); other audit rows stay Admin-only.
**Line**: `id, line_no, part {id, part_number, revision, description, requires_coc, packaging_instruction_ref}, qty_ordered, qty_shipped|null, lot_number|null, location {id, code, type}|null, short_note|null`.
**History**: `id, from_status|null, to_status, changed_at, business_date, changed_by {id, display_name}, note|null`.
**Verification attempt**: `attempt_no, result ("Pass"|"Fail"), verified_by, packer {id, display_name}, verified_at, business_date, checklist {key: "pass"|"fail"}, failed_items[], note|null`.
`allowed_actions` = action names the **caller** could perform now (transition valid, role base permission, Matrix R-1 and R-5 applied); a UI hint, not a promise.
`is_overdue` = promise_date < `business_today` and status ∉ {Shipped, Cancelled}. `on_time_indicator`/`days_late`: computed by the KPI module helper `isOnTime()` (same tolerance and basis settings as KPI-1); null while not shipped. No second implementation of the formula exists outside `src/lib/kpi/`.

### E-05 GET /api/v1/shipments
Roles: all (P-03). Filters: `status` (multi), `customer_id`, `carrier_id`, `q` (shipment_no, customer_po, tracking_number), `date_field` (`order_date|requested_date|promise_date|ship_date`, default `promise_date`) with `from`/`to` (inclusive; both optional), `late=true` (Shipped and ship_date later than promise + tolerance), `overdue=true`, `has_error=true`. Sort: `shipment_no, customer, promise_date, ship_date, status, order_date` (default `-promise_date`). Response: paged `ShipmentSummary` plus `total` of the filtered set (US-024 result count). Errors: 422 (bad filter/date, `from > to`).

### E-06 POST /api/v1/shipments
Roles: SHP, SUP (P-04); others 403 (Admin, Receiving, Quality, Viewer; Matrix R-2).
Request:
```json
{ "customer_id": 2, "customer_po": "PO-48117", "order_date": "2026-11-10", "requested_date": "2026-11-24",
  "promise_date": "2026-11-25", "service_level": "Ground", "notes": "...",
  "doc_packing_slip": false, "doc_bol": false, "doc_coc": false, "doc_labels": false,
  "lines": [ { "part_id": 7, "qty_ordered": 120, "lot_number": "L2611-004" } ] }
```
Validation (422, per-field messages): `customer_id` active; `customer_po` 1..40; the three dates valid; **`promise_date >= order_date`** and **`requested_date >= order_date`** *(T-016, D-14: DB CHECK `shipment_dates_chk`)*; `service_level` ≤ 40 optional; `notes` ≤ 1000; `lines` 1..50; `part_id` active; `qty_ordered` integer 1..1,000,000 (0, negative, fractional, text rejected); `lot_number` optional `^[A-Z0-9][A-Z0-9-]{2,29}$` [A], and when given it must be an existing lot of that line's part (422 `LOT_PART_MISMATCH`, §7 lot registry, *T-016*); flags default false. Inactive customer/part → `INACTIVE_REFERENCE`. Revision is the part's (`part.revision`); a different revision is a different part row.
Effects (one transaction): `shipment_no` = `SH-` + sequence (≥ 4 digits, starts above the seeded maximum; gaps after rollbacks are possible), status `Planned`, `line_no` 1..n in request order, history row (null → Planned), audit `SHIPMENT_CREATE`.
Responses: 201 + `Location` + ShipmentDetail | 403 | 415 | 422.

### E-07 GET /api/v1/shipments/{id}
Roles: all (P-03). Responses: 200 ShipmentDetail | 404 (generic `NOT_FOUND`, same shape for malformed id).

### E-08 PATCH /api/v1/shipments/{id}
Roles: SHP, SUP (P-04). Editable: `customer_id, customer_po, order_date, requested_date, promise_date, service_level, notes, doc_packing_slip, doc_bol, doc_coc, doc_labels, lines` (all optional, at least one). `lines` is the **complete** new list: entries with `id` update that line, entries without `id` are added (next `line_no`), omitted existing lines are removed (a line referenced by a packaging error → 409 `LINE_IN_USE`). Not editable here: status, packer, verifier, carrier, tracking, ship date, quantities shipped, hold/late reasons (they belong to actions).
Rules:
- Status Planned, Ready to Pack, Packing, Verified, On Hold, Rework: allowed. Status Shipped or Cancelled: **409 `SHIPMENT_LOCKED` for every role and every field, notes included** *(UD-3, Matrix R-14; the earlier Supervisor-notes exception is withdrawn)*. Corrections go through E-53. The DB enforces the same lock (trigger `shipment_lock_guard`).
- All E-06 validation re-applied to the merged result (`promise_date >= order_date`, etc.).
- If status is **Verified** and `customer_id`, `customer_po` or any line part/qty/lot/location changed: status → **Rework**, `rework_origin = EDITED_AFTER_VERIFY`, `verified_by`/`verified_at` cleared, history note "Edited after verification: <fields>" [A: header scope]. Flag/notes/date edits do not trigger it. Earlier verification attempts are kept.
Effects: one transaction; audit `SHIPMENT_UPDATE` with old→new per changed field (lines as `{added, removed, changed}` summary).
Responses: 200 ShipmentDetail | 403 | 404 | 409 | 422.

### Actions: common rules (E-09 to E-16)
Request body: JSON object, fields per action, optional `note` (≤ 500) on every action (stored on the history row). Success: **200** with the updated ShipmentDetail (`{ "data": ... }`). Order of checks as §1.3: base role → schema → load with `FOR UPDATE` → conditional role/identity rules (403, step 5) → transition validity (409 `INVALID_TRANSITION`, `details = { status, allowed_from }`, step 6) → data rules *(T-016, D-9: corrected to match §1.3)*. Every success writes one history row `{from, to, changed_by, changed_at, business_date, note}` and one audit row.

### E-09 POST /api/v1/shipments/{id}/actions/mark-ready
Roles: SHP, SUP (P-05). Request `{ note? }`. Rules: status Planned. Effects: → Ready to Pack; history (first such row anchors KPI-6); audit `SHIPMENT_MARK_READY`. Responses: 200 | 403 | 404 | 409 `INVALID_TRANSITION`.

### E-10 POST /api/v1/shipments/{id}/actions/start-packing
Roles: SHP, SUP (P-06). Request `{ note? }`. Rules: status Ready to Pack, **or** *(UD-4)* status Packing with `packed_by` null (the state right after a reopen by Quality/Supervisor; the re-pack). Any other status, or Packing with a packer already recorded → 409 `INVALID_TRANSITION`. Effects: from Ready to Pack → Packing with a history row; for the re-pack no status change and no history row (Packing → Packing is not a transition). In both cases `packed_by` = caller (the **current packer**, Matrix R-1); audit `SHIPMENT_START_PACKING` (`changes.repack = true` for the re-pack). The response lets the UI show each part's `packaging_instruction_ref`. Responses: 200 | 403 | 409.

### E-11 POST /api/v1/shipments/{id}/actions/verify
Roles: SHP, QUA, SUP (P-07\*); ADM, RCV, VWR 403 `FORBIDDEN_ROLE`. **Subject to Matrix R-1 for every role.**
Request:
```json
{ "checklist": { "part_number": "pass", "revision": "pass", "quantity": "pass", "lot": "pass",
                 "labels": "fail", "packing_slip": "pass", "coc": "pass", "packaging_method": "pass" },
  "note": "Label shows CRC-2041-A, parts are rev B", "outcome": "fail" }
```
*(T-016, D-15)* `note` (≤ 500) is **required (1..500) when any item is `fail`** (422 `fields.note`; UI `E-VER-4`). `outcome` (`pass` | `fail`, optional) is the button the user pressed; when it is present and disagrees with the checklist (`pass` with any `fail` item, or `fail` with none) → 422 `VALIDATION_ERROR` `fields.outcome` (UI `E-VER-5`, `E-VER-6`). One note per attempt (the `shipment_verification.note` column); per-item notes are not stored.
Rules, in order:
1. **Matrix R-1 (checked inside the verify transaction, after the body validates and before the 409 checks, §1.3 step 5):** the shipment row is locked with `SELECT … FOR UPDATE` (or the status change is one conditional `UPDATE … WHERE status = 'Packing' AND packed_by <> $caller`), and the caller id **from the session** is compared with `shipment.packed_by`, the **current packer** (the user of the latest `start-packing`, including the re-pack after a reopen, UD-4). Equal → **403 `VERIFIER_SAME_AS_PACKER`** ("The person who packed this shipment cannot verify it."), audit `ACCESS_DENIED`, **no verification row (passed or failed) is written**, status unchanged. Applies to Shipping, Quality and Supervisor alike; after a reopen the **re-packing user** (E-10) is refused and the earlier packer is accepted (T-5, UD-4). Two concurrent requests cannot bypass it because the comparison and the status change happen under the same row lock. The packer id is never read from the request (R-12; a body containing `verifierId`/`packerId` is 400 `UNKNOWN_FIELD`, T-16).
2. Status must be Packing, else 409. Rework → see the rework-gate text in §1.7 (409 `REWORK_GATE_NOT_MET` or `INVALID_TRANSITION`). A Packing shipment with no recorded packer (normal right after a reopen, UD-4) → 409 `INVALID_TRANSITION`, `details.reason = "no_packer"`, `details.required_action = "start-packing"` (someone must re-pack first; `shipment_verification.packer_id` is NOT NULL).
3. Checklist: every applicable key present with `pass` or `fail`; `coc` is required iff any line's part has `requires_coc` and **rejected as unknown if not applicable**; a missing key → 422 `CHECKLIST_INCOMPLETE` (`fields.checklist.<key>`). No "unanswered" can pass.
4. Record consistency (poka-yoke, US-023): `lot = pass` requires every line to have a `lot_number` and `coc = pass` requires `doc_coc = true`, else 422 `CHECKLIST_CONTRADICTS_RECORD` (the verifier must mark `fail`, or the packer fix the record via E-08). `labels`, `packing_slip`, `packaging_method`, `part_number`, `revision`, `quantity` are human judgements.
Effects (one transaction): insert `shipment_verification` row (`attempt_no` = previous + 1, `result`, `verified_by`, `packer_id` snapshot, checklist, failed items, `business_date`).
- All applicable items `pass` → status **Verified**, `verified_by`, `verified_at`; completed rework events of the episode get `reverified_ok = true` (server-managed) [P]; `rework_origin` cleared.
- Any item `fail` → status **Rework**, `rework_origin = VERIFICATION_FAILED`, history note lists the failed items, `verified_by` cleared. HTTP is still 200; `data.verification.result = "Fail"`. A packaging error must then be logged (E-18) before the gate (§1.7) lets the shipment move on. FPY (KPI-4) uses attempt 1 only.
- audit `SHIPMENT_VERIFY`.
Responses: 200 `{ "data": { ...ShipmentDetail, "verification": {attempt} } }` | 403 `FORBIDDEN_ROLE` / `VERIFIER_SAME_AS_PACKER` / `CSRF_INVALID` | 404 | 409 | 422.

### E-12 POST /api/v1/shipments/{id}/actions/ship
Roles: SHP, SUP (P-08); ADM, RCV, QUA, VWR 403.
Request:
```json
{ "ship_date": "2026-11-25", "carrier_id": 1, "tracking_number": "SLP123456789012",
  "packages_count": 2, "total_weight_lb": 48.5, "late_reason_id": null, "service_level": "Ground",
  "lines": [ { "line_id": 11, "qty_shipped": 120, "lot_number": "L2611-004", "location_id": 4, "short_note": null } ],
  "note": null }
```
Rules:
- Status must be **Verified** (409 `INVALID_TRANSITION`; Rework/Packing per §1.7). AC-2: a failed verification can only reach this state through reopen + logged error + completed rework + a passing verification by a non-packer.
- `ship_date` defaults to `business_today`; must not be later than `business_today` (no future dates) and not before `order_date`.
- `carrier_id` active. `tracking_number` `^[A-Za-z0-9-]{1,40}$` [A]; **required unless the carrier's mode is Pickup**; if supplied for Pickup it is still format-checked.
- `packages_count` integer 1..999; `total_weight_lb` number > 0, ≤ 100000, ≤ 2 decimals.
- **Late reason** *(T-016, D-2; confirmed by UD-1)*: required iff `ship_date > promise_date` (calendar days; always the promise date, regardless of the KPI basis toggle and of `on_time_tolerance_days`, which affects only the KPI classification and `on_time_indicator`). If required and missing → 422 (`fields.late_reason_id`); it must be category `late`. When `ship_date <= promise_date` it must be omitted or null (the DB CHECK `shipment_late_reason_chk` allows a late reason only on a Shipped shipment that is late), else 422.
- `lines`: if present it must contain **every** shipment line exactly once; if omitted every line must already have `lot_number` and `location_id` (and `qty_shipped` defaults to `qty_ordered`). Per line: `qty_shipped` integer 0..`qty_ordered` (over-shipping rejected [A]); `lot_number` required and an existing lot of the line's part (422 `LOT_PART_MISMATCH`, *T-016*); `location_id` required, active, type Stock, FG or Shipping (not Hold or Receiving) [A]; `short_note` (1..300) **required when `qty_shipped < qty_ordered`**; at least one line must ship > 0. A short shipment is accepted and later counts as not-in-full for OTIF.
- **Stock check under lock (US-041):** for each line with `qty_shipped > 0`, on-hand for (part, lot, location) ≥ `qty_shipped`; otherwise 409 `INSUFFICIENT_STOCK` with `details = { line_id, available, requested }`, nothing changes.
Effects (one transaction, **in this order**, because the DB lock trigger of UD-3 refuses line changes once the status is Shipped): lines updated (`qty_shipped`, `lot_number`, `location_id`, `short_note`); one `SHIP` inventory transaction per line with `qty_shipped > 0` (`qty_change = -qty_shipped`, `reference_type = 'shipment'`, `reference_id` = shipment id, `txn_at` = real now); shipment → **Shipped** with `ship_date, carrier_id, tracking_number, packages_count, total_weight_lb, late_reason_id` and `shipped_at` = real now (§1.6; it equals the SHIP rows' `txn_at`, *T-016*); history row; audit `SHIPMENT_SHIP` (`changes.ledger_txn_ids`). All-or-nothing.
Responses: 200 `{ data: ShipmentDetail + "ledger": [txn…] }` | 403 | 404 | 409 `INVALID_TRANSITION` / `REWORK_GATE_NOT_MET` / `INSUFFICIENT_STOCK` | 422.

### E-13 POST /api/v1/shipments/{id}/actions/hold
Roles: SHP, QUA, SUP (P-09). Request `{ "hold_reason_id": int (category hold), "hold_owner_dept": enum, "note"? }` (both required; field renamed from `owner_dept` to match the column and the response, *T-016*). Rules: status ∈ Planned, Ready to Pack, Packing, Verified, Rework (not On Hold, Shipped, Cancelled). Effects: `held_from_status` = current status; → On Hold; `hold_reason_id`, `hold_owner_dept` set; audit `SHIPMENT_HOLD`. Responses: 200 | 403 | 409 | 422 (missing reason: `fields.hold_reason_id`).

### E-14 POST /api/v1/shipments/{id}/actions/release
Roles: QUA, SUP only (P-10, Matrix R-6); SHP 403. Request `{ note? }`. Rules: status On Hold. Effects: status → `held_from_status`; hold fields cleared (retained in history note); audit `SHIPMENT_RELEASE`. The packer and verifier stay as they were.

### E-15 POST /api/v1/shipments/{id}/actions/cancel
Roles: SUP, SHP (P-11); others 403. Request `{ "reason": string 1..500 }` (required; stored as the history note and in audit). Rules, in order: **Matrix R-5** (§1.3 step 5, status read from the locked row): SHP only when the **current** status is Planned or Ready to Pack; at any other status (Packing, Verified, Rework, On Hold, and also Shipped or Cancelled) → **403 `FORBIDDEN_CANCEL_AT_STATUS`** (a role rule, not 409; T-9). Then, for SUP, status ∈ Planned, Ready to Pack, Packing, Verified, Rework, On Hold, else 409 `INVALID_TRANSITION` (Shipped, Cancelled). Effects: → Cancelled (read-only; excluded from every KPI); no ledger effect (nothing is posted before ship); audit `SHIPMENT_CANCEL`.

### E-16 POST /api/v1/shipments/{id}/actions/reopen
Roles: *(UD-4)* **QUA, SUP** (P-26, Matrix R-15); SHP, RCV, ADM, VWR 403 `FORBIDDEN_ROLE`. Request `{ note? }`. Rules: status Rework (else 409); **rework gate** (§1.7) for origins `VERIFICATION_FAILED` and `ERROR_LOGGED` → 409 `REWORK_GATE_NOT_MET`. Effects: → Packing; **`packed_by` cleared** (null); `rework_origin` cleared; history row; audit `SHIPMENT_REOPEN`. The shipment cannot be verified until a Shipping user or Supervisor re-packs it with E-10, and that **re-packing user becomes the current packer** (the earlier packer may then verify, the re-packer may not: Matrix R-1 / US-020, T-5). A Supervisor who reopens and then re-packs is the packer like anyone else.

### E-53 POST /api/v1/shipments/{id}/actions/correct *(UD-3, Matrix P-28, R-14, US-086)*
Roles: **SUP only** (P-28 Y\*); SHP, RCV, QUA, ADM, VWR 403 `FORBIDDEN_ROLE`.
Request (all optional except `reason`; at least one field must actually change):
```json
{ "reason": "Carrier keyed wrong at dock; BOL shows HFL", "customer_po": "PO-48117", "requested_date": "2026-11-24", "promise_date": "2026-11-25",
  "ship_date": "2026-11-25", "carrier_id": 2, "tracking_number": "HFL1234567890", "service_level": "LTL",
  "packages_count": 3, "total_weight_lb": 61.0, "late_reason_id": null,
  "doc_packing_slip": true, "doc_bol": true, "doc_coc": false, "doc_labels": true, "notes": "...",
  "lines": [ { "line_id": 11, "short_note": "Short 2: customer agreed" } ] }
```
**Correctable fields (confirmed by Marcus, T-022; this finalizes Priya's US-086 [P] list and adds `ship_date` and `service_level`):** `customer_po`, `requested_date`, `promise_date`, `ship_date`, `carrier_id`, `tracking_number`, `service_level`, `packages_count`, `total_weight_lb`, `late_reason_id`, the four `doc_*` flags, `notes`, and per line only `short_note`. The DB trigger `shipment_lock_guard` allows exactly this column set. Not correctable: `status`, `customer_id`, `order_date`, packer/verifier, `shipped_at`, and every line field that feeds the ledger (`part_id`, `qty_ordered`, `qty_shipped`, `lot_number`, `location_id`). Those return **422 `CORRECTION_FIELD_NOT_ALLOWED`**; inventory is corrected through a cycle count. Actor or timestamp fields return 400 `UNKNOWN_FIELD` (R-12).
Rules, in order (§1.3): role → Zod (`reason` trimmed 10..500, else 422 `fields.reason`; field formats as E-06/E-12) → load `FOR UPDATE` → status must be **Shipped or Cancelled**, else 409 `INVALID_TRANSITION` (`details.required_action = "edit"`, use E-08) → **merged-record validation as E-06/E-12**: dates ≥ `order_date`; `ship_date` ≤ `business_today`; tracking required unless carrier mode Pickup; late reason required iff merged `ship_date > promise_date` (UD-1), else it must be null; `carrier_id` active. On a **Cancelled** shipment the ship-only fields (`ship_date`, `carrier_id`, `tracking_number`, `service_level`, `packages_count`, `total_weight_lb`, `late_reason_id`, line `short_note`) → 422. If no value differs from the stored one → 422 `VALIDATION_ERROR` ("Nothing to correct").
Effects (one transaction): update the shipment (and line notes); **no** status-history row, ledger row or verification row; audit `SHIPMENT_CORRECT` with `changes = { field: [old, new], …, reason, lines: [...] }`. KPIs read the corrected values on the next load (one KPI module).
Responses: 200 ShipmentDetail (with `corrections[]`) | 403 | 404 | 409 | 422.

---

## 6. Packaging errors, rework, corrective actions

**PackagingError**: `id, error_no, shipment {id, shipment_no}, shipment_line_id|null, detected_at, detected_by_role, detected_stage, category, paperwork_subtype|null, severity, description, root_cause_category|null, root_cause_note|null (5 Whys), status, reported_by, needs_recategorisation (category = Other), is_overdue (status Open and detected more than 7 days before business_today), `packaging_related` (boolean, *CE-4*: false = a customer-found error not caused by our packing; it then does not count in KPI-3, KPI-4 or C3), rework_minutes_total (completed events only), rework_events[], corrective_actions[], created_at`.

### E-17 GET /api/v1/packaging-errors
Roles: all. Filters: `status, category, severity, detected_stage` (multi), `shipment_id` (or `shipment_no`), `from`/`to` (date of `detected_at`), `overdue=true`, `needs_recategorisation=true`. Sort: `error_no, detected_at, severity, status` (default `-detected_at`). Rows carry `rework_minutes_total` and `corrective_action_status` ("None" or the least-complete linked status).

### E-18 POST /api/v1/packaging-errors
Roles: SHP, QUA, SUP (P-12); ADM, RCV, VWR 403. **Matrix R-8 (P-12 Y\* for SHP):** SHP logs **Before-ship errors only**; if the request has `detected_stage = "After ship"` **or** the shipment's DB status is Shipped, SHP gets **403 `FORBIDDEN_AFTER_SHIP_ERROR`** (T-18); QUA and SUP may log both.
Request:
```json
{ "shipment_id": 31, "shipment_line_id": null, "detected_at": null, "detected_by_role": "Verifier",
  "detected_stage": "Before ship", "category": "Paperwork", "paperwork_subtype": "Packing slip",
  "severity": "High", "description": "Packing slip lists rev B; parts are rev C", "packaging_related": true }
```
Validation (422): enums as §2; `description` 1..1000; `detected_at` timestamp, default `business_now`, not later than `business_now + 5 min`; `shipment_line_id` (if given) belongs to the shipment; **`paperwork_subtype` required when category is Paperwork and forbidden otherwise**; `detected_by_role = Customer` requires stage After ship; stage After ship allows only detected_by Quality or Customer; stage Before ship allows Packer, Verifier or Quality [A]. Root cause is **not** accepted here (P-14 is Quality/Supervisor; set it via E-20) [P, differs from docs/08 F4's "optional root cause"]. *(CE-4, UD-9)* `packaging_related` is optional, default `true`. `false` is allowed only with `detected_stage = "After ship"` (else 422 `fields.packaging_related`; DB CHECK `packaging_error_related_chk`) and then requires `packaging_related_reason` (10..500, else 422), which is stored only in the audit row. Only QUA and SUP can send `false`; SHP cannot log After-ship errors (R-8), so a SHP request with `false` is refused by R-8 (403) or by the stage rule (422).
State rules after the role rules (409 `STAGE_STATUS_MISMATCH`, so reachable by QUA/SUP, or by SHP only for a Cancelled shipment): Before ship requires the shipment status ∉ {Shipped, Cancelled}; After ship requires status Shipped (no Delivered, UD-6).
Effects (one transaction): `error_no` = `PE-` + sequence, status **Open**, `reported_by` = caller. **If stage is Before ship and shipment status ∈ {Packing, Verified}** → shipment → **Rework**, `rework_origin = ERROR_LOGGED`, `verified_by` cleared, history note "Packaging error PE-nnnn". In any other status no shipment change (a failed verification already put it in Rework; an After-ship error never changes the shipment). Audit `PACKAGING_ERROR_CREATE` (and `SHIPMENT_UPDATE` row if the status moved).
Responses: 201 + PackagingError | 403 | 404 | 409 | 422.

### E-19 GET /api/v1/packaging-errors/{id}
Roles: all. 200 PackagingError with linked rework events and corrective actions.

### E-20 PATCH /api/v1/packaging-errors/{id}
Roles: QUA, SUP (P-14); **SHP 403** (they may log but not edit root cause, US-031). Request: `{ "root_cause_category"?: enum, "root_cause_note"?: string ≤ 2000, "packaging_related"?: boolean, "packaging_related_reason"?: string 10..500 }` (at least one field; `null` clears the root-cause fields). *(CE-4, UD-9)* Changing `packaging_related` (either direction) requires `packaging_related_reason` (422) and is allowed only on an After-ship error (422 `fields.packaging_related` otherwise). Rules: 409 `ERROR_CLOSED` when Closed. Effects: audit `PACKAGING_ERROR_UPDATE` old→new (with `reason` for a `packaging_related` change). The 5 Whys note is `root_cause_note`. No other field is editable in v1 core (log fields are write-once) [A].

### E-21 POST /api/v1/packaging-errors/{id}/actions/contain
Roles: *(UD-4)* **QUA, SUP** (P-27, Matrix R-15); SHP, RCV, ADM, VWR 403 `FORBIDDEN_ROLE`. Rule: status Open → Contained (else 409 `INVALID_TRANSITION`). Audit `PACKAGING_ERROR_CONTAIN`.

### E-22 POST /api/v1/packaging-errors/{id}/actions/close
Roles: QUA, SUP (P-14). Rules: status Open or Contained (Closed → 409 `ERROR_CLOSED`); **`root_cause_category` must be set** and, for **Before ship** errors, **at least one completed rework event** exists → else 409 `CLOSE_PRECONDITION_FAILED` (`details.missing` = [`root_cause`, `completed_rework`]). After-ship (customer-found) errors need no rework [A]. Open corrective actions do not block close [A]. Effects: status Closed, `closed_at` = real now (DB CHECK, *T-016*); audit `PACKAGING_ERROR_CLOSE`.

**ReworkEvent**: `id, packaging_error {id, error_no}, shipment {id, shipment_no}, action, started_at, completed_at|null, minutes|null, status ("In progress"|"Completed"), performed_by, reverified_ok|null, created_at`.

### E-23 GET /api/v1/rework-events
Roles: all. Filters `packaging_error_id`, `shipment_id`, `status` (`in_progress|completed`), `from`/`to` (date of `completed_at`). Sort `started_at, completed_at, minutes` (default `-started_at`).

### E-24 POST /api/v1/rework-events
Roles: SHP, QUA, SUP (P-13). Request `{ "packaging_error_id", "action": enum, "started_at"?: ts (default business_now), "completed_at"?: ts }` (both are business instants on the same clock, §1.6, *T-016*). Rules: error exists (a rework event cannot exist without an error) and is not Closed (409 `ERROR_CLOSED`); `completed_at >= started_at` (422 `fields.completed_at`); neither later than `business_now + 5 min`. `shipment_id` is derived from the error; `performed_by` = caller; `reverified_ok` is server-managed (E-11) and not accepted [P]. `minutes` = `floor((completed_at - started_at) / 60 s)`, null while in progress; in-progress events are excluded from every minute total (US-029). Audit `REWORK_CREATE`. Response 201.

### E-25 PATCH /api/v1/rework-events/{id}
Roles: SHP, QUA, SUP (P-13). Request `{ "completed_at"?: ts }` (the only editable field; completes an in-progress event; default `business_now`, not later than `business_now + 5 min`). Rules: not already completed (409 `ALREADY_COMPLETED`), `>= started_at` (422 `fields.completed_at`). Effects: sets `completed_at`; `minutes` and `completed_business_date` are **generated by the database** from it (never written by the app, *T-016, D-1*); audit `REWORK_COMPLETE`. Response 200.

**CorrectiveAction**: `id, packaging_error {id, error_no}, action_description, owner {id, display_name}, due_date, status, is_overdue (due_date < business_today and status ≠ Closed), closed_at|null, created_at`.

### E-26 GET /api/v1/corrective-actions
Roles: all. Filters `status`, `owner_id`, `packaging_error_id`, `overdue=true`. Sort `due_date, status, id` (default `due_date`).

### E-27 POST /api/v1/corrective-actions
Roles: QUA, SUP (P-14). Request `{ "packaging_error_id", "action_description": 1..1000, "owner_id": int, "due_date": date }` (status is always created `Open`). Rules: owner is an **active** user (422 `INACTIVE_REFERENCE`); `due_date >=` the error's `detected_at` date (422); error not Closed [A]. Audit `CORRECTIVE_ACTION_CREATE`. Response 201.

### E-28 PATCH /api/v1/corrective-actions/{id}
Roles: QUA, SUP (P-14). Editable `action_description, owner_id, due_date, status`. Status moves forward only: Open → In Progress → Closed (Open → Closed allowed); Closed is read-only (409 `ACTION_CLOSED`). On Closed, `closed_at` = real now. Same owner/date rules as E-27. Audit `CORRECTIVE_ACTION_UPDATE`.

---

## 7. Inventory

**Ledger rule (US-037):** `inventory_transaction` rows are never edited or deleted (DB triggers also enforce it). Quantities are signed non-zero integers; lot number is required on every row; ADJUST and SCRAP require a reason code of category `adjust` / `scrap`. On-hand = signed sum per (part, location, lot); no row may drive it below zero.

**Lot registry (T-016, D-12).** Every lot number belongs to exactly one part (`lot` table; composite FKs `(part_id, lot_number)` on lines, receipts, count lines and ledger rows), so an unchecked lot would become a 500. Rules: lot numbers are trimmed and upper-cased, `^[A-Z0-9][A-Z0-9-]{2,29}$`. **E-30 (receipt) and E-34 PRODUCTION_COMPLETE create the lot row if it is new** (`INSERT … ON CONFLICT DO NOTHING`, then re-read). If the number already belongs to another part, the response is 422 `LOT_PART_MISMATCH` (`fields.lot_number`). Every other endpoint that takes a lot number (E-06/E-08 lines, E-12 lines, E-34 TRANSFER/SCRAP) requires an **existing lot of the same part**, else 422 `LOT_PART_MISMATCH`. The `L<yy><ww>-<nnn>` pattern is a UI hint and a seed convention only.

**Transaction**: `id, txn_type, part {id, part_number, revision}, location {id, code, type}, lot_number, qty_change, reason_code {id, label}|null, reference_type (receipt|shipment|cycle_count|manual), reference_id, transfer_group|null, txn_at, created_by`.

### E-29 GET /api/v1/receipts and E-31 GET /api/v1/receipts/{id}
Roles: all. **Receipt**: `id, receipt_no, supplier {id, code, name}, supplier_po, part {id, part_number, revision}, qty_received, lot_number, arrived_at, putaway_at (null in v1 core), location {id, code, type}|null, inspection_status, received_by, transaction_id|null, created_at`. Filters `supplier_id, part_id, lot_number, inspection_status, from/to` (date of `arrived_at`). Sort `receipt_no, arrived_at` (default `-arrived_at`).

### E-30 POST /api/v1/receipts
Roles: RCV, SUP (P-15); SHP, QUA, ADM, VWR 403.
Request `{ "supplier_id", "supplier_po": 1..40, "part_id", "qty_received": int 1..1,000,000, "lot_number", "arrived_at"?: ts (default business_now, not later than business_now + 5 min), "inspection_status": enum, "location_id"?: int }`.
Rules (422): supplier and part active; lot required (lot registry above: created if new, 422 `LOT_PART_MISMATCH` if it belongs to another part); by `inspection_status`:
- **Accepted**: `location_id` required, active, type Stock, Receiving or FG. RECEIPT transaction to that location.
- **On Hold**: location must be of type Hold; if omitted the server uses the only active Hold location (`HOLD-01`); several active Hold locations and none chosen → 422. RECEIPT transaction to the Hold location.
- **Rejected**: `location_id` must be omitted; **no ledger row** (no on-hand is created); the receipt remains visible with that status.
Effects (one transaction): `receipt_no` = `RC-` + sequence; receipt row; for Accepted / On Hold one `RECEIPT` row (`qty_change = +qty_received`, `reference_type = 'receipt'`); audit `RECEIPT_CREATE`. Held stock is released by a transfer out of the Hold location (E-34, Matrix R-7), which only Quality and Supervisor can post. Receipts cannot be edited or voided in v1 core; a mistaken receipt is corrected only through a count adjustment [A].
Responses: 201 + Receipt (with the transaction) | 403 | 422.

### E-32 GET /api/v1/inventory/on-hand
Roles: all (P-03). Filters `part_id, location_id, lot_number, include_zero` (default false: zero rows hidden). Sort `part_number, location, lot_number, qty_on_hand` (default `part_number`). Row: `{ part {id, part_number, revision, description, abc_class}, location {id, code, type}, lot_number, qty_on_hand }`. Computed from the ledger view; no edit control or endpoint exists. The same query backs R4.

### E-33 GET /api/v1/inventory-transactions
Roles: all. Read-only ledger listing (R5 as a report is deferred; this is the plain list used by tests and lot trace). Filters `part_id, lot_number, txn_type, location_id, reference_type, reference_id, from/to` (UTC date of `txn_at`). Sort `txn_at, id` (default `-txn_at`).

### E-34 POST /api/v1/inventory-transactions
Roles: base permission SUP, RCV\*, QUA\* (P-16); SHP, ADM, VWR 403 `FORBIDDEN_ROLE`. Only three types can be posted by hand; RECEIPT, SHIP and ADJUST are created by E-30, E-12 and E-40 respectively, and any other `txn_type` (including ADJUST, "manual adjustment is deferred", US-040) → 422 `fields.txn_type`.
Request (discriminated on `txn_type`):
```json
{ "txn_type": "TRANSFER", "part_id": 7, "lot_number": "L2611-004", "from_location_id": 5, "to_location_id": 4, "qty": 40 }
{ "txn_type": "SCRAP", "part_id": 7, "lot_number": "L2611-004", "location_id": 4, "qty": 5, "reason_code_id": 12 }
{ "txn_type": "PRODUCTION_COMPLETE", "part_id": 7, "lot_number": "L2612-001", "location_id": 9, "qty": 200 }
```
Every variant also accepts an optional `"note"` (≤ 500, stored on each ledger row; UI S16 has a note field, *T-016*).
Rules: `qty` integer 1..1,000,000 (the server signs it); part and locations active; for TRANSFER `from != to`; SCRAP `reason_code_id` category `scrap` (required); PRODUCTION_COMPLETE location type **FG** and the lot is created if new (lot registry); TRANSFER / SCRAP quantity ≤ on-hand at the source (part, location, lot) under lock, else 409 `INSUFFICIENT_STOCK` (`details.available`).
Conditional roles (§1.3 step 5; the rule is decided by the **type of the source location read from the DB in the same transaction**, never by a request flag; T-13, T-19):
- **Matrix R-7:** any movement **out of** a Hold-type location, a TRANSFER whose `from_location` is Hold or a SCRAP at a Hold location, needs QUA or SUP. RCV → **403 `FORBIDDEN_HOLD_RELEASE`**. RCV may transfer, scrap and record PRODUCTION_COMPLETE for stock not in a Hold location, and may transfer **into** a Hold location.
- **QUA (Y\*):** only a TRANSFER into or out of a Hold location (source or destination is Hold) and a SCRAP at a Hold location (disposition of held material). Anything else, including PRODUCTION_COMPLETE or a transfer between two non-Hold locations → **403 `FORBIDDEN_NON_HOLD_TXN`**.
- SUP: all three types.
Effects (one transaction): TRANSFER posts **two** rows (`-qty` at source, `+qty` at destination) sharing one `transfer_group`; either both are stored or neither. SCRAP posts `-qty`. PRODUCTION_COMPLETE posts `+qty`. `reference_type = 'manual'`. Audit `INVENTORY_TXN_CREATE` (lists the txn ids).
Responses: 201 `{ data: { transactions: [Transaction…] } }` | 403 | 409 `INSUFFICIENT_STOCK` | 422.

### 7.1 Cycle counts (F9; docs/03 §3.4)
**CycleCount**: `id, count_no, scheduled_date, status, scope { abc_class|null, location {id, code}|null }, created_by, created_at, submitted_at|null, approved_by|null, approved_at|null, line_count, counted_count`, and in the detail `lines[]` plus `can_approve` (true only when the caller is SUP, the count is Counted and the caller entered or recounted no line **and did not submit it**, UD-2; lets the UI show the S19 "unavailable" state) and `caller_entered_lines` (bool). `can_approve` is a hint; E-40 re-checks.
**Line** (always): `id, part {id, part_number, revision, abc_class}, location {id, code}, lot_number, counted_qty|null, recount_qty|null, recount_required (counted_qty set, out of tolerance, recount_qty null), counted_by|null, counted_at|null, recounted_by|null, recounted_at|null` (the counter ids are visible to every role that can open the count; R-4 needs them).
**Line, restricted fields** `system_qty, variance (counted_qty - system_qty), within_tolerance, final_qty (recount_qty if set else counted_qty), final_variance, adjustment_txn_id`: returned **only** when the count is `Counted` and the caller is SUP or ADM, or the count is `Approved` and the caller is any role. For an **Open** count the fields are absent for **every** role (including Supervisor) and absent from the response body, not merely hidden in the UI (US-043: blind count). `recount_required` tells a counter to recount without revealing the system quantity.
Tolerance (docs/03 §3.3, settings): `within_tolerance` iff `abs(variance) <= system_qty * tolerance_pct / 100` for the part's ABC class (defaults A 0, B 2, C 5), computed on the **first** count.

### E-35 GET /api/v1/cycle-counts
Roles: all. Filters `status, from/to` (`scheduled_date`). Sort `count_no, scheduled_date, status` (default `-scheduled_date`).

### E-36 POST /api/v1/cycle-counts
Roles: SUP only (P-17); all others 403.
Request `{ "scheduled_date": date, "abc_class"?: "A|B|C", "location_id"?: int }` (at least one of `abc_class` / `location_id`).
Effects (one transaction): `count_no` = `CC-` + sequence; status Open; one line per (part, location, lot) with on-hand > 0 matching the filter; `system_qty` snapshot stored but not exposed to counters; audit `CYCLE_COUNT_CREATE`. 422 `NO_COUNT_LINES` (no matching stock), 422 `COUNT_TOO_LARGE` (> 500 lines). Response 201 CycleCount (no restricted fields).

### E-37 GET /api/v1/cycle-counts/{id}
Roles: all, with the field restriction above. Lines sorted by location code, part number, lot.

### E-38 POST /api/v1/cycle-counts/{id}/entries
Roles: RCV, SUP (P-18); SHP, QUA, ADM, VWR 403. Count status must be **Open** (409 `INVALID_COUNT_STATE`).
Request `{ "entries": [ { "line_id": 101, "counted_qty": 96 }, { "line_id": 102, "recount_qty": 14 } ] }` (1..200 entries, each with exactly one of the two quantities, integers ≥ 0; negative, fractional or non-numeric → 422). All-or-nothing.
Rules per entry: `counted_qty` only when the line has none yet (the first count is kept unchanged: otherwise 409 `ALREADY_COUNTED`); `recount_qty` only when `counted_qty` exists, is **out of tolerance**, and no recount exists yet (else 422 `fields.entries[i]`). Records `counted_by` / `counted_at` (and the recounter for R-4).
Response 200: `{ "data": { "count_no", "status", "lines": [ { "line_id", "counted_qty", "recount_qty", "recount_required" } ] } }` (still no system quantity). Audit `CYCLE_COUNT_ENTRY`.

### E-39 POST /api/v1/cycle-counts/{id}/actions/submit
Roles: RCV, SUP (P-18). Rules: status Open (else 409 `INVALID_COUNT_STATE`); every line has `counted_qty` and every out-of-tolerance line has `recount_qty`, else 422 `COUNT_INCOMPLETE` (`details.line_ids`). Effects: status **Counted**, `submitted_by` = caller, `submitted_at` = real now (both required by the DB, *T-016*); audit `CYCLE_COUNT_SUBMIT`. *(UD-2)* The submitter can **not** approve the count afterwards (E-40). Response 200 CycleCount.

### E-40 POST /api/v1/cycle-counts/{id}/actions/approve
Roles: **SUP only** (P-19\*, Matrix R-3); SHP, RCV, QUA, ADM, VWR 403 `FORBIDDEN_ROLE`.
Request `{ "reason_code_id": int (category adjust; required when at least one line has a final variance), "note"?: string ≤ 500 }`.
Rules, in order: (1) **Matrix R-4 (widened by UD-2), inside the approve transaction under the count's row lock:** if the caller (id from the session) entered **or recounted any line** of this count (`counted_by` / `recounted_by`) → **403 `APPROVER_SAME_AS_COUNTER`**; if the caller **submitted** the count (`submitted_by`) → **403 `APPROVER_SAME_AS_SUBMITTER`**; audited, nothing changes (T-15, T-26). DB backstops: trigger `cycle_count_approval_guard` and CHECK `cycle_count_approver_not_submitter_chk`. In the seed, counts are entered **and submitted** by `demo.receiver`, so `demo.supervisor` can approve them. (2) Status must be Counted (Open → 409 `INVALID_COUNT_STATE`; **Approved → 409 `ALREADY_APPROVED`**, no second adjustment, guaranteed by the row lock plus the status check). (3) `reason_code_id` required (422) when at least one line has a final variance.
Effects (one transaction, advisory locks on all affected (part, lot)): for each line with `final_qty != system_qty` post one **ADJUST** row for `final_qty - system_qty` at the line's location (`reference_type = 'cycle_count'`, `reference_id` = count id, the given reason code, `txn_at` = real now). Example: system 100, count 96, recount 96, class A → ADJUST of −4, on-hand 96 (AC-5). Then status **Approved**, `approved_by`, `approved_at`, `approved_business_date` (§1.6), audit `CYCLE_COUNT_APPROVE` with the adjustment ids. If any adjustment would drive current on-hand below zero → 409 `ADJUST_WOULD_GO_NEGATIVE`, nothing is posted. Lines of an approved count feed KPI-7 by `approved_business_date`.
Snapshot drift [P]: the adjustment uses the **snapshot** variance as specified (US-044). If current on-hand differs from the snapshot for a line, approval still proceeds and the response carries `warnings: [ { line_id, code: "ON_HAND_CHANGED_SINCE_SNAPSHOT", snapshot_qty, current_qty } ]`. Stock should not move during a count (docs/03 §3.4); there is no freeze mechanism in v1.
Response 200 `{ data: { ...CycleCount (restricted fields now visible; `can_approve` false), adjustments: [ {line_id, txn_id, qty_change} ], warnings: [] } }`. Never a "reject count" path in v1 core.

### E-41 GET /api/v1/lot-trace/{lot_number}
Roles: all (P-03). Lot is upper-cased and validated (`^[A-Z0-9-]{3,30}$`, else 422).
Response 200 (no match is **200 with `found: false`**, never a 404, so the UI can show "no results"):
```json
{ "data": { "lot_number": "L2611-004", "found": true,
  "backward": [ { "receipt_no": "RC-0042", "supplier": {"id","code","name"}, "supplier_po", "part": {"id","part_number","revision"},
                  "qty_received", "inspection_status", "arrived_at" } ],
  "forward":  [ { "shipment_no", "shipment_id", "customer": {"id","code","name"}, "ship_date", "qty_shipped",
                  "carrier": {"id","name"}|null, "tracking_number"|null, "status" } ],
  "movements": [ { "txn_at", "txn_type", "location": {"id","code"}, "qty_change", "reason_code"|null } ],
  "summary": { "received_total", "shipped_total", "scrapped_total", "adjusted_total", "on_hand_total" } } }
```
`movements` lists **all** ledger rows for the lot (receipts, ships, transfers, scrap, adjust) in chronological order (US-045). Receipts with status Rejected appear in `backward` with no ledger row. The same data in flat form is report R7 (§10), including CSV.

---

## 8. Lookups and settings

### E-42 GET /api/v1/lookups/{type}
Roles: all. `type` ∈ `customers | suppliers | carriers | parts | locations | reason-codes | users`. Query: `active=true` (default) | `false` | `all`; `category` (reason-codes only); `q`. Returns the full set (≤ 500), sorted by code/name. Rows:

| type | Fields |
|------|--------|
| customers | `id, code, name, ship_to_city, ship_to_state, active` |
| suppliers | `id, code, name, active` |
| carriers | `id, name, mode, active` |
| parts | `id, part_number, revision, description, unit_of_measure, abc_class, packaging_instruction_ref, requires_coc, active` |
| locations | `id, code, type, active` |
| reason-codes | `id, category, code, label, active` (the seeded `late` list includes material shortage, quality hold, paperwork, carrier, packaging rework, capacity/peak volume, customer change) |
| users | `id, display_name, role` for **active** users only (for owner dropdowns); GET only; no usernames, no hashes; `active` filter is ignored |

Deactivated rows remain visible on existing records and reports; the default dropdown query hides them.

### E-43 POST /api/v1/lookups/{type}
Roles: ADM, SUP (P-20); all others 403. `type` ≠ `users` (user management is P-23, deferred: 404). Request fields per type:
- customers `{ code 1..20 [A-Z0-9-], name 1..100, ship_to_city?, ship_to_state?, active? }`; suppliers `{ code, name }`; carriers `{ name 1..80, mode }`.
- parts `{ part_number, revision, description ≤ 200, unit_of_measure ≤ 10 (default "EA"), abc_class A|B|C **required**, packaging_instruction_ref ≤ 100, requires_coc (default false) }`. *(T-016, D-3: Zod mirrors the DB.)* `part_number` is upper-cased and must match `^[A-Z0-9][A-Z0-9-]{2,29}$`; `revision` is upper-cased and must match `^[A-Z0-9]{1,10}$`; `part_number` **must end with `-` + revision** (e.g. `CRC-2041-B` / `B`; a different revision is a different part row). A violation → 422 `fields.part_number` / `fields.revision`. E-44 re-applies the rule to the merged row.
- locations `{ code 2..20 [A-Z0-9-], type }`; reason-codes `{ category, code 2..30 [A-Z0-9_], label 1..80 }` (exactly one category).
Rules: unique keys → 409 `DUPLICATE` (`fields.part_number`, `fields.code`, …) with an inline-friendly message; new rows are `active = true`. Audit `LOOKUP_CREATE`. Response 201.

### E-44 PATCH /api/v1/lookups/{type}/{id}
Roles: ADM, SUP (P-20). Any subset of the creatable fields plus `active` (deactivate or reactivate; nothing is ever deleted). **Identity fields** (`code`, `part_number`, `revision`, `location.type`, `reason-code.category`) can change only while the row is **unreferenced** (no shipment line, receipt, ledger row, error or count points to it), else 409 `LOOKUP_IN_USE`. Duplicate → 409 `DUPLICATE`. Deactivating a row never alters existing records; any new-record endpoint using it returns 422 `INACTIVE_REFERENCE`. Audit `LOOKUP_UPDATE` old→new. Responses 200 | 403 | 404 | 409 | 422.

### Settings (key/value `setting` table)
| Key | Default | Range / type | Used by |
|-----|---------|-------------|---------|
| `target_on_time_pct` | 95 | number 0..100 | KPI-1 |
| `target_otif_pct` | 93 | 0..100 | KPI-2 |
| `target_pkg_error_rate_pct` | 2 | 0..100 (target is "below") | KPI-3 |
| `target_fpy_pct` | 98 | 0..100 | KPI-4 |
| `target_rework_freq_pct` | 2 | 0..100 ("below") | KPI-5 |
| `target_cycle_time_h` | 24 | number 0.01..720 (DB range, *T-016*) | KPI-6 |
| `target_inventory_accuracy_pct` | 97 | 0..100 | KPI-7 |
| `target_dock_to_stock_h` | 8 | 0.01..720 | stored for v1.1 (KPI-8 not shown) |
| `tolerance_a_pct`, `tolerance_b_pct`, `tolerance_c_pct` | 0, 2, 5 | 0..100 | cycle counts, KPI-7 |
| `on_time_tolerance_days` | 0 | integer 0..30 | KPI-1/2 and on-time flags only; **not** the late-reason rule (UD-1) |
| `on_time_basis` | promise | `promise` \| `requested` (the KPI-1 toggle default) | KPI-1/2 |
| `reporting_mode` | fixed | `fixed` \| `live` | business clock |
| `reporting_date` | 2026-11-25 | date 2000-01-01..2100-12-31 | business clock |

### E-45 GET /api/v1/settings
Roles: all (P-02; tiles need targets and the date label). Response 200:
`{ "data": { "targets": { "on_time_pct": 95, … }, "tolerances": { "a_pct": 0, "b_pct": 2, "c_pct": 5, "on_time_days": 0 }, "on_time_basis": "promise", "reporting": { "mode", "reporting_date", "business_today", "label" } } }`. `label` is "Reporting date: 25 Nov 2026 (fixed demo date)" in fixed mode, "Live date: <date>" otherwise.

### E-46 PATCH /api/v1/settings/targets
Roles: ADM, SUP (P-21); others 403. Request: any subset of `{ "target_*": number, "tolerance_*_pct": number, "on_time_tolerance_days": int, "on_time_basis": enum }` (keys exactly as in the table; unknown keys 422). Out-of-range or non-numeric → 422 with the field message; the old value stays. Effects: audit `SETTINGS_TARGETS_UPDATE` old→new per key; the next dashboard load uses the new target. Response 200 (full settings).

### E-47 PATCH /api/v1/settings/reporting
Roles: **ADM only** (P-22; SUP and all others 403, Matrix R-9). Request `{ "mode": "fixed"|"live", "reporting_date"?: date }` (required when `mode = fixed`; an invalid or impossible date → 422 `fields.reporting_date`; kept but ignored when live). Effects: audit `SETTINGS_REPORTING_UPDATE`; label changes accordingly. Response 200 (full settings).

---

## 9. KPIs and charts

All KPI maths lives in **`src/lib/kpi/`** (one module, `kpi-definitions`, `docs/05`). The endpoints below only parse parameters, call the module and shape the response. Cancelled shipments are excluded; division by zero returns `null`, never 0 or 100. Formulas, period anchors and edge cases are not restated here; any mismatch between this file and `docs/05` is resolved in favour of `docs/05` (Kenji owns shapes, marked **[Kenji to confirm]**).

### E-48 GET /api/v1/kpis
Roles: all (P-02). Query: `from`, `to` (dates, inclusive; both or neither), `basis` (`promise|requested`, default setting `on_time_basis`).
Default period (Q-23): **30 days inclusive ending on `business_today`**, i.e. `to = business_today`, `from = to - 29 days` (2026-10-27 to 2026-11-25 at the seeded date). The **previous period** is the equal-length period immediately before `from` (2026-09-27 to 2026-10-26). Validation: `from <= to`, span ≤ 366 days (422).
Response 200 (full example in kpi-spec §11.1):
```json
{ "data": { "period": {"from","to","days"}, "previous_period": {"from","to","days"}, "basis": "promise", "tolerance_days": 0,
  "reporting": { "mode","reporting_date","label" },
  "kpis": [ { "kpi_id": 1, "key": "on_time_pct", "name": "On-Time Shipment %", "unit": "%", "tile": true,
              "value": 96.66666, "value_1dp": 96.7, "previous_value": 94.2, "previous_value_1dp": 94.2, "delta": 2.46, "trend": "Up",
              "good_direction": "up", "change_assessment": "Better", "note": null,
              "target": 95, "target_comparison": ">=", "meets_target": true,
              "numerator": 29, "denominator": 30, "extra": {}, "definition": "Shipments with ship date on or before the promise date divided by shipments shipped, x 100." } ] } }
```
`kpis` order and keys: `on_time_pct` (1), `otif_pct` (2), `pkg_error_rate_pct` (3; `extra`: `errors_per_100_shipments`, `errors`, `shipments_with_error`, `internal_catches`, `customer_escapes`, `excluded_errors`), `fpy_pct` (4; `extra`: `first_attempt_failed`, `passed_but_errored`, `escape_failures`), `cycle_time_median_h` (6; `extra`: `p90_h`, `p90_h_1dp`, `shipments_measured`, `within_target_pct`), `inventory_accuracy_pct` (7; `extra`: `after_recount_pct`, `absolute_variance_units`, `lines_counted`, `by_class`), `rework_frequency_pct` (5; `tile: false`, `extra`: `rework_events`, `total_rework_minutes`, `avg_rework_minutes`; shown in the error/rework report).
*(CE-1)* Each KPI also carries `previous_value_1dp`, `good_direction` (`up` | `down`), `change_assessment` (`Better` | `Worse` | `Same` | null) and `note` (null except KPI-6, the real-clock limitation of §1.6). The top level carries `tolerance_days` and `previous_period.days`. `meets_target` compares the **1-dp value** with the target; KPI-3 uses a strict `<`, KPI-5 `<`, KPI-6 `<=`, the others `>=` (kpi-spec G-6).
*(CE-2, UD-7/8/9)* KPI-3 population = **Shipped shipments by actual `ship_date`** (UD-8; the former "verified or shipped" wording is withdrawn); errors attach to their shipment whatever the detection date. KPI-3, KPI-4 and C3 count only **countable errors** (Before ship, or After ship with `packaging_related = true`, UD-9). KPI-4 is anchored on the first verification's business date and fails a shipment that later gets a countable error. KPI-7 `value` is **first-count** accuracy (UD-7); after recount is `extra.after_recount_pct`. Formulas: [kpi-spec](../kpi/kpi-spec.md) §4 to §9. `value` is full precision, `null` for "No data" (with `trend`, `delta`, `meets_target` also `null`); `trend` ∈ Up, Down, Flat (delta rounds to 0.0 at one decimal) or `null`; `target_comparison` ∈ `>=`, `<`, `<=` per docs/05 §5.3. Same inputs always give the same value as every chart and report (US-046). **[Kenji to confirm]**.

### E-49 GET /api/v1/kpis/charts/{chart}
Roles: all (P-02). `chart` ∈ `C1 | C2 | C3` (C4–C6 deferred). Query `from`, `to` as E-48 (default 30 days ending at `business_today`; the dashboard may pass the full 6 months); C1 also takes `basis` as in E-48, so the chart follows the dashboard toggle (*T-016*); C2 also `granularity=day|week` (default `day`; the UI switches to `week` when daily groups hold fewer than 5 shipments, US-057). Each response also carries a `table` (the same rows) for the accessible data-table alternative.
- **C1** On-time % by ISO week: `{ "series": [ { "week": "2026-W47", "week_start", "week_end", "partial", "range_from", "range_to", "value": 96.7|null, "numerator", "denominator" } ], "target": 95, "overall", "previous_overall", "summary", "table" }`; weeks with no shipments are `value: null` (gap, never 0). *(CE-3)* `partial`/`range_*` mark weeks clipped by the period; `overall` equals the KPI-1 tile.
- **C2** Shipments per day vs error rate: `{ "granularity", "suggested_granularity", "series": [ { "date"|"week", "shipments_shipped", "shipments_with_error", "packaging_error_rate_pct": 6.1|null } ], "summary_totals", "summary", "table" }`. *(CE-3)* Week points also carry `week_start`, `week_end`, `partial`, `range_from`, `range_to`; the sums equal the KPI-3 tile (ship-date basis, UD-8).
- **C3** Packaging errors by category (Pareto): `{ "series": [ { "category", "count", "pct", "cumulative_pct", "previous_count" } ], "total": 10, "previous_total", "summary", "table" }` sorted by count descending (ties by category ascending), zero-count categories omitted, the last `cumulative_pct` is 100. *(CE-3)* Population: countable errors (UD-9) by `detected_at` date in the period.
Shapes **[Kenji to confirm]**; 200 | 422.

---

## 10. Reports and CSV

### E-50 GET /api/v1/reports/{id}
Roles: all (P-03; US-065: every signed-in role can export what it can view). `id` ∈ `R1 | R3 | R4 | R7` (R2, R5, R6, R8 deferred → 404). Without `format` the response is JSON; `format=csv` is §1.10.
JSON response: `{ "data": [rows], "columns": [ {"key","label","type"} ], "totals": {…}|null, "report": {"id","name"}, "period": {"from","to"}|null, "generated_at", "page", "page_size", "total" }`. Row order is **fixed** per report (so screen and CSV are identical); `sort` is not accepted. Rows are plain flat objects keyed by `columns[].key`.

| Report | Filters (all optional unless noted) | Columns | Fixed order | Totals |
|--------|-------------------------------------|---------|-------------|--------|
| **R1 Shipment Log** | `from`, `to` (on `ship_date`, default period = E-48), `customer_id`, `carrier_id`, `status`, `include_cancelled` (default false), `late_only` | shipment_no, customer, customer_po, promise_date, ship_date, carrier, tracking_number, status, on_time ("On time" / "Late" / empty), days_late | `ship_date` desc, `shipment_no` | `{ row_count }` (equals the count of the matching shipment list) |
| **R3 Packaging Error and Rework Log** | `from`, `to` (date of `detected_at`), `category`, `severity`, `detected_stage`, `status` | error_no, shipment_no, category, severity, detected_stage, packaging_related *(CE-4)*, root_cause_category, rework_minutes, corrective_action_status | `detected_at` desc, `error_no` | `{ error_count, total_rework_minutes }` equal to the row sums; "None" is shown (JSON null, CSV text `None`) when there is no rework or no corrective action |
| **R4 Inventory On-Hand** | `part_id`, `location_id`, `lot_number`, `include_zero` (default false) | part_number, revision, description, abc_class, location, location_type, lot_number, qty_on_hand | `part_number`, `location`, `lot_number` | `{ row_count }` |
| **R7 Lot Trace** | `lot_number` **required** | section (`RECEIPT` / `MOVEMENT` / `SHIPMENT`), date, document (receipt_no or shipment_no), party (supplier or customer), part_number, location, txn_type, qty, carrier, tracking_number | chronological | `{ received_total, shipped_total, on_hand_total }` |

`on_time` and `days_late` come from the KPI module helper (same tolerance and basis as KPI-1). *(CE-5)* `src/lib/kpi/` exports `isOnTime(shipDate, basisDate, toleranceDays)` and `daysLate(shipDate, basisDate)`; ShipmentSummary `on_time_indicator`/`days_late` and R1 use them, nothing else re-implements them. A lot with no records returns an empty `data` (CSV: header only). Errors: 404 unknown report id | 422 bad filter, `from > to`, `EXPORT_TOO_LARGE`.

---

## 11. Admin

### E-51 GET /api/v1/admin/audit-log
Roles: **ADM only** (P-24; everyone else 403, T-11). Filters `user_id`, `action`, `table_name`, `record_id`, `from`/`to` (UTC date of `at`). `record_id` is stored as the record's integer id in text form. The filter also accepts a business key (`SH-1042`, `PE-0007`, `RC-0001`, `CC-0003`, as in §1.1), which the server resolves to (`table_name`, id) *(T-016)*. Fixed order newest first. Row: `{ id, at, user {id, username, display_name}|null, action, table_name, record_id, changes }` (`changes` as stored: `{field: [old, new]}`, plus the denial fields for `ACCESS_DENIED`). No endpoint edits or deletes audit rows. Response: paged list.

### E-52 POST /api/v1/admin/demo-reset
Roles: **ADM only** (P-25, Matrix R-9). Needs the CSRF token and the JSON content type like every write.
Request `{ "confirm": "RESET DEMO DATA" }` (exact string, else 422 `fields.confirm`).
Order of checks (Matrix R-9, T-20, S-28): session (401) → **`DEMO_RESET_ENABLED === "true"`, else 404 `FEATURE_DISABLED` for every signed-in role** (the feature is absent by default on previews and production) → CSRF / content type (403 / 415) → role (non-Admin 403 `FORBIDDEN_ROLE`, audited) → body and `confirm` (400 / 422) → **cooldown: at most one accepted reset per 10 minutes, `last_demo_reset_at` recorded in the DB (a settings row written after the reseed, so the truncate does not erase it) → 429 `RESET_COOLDOWN` with `Retry-After`** → lock (409).
Effects: (1) write `DEMO_RESET` audit entry in its own committed transaction **before** anything is cleared; (2) take `pg_advisory_lock` (a second concurrent reset → 409 `RESET_IN_PROGRESS`); (3) one transaction: `TRUNCATE … RESTART IDENTITY CASCADE` on the business tables (append-only triggers permit TRUNCATE), run the deterministic seed generator (`src/lib/seed/`, same code as `npm run db:reset-seed`), restore default settings (fixed mode, 2026-11-25), re-insert a `DEMO_RESET` audit row naming the actor and time. **`audit_log` is truncated with the business tables** *(confirmed T-016, D-5)*: the reset wipes visitor free text inside `changes` (security plan PD-9), and old `record_id`s cannot collide with the re-numbered records. The step-(1) row survives only when the reset rolls back, so it records failed attempts. Test S-29 checks that the re-inserted row exists; (4) **all sessions are ended**, including the caller's, so the response clears the cookie and the Admin signs in again. The seed rebuilds the demo users with their configured passwords (the deployed `demo.admin` password comes from the secret `DEMO_ADMIN_PASSWORD`, inactive if unset; seed concern, security plan §11) and the login-attempt counters. Must finish within the 60 s function limit (ADR-001 R4).
Responses: 200 `{ "data": { "reset": true, "duration_ms": 640, "counts": { "shipments": 300, … } } }` | 403 | 404 `FEATURE_DISABLED` | 409 | 422 | 429 `RESET_COOLDOWN`.

---

## 12. Traceability

### 12.1 Endpoints to stories (V1-CORE) and scope §3 items
| Story | Endpoints | Notes |
|-------|-----------|-------|
| US-001 (+US-002) Login, logout, hashed passwords | E-02, E-03, E-04 | scrypt, no default credentials, generic failure; bootstrap of the first Admin in non-demo mode is a script, not an endpoint |
| US-003 Role enforcement, 403 | all writes; E-51, E-52 | §1.3 order, §13 permission tests |
| US-005 (+US-006) Audit log and Admin view | audit on every write (§1.8); E-51 | |
| US-007 Lookups | E-42, E-43, E-44 | P-20 |
| US-008 Targets, tolerances, reporting date | E-45, E-46, E-47; E-48 default period | P-21, P-22 |
| US-011 Reset | E-52 | `npm run db:reset-seed` shares the generator |
| US-014 (+US-015, US-023) Create/edit shipment, doc flags | E-06, E-08 | |
| US-016 (+US-017) Status lifecycle, hold, release, cancel | E-09, E-13, E-14, E-15 (+ E-10..E-12, E-16) | history in ShipmentDetail |
| US-019 Pack and verify | E-10, E-11 | |
| US-020 Verifier ≠ packer | E-11, E-16 | `VERIFIER_SAME_AS_PACKER` |
| US-021 (+US-022) Ship, late reason | E-12 | |
| US-024 (+US-018) List, filters, detail | E-05, E-07 | |
| US-027 (+US-033) Log error incl. customer-found | E-18, E-17, E-19 | R-8 |
| US-029 Rework | E-24, E-25, E-23 | |
| US-030 Ship gate | E-11, E-12, E-16, E-18, E-24 | §1.7 |
| US-032 (+US-031, US-034) Root cause, corrective action, close-out | E-20, E-21, E-22, E-26, E-27, E-28, E-17 | |
| US-035 (+US-039) Receive, transfer, scrap, production | E-30, E-34, E-29, E-31 | R-7 |
| US-037 (+US-038) Ledger and on-hand | E-32, E-33, ledger rules §7 | |
| US-041 Shipping consumes inventory | E-12 | |
| US-043 (+US-042) Create, blind count | E-36, E-37, E-35, E-38, E-39 | |
| US-044 Approve, adjust | E-40 | R-3, R-4 |
| US-045 Lot trace | E-41, E-50 (R7) | |
| US-046..US-053 KPI module | E-48 | one module |
| US-054 Tiles, date range, reporting-date label | E-48, E-45 | |
| US-056, US-057, US-058 Charts C1, C2, C3 | E-49 | |
| US-065 (+US-066, US-068, US-069) Reports, CSV | E-50 | |
| US-086 Supervisor correction of a Shipped/Cancelled shipment *(UD-3)* | E-53, E-08 (409 `SHIPMENT_LOCKED`), E-07 (`corrections[]`) | P-28, R-14 |
| US-074 (+US-073) Request security | §1.3, §1.4 | |
| US-075 Generic errors | §1.4 | |
| US-079 KPI tests | E-48 inputs (fixtures) | tested at module level |
| US-080 Route and permission tests | §13 | |
| US-081, US-083 Deployed demo, skeleton | E-52, E-04 (banner data) | banner itself is UI |
| US-012, US-013 Seed | none (seed uses the same domain functions or must satisfy the same invariants) | |

Scope §3 items: 3.1 → E-05..E-16 · 3.2 → E-17..E-28 · 3.3 → E-29..E-41 · 3.4 → E-45..E-50 · 3.5 → §1.2, §1.3, §1.8, E-02..E-04, E-51 · 3.6/3.7 → E-52.

### 12.2 Scope §5 acceptance criteria to endpoints
| AC | Criterion | Endpoints that deliver it |
|----|-----------|---------------------------|
| 1 | Create, pack (A), verify (B), error, rework, ship; KPIs change | E-06, E-09, E-10, E-11, E-18, E-24, E-25, E-16, E-11, E-12, E-48 (tiles reflect new records through the `business_date` rule, §1.6) |
| 2 | Failed verification cannot reach Shipped without error, rework, re-verification; direct requests 409 | E-11 (fail path), E-18, E-24/E-25, E-16 (gate), E-12 (409 `INVALID_TRANSITION` / `REWORK_GATE_NOT_MET`) |
| 3 | Verifier ≠ packer, server-enforced; Shipping/Quality/Supervisor may verify | E-10, E-11 (403 `VERIFIER_SAME_AS_PACKER`), E-16 |
| 4 | Receipt creates inventory; shipment consumes it; per-lot on-hand; lot trace | E-30, E-12, E-32, E-41, E-50 (R4, R7) |
| 5 | Count variance → approved ADJUST → accuracy % | E-36, E-38, E-39, E-40, E-48 (KPI-7) |
| 6 | KPI-1..7 unit tests | module-level; E-48 supplies the same functions |
| 7 | Non-permitted 403, unauthenticated 401 | §1.3, §13 |
| 8 | Reset command and Admin reset | E-52 |
| 9 | Usable layouts, text status | data supplied as text fields (`status`, `on_time_indicator`, `trend`, `meets_target`); tables in E-49 |
| 10 | Persistence on Netlify, previews isolated | all state in Postgres; no in-memory state anywhere (sessions, rate limits, locks) |
| 11 | Fixed reporting date labelled, non-empty KPIs | E-45, E-47, E-48 (`reporting.label`) |

---

## 13. Permission and security test checklist (US-080, S-01 to S-31, matrix T-1 to T-22)
Regenerated 2026-11-26 from `docs/plan/permissions-matrix.md` (REVIEWED) §2, §3, §5. For every row the test asserts the status code, that **nothing changed** (row counts, ledger sums, status), and that an `ACCESS_DENIED` audit row exists for signed-in 403s. For every write route also run (S-07, S-08, T-14, T-17): no token → 403 `CSRF_INVALID`; forged `Origin` + JSON → 403; `text/plain`, missing type and form types → 415; body with an actor field → 400 `UNKNOWN_FIELD` (T-16); GET of the URL → 405 (T-21); no session → 401 (T-12). The Viewer calls **every** write endpoint and gets 403 (T-10). S-01 compares the `permissions.ts` map with the table below.

| Action (matrix) | Endpoints | Allowed | Must get 403 | Matrix scenarios |
|-----------------|-----------|---------|--------------|------------------|
| P-01 | E-02, E-03, E-04 | all roles | n/a (login: wrong password, unknown user and deactivated user are identical 401; 6th failure in 15 min → 429) | T-12 |
| P-02, P-03 | all GET endpoints except E-51 | all six roles | none (401 when anonymous) | T-12 |
| P-04 | E-06, E-08 | SUP, SHP | ADM, RCV, QUA, VWR | T-6, T-10 |
| P-05, P-06 | E-09, E-10 (incl. re-pack after reopen) | SUP, SHP | ADM, RCV, QUA, VWR | T-6, T-10 |
| P-26 *(UD-4, R-15)* | E-16 | SUP, QUA | SHP, RCV, ADM, VWR | T-23 |
| P-28 *(UD-3, R-14)* | E-53 (E-08 on Shipped/Cancelled → 409 `SHIPMENT_LOCKED` for all) | SUP | SHP, RCV, QUA, ADM, VWR | T-25 |
| P-07 + R-1 | E-11 | SUP, SHP, QUA, **not the current packer** | ADM, RCV, VWR (`FORBIDDEN_ROLE`); the packer in any role (`VERIFIER_SAME_AS_PACKER`, no verification row, concurrent verify cannot self-verify) | T-1 to T-5, T-16 |
| P-08 | E-12 | SUP, SHP | ADM, RCV, QUA, VWR | T-6, T-8 |
| P-09 | E-13 | SUP, SHP, QUA | ADM, RCV, VWR | T-6 |
| P-10 (R-6) | E-14 | SUP, QUA | SHP, RCV, ADM, VWR | T-22 |
| P-11 + R-5 | E-15 | SUP (any pre-ship status); SHP only Planned / Ready to Pack | SHP at any other status (`FORBIDDEN_CANCEL_AT_STATUS`), QUA, RCV, ADM, VWR | T-9 |
| P-12 + R-8 | E-18 | SUP, QUA (both stages); SHP Before ship on an unshipped shipment | SHP with stage After ship or a Shipped shipment (`FORBIDDEN_AFTER_SHIP_ERROR`), ADM, RCV, VWR | T-6, T-18 |
| P-13 | E-24, E-25 | SUP, SHP, QUA | ADM, RCV, VWR | T-6 |
| P-14 | E-20, E-22, E-27, E-28 | SUP, QUA | SHP, RCV, ADM, VWR | |
| P-27 *(UD-4, R-15)* | E-21 | SUP, QUA | SHP, RCV, ADM, VWR | T-24 |
| P-15 | E-30 | SUP, RCV | SHP, QUA, ADM, VWR | T-6 |
| P-16 + R-7 | E-34 | SUP all; RCV for non-Hold sources; QUA only transfers into/out of Hold and scrap at Hold | RCV transfer or scrap from Hold (`FORBIDDEN_HOLD_RELEASE`); QUA anything else (`FORBIDDEN_NON_HOLD_TXN`); SHP, ADM, VWR | T-13, T-19 |
| P-17 | E-36 | SUP | SHP, RCV, QUA, ADM, VWR | |
| P-18 | E-38, E-39 | SUP, RCV | SHP, QUA, ADM, VWR | |
| P-19 + R-3, R-4 | E-40 | SUP who entered or recounted no line and did not submit | RCV, SHP, QUA, ADM, VWR (`FORBIDDEN_ROLE`); the SUP who entered or recounted any line (`APPROVER_SAME_AS_COUNTER`) or submitted it (`APPROVER_SAME_AS_SUBMITTER`, UD-2) | T-7, T-8, T-15, T-26 |
| P-20 | E-43, E-44 | ADM, SUP | SHP, RCV, QUA, VWR | T-7 |
| P-21 | E-46 | ADM, SUP | SHP, RCV, QUA, VWR | T-7 |
| P-22 | E-47 | ADM | SUP and all others | T-11 |
| P-23 | (no endpoint in core) | ADM (v1.1) | every `/users` request is 404 now | T-11 |
| P-24 | E-51 | ADM | all others | T-11 |
| P-25 + R-9 | E-52 | ADM | non-Admin 403 with the flag on; **flag off → 404 for every signed-in role**; a second accepted reset within 10 min → 429; reset ends all sessions; audit row exists after the reseed | T-11, T-20 |

Fixture checks owned by the domain tests: AC-5 count (100 / 96, class A, recount 96 → ADJUST −4, on-hand 96); transfer fixture (receipt 100, ship 30, transfer 20 out, scrap 5 → source 45, destination 20); ship fixture (receipt 100 of `L2611-004`, ship 40 → 60; ship 70 more → 409 `INSUFFICIENT_STOCK` with `available`); R1 row count equals the list count for the same filters; CSV guard (`=1+1`, `+x`, `-2+3`, `@SUM(A1)`, tab+`=1` prefixed with `'`; numeric −5 stays −5; `Content-Type: text/csv`); forced DB error → generic 500 with `request_id`, no stack text and no partial ledger/audit rows (S-22); audit and logs contain no password, token, IP or URL (S-24).

---

## 14. Decisions, answers and open items

### 14.1 Schema requests for Dana (docs/08 names kept; the §2 enumerations are stable and unchanged by this revision)
1. New table **`shipment_verification`**: `id, shipment_id, attempt_no, result (Pass|Fail), verified_by, packer_id, verified_at, business_date, checklist jsonb, failed_items text[], note` (unique `shipment_id, attempt_no`). Needed by US-019/US-020/FPY; not in docs/08.
2. `shipment`: add `rework_origin` (enum, nullable), `held_from_status`, `hold_owner_dept`, `verified_at`. `shipment_line`: add `short_note`. (`packed_by`, `verified_by`, `hold_reason_id`, `late_reason_id` exist.)
3. `shipment_status_history`: add `business_date date not null`. `rework_event`: add `completed_business_date`; `reverified_ok` is server-managed. `cycle_count`: add `scope_abc_class`, `scope_location_id`, `submitted_at`, `approved_business_date`. `cycle_count_line`: add `counted_by`, `counted_at`, `recounted_by`, `recounted_at`, `adjustment_txn_id` (R-4 needs both counter columns).
4. `inventory_transaction`: add `transfer_group` (uuid or bigint) to link the two TRANSFER legs; `lot_number` stored upper-case; append-only triggers on it, `shipment_status_history` and `audit_log` (ADR-001 §5).
5. `reason_code`: add `active`. `setting`: keys listed in §8 plus `last_demo_reset_at`. `audit_log`: no hard FK to `user` that would block the demo reset; **no IP column**.
6. `session` table: SHA-256 of token, `user_id`, `csrf_token`, `created_at`, `last_seen_at`, `expires_at` (no anonymous rows now that E-01 is withdrawn). `login_attempts` (key hash, window start, count) for the DB-backed rate limit; client key = salted SHA-256 of the IP, salt stored in settings (security plan §3.3).
7. Sequences for `SH-`, `PE-`, `RC-`, `CC-` numbers (start above the seed maxima); `minutes` on `rework_event` either generated or computed in the repo.

### 14.2 Open items (owner)
| ID | Item | Owner |
|----|------|-------|
| Q-A | **Closed (T-016, D-1):** Option A. Real timestamps, `business_date` columns, user-entered business instants and a generated `completed_business_date` (§1.6). | — |
| Q-B | **Closed (UD-4):** reopen = P-26, contain = P-27, both QUA and SUP. | — |
| Q-D | KPI-7 hit-rate: tolerance is evaluated on the **first** count; the recount only affects the adjustment quantity. Confirm against docs/03 §3.3. | Kenji |
| Q-G | **Closed (UD-3):** no direct edits after Shipped/Cancelled, notes included; Supervisor correction E-53 (P-28). | — |
| Q-H | Resolved by R-5: Shipping cancelling from On Hold (or any status after Ready to Pack) is 403. Priya to align the US-017 text. | Priya |
| Q-I | Formats: **closed for the technical part (T-016, D-3, D-12)**. Zod mirrors the DB regexes (tracking `^[A-Za-z0-9-]{1,40}$`, lot `^[A-Z0-9][A-Z0-9-]{2,29}$`, part number and revision with the suffix rule), plus the lot registry. **Still for Priya:** the hold owner departments, refusing over-shipping, and SHIP locations limited to Stock/FG/Shipping (product rules; the current values stand until she changes them). | Priya |
| Q-J | Edit-after-verify trigger fields (E-08: customer, PO, line part/qty/lot/location). | Priya |
| Q-K | **Closed (T-016, D-11):** the gate uses `rework_episode` (§1.7). | — |
| Q-L | Snapshot drift on approval is a warning, not a block; no count freeze in v1. | Priya, Marcus |
| Q-N | `GET /lookups/users` exposes display names and roles of active users to every role (owner dropdown). | Sasha |
| Q-P | KPI and chart response shapes (§9). | Kenji |
| Q-Q | Optional abuse controls (write cap 429, demo read-only 503; security plan PD-5/PD-7 "Should") are specified but not in V1-CORE unless Olivia adds them. | Olivia, Sasha |
| Q-R | **Closed (T-016, D-9):** §1.3 is the authoritative order. Identity and role-by-state rules (403) come before the 409 checks; the security plan's "follow-up read decides 403 vs 409" is an implementation of the same order. | — |
| Q-S | **Closed (ADR-003 O-3, Proposed):** no pre-session token; Origin/`Sec-Fetch-Site` + content type + SameSite. | — |

**Resolved by the reviewed matrix and security plan:** Q-C (no pre-login token, E-01 withdrawn), Q-E (R-4 accepted, `APPROVER_SAME_AS_COUNTER`), Q-F (R-7 extended to scrap; Quality limited to Hold moves), Q-M (reset audit row re-inserted after the reseed, security plan §9), Q-O (*superseded by T-016, D-8*: pages use plain urlencoded HTML form posts with a hidden `_csrf` field; JSON stays the API surface; both share the service layer, §1.12).

### 14.3 Answers to the UI spec questions addressed to the back end (docs/design/ui-spec.md §14)
| # | Answer |
|---|--------|
| 14.1 | All timestamps are UTC ISO strings; the UI formats them in UTC and appends "UTC" (Q-20 default). The "now" defaults for arrival, rework started and completed, and detected use `business_now`; the ship date and other date defaults use `business_today` (§1.6, decided T-016). Status history, verification, ledger, count and audit times are real UTC, so in fixed mode their date can differ from the business date shown next to them. `GET /me` and `GET /settings` return `business_today`. Default values come from the server, never the browser clock. |
| 14.2 | Confirmed: default period = 30 days inclusive ending on `business_today`: 2026-10-27 to 2026-11-25; previous period 2026-09-27 to 2026-10-26 (30 days each). Returned by E-48 as `period` and `previous_period`. |
| 14.3 | Confirmed (§7.1, E-37/E-38): system quantity, variance and tolerance result are **absent from the response body** for every role while the count is Open; present for SUP and ADM when Counted; present for all roles once Approved. Counters get only `recount_required`. |
| 14.4 | **R-4 is adopted** (matrix R-4, T-15). E-40 returns 403 `APPROVER_SAME_AS_COUNTER`; E-37 returns `can_approve` and `caller_entered_lines` so S19 can show the Unavailable state. |
| 14.5 | `reverified_ok` is **server-managed** (set true on the episode's completed rework events when a passing verification follows); the user does not type it. "Start packing again" is `reopen` (E-16) and **is gated** on a logged Before-ship error and a completed rework event (G1/G2, §1.7). In addition `verify` or `ship` attempted while the shipment is in Rework returns 409 `REWORK_GATE_NOT_MET` naming what is missing, so US-030 holds on every path. Rework entered by editing a Verified shipment (`EDITED_AFTER_VERIFY`) needs no error or rework. |
| 14.6 | Hold owning department is `hold_owner_dept` ∈ Shipping, Quality, Receiving, Production, Planning, Customer, required with `hold_reason_id` (E-13); stored on the shipment and in the history note (schema request 14.1 #2). |
| 14.7 | Corrective action **owner and due date are required** (E-27); the owner must be an active user (`GET /lookups/users`). |
| 14.8 | The server enforces only `^[A-Z0-9][A-Z0-9-]{2,29}$` for lot numbers (upper-cased on write) and `^[A-Za-z0-9-]{1,40}$` for tracking numbers (max 40). `L<yy><ww>-<nnn>` is a UI placeholder and seed convention, not a server rule. |
| 14.9 | F8 for Quality: TRANSFER into or out of a Hold-type location and SCRAP at a Hold location only (matrix R-7). Receiving may transfer, scrap and record production complete for stock not in a Hold location; moving or scrapping **from** a Hold location is 403 `FORBIDDEN_HOLD_RELEASE`; transferring **into** Hold is allowed. PRODUCTION_COMPLETE is Receiving and Supervisor only. |
| 14.10 | Not an API matter: per matrix §4 and security plan PD-2, the six non-Admin demo passwords are published; the deployed `demo.admin` password is not; Viewer is kept. |
| 14.11 | Tile and chart shapes: E-48 and E-49 (§9): per KPI `value`, `value_1dp`, `previous_value`, `delta`, `trend` (Up/Down/Flat/null), `target`, `target_comparison`, `meets_target`, `numerator`, `denominator`, `extra`, plus a plain-text `definition` (docs/05 wording, rendered escaped, never as HTML). The UI never computes a KPI. Kenji confirms. |
| 14.12, 14.13 | Presentation and copy decisions; no API impact. |
| 14.14 | Each shipment line returns `part.packaging_instruction_ref` and `part.revision` (a part row has one revision; a different revision is a different part). |
| 14.15 | Confirmed: the **current packer** is `shipment.packed_by`, the user of the most recent `start-packing` (including the re-pack after a reopen; *UD-4*: reopen itself, by Quality or Supervisor, clears the packer), for every role including Supervisor and Quality (T-4, T-5). The refusal is 403 `VERIFIER_SAME_AS_PACKER`; `packed_by` is in the payload and `allowed_actions` omits `verify` for that caller. |
| 14.16 | Ship date defaults to `business_today`; a ship date **after `business_today` is rejected** (422 `fields.ship_date`) and one **before the order date is rejected** (422). *(UD-1)* A late reason is required when `ship_date > promise_date`, **regardless of** `on_time_tolerance_days` (tolerance affects KPI-1/2 only). |
| 14.17 | Chart click-through uses ordinary list filters that exist: `GET /shipments?status=Shipped&date_field=ship_date&from=&to=` (C1 week, C2 day) and `GET /packaging-errors?category=&from=&to=` (C3). Links under each chart suffice on the API side. |
| 14.18 | List parameters are exactly `page` (1-based), `page_size` (default 25, max 100), `sort` (field, `-` prefix for descending, allow-listed per endpoint) and the named filters of each endpoint (§1.5). Responses return `page`, `page_size`, `total`. Unknown parameters are 422, so the UI must not add extras. Filter state across redirects is a UI matter; the API is stateless. |

### 14.4 Reserved: user management (P-23, v1.1; no endpoint in core)
When built it follows Matrix R-11: one role per user; an Admin cannot change their own role or deactivate themselves; the last active Admin cannot be deactivated; a role change or deactivation deletes the user's sessions immediately; audit entries never contain passwords. All other roles get 403.

### 14.5 Change control
Change this file first, then the code, in the same PR (api-contract skill). Matrix renumbering touches only the P-nn and R-n references; §3 and §13 are regenerated from the matrix.
