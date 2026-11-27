# Lessons — security-reviewer (Sasha)

- 2026-11-27 (T-027): **Check "local vs deployed" flags against every entry point that touches a remote DB.**
  ADR-003 keyed the demo Admin password on `APP_ENV=local`, but the first production seed is a local script
  run with `--remote`, so the published local password would have reached production. Rule: decide the
  credential mode by the **target DB**, not by where the code runs.
- 2026-11-27: Cross-check ADR permission sketches against the latest matrix ids and error codes. Placeholder
  ids (UD-x) and merged error codes slip through easily (APPROVER_SAME_AS_SUBMITTER).
- 2026-11-27: Two CSP sources (`netlify.toml` and middleware) drift apart. Require one shared string and a
  test that compares them.
- npm advisories triage: `npm audit --json` → find the root advisories (`via` objects with a URL) and check
  whether the code is build/dev-only or on the request path. A forced fix that downgrades a major version is
  a reject.
- 2026-11-27 (T-034): **Middleware must match routes on the same path the framework routes on.** Astro 7 routes on
  the fully decoded pathname (`validateAndDecodePathname`), but `new URL(request.url).pathname` keeps `%XX` for
  unreserved chars, so `/admin/audit%2Dlog` skipped the route table (SEC-01). Always test encoded literal segments
  and require deny-by-default for unmatched GETs, not only writes.
- Security tests live in `tests/security/` with their own vitest config until CI includes them; write them to
  assert the secure behaviour (they fail until fixed) rather than `it.fails`.
