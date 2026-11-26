# Diego — lessons

- 2026-11-26 (T-014): when upstream docs (matrix, security plan) are reviewed in parallel, re-read them before finalising error codes and check order; keep a single table (contract §1.3) as the source of order and reference it from each endpoint instead of repeating it.
- Do not put state-creating behaviour behind GET (R-13); this killed the draft's `GET /auth/csrf`.
- Keep enumerations (§2) stable once Dana consumes them; add new values only via a schema request.
