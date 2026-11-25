# Permissions Matrix (v1 core)

**DRAFT — pending security-reviewer (Sasha) review.**
**Task:** T-004 · **Owner:** Priya (product-manager) · **Date:** 2026-11-25
**Sources:** user decisions 5 and 7 (2026-11-25), [project-scope.md](../project-scope.md) §2, §3.5, §5, [07-software-design.md](../07-software-design.md) §7.2, [04](../04-shipping-workflows-coordination.md) §4.2.
All users, names and data are **fictional**.

## 1. How to read this

- **Y** = allowed. Blank = not allowed: the server returns **HTTP 403** (signed in) or **401/redirect** (not signed in). A 403 also writes an access-denied audit entry.
- **Y\*** = allowed with a special rule (section 3).
- **Deny by default:** any action not listed here is refused for every role.
- Enforcement is **server-side in every handler**. Hiding a button is never the protection. Direct requests (bypassing the UI) are tested (US-080).
- Status or state conflicts (for example shipping a shipment that is not Verified) return **409**, not 403. A role or identity refusal (including verifier = packer) returns **403** [P: error code `VERIFIER_SAME_AS_PACKER`; Diego/Marcus to confirm in the API contract].
- Roles: Admin, Supervisor, Shipping, Receiving, Quality; **Viewer is optional** (recommended: keep it as a read-only guest login for the public site; dropping it changes no story).
- Cross-references: story IDs are in [backlog.md](backlog.md).

## 2. Matrix

| ID | Action | Admin | Supervisor | Shipping | Receiving | Quality | Viewer (opt.) | Story |
|----|--------|:-----:|:----------:|:--------:|:---------:|:-------:|:-------------:|-------|
| P-01 | Sign in / sign out | Y | Y | Y | Y | Y | Y | US-001 |
| P-02 | View dashboard, KPI tiles, charts (incl. fixed reporting date label) | Y | Y | Y | Y | Y | Y | US-054 |
| P-03 | View shipments, packaging errors, rework, inventory, lot trace, reports; CSV export | Y | Y | Y | Y | Y | Y | US-024, US-065 |
| P-04 | Create / edit shipment (header, lines, document flags) before it ships | | Y | Y | | | | US-014 |
| P-05 | Mark Ready to Pack | | Y | Y | | | | US-016 |
| P-06 | Start packing (user becomes the recorded **packer**) | | Y | Y | | | | US-019 |
| P-07 | **Verify** shipment (pass or fail checklist) | | Y\* | Y\* | | Y\* | | US-019, US-020 |
| P-08 | **Ship** shipment (ship date, carrier, tracking; posts ledger) | | Y | Y | | | | US-021 |
| P-09 | Put shipment On Hold (reason required) | | Y | Y | | Y | | US-016 |
| P-10 | Release shipment from hold | | Y | | | Y | | US-016 |
| P-11 | Cancel shipment (reason required; before Shipped) | | Y | Y\* | | | | US-016 |
| P-12 | Log packaging error (before or after ship) | | Y | Y | | Y | | US-027 |
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
| P-23 | Manage users (create, deactivate, change role) — **screen deferred to v1.1; rule fixed now** | Y | | | | | | US-004 (deferred) |
| P-24 | View audit log | Y | | | | | | US-005 |
| P-25 | Demo-data reset (env-gated; confirmation required; audited) | Y | | | | | | US-011 |

## 3. Special rules

