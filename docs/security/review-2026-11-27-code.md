# Security code review — backend W2 (T-034)

Reviewer: Sasha (security-reviewer) · Date: 2026-11-27 · Commit reviewed: `main @ a318446` (T-030 backend)
Baseline: ADR-003 §8 C-1…C-10, ADR-002 §14 H-1…H-7, `docs/security/security-plan.md`,
`docs/security/review-2026-11-27-design.md` §7 (DR-01…DR-05), `security-review-checklist`.

**Sign-off status: NOT SIGNED OFF — 1 High open (SEC-01).** Every other ADR condition is met in code or
is a deploy-time check. Once SEC-01 is fixed and `tests/security/` passes, I re-verify, and this becomes
"signed off for the backend, with the deploy-time checks still to run".

## 1. Scope

Reviewed: `src/middleware.ts`, `src/lib/auth/**`, `src/lib/http/**`, `src/lib/services/**`, `src/lib/repos/**`,
`src/lib/validation/**`, `src/lib/env.ts`, `src/lib/audit.ts`, `src/lib/seed/demo-credentials.ts` and `write.ts`
(the credential branch), `scripts/reset-seed.ts`, `netlify.toml`, `astro.config.mjs`, `src/pages/api/v1/**`,
`src/pages/logout.ts`.
Not reviewed: the frontend pages (they are being built in parallel). I only grepped them to rate SEC-01.

## 2. Commands run

| Command | Result |
|---------|--------|
| `npm run lint` | exit 0: "no banned patterns (sql.unsafe, set:html, eval, new Function, Astro.session, innerHTML=)" |
| `npm audit --audit-level=high` | exit 0. 10 moderate (the glob/minimatch chain via `@astrojs/netlify` → `@netlify/*` → archiver/readdir-glob, build and dev only). 0 high, 0 critical. Matches the accepted H-6 set. |
| `npx vitest run tests/integration/api tests/unit/services` | 7 files, **115/115 passed** (133 s) |
| `npx vitest run --config tests/security/vitest.config.ts` (new) | 6 tests: **3 passed, 3 failed**. The 3 failures are SEC-01 and are expected until the fix. |
| Secrets grep (`git grep` for password/secret/token literals, connection strings with credentials, AKIA/ghp_/nfp_/PEM keys; tracked `.env*` and `state.json`) | Demo passwords appear only in `src/lib/seed/demo-credentials.ts:16-25`. The only connection string is a placeholder in `.env.example:6` (`fake-password@localhost`). `.env` and `.env.*` are git-ignored. Only `.env.example` is tracked. No real secrets. |
| CI workflow grep | `permissions: contents: read`. No `pull_request_target` (H-3 met). |

## 3. Findings

