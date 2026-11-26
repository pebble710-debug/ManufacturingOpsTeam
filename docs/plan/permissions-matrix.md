# Permissions Matrix (v1 core)

**REVIEWED — product-manager (Priya) + security-reviewer (Sasha), 2026-11-25**
**Tasks:** T-004 (draft, Priya) · T-015 (security review, Sasha) · **Date:** 2026-11-25
**Updated 2026-11-26 (T-021, Priya):** user decisions UD-2, UD-3, UD-4 applied (rows P-26 to P-29, rules R-4, R-14, R-15; tests T-23 to T-28). UD-1, UD-5, UD-6 are business rules, see backlog.md section 1.1.
**Sources:** user decisions 5 and 7 (2026-11-25), [project-scope.md](../project-scope.md) §2, §3.5, §5, [07-software-design.md](../07-software-design.md) §7.2, [04](../04-shipping-workflows-coordination.md) §4.2, [ADR-001](../ADR-001.md) §8, [PoC report](../poc/poc-report.md) R-1.
**Companion docs:** [security/security-plan.md](../security/security-plan.md) (controls and tests), [security/threat-model.md](../security/threat-model.md).
All users, names and data are **fictional**.

## 1. How to read this

- **Y** = allowed. Blank = not allowed: the server returns **HTTP 403** (signed in) or **401/redirect** (not signed in). A 403 for a signed-in user also writes an access-denied audit entry.
- **Y\*** = allowed with a special rule (section 3).
- **Deny by default:** any action not listed here is refused for every role, including any new route that has no permission entry yet.
- Enforcement is **server-side in every handler**. Hiding a button is never the protection. Direct requests (bypassing the UI) are tested (US-080).
- **One role per user.** A user has exactly one role in v1; permissions are never combined (R-11).
- **Response codes, checked in this order** [P; Diego/Marcus confirm in the API contract]:
  1. not signed in → **401** (API) or redirect to `/login` (pages);
  2. missing/wrong CSRF token → **403** (`CSRF_INVALID`); wrong or missing `Content-Type` → **415**;
  3. role not allowed for the action → **403** (`FORBIDDEN_ROLE`);
  4. invalid input → **400/422** (Zod field errors);
  5. identity rule refused (verifier = packer, approver = counter, approver = submitter) → **403** (`VERIFIER_SAME_AS_PACKER`, `APPROVER_SAME_AS_COUNTER`, `APPROVER_SAME_AS_SUBMITTER`) [P; codes confirmed by Marcus in the contract];
  6. status or state conflict (for example shipping a shipment that is not Verified, or editing a Shipped or Cancelled shipment directly) → **409**;
  7. too many attempts (login, demo reset) → **429**.
- Roles: Admin, Supervisor, Shipping, Receiving, Quality, plus **Viewer**: a read-only guest role, **kept and seeded** (7th demo user). It is the recommended login for visitors to the public demo site. Viewer is not an operational role; removing it later changes no story.
- Cross-references: story IDs are in [backlog.md](backlog.md).

## 2. Matrix

