# Diego — decisions (API contract, T-014)

Contract: `docs/api/contract.md` (DRAFT 2, 2026-11-26). Matrix: `docs/plan/permissions-matrix.md` (REVIEWED).

- **Check order** (matrix §1): 401 -> 403 CSRF / 415 -> 403 role -> 400/422 -> 403 identity/role-by-state (R-1, R-4, R-5, R-7, R-8, read from the locked DB row) -> 409 -> 429. Login rate limit is checked first (cheap rejection).
- Actor fields in bodies -> 400 `UNKNOWN_FIELD` (R-12, Zod strict). Body limit 64 KB.
- Verify: R-1 compared under the shipment row lock, no verification row on refusal; current packer = latest start-packing or reopen user.
- Rework gate on `reopen` (G1 before-ship error + G2 completed rework) and 409 `REWORK_GATE_NOT_MET` on verify/ship in Rework. `reverified_ok` is server-managed.
- Ledger: advisory lock per (part, lot) in sorted order; ADJUST uses snapshot variance, warns on drift.
- Demo reset: 404 when flag off (every role), 429 `RESET_COOLDOWN` 10 min, ends all sessions, audit row re-inserted after reseed.
- E-01 (pre-login token endpoint) withdrawn: security plan §5 and R-13 (no state-creating GET).
- Open blocking item: Q-A business_date columns so live records fall inside the fixed-date KPI period.