| ID | Severity | File:line | Issue | Fix recommendation | Owner |
|----|----------|-----------|-------|--------------------|-------|
| SEC-01 | **High** | `src/lib/http/pipeline-core.ts:157,166,170,172,176-181`; `src/lib/auth/routes.ts:156-158` | **A percent-encoded path skips the route table and the role check.** The middleware matches on the raw `new URL(request.url).pathname`. Astro routes on the fully decoded pathname (`validateAndDecodePathname`, `node_modules/astro/dist/core/util/pathname.js`). An unmatched GET only needs a session: step 3 is skipped when `spec` is null, and so is the `DEMO_RESET_ENABLED` flag check. Any signed-in user, including Viewer, can reach any page by encoding one character, for example `GET /admin/audit%2Dlog`, `/%61dmin/settings` or `/admin/demo%2Dreset`. All 32 GET page patterns are affected (test output). API paths are safe: an unmatched `/api/*` returns 404, and so does any unmatched write. Some new pages re-check `locals.capabilities`, which partly mitigates this. But the design promise is deny-by-default in the middleware (ADR-003 D-9), and the Admin-only pages (audit log, settings, lookups, demo reset) must not depend on each page remembering to check. | (1) In `runPipeline`, decode the pathname the same way Astro does: `decodeURI` repeatedly until it stops changing, at most 10 times. Refuse with 400 when decoding fails or the limit is hit. Use that decoded path for `matchRoute`, `isApiPath`, the `/_astro/` test and the audit `path`. (2) Deny by default for GET too: an authenticated GET with no route entry returns 404 (add explicit table entries for `/404` and `/500` if needed). Keep the per-page `can(...)` checks as defence in depth. (3) Add `tests/security/` to the Vitest projects in CI. | Diego (fix), Theo (CI project) |
| SEC-02 | Low | `src/lib/auth/csrf.ts:12` | `csrfFromForm` reads `request.clone().text()` with no size cap. The 64 KB check only looks at `Content-Length`, so a chunked body is read in full before the cap in `readBodyCapped` runs. Netlify's own request-size limit bounds the impact. | Read the clone through `readBodyCapped(request.clone())`, or check the CSRF token inside the form handler after the capped read. | Diego |
| SEC-03 | Low | `src/lib/http/pipeline-core.ts:190`, `src/lib/http/handlers.ts:60`, `src/pages/logout.ts:13` | `cookies.delete(sessionCookieName(), { path: '/' })` sends no `Secure`. Browsers ignore a `Set-Cookie` for a `__Host-` cookie without `Secure`, so after logout the stale cookie stays in the browser. The server row is deleted, so there is no session reuse. This is hygiene only. | Delete the cookie with the same attributes it was set with (`secure: !dev, httpOnly, sameSite: 'lax', path: '/'`), through one helper in `session.ts`. | Diego |
| SEC-04 | Low | `src/lib/http/respond.ts:383` | The flash cookie is set without `Secure`. | Add `secure: !isDevServer()`. | Diego |
| SEC-05 | Low | `src/lib/auth/login.ts:27-41`, `src/lib/auth/rate-limit.ts:152-168` | The throttle check and the increment are separate statements, so a parallel burst can pass more than 5 guesses per window. The design accepts this for a prototype. | Optional: increment first (`INSERT … ON CONFLICT … RETURNING fail_count`) and refuse when the count is over the limit, or lock the row. | Diego |
| SEC-06 | Low | `src/lib/http/pipeline-core.ts:170` | The `/_astro/` early return skips `finish()`, so no security headers are added there. The CDN `[[headers]]` cover static assets. It only matters if an SSR response is ever served under that prefix. | Wrap it in `finish(...)` or keep it as it is with a comment. Fold it into the SEC-01 fix. | Diego |
| SEC-07 | Info | `src/lib/http/errors.ts:321` | `DEBUG_DB` logs Postgres error messages, which can contain row values. | Never set `DEBUG_DB` in Netlify. Mention this in the README env table. | Theo |
| SEC-08 | Info | `src/lib/services/admin.ts:53-63` | The demo-reset cooldown is read outside the reset transaction (a race). The credential mode comes from `appEnv()` and not from the target DB. It is safe today: the function always uses the site's own DB, and `appEnv()` defaults to `deployed`. The route is also flag-gated and Admin-only. | Accepted for v1. If a local server is ever pointed at a remote DB, decide the mode from the DB host (same rule as `reset-seed.ts`). | Diego |

No Critical findings.

## 4. ADR conditions: verification