| ID | Action | Admin | Supervisor | Shipping | Receiving | Quality | Viewer | Story |
|----|--------|:-----:|:----------:|:--------:|:---------:|:-------:|:------:|-------|
| P-01 | Sign in / sign out | Y | Y | Y | Y | Y | Y | US-001 |
| P-02 | View dashboard, KPI tiles, charts (incl. fixed reporting date label) | Y | Y | Y | Y | Y | Y | US-054 |
| P-03 | View shipments, packaging errors, rework, inventory, lot trace, reports; CSV export | Y | Y | Y | Y | Y | Y | US-024, US-065 |
| P-04 | Create / edit shipment (header, lines, document flags, notes) **before it ships**; Shipped and Cancelled shipments are locked (R-14) | | Y | Y | | | | US-014 |
| P-05 | Mark Ready to Pack | | Y | Y | | | | US-016 |
| P-06 | Start packing (user becomes the recorded **packer**) | | Y | Y | | | | US-019 |
| P-07 | **Verify** shipment (pass or fail checklist) | | Y\* | Y\* | | Y\* | | US-019, US-020 |
| P-08 | **Ship** shipment (ship date, carrier, tracking; posts ledger) | | Y | Y | | | | US-021 |
| P-09 | Put shipment On Hold (reason required) | | Y | Y | | Y | | US-016 |
| P-10 | Release shipment from hold | | Y | | | Y | | US-016 |
| P-11 | Cancel shipment (reason required; before Shipped) | | Y | Y\* | | | | US-016 |
| P-12 | Log packaging error (before or after ship) | | Y | Y\* | | Y | | US-027 |
| P-13 | Log rework event | | Y | Y | | Y | | US-029 |
| P-14 | Edit root cause (6M), 5 Whys, corrective action; close error | | Y | | | Y | | US-032 |
| P-15 | Receive material (receipt with lot and inspection status) | | Y | | Y | | | US-035 |
| P-16 | Inventory transfer, scrap, production complete | | Y | | Y\* | Y\* | | US-035 |
| P-17 | Create cycle-count list | | Y | | | | | US-043 |
| P-18 | Enter cycle count (blind count, recount) | | Y | | Y | | | US-043 |
| P-19 | **Approve** cycle count / post inventory adjustment | | Y\* | | | | | US-044 |
| P-20 | Manage lookups (parts, customers, suppliers, carriers, locations, reason codes) | Y | Y | | | | | US-007 |
| P-21 | Edit KPI targets and cycle-count tolerances | Y | Y | | | | | US-008 |
| P-22 | Set fixed reporting date or switch to live date | Y | | | | | | US-008 |
| P-23 | Manage users (create, deactivate, change role) — **screen deferred to v1.1; rule fixed now** | Y\* | | | | | | US-004 (deferred) |
| P-24 | View audit log (read-only) | Y | | | | | | US-005 |
| P-25 | Demo-data reset (env-gated; confirmation; cooldown; audited) | Y\* | | | | | | US-011 |
| P-26 | **Reopen** a shipment from Rework to Packing (UD-4; server-enforced) | | Y | | | Y | | US-016 |
| P-27 | **Contain** a packaging error (Open to Contained; UD-4; server-enforced) | | Y | | | Y | | US-032 |
| P-28 | **Correct** a Shipped or Cancelled shipment (UD-3): audited correction action, reason required, old to new recorded | | Y\* | | | | | US-086 |
| P-29 | View the Resources page (static links, no data) | Y | Y | Y | Y | Y | Y | US-085 |

## 3. Special rules

