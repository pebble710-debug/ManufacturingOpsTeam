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

# Diego - decisions (T-030, implementation)
- Pipeline logic lives in `src/lib/http/pipeline-core.ts` (`runPipeline`, `dispatchApi`), independent of Astro; `src/middleware.ts` and `src/pages/api/v1/[...path].ts` are thin glue. Route table + permission map: `src/lib/auth/routes.ts`, `permissions.ts`.
- All JSON handlers are in one table (`src/lib/http/handlers.ts`, keyed by route id E-nn); kpis stay Kenji's static files (they win over the rest route).
- Unmatched GETs require a session but no role; unmatched non-GETs are 404 (fail closed). Page 403s render a minimal HTML page from the middleware.
- Business clock helpers: `src/lib/clock.ts` (`getBusinessClock`, `computeClock`, `realNow`, `setClockForTests`).
- Late reason (UD-1): `lateReasonRequired(ship_date, promise_date)`; tolerance never consulted.
- Demo reset finds Dana's seed function via `import.meta.glob('../seed/{index,load,run}.ts')` and the first exported name among seedDemoData/resetAndSeed/seedDatabase/runSeed/seed; 503 if none exists.