| Cond. | Status | Evidence |
|-------|--------|----------|
| C-1 siteOrigin from the request URL | Met | `pipeline-core.ts:223` uses `url.origin`. `pipeline.ts:24-30` compares `Origin` exactly, so `null` never matches. |
| C-2 DUMMY_HASH = SCRYPT_PARAMS | Met | `password.ts:74,101-102`. Unit test `http.test.ts:67`. |
| C-3 seed mode follows the target DB | Met | `demo-credentials.ts:30-42`, `write.ts:43-54`, `reset-seed.ts:26-31`. Tests in `seed-unit.test.ts:29-44`. |
| C-4 APPROVER_SAME_AS_SUBMITTER | Met | `rules.ts:227,273-277`, `cycle-counts.ts:155-156` (under the row lock, before the 409). Test `inventory-quality-admin.test.ts:170-185`. The code is in `docs/api/contract.md`. |
| C-5 P-26…P-29, Viewer in ALL_ROLES | Met | `permissions.ts:4,38-41`. |
| C-6 one CSP | Met in code | `security-headers.ts:2-4` equals `netlify.toml:26` (CSP_DEPLOYED, `style-src 'self'`). Test `http.test.ts:46`. The deployed `curl -sI` check is still to run on the first deploy. |
| C-7 fail closed; no secrets in audit rows | Met | `pipeline-core.ts:264-268` catches everything into a refusal. `audit.ts:13-22` scrubs. `LOGIN_FAILED` stores an existing username or "unknown" (`login.ts:39`). `ACCESS_DENIED` stores method, path, code and role only. |
| C-8 `next` redirect check | Met | `pipeline.ts:87-101` (control characters, `//`, `\`, schemes, checked before and after decoding). Test `http.test.ts:40`. |
| C-9 no bootstrap endpoint | Met | Not in the `routes.ts` table. Unmatched writes return 404. |
| C-10 / DR-05 no notes exception on Shipped/Cancelled | Met | `shipments.ts:99-100` locks all fields. Tests `shipment-workflow.test.ts:136,223`. The contract exception is removed. |
| H-1 X-Robots-Tag, shared CSP | Met | `netlify.toml:33`, `security-headers.ts:15`. |
| H-3 CI permissions | Met | workflow `permissions: contents: read`, no `pull_request_target`. |
| H-4 only the exact string `true` enables the flag | Met in code | `env.ts:7-9`. The first-deploy check (404) is still to run (Theo). |
| H-5 scripts never print secrets; `--remote` gate | Met | `reset-seed.ts:23-35` and `migrate.ts` print the host only. |
| H-6 advisories | Met | 10 moderate, the same accepted set. 0 high or critical. |
| H-2, H-7 | Not code | Netlify UI and `.npmrc`. Check them at deploy. |

Design checklist §7 items 1–11: met, except item 1 ("deny by default"), which SEC-01 breaks for GET pages.
Other checks done: the verifier ≠ packer rule (R-1) is checked under `FOR UPDATE`, with the actor taken from the session (`shipments.ts:281-289`). No form or API field can set `packed_by`. R-5, R-7 and R-8 are enforced in the services on locked rows. Dynamic SQL identifiers come only from allow-lists (`sortParam` maps, `TABLE` constants, `BUSINESS_KEYS`). The users lookup returns only id, display_name and role. The CSV export guards against formula injection (`reports.ts:144-151`). Cookies are `__Host-sid`, Secure, HttpOnly, SameSite=Lax. Sessions store only the SHA-256 of the token, are rotated on login, and are re-read with the role and `active` flag on every request.

## 5. DR re-verification

| ID | Result |
|----|--------|
| DR-01 | **Closed.** `--remote` or a non-local host selects the deployed mode (`reset-seed.ts:30`, `demo-credentials.ts:30`). Unit-tested. |
| DR-02 | **Closed in code.** `DEMO_ADMIN_PASSWORD` shorter than 16 characters makes the admin inactive (`demo-credentials.ts:38-42`, `write.ts:54`). Scoping the variable to Production and Functions is a Netlify UI check for Theo at deploy. |
| DR-03 | **Closed in code.** One CSP string, with an equality test. Confirm with a header check on the first deploy. |
| DR-04 | **Closed.** A separate code, in the contract, tested. |
| DR-05 | **Closed.** The exception is removed from the contract. The code returns 409 `SHIPMENT_LOCKED`. Tested. |

## 6. Tests added

- `tests/security/route-encoding.test.ts`: SEC-01. A unit sweep over all GET page patterns, plus end-to-end `runPipeline` tests against in-memory Postgres: Viewer gets 403 on `/admin/audit-log` (control), and encoded `/admin/audit%2Dlog` and `/admin/demo%2Dreset` must not reach the page. These fail now and must pass after the fix.
- `tests/security/vitest.config.ts`: a standalone config. It is not in the default projects yet (Theo).
