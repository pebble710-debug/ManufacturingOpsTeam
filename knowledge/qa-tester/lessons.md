# QA lessons (Quinn)

## 2026-11-26 — T-017 schema harness (spikes/schema-check)
- **Extract SQL from the design doc at run time** (heading + first ```sql block) instead of copying it. Parallel edits by the architect (T-016: generated `completed_business_date`, removed `approved_by <> submitted_by` CHECK) were caught on the very next run. A doc/heading change must fail loudly, not silently test a stale copy.
- Also extract the doc's oracle queries (schema.md §5, §8) and run them unmodified against fixtures; match them by a distinctive token and require exactly one match.
- PGlite specifics: `numeric` and some aggregates return strings (wrap with `Number()`); `bigint` counts come back as numbers; deferred constraint triggers fail at COMMIT, so negative tests must use autocommit statements or `db.transaction`; a rejected statement rolls back. One in-memory DB per fixture file (KPI views read all rows, so fixtures A/B/C must not share a database).
- Trigger order matters for error text: BEFORE triggers (history chain, R-4 guard) fire before CHECK and FK. Build test data so that only the rule under test can reject the row; assert SQLSTATE plus message.
- When a doc change legitimately alters a rule, update the test **and say so in the report** (old assertion, new assertion, who changed the rule). Never silently flip an assertion.
- Generated columns reject explicit values (`cannot insert a non-DEFAULT value into column`); test helpers must not supply them.
- npm quirk: a fresh `npm install` in a new spike dir crashed with `edgesOut`; `.npmrc legacy-peer-deps=true` + explicit `vite` fixed it. Check `npm ci` early in CI.
- Rules that live only in the API (role permissions, R-1 identity, G1/G2 rework gate, status = last history row) cannot be proven by DB tests; list them in the matrix as mandatory integration tests so nobody assumes DB coverage.
- Tool note: the shell safety check refuses `rm -f` on /tmp paths; use Write/Edit for file changes instead of deleting.