| Rule | Statement | Notes / tests |
|------|-----------|---------------|
| **R-1 Verifier ≠ packer** (user decision 5) | Shipping, Quality and Supervisor may verify, but the verifier must be a different person from the **current packer** of that shipment. The server compares the signed-in user id (from the session, never from the request body) with the recorded packer id **inside the verify transaction** (conditional `UPDATE … WHERE packer_id <> $me`, or a row lock), so two concurrent requests cannot bypass it. | Enforced for UI and direct requests; a refused attempt records no passed or failed verification (403, audited). After a rework, the **new** packer is the current packer: the earlier packer may verify, the new one may not (US-020). Applies to Supervisor too (a Supervisor who packed cannot verify). T-1 to T-5. |
| **R-2 Admin is not an operator** — **confirmed** | Admin cannot pack, verify, ship, hold, cancel, log errors or rework, receive, transfer, count or approve. Admin may view everything and runs configuration (lookups, targets, reporting date), users, audit log and demo reset. | Separation of duties: the person who controls accounts and reads the audit trail should not also create the operational records being audited. With R-11 (one role per user, no self role change) an Admin cannot quietly turn themselves into a verifier. In a small plant a Supervisor covers both. T-6. |
| **R-3 Supervisor approvals** | Only a Supervisor approves a cycle count and posts the adjustment; adjustments exist only through an approved count in v1 core (stand-alone manual adjustment is deferred, US-040). | Shipping, Receiving, Quality, Admin, Viewer get 403. T-7, T-8. |
| **R-4 Approver ≠ counter and ≠ submitter** — **accepted into v1 core; widened by UD-2 (2026-11-26)** | A Supervisor may not approve a count if they **entered or recounted any line** of that count **or submitted** the count. Both checks run in the approve transaction; the session user is compared with the recorded counter(s) and submitter. | Same pattern as R-1 (one server check in the approve transaction, tests for both). Seed: counts are entered and submitted by `demo.receiver`, so `demo.supervisor` can approve them in the demo. Criterion added to US-044. T-15, T-26. |
| **R-5 Shipping cancels only early** | Shipping may cancel only while the shipment is Planned or Ready to Pack; Supervisor may cancel at any status before Shipped. Cancelled shipments leave every KPI. | Limits KPI manipulation. Changes the earlier US-017 text (Shipping or Supervisor, any pre-ship status). Refusal for Shipping at a later status is **403** (role rule), not 409. T-9. |
| **R-6 Hold release** | Shipping can put a shipment on hold but only Quality or Supervisor can release it. | T-22. |
| **R-7 Moving stock out of a Hold location** | Any movement **out of** a Hold location (transfer **or** scrap) needs Quality or Supervisor. Receiving may transfer, scrap and record production complete for stock that is not in a Hold location. Quality's P-16 permission covers only transfers and scrap into or out of Hold locations (disposition), not production complete. | Replaces the deferred release/reject screen (US-036). The rule is decided by the **source location's type in the database**, not by a request flag. T-13, T-19. |
| **R-8 Customer-found errors** | After-ship errors are logged against Shipped shipments by Quality or Supervisor only; Shipping logs before-ship errors only (P-12 Y\*). | Matches US-033 (merged into US-027). Shipping logging against a Shipped shipment → 403. T-18. |
| **R-9 Reporting date and reset** | Only Admin sets the reporting date and runs the demo reset. Reset requires `DEMO_RESET_ENABLED=true` (otherwise the endpoint returns **404**), the CSRF token, an explicit typed confirmation, and a **cooldown** (at most one reset per 10 minutes, recorded in the DB → 429). It writes an audit entry first, rebuilds the seed (including demo users and their passwords) and **ends all sessions**. | Disabled by default on previews and production unless set. Public site: the deployed `demo.admin` password is **not published** (section 4). Security plan §11. T-11, T-20. |
| **R-10 Self-service limits** | No role can edit or delete audit entries, ledger transactions or status history through the app (append-only, also enforced by DB triggers per ADR-001). | Not a role action; included for completeness. |
| **R-11 Account safety** (new) | Each user has exactly one role. An Admin cannot change their own role or deactivate themselves, and the last active Admin cannot be deactivated. A role change or deactivation ends that user's sessions immediately. | Applies when user management ships (v1.1); seed data already follows it. The role is read from the `users` row on every request (via the session), never from the cookie or client. |
| **R-12 Identity comes from the session** (new) | Fields that record *who* did something (packer, verifier, counter, approver, created_by, audit user) are always set by the server from the signed-in user. Request bodies that contain them are rejected (Zod `.strict()` → 400). | Prevents spoofing R-1/R-4 by sending someone else's id. T-16. |
| **R-13 No state change on GET** (new) | Every state change (including sign-out and demo reset) uses POST (or PUT/PATCH/DELETE) with the CSRF token. GET is always read-only. | A link or image tag on another site cannot change data. T-21. |
| **R-14 Shipped and Cancelled shipments are locked** (UD-3, 2026-11-26) | Once a shipment is Shipped or Cancelled, header, lines, document flags and **notes** cannot be edited directly by any role: the server answers **409** (`SHIPMENT_LOCKED`, [P] code). The only way to change them is the **correction action** (P-28): Supervisor only, a reason is required, and one audit row records each changed field old to new. Corrections never change the status history, ledger rows or verification records (the ledger is corrected with a count adjustment, not here). | Locks KPI-relevant data after the fact; the audit shows who changed what and why. A Shipping user attempting a correction gets 403 (role rule, before the state check). T-25. |
| **R-15 Reopen and contain are Supervisor and Quality only** (UD-4, 2026-11-26) | Reopen (Rework to Packing) and contain (Open to Contained) are refused with 403 for Shipping, Receiving, Admin and Viewer. Shipping still logs errors and rework (P-12, P-13) and re-packs after a reopen. | The check is on the session role in the handler, never a UI hide. T-23, T-24. |

