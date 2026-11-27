# Security design review — 2026-11-27 (T-027, W1.5)

**Reviewer:** security-reviewer (Sasha) · **Repo state:** `main` @ 6661fc9 (plus uncommitted WIP by others)
**Sign-off status:** **ADR-003 APPROVED** and **ADR-002 APPROVED**, both with binding conditions. Login,
session and middleware implementation (W2, Diego) may start once the Orchestrator relays this to the user
and the user gives the go-ahead. This is **not** a release sign-off. Release still needs security plan §14.

All data is fictional (Cobalt Ridge Components, Inc.). No secrets appear in this report.

## 1. Scope

- `docs/adr/ADR-003-auth-sessions-csrf.md` (Marcus): sessions, cookies, CSRF, login, rate limit,
  permissions map, middleware order, CSP, demo credentials.
- `docs/adr/ADR-002-hosting-and-deploy.md` (Theo), `netlify.toml`, `astro.config.mjs`.
- Checked against `docs/security/security-plan.md`, `docs/plan/permissions-matrix.md` (P-26 to P-29, R-14,
  R-15, R-4 + UD-2), `docs/api/contract.md` §1.3 and §1.12, and `docs/poc/poc-report.md` R-1.
- `npm audit` at the repo root.

## 2. Commands run

| Command | Result |
|---------|--------|
| `npm audit --json` (summarised) | 10 moderate, 0 high, 0 critical. Two root advisories: GHSA-3g3m-2fjr-6pw4 (`glob` 9.0.0–14.0.1) and GHSA-g3hv-75wg-m249 (`minimatch` 7.0.0–11.0.0). The other 8 entries are the chain `@astrojs/netlify` → `@netlify/vite-plugin` → `@netlify/dev` → `@netlify/functions-dev` → `@netlify/zip-it-and-ship-it` → `@vercel/nft` / `archiver` / `readdir-glob`. The only fix npm offers is `@astrojs/netlify@6.5.13`, a breaking downgrade. |
| `npm audit --omit=dev` | The same 10 moderate (the adapter is a runtime dependency) |
| `npm audit --audit-level=high` | exit 0 |
| `grep env .gitignore` | `.env` and `.env.*` ignored, `!.env.example` kept |

## 3. PoC R-1 closure (design level)

R-1 (JSON forged-Origin POST passed `checkOrigin`) is **closed by design**. Four controls now cover it:
- a strict content-type allow-list per surface (415 before parsing), so `text/plain` and
  `multipart` "simple" cross-site requests are refused;
- `application/json` from another site needs a CORS preflight, and no CORS headers are ever sent;
- the session-bound synchronizer token, compared in constant time, is required on every authenticated write,
  including logout;
- the Origin / `Sec-Fetch-Site` check for all state-changing requests, including login.

Quinn's S-07, S-08, T-14 and T-17 on both surfaces verify it in W2.

## 4. Findings

