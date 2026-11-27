
## 2026-11-27 T-029 build of migration 0001 and the seed
- Context: turned the designed DDL and seed plan into code. Migration 0001 is a verbatim copy of the tested DDL in migrations-plan section 3; `spikes/schema-check` now reads the real file first (92 tests green).
- postgres.js v4: `sql.array()` is removed (pass JS arrays directly); `sql(rows, ...cols)` cannot express OVERRIDING SYSTEM VALUE, so rely on identity ids following insertion order and verify `count = max(id)`; use `sql(tableName)` for identifiers (no sql.unsafe).
- Node 22 runs `.ts` scripts directly but needs explicit `.ts` import extensions; `src/lib/seed/*` therefore imports with `.ts` (astro tsconfig allows it).
- Seed design that worked: demand-driven just-in-time supply per part (binary search on receipt size, then split/merge to the exact receipt count), FIFO ledger simulation with line splitting, chronological event queue, validation SQL inside the transaction. The seed passed all section-9 queries first time because stock is simulated, never patched.
- Ledger/unit determinism: no Date.now/Math.random in `src/lib/seed` (unit test greps); the CLI passes the clock and `nowIso`.
- Never `pkill -f astro`: the sandbox denies broad kills (other agents run dev servers). Stop only the PID you started.
- Credentials: seed credential mode follows `--remote`, not appEnv (Sasha DR-01). demo.admin inactive unless DEMO_ADMIN_PASSWORD >= 16 chars on remote.
