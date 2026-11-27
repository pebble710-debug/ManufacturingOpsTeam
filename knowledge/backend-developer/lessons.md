# Diego — lessons

- 2026-11-26 (T-014): when upstream docs (matrix, security plan) are reviewed in parallel, re-read them before finalising error codes and check order; keep a single table (contract §1.3) as the source of order and reference it from each endpoint instead of repeating it.
- Do not put state-creating behaviour behind GET (R-13); this killed the draft's `GET /auth/csrf`.
- Keep enumerations (§2) stable once Dana consumes them; add new values only via a schema request.
- 2026-11-27 (T-030): postgres.js double-encodes a JS string sent to a jsonb parameter (it becomes a JSON string scalar, which then failed the `jsonb_typeof = 'object'` CHECK). Always pass objects with `tx.json(obj)`; never `JSON.stringify(x)::jsonb`.
- postgres.js returns bigint/numeric as strings and `date` as Date: cast in SQL (`id::int`, `col::text`, `x::float8`) and use `wire()` (src/lib/http/respond.ts) as the safety net for numeric-looking keys.
- Drive the real pipeline in tests with `runPipeline` + `dispatchApi` and plain Request objects (tests/integration/api/helpers.ts): no Astro server needed, in-memory Postgres from `startTestDb()` starts in ~3 s.
- A role-matrix test that loops over every write route must skip logout (it kills the session), and any test that deactivates a user must reactivate it.
- Order of checks matters for tests: 422 (Zod) before 404/403-by-state; R-1/R-4/R-5/R-7/R-8 (403) before 409; the DB lock triggers are the backstop, not the first line.