| ID | Sev | Location | Issue | Fix | Owner | Status |
|----|-----|----------|-------|-----|-------|--------|
| DR-01 | **High** | ADR-003 D-13 with ADR-002 §7 | `scripts/reset-seed.ts` sets `APP_ENV=local`, and ADR-002 §7 uses that script with `--remote` for the **first production seed**. As written, `demo.admin` would get the published local password on the public site, which means Admin access to the audit log, the reporting date and the demo reset. | The seed credential mode follows the target DB: `--remote` or a non-local host means the deployed mode (`DEMO_ADMIN_PASSWORD` ≥ 16 characters, otherwise the account is inactive). Unit test. | Diego, Dana | **Corrected in ADR-003 D-13** (tagged). Verify in code. |
| DR-02 | **High** | ADR-002 §3 `DEMO_ADMIN_PASSWORD` row | It said "if unset, the seed must use its documented demo default", and "optionally all demo users". Both contradict matrix §4 and PD-2: the deployed Admin would have a published password. | If unset or too short, the account is inactive. The variable covers the Admin only, is scoped to Production and Functions, and is marked secret. | Theo | **Corrected in ADR-002 §3** (tagged) |
| DR-03 | Medium | `netlify.toml:24`, ADR-002 §9 | The CSP has `style-src 'self' 'unsafe-inline'`, but ADR-003 D-12 has `style-src 'self'`. That gives two different policies, and the relaxation is not needed because `style=` attributes are banned by grep. | Use one shared CSP string with `style-src 'self'`. Add `X-Robots-Tag`. A test compares the middleware and `netlify.toml` values. | Theo, Diego | ADR-002 text corrected. **`netlify.toml` still to change (Theo, H-1)** |
| DR-04 | Medium | ADR-003 D-10 vs matrix §1 step 5 and T-26 | UD-2 submitter refusal was folded into `APPROVER_SAME_AS_COUNTER`, but the matrix and T-26 expect `APPROVER_SAME_AS_SUBMITTER`. The contract has neither the code nor the submitter rule. | Use a separate code. Contract §1.3 step 5, the §1.4 code table and E-40 add the submitter rule and the code. | Marcus (contract), Diego | ADR-003 corrected. **Contract change listed (§6)** |
| DR-05 | Medium | Contract E-08 (around line 385) vs matrix R-14 | Contract E-08 has an exception: "a Supervisor sending only `notes`" may edit Shipped or Cancelled shipments. R-14 (UD-3) locks notes too; the only route is the P-28 correction. | Remove the exception, so the response is 409 `SHIPMENT_LOCKED`. Notes go through the correction action. | Marcus | **Contract change listed (§6)** |
| DR-06 | Low | ADR-003 D-9 | The permission-map sketch used `UD-4`/`UD-3` placeholders and mapped contain to P-14. The matrix now has P-26 (reopen), P-27 (contain), P-28 (correct) and P-29 (resources). Viewer membership of `ALL_ROLES` was implicit. | Use the matrix ids. `ALL_ROLES` includes Viewer. S-01 covers P-26 to P-29. | Diego | Corrected in ADR-003 (tagged) |
| DR-07 | Low | ADR-003 D-5 step 8 | The `next` open-redirect rule did not cover encoded or control-character variants. | Reject control characters and decoded `//` or `\`. Add tests (ADR-003 §8 C-8). | Diego, Quinn | Condition |
| DR-08 | Low | ADR-003 D-2 | `DUMMY_HASH` must use the live `SCRYPT_PARAMS`, or user-enumeration timing differs. | Regenerate it whenever the parameters change (C-2). | Diego | Condition |
| DR-09 | Low | ADR-002 §8, H-4 | Whether a `netlify.toml` context env value or the UI value wins at **Function runtime** is unverified [A]. The design is fail-safe (only the exact string `true` enables reset). | Check for the 404 on the first deploy and record the evidence. | Theo | Condition |
| DR-10 | Low | ADR-002 §10 | Actions are pinned to major tags, not commit SHAs, and `.npmrc` has `legacy-peer-deps=true`. | Pin to SHAs later. Remove `legacy-peer-deps` when the peer range allows. Never use `pull_request_target`. | Theo | Accepted, tracked |
| DR-11 | Low | ADR-003 D-6 / D-14 | Residual abuse risks: distributed guessing is limited only per IP; a signed-in visitor can create `ACCESS_DENIED` rows; scrypt CPU is spent per failed login. | Accepted for a demo. The unpublished password is random and ≥ 16 characters. PD-5 write cap stays a "Should". PD-7 credit watch. | user (via Olivia), Theo | Accepted |
| DR-12 | Info | `astro.config.mjs` | It has `checkOrigin: true`, `inlineStylesheets: 'never'` and `assetsInlineLimit: 0`, no Astro sessions and no edge middleware, which is correct. `security.csp` is left at its default (`false`). | Optionally set `security.csp: false` explicitly, as ADR-003 D-12 lists. | Theo | Optional |

## 5. Decisions

- **npm advisories (10 moderate): ACCEPT and TRACK.** The vulnerable `glob` and `minimatch` code runs only in
  Netlify build and dev tooling (function bundling, file tracing, zipping, the dev server). It processes our
  own repository paths, never request input, and is not on the request path of the deployed function. The
  offered fix (adapter 6.5.13) is incompatible with Astro 7 and is rejected. Re-check this at every dependency
  bump and at release. Use `overrides` only if the upstream fix lands and the build passes. Any high or
  critical advisory blocks.
- **ADR-003 open questions:** A3-1 accept the 5-minute throttle. A3-2 a 16-character minimum, generated
  randomly, with no class rule. A3-4 accept `Sec-Fetch-Site` (`Origin: null` is refused). A3-3 stays with
  Theo.
- **Login CSRF without a pre-session token (O-3a):** accepted (Low; at worst a victim is signed into a
  published demo account).
- **Security plan §15 O-1** (scrypt, timeouts, login CSRF, client IP) is answered by ADR-003. The scrypt
  measurement stays open until the first hosted deploy (T-018).

## 6. Changes needed in files I did not edit (Marcus is editing them)

1. `docs/api/contract.md` §1.3 step 5, the §1.4 code table, and E-40 rules plus the P-19 row of the authorization test table: add
   the R-4 **submitter** rule (UD-2) and 403 **`APPROVER_SAME_AS_SUBMITTER`** (T-26).
2. `docs/api/contract.md` E-08 (around line 385): delete the "Supervisor sending only `notes`" exception
   (R-14).
3. `docs/api/contract.md` §1.3 2a: already refined by ADR-003 (`Sec-Fetch-Site`, unmatched non-GET → 404);
   confirm the text matches D-5 step 2 and D-9 step 0.
4. `netlify.toml` (Theo): use the D-12 CSP string and add `X-Robots-Tag: noindex, nofollow` (H-1).
5. `docs/data-model/*` (Dana or Marcus): no schema change is needed for auth. Confirm that the CHECK
   `approved_by <> submitted_by` and the trigger `cycle_count_approval_guard` exist as ADR-003 D-10 assumes.

## 7. Conditions for Diego (W2 implementation checklist)

These are binding (ADR-003 §8 C-1 to C-10, ADR-002 §14 H-1 to H-7). Short form:

1. Follow the middleware order in ADR-003 D-9 exactly. Fail closed on any exception. An unmatched non-GET
   route returns 404.
2. Compute `siteOrigin` from `request.url`, never from request headers. Refuse `Origin: null`.
3. Apply the content-type allow-list and the 64 KB cap before any body parsing. Duplicate `_csrf` fields are
   refused. Compare tokens with `timingSafeEqual` through `safeEqual`.
4. Store only the SHA-256 of the session token. The cookie is `__Host-sid` (Secure, HttpOnly, SameSite=Lax,
   Path=/) in every build. `sid` is used only when `import.meta.env.DEV` is true.
5. Rotate the session on login. Logout is a POST with the CSRF token. Idle timeout 30 min (5-minute
   throttle), absolute timeout 8 h. Read the role and the `active` flag from `app_user` on every request.
6. Rate limit before scrypt. No lockout. Never read `X-Forwarded-For` yourself.
7. The identity rules (R-1, R-4 counter **and** submitter, R-5, R-7, R-8) run on a locked row inside the
   transaction, with the actor taken from the session. A refusal writes an `ACCESS_DENIED` audit row after
   the rollback.
8. One `PERMISSIONS` map with P-01 to P-29, and one `ROUTES` table. Every handler calls `requireAction`.
   Tests: S-01, S-03 and route coverage.
9. One CSP constant shared with `netlify.toml`. Zero CSP violations (S-21).
10. `DEMO_ADMIN_PASSWORD` is read only in `src/lib/seed/` and `src/lib/env.ts`. A `--remote` seed uses the
    deployed mode. Never log, audit or return the value.
11. No bootstrap endpoint. No `Astro.session`, `sql.unsafe` or `set:html`.

## 8. Re-verification

I will re-verify DR-01 to DR-05 in the W2 code review (unit tests S-30, S-01 and T-26, a `curl -sI` header
check on a local build, and a grep for `DEMO_ADMIN_PASSWORD` references).