## 4. Demo users (fictional, demo-only)

All accounts use **demo-only** passwords; they must never be reused for anything real. Emails use `example.com`. Names are obviously fake. Password provisioning follows [security-plan.md](../security/security-plan.md) §11.

| Username | Display name | Role | Why it exists | Password on the public deployed site |
|----------|--------------|------|---------------|--------------------------------------|
| `demo.admin` | Demo Admin | Admin | Settings, reporting date, audit log, demo reset | **Not published.** Set from the Netlify env var `DEMO_ADMIN_PASSWORD` (secret) at seed/reset; if unset, the deployed Admin account is created **inactive**. Locally and in tests: the documented demo password. |
| `demo.supervisor` | Demo Supervisor | Supervisor | Approvals, holds, cancel, can also verify | Published (README / login page), demo-only |
| `demo.shipper1` | Demo Shipper One | Shipping | Packer in the demo storyline | Published, demo-only |
| `demo.shipper2` | Demo Shipper Two | Shipping | Second Shipping user so verifier ≠ packer can be shown and tested | Published, demo-only |
| `demo.receiver` | Demo Receiver | Receiving | Receipts, transfers, count entry | Published, demo-only |
| `demo.quality` | Demo Quality | Quality | Verifies, holds, root cause, corrective actions | Published, demo-only |
| `demo.viewer` | Demo Viewer | Viewer | Read-only guest (recommended visitor login); negative tests | Published, demo-only |

Seven accounts. Dana seeds them; passwords are hashed by the seed (scrypt, per-user salt), never stored in plain text. The published passwords live in the README and on the login page only; they are not secrets and give no access to anything outside the demo.

## 5. Test scenarios the matrix must support (for US-080 and the demo script)

| # | Scenario | Expected |
|---|----------|----------|
| T-1 | `demo.shipper1` packs SH-xxxx, then tries to verify it | 403 `VERIFIER_SAME_AS_PACKER`, no verification recorded |
| T-2 | `demo.shipper2` verifies the same shipment | Verified |
| T-3 | `demo.quality` and `demo.supervisor` each verify a shipment packed by `demo.shipper1` | Verified |
| T-4 | `demo.supervisor` packs a shipment, then tries to verify it | 403 |
| T-5 | Shipment fails verification, is re-packed by `demo.shipper2`; `demo.shipper1` verifies | Verified; `demo.shipper2` verifying is refused |
| T-6 | `demo.admin` tries to pack, verify, ship, hold, receive, log an error, approve a count | 403 each |
| T-7 | `demo.receiver` tries to approve a count, edit targets, edit lookups | 403 each |
| T-8 | `demo.quality` tries to approve a count or ship | 403 |
| T-9 | `demo.shipper1` tries to cancel a Packing shipment | 403 (R-5); `demo.supervisor` succeeds |
| T-10 | `demo.viewer` calls **every** write endpoint directly | 403 each, no row changes |
| T-11 | Any non-Admin role requests the audit log, user admin, demo reset, reporting date | 403 |
| T-12 | Unauthenticated client requests any protected page or endpoint | 401 or redirect to login |
| T-13 | `demo.receiver` transfers stock out of HOLD-01 | 403; `demo.quality` succeeds |
| T-14 | Write request without a valid CSRF token, or with a forged `Origin` | 403, nothing changes (form **and** JSON) |
| T-15 | `demo.supervisor` enters or recounts a count line, then tries to approve that count | 403 `APPROVER_SAME_AS_COUNTER`; approving a count entered only by `demo.receiver` succeeds |
| T-16 | `demo.shipper1` sends a verify request whose body contains `verifierId`/`packerId` of another user | 400, nothing changes (R-12) |
| T-17 | JSON write with `Content-Type: text/plain` or missing; form write with `application/json` | 415, nothing changes |
| T-18 | `demo.shipper1` logs a packaging error against a Shipped shipment | 403 (R-8); `demo.quality` succeeds |
| T-19 | `demo.receiver` scraps stock located in HOLD-01 | 403 (R-7) |
| T-20 | Demo reset: flag off → 404; flag on, Admin, second reset within 10 min → 429; any other role → 403 | As stated; audit entry written for each accepted reset |
| T-21 | GET request to any write or logout URL | 405 (or no effect), nothing changes |
| T-22 | `demo.shipper1` releases a shipment from hold | 403; `demo.quality` succeeds |
| T-23 | `demo.shipper1` reopens SH-1284 (Rework to Packing) | 403 (R-15); `demo.quality` or `demo.supervisor` succeeds; Admin, Receiving, Viewer 403 |
| T-24 | `demo.shipper1` contains an Open packaging error | 403 (R-15); `demo.quality` or `demo.supervisor` succeeds |
| T-25 | Direct edit (header, line, flags, notes) of a Shipped or Cancelled shipment by Shipping or Supervisor | 409 `SHIPMENT_LOCKED`, nothing changes; correction by `demo.shipper1` 403; correction by `demo.supervisor` with a reason succeeds and writes an audit row old to new; without a reason 400/422 |
| T-26 | A Supervisor who **submitted** a count (but entered no line) tries to approve it | 403 `APPROVER_SAME_AS_SUBMITTER`; no adjustment posted |
| T-27 | Every role opens `/resources` | 200 for all signed-in roles; unauthenticated goes to login |
| T-28 | `demo.shipper1` ships SH-1287 (promise date passed) with no late reason, then with a reason | Rejected (400/422), then Shipped; the rule applies even when the on-time tolerance setting is above 0 days (UD-1) |