| Rule | Statement | Notes / tests |
|------|-----------|---------------|
| **R-1 Verifier ≠ packer** (user decision 5) | Shipping, Quality and Supervisor may verify, but the verifier must be a different person from the **current packer** of that shipment. The server compares the signed-in user id with the recorded packer id. | Enforced for UI and direct requests; a refused attempt records no passed verification. After a rework, the **new** packer is the current packer: the earlier packer may verify, the new one may not (US-020). Applies to Supervisor too (a Supervisor who packed cannot verify). |
| **R-2 Admin is not an operator** | Admin cannot pack, verify, ship, log errors or rework, receive, transfer, count or approve. Admin may view everything and runs configuration (lookups, targets, reporting date), users, audit log and demo reset. | Justification: separation of duties. An administrator who can also ship or verify could create and approve their own records, which defeats the second-person check and the audit trail. In a small plant a Supervisor covers both. Sasha to confirm. |
| **R-3 Supervisor approvals** | Only a Supervisor approves a cycle count and posts the adjustment; adjustments exist only through an approved count in v1 core (stand-alone manual adjustment is deferred, US-040). | Shipping, Receiving, Quality, Admin get 403. |
| **R-4 Approver ≠ counter** [P, not yet a story criterion] | A Supervisor may not approve a count they entered themselves. | Proposed for Sasha; adds one server check and one test. If approved, add to US-044. |
| **R-5 Shipping cancels only early** | Shipping may cancel only while the shipment is Planned or Ready to Pack; Supervisor may cancel at any status before Shipped. Cancelled shipments leave every KPI. | Limits KPI manipulation. Changes the earlier US-017 text (Shipping or Supervisor, any pre-ship status). |
| **R-6 Hold release** | Shipping can put a shipment on hold but only Quality or Supervisor can release it. | From earlier backlog matrix ("request hold"). |
| **R-7 Moving stock out of a Hold location** | Receiving may transfer or scrap stock, but a transfer **out of** a Hold location (releasing held material) needs Quality or Supervisor. | Replaces the deferred release/reject screen (US-036). Receiving gets 403 on that transfer (marked Y\* in P-16). |
| **R-8 Customer-found errors** | After-ship errors are logged against Shipped shipments by Quality or Supervisor only; Shipping logs before-ship errors. | Matches US-033 (merged into US-027). P-12 for Shipping applies to before-ship errors. |
| **R-9 Reporting date and reset** | Only Admin sets the reporting date and runs the demo reset. Reset requires `DEMO_RESET_ENABLED=true`, an explicit confirmation, and writes an audit entry before the data is cleared. | The reset endpoint is disabled by default on previews and production unless set. Sasha to review exposure (public site). |
| **R-10 Self-service limits** | No role can edit or delete audit entries, ledger transactions or status history through the app (append-only, also enforced by DB triggers per ADR-001). | Not a role action; included for completeness. |

## 4. Demo users (fictional, demo-only)

All accounts use **demo-only** passwords documented in the README; they must never be reused for anything real. Emails use `example.com`. Names are obviously fake.

| Username | Display name | Role | Why it exists |
|----------|--------------|------|---------------|
| `demo.admin` | Demo Admin | Admin | Settings, reporting date, audit log, demo reset |
| `demo.supervisor` | Demo Supervisor | Supervisor | Approvals, holds, cancel, can also verify |
| `demo.shipper1` | Demo Shipper One | Shipping | Packer in the demo storyline |
| `demo.shipper2` | Demo Shipper Two | Shipping | Second Shipping user so verifier ≠ packer can be shown and tested |
| `demo.receiver` | Demo Receiver | Receiving | Receipts, transfers, count entry |
| `demo.quality` | Demo Quality | Quality | Verifies, holds, root cause, corrective actions |
| `demo.viewer` | Demo Viewer | Viewer (optional) | Read-only guest; negative tests |

Seven accounts (six without the optional Viewer). Dana seeds them; Diego/Sasha decide how passwords are provisioned on the public site (Q-19).

## 5. Test scenarios the matrix must support (for US-080 and the demo script)

| # | Scenario | Expected |
|---|----------|----------|
| T-1 | `demo.shipper1` packs SH-xxxx, then tries to verify it | 403, no verification recorded |
| T-2 | `demo.shipper2` verifies the same shipment | Verified |
| T-3 | `demo.quality` and `demo.supervisor` each verify a shipment packed by `demo.shipper1` | Verified |
| T-4 | `demo.supervisor` packs a shipment, then tries to verify it | 403 |
| T-5 | Shipment fails verification, is re-packed by `demo.shipper2`; `demo.shipper1` verifies | Verified; `demo.shipper2` verifying is refused |
| T-6 | `demo.admin` tries to ship, verify, receive, log an error | 403 each |
| T-7 | `demo.receiver` tries to approve a count, edit targets, edit lookups | 403 each |
| T-8 | `demo.quality` tries to approve a count or ship | 403 |
| T-9 | `demo.shipper1` tries to cancel a Packing shipment | 403 (R-5); `demo.supervisor` succeeds |
| T-10 | `demo.viewer` tries any create, edit, approve action | 403 |
| T-11 | Any non-Admin role requests the audit log, user admin, demo reset, reporting date | 403 |
| T-12 | Unauthenticated client requests any protected page or endpoint | 401 or redirect to login |
| T-13 | `demo.receiver` transfers stock out of HOLD-01 | 403; `demo.quality` succeeds |
| T-14 | Request without a valid CSRF token or origin | Rejected, nothing changes |

## 6. Open points for Sasha (security-reviewer)

1. Confirm R-1 to R-9, especially R-2 (Admin cannot operate) and the 403 versus 409 split.
2. Decide whether R-4 (approver ≠ counter) goes into v1 core.
3. Should Supervisor get read access to the audit log? (Draft: Admin only.)
4. Public-site exposure of demo passwords and the Admin reset (Q-19): password provisioning, rate limiting, or per-environment passwords.
5. Confirm that keeping an optional read-only Viewer is acceptable.