## 6. Review notes (security-reviewer, T-015, 2026-11-25)

What changed from Priya's DRAFT and why:

1. **R-2 confirmed** (Admin is not an operator) and backed by the new **R-11** (one role per user, no self role change, sessions end on role change). Without R-11 an Admin could promote themselves and bypass the separation.
2. **R-4 accepted into v1 core** and widened to "any line of that count" (recounts included). It is one check plus one test and mirrors R-1. Follow-up for Priya: add to US-044.
3. **Audit log stays Admin-only** (P-24). Least privilege: the log holds login failures and access denials. Supervisors already see record history on each record. Because the public demo's `demo.admin` password is not published (section 4), visitors cannot read the log. The audit log must not store IP addresses or raw unknown usernames (security plan §9).
4. **Viewer kept and seeded** as a read-only guest, the recommended login for the public site. Column label changed from "Viewer (opt.)" to "Viewer"; T-10 now covers every write endpoint.
5. **Response-code order** added (401 → 403 CSRF / 415 → 403 role → 400/422 → 403 identity rule → 409 → 429). This keeps the 403/409 split from the draft and adds 415 (PoC R-1: content-type enforcement) and 429 (rate limits).
6. **P-12 Shipping and P-23/P-25 Admin marked Y\*** so the special rules (R-8, R-11, R-9) show in the matrix.
7. **R-7 tightened:** scrap out of a Hold location also needs Quality/Supervisor (scrapping held stock is a disposition). Quality's P-16 scope is defined (Hold moves only).
8. **R-9 extended for the public site:** reset cooldown (429), 404 when the flag is off, sessions ended after reset, and the deployed Admin password provisioned from a Netlify secret env var rather than published (answers open point 4 / Q-19).
9. **New R-12** (identity fields come from the session) and **R-13** (no state change on GET).
10. **R-1** now states that the check runs inside the verify transaction (race-safe), as ADR-001 §8 #1 requires.
11. Test scenarios T-15 to T-22 added for the new and tightened rules.

Follow-ups (not blockers for this document):
- product-manager (Priya): update US-017 (R-5), US-044 (R-4), US-011/US-081 (R-9 cooldown, Admin password not published), backlog Q-19 → resolved by security plan §11.
- backend-developer (Diego) + software-architect (Marcus): confirm the error codes and response order in the API contract; ADR-003 (T-009) fixes the session and CSRF details from security plan §3–§5.
- data-model-specialist (Dana): seed users per section 4; counts entered by `demo.receiver`; `DEMO_ADMIN_PASSWORD` handling.
