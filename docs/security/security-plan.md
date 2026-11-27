# Security Plan — v1 (V1-CORE)

**Status:** PROPOSED — security-reviewer (Sasha), 2026-11-25 · **Task:** T-015
**Applies to:** Manufacturing Shipping & Inventory Operations Dashboard v1 (Astro SSR + `@astrojs/netlify` + Netlify Database + postgres.js + Chart.js, per [ADR-001](../ADR-001.md) §5 and §8).
**Inputs:** [project-scope.md](../project-scope.md) §3.5, §3.6, §3.7, §4 · [07-software-design.md](../07-software-design.md) §7.2 · [ADR-001](../ADR-001.md) §8 · [PoC report](../poc/poc-report.md) (R-1 CSRF, §3.10 audit) · [permissions-matrix.md](../plan/permissions-matrix.md) (REVIEWED) · [threat-model.md](threat-model.md) · backlog Q-19.
**Finalized by:** ADR-003 auth & sessions (T-009) for the session/CSRF details marked [P].

Tags follow `docs/README.md`: **[R]** researched, **[A]** assumption to verify, **[P]** proposed.
All data is **fictional** (Cobalt Ridge Components, Inc.). Nothing here claims compliance with any standard.

---

## 1. Principles (proportionate for a class prototype)

1. **The server decides.** Every permission, identity rule and status transition is enforced in server code (and, for append-only, in DB triggers). The UI only mirrors it.
2. **Deny by default, fail closed.** Unknown route, unknown role, missing session, middleware error or DB error → no access and no partial write.
3. **Nothing secret in the public repo.** The repository and the demo site are public; assume an attacker reads every line of code and every published demo password.
4. **Protect the Free-plan budget.** On a 300-credit hard limit, abuse that burns credits pauses *all* the owner's Netlify projects. Availability of the demo is an asset (threat model A5).
5. **Keep it small.** v2 items stay v2: SSO, MFA, account lockout policy, encryption at rest beyond provider defaults, formal pen test, compliance (scope §4; docs/07 §7.2).

## 2. Control map (OWASP Top 10:2025 ↔ docs/07 §7.2)

**[R]** OWASP Top 10:2025: A01 Broken Access Control · A02 Security Misconfiguration · A03 Software Supply Chain Failures · A04 Cryptographic Failures · A05 Injection · A06 Insecure Design · A07 Authentication Failures · A08 Software or Data Integrity Failures · A09 Security Logging and Alerting Failures · A10 Mishandling of Exceptional Conditions ([OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/)). [A] A08–A10 names to re-check against the final published list.

| ID | Requirement (v1) | docs/07 §7.2 # | OWASP 2025 | Section | Tests |
|----|------------------|:--------------:|:----------:|---------|-------|
| SEC-01 | Every route requires login except an allow-list; role checked server-side on every write; matrix in permissions-matrix.md | 1 | A01 | §4 | S-01–S-06 |
| SEC-02 | Verifier ≠ packer, approver ≠ counter, R-5/R-7/R-8 rules enforced in the write transaction | 1 | A01, A06 | §4 | S-05, S-06 |
| SEC-03 | CSRF: synchronizer token + content-type allow-list + `checkOrigin` on every state change | 4 | A01, A06 | §5 | S-07–S-09 |
| SEC-04 | Passwords: scrypt, per-user salt, constant-time compare; no plain-text passwords anywhere | 5 | A04, A07 | §3.1 | S-10, S-11 |
| SEC-05 | DB-backed sessions, `__Host-sid` cookie, idle/absolute timeouts, rotation, logout | 5 | A07, A04 | §3.2 | S-12–S-14 |
| SEC-06 | Login rate limiting stored in the DB (no lockout) | 5 | A07 | §3.3 | S-15 |
| SEC-07 | Server-side validation with Zod `.strict()` schemas; size limits | 8 | A06, A05 | §6 | S-16, S-17 |
| SEC-08 | Parameterized SQL only: postgres.js tagged templates; `sql.unsafe` banned | 2 | A05 | §7.1 | S-18 |
| SEC-09 | Output encoding: Astro auto-escape; `set:html`/`innerHTML` with data banned; safe chart JSON | 3 | A05 | §7.2 | S-19 |
| SEC-10 | CSV export guards against formula injection | 3 | A05 | §7.3 | S-20 |
| SEC-11 | Security headers and CSP; HTTPS only; no CORS | 6 | A02 | §8 | S-21 |
| SEC-12 | Generic errors, no stack traces; fail closed | 10 | A02, A10 | §8.3 | S-22 |
| SEC-13 | Append-only audit log of writes, logins and 403s; no secrets or personal data in logs | 9 | A09, A08 | §9 | S-23, S-24 |
| SEC-14 | Secrets only in Netlify env vars; `.gitignore`; gitleaks in CI; GitHub secret scanning | 6 | A02, A04 | §10.1 | S-25 |
| SEC-15 | Dependencies pinned; `npm audit --audit-level=high` gate; moderate advisories tracked | 7 | A03 | §10.2 | S-26 |
| SEC-16 | CI/build integrity: least-privilege GitHub Actions, untrusted fork PRs get no secrets | — | A03, A08 | §10.3 | S-27 |
| SEC-17 | Public demo site: demo-only accounts, unpublished Admin password, env-gated reset with cooldown, abuse/credit limits | 5 | A06, A07 | §11 | S-28–S-30 |
| SEC-18 | Fictional data only; no real-system connections | — | — | §12 | S-31 |

## 3. Authentication (A07, A04)

### 3.1 Password storage
- `node:crypto.scrypt` with **N = 2^17 (131072), r = 8, p = 1**, 16-byte random salt per user (`crypto.randomBytes`), 64-byte key, `maxmem` = 256 MiB (Node's 32 MiB default is too small for these parameters: memory ≈ 128·N·r = 128 MiB). **[R]** These are the OWASP Password Storage Cheat Sheet minimum scrypt parameters ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). If the function memory limit makes this impractical, the OWASP-equivalent **N = 2^15, r = 8, p = 3** (32 MiB) is acceptable [P]. [A] Measure hash time in the function on the first deploy (target < 500 ms).
- Store as one self-describing string, e.g. `scrypt$17$8$1$<salt b64>$<hash b64>`, so parameters can change later without a migration.
- Compare with `crypto.timingSafeEqual`. For an unknown username, still run one scrypt against a fixed dummy hash so response time does not reveal which usernames exist.
- One generic failure message ("Username or password is incorrect"), per US-001.
- No password ever appears in logs, audit entries, error messages, seed output, test snapshots or the repo. Demo passwords are hashed by the seed at run time.
- Password change/reset screens are out of v1 (US-004 deferred). No default credentials exist outside the seed (§11).

### 3.2 Sessions [P; ADR-003 confirms]
- Token: 32 random bytes (`crypto.randomBytes(32)`, base64url). The `sessions` table stores **only SHA-256(token)**, plus `user_id`, `created_at`, `last_seen_at`, `csrf_token`, `expires_at`.
- Cookie: **`__Host-sid`**; `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, **no `Domain`** (the `__Host-` prefix forces these). [A] Browsers accept `Secure` cookies on `http://localhost`; if a dev browser rejects the prefix locally, use the name `sid` **only** when `import.meta.env.DEV` is true, never in builds.
- **Idle timeout 30 min, absolute timeout 8 h.** Both checked server-side on every request; expired rows are deleted.
- Rotate: a new token on every login (never reuse a pre-login token); the old row is deleted.
- Logout is a **POST** with the CSRF token; it deletes the session row and clears the cookie.
- The user's role and `active` flag are read from the `users` row on each request (join on session lookup), so a role change or deactivation takes effect immediately (R-11), and all of that user's sessions are deleted.
- Credit saving: update `last_seen_at` at most once every 5 minutes per session, not on every request.
- Do **not** use Astro sessions (`Astro.session`): the adapter wires them to Netlify Blobs (PoC D8). CI greps for `Astro.session`.

### 3.3 Login rate limiting (no lockout)
- Stored in the DB (`login_attempts`: key, window start, count); in-memory counters do not work in ephemeral functions.
- Limits [P]: **5 failures per (username, client) per 15 min** and **30 failures per client per 15 min**; over the limit → **429** with the generic message and no scrypt work (cheap rejection). Successful login clears the (username, client) counter.
- **No per-account lockout.** On a public site with published usernames, locking an account would let any visitor lock out the whole class (denial of service). Account lockout stays v2 (US-001 out of scope).
- Client key: SHA-256 of (client IP from Netlify's `x-nf-client-connection-ip` header [A verify name] + a random per-database salt generated by the first migration and stored in a `settings` row). This avoids storing raw IPs and needs no extra secret env var. Rows older than 24 h are deleted on write.

## 4. Authorization (A01)

- **Middleware (deny by default):** `src/middleware.ts` runs first on every request. Allow-list without a session: `/login` (GET, POST), static assets under `/_astro/*`, `/favicon.*`, `/robots.txt`. Everything else without a valid session → 401 (`/api/v1/*`) or 302 to `/login` (pages). Requests with no cookie are rejected **without a DB query** (cheap path under abuse).
- **Per-handler checks:** every write handler starts with `requireRole(locals.user, …roles)` using one central table generated from permissions-matrix.md §2 (one `permissions.ts` map: action → roles). A unit test asserts the map equals the matrix (S-01). A route with no map entry is denied.
- **Middleware also enforces** that every non-GET/HEAD request on a route without a declared permission is refused, so a forgotten `requireRole` fails closed.
- **Identity rules in the transaction:** verifier ≠ packer (R-1) and approver ≠ counter (R-4) are SQL conditions inside the write transaction, e.g. `UPDATE shipment SET status='Verified', verified_by=${me} WHERE id=${id} AND status='Packing' AND packed_by <> ${me} RETURNING id`; if no row is returned, a follow-up read decides 403 vs 409. The response order is the one in [API contract §1.3](../api/contract.md) (authoritative, confirmed in T-016 D-9: 401 → 403 Origin → 415/413 → 403 token → 403 role → 400/422 → 403 identity/role-by-state → 409 → 429, with login's 429 checked first). R-5, R-7 and R-8 read the current status/location type from the DB in the same transaction, never from the request.
- **Identity from the session only (R-12):** `packed_by`, `verified_by`, `counted_by`, `approved_by`, `created_by`, audit `user_id` are set from `locals.user.id`. Zod schemas are `.strict()`, so bodies containing them are rejected.
- **No state change on GET (R-13).** GET handlers never write (except the throttled `last_seen_at`).
- **Object-level access:** all records belong to one fictional plant and every role may read them (P-03), so there is no per-owner read filter. The only object-level write rules are R-1, R-4, R-5, R-7, R-8.
- Every 403 for a signed-in user writes an audit entry (`ACCESS_DENIED`, action, entity id). Anonymous 401s are not audited (keeps abuse cheap and the log small).

## 5. CSRF (A01, A06) — PoC finding R-1

All three layers are **required** on every POST/PUT/PATCH/DELETE (ADR-001 §8 #4):

1. **Synchronizer token.** 32 random bytes per session, stored in the session row. Rendered as a hidden `_csrf` field in every form; sent as `X-CSRF-Token` on every `fetch`. Middleware checks it with `timingSafeEqual` **before** the handler or any body parsing beyond the token; missing/wrong → 403 `CSRF_INVALID` + audit entry. Rotates with the session.
2. **Content-type allow-list (server-side).** `/api/v1/*` writes accept only `application/json`; SSR form handlers accept only `application/x-www-form-urlencoded`. `multipart/form-data` is accepted nowhere in v1, because there are no uploads (T-016 D-8; route list in API contract §1.12). On form routes, middleware reads only the `_csrf` field from the body, after the 64 KB limit. Missing, `text/plain` or anything else → **415** before parsing. This closes the PoC gap where a forged-Origin JSON POST returned 200.
3. **Astro `security.checkOrigin: true`** stays on (blocks cross-site form posts), plus `SameSite=Lax` cookies.

Also: the app sends **no CORS headers** (`Access-Control-Allow-Origin` never set), so browsers cannot read cross-origin responses. Login form (pre-session): protected by layers 2 and 3; a pre-session token is optional [P; ADR-003 decides] because login CSRF has little impact here (an attacker could only sign a victim into a published demo account).

## 6. Input validation (A06)

- One Zod schema (from `astro/zod`) per write endpoint and per form, shared between client hints and the server. The **server** validation is the control.
- `.strict()` objects (unknown fields → 400). Types, required fields, enums from allow-lists (statuses, reason codes, 6M categories), numeric ranges (quantities > 0 and below a sane maximum), date ranges, max string lengths (e.g. 200 for short text, 2,000 for notes), max array lengths (e.g. 50 shipment lines).
- Request body limit: reject bodies over **64 KB** (413) before parsing.
- IDs and codes match the formats in the API contract, which equal the DB CHECKs (T-016 D-3, D-12): `SH-####`-style business keys; part number `^[A-Z0-9][A-Z0-9-]{2,29}$` ending in `-<revision>`; lot `^[A-Z0-9][A-Z0-9-]{2,29}$`, upper-cased. `CRC-####-<rev>` and `L<yy><ww>-<nnn>` are seed conventions and UI hints, not server rules.
- Status transitions go only through `POST …/actions/{action}` with per-transition fields (ADR-001 §8 #8); invalid transition → 409.
- Validation errors return field names and messages only, never SQL or stack details.

## 7. Injection and output encoding (A05)

### 7.1 SQL
- postgres.js **tagged templates only** in `src/lib/db.ts` and `src/lib/repos/`. **`sql.unsafe` is banned** (CI grep fails the build). No string-concatenated SQL anywhere.
- Dynamic sort/filter columns come from per-endpoint allow-lists mapped to fixed identifiers; never pass user text to `sql(identifier)`.
- `LIKE`/`ILIKE` search escapes `%`, `_` and `\` in the user value.
- Migrations are static `.sql` files reviewed in PRs.

### 7.2 HTML / JS output
- Astro expression escaping is the default. **`set:html` is banned for any value that can contain user or DB data** (CI grep; any exception needs a reviewer note). No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` or `eval`/`new Function` in client scripts with data.
- Chart data: pass as a `data-*` attribute (escaped by Astro) or as a `<script type="application/json">` data block serialized with `<`, `>`, `&`, U+2028/2029 escaped (`<` …); read it with `JSON.parse`. Do **not** use `define:vars` (it creates inline script and breaks the CSP).
- Chart.js renders labels to canvas (no HTML); keep custom tooltip callbacks text-only (no HTML tooltips).

### 7.3 CSV export (formula injection)
- For every **text** cell from user-controlled or DB string fields: if it starts with `=`, `+`, `-`, `@`, tab (`\t`) or carriage return (`\r`), prefix a single quote `'`. Then apply normal CSV quoting (wrap in `"`, double internal quotes).
- Numeric columns (quantities, which can be negative) are written from typed numbers, not passed through the guard, so `-5` stays a number.
- Response: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<report>-<date>.csv"`, `X-Content-Type-Options: nosniff`. Filenames are built from fixed report codes, never user text.

## 8. Configuration, headers and errors (A02, A10)

### 8.1 Security headers
Set in middleware for SSR responses and in `netlify.toml` `[[headers]]` for static assets [P]:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000
X-Robots-Tag: noindex, nofollow
Cache-Control: no-store            (authenticated SSR pages, /api/v1/*, CSV exports)
```

- **Astro + bundled Chart.js and the CSP:** Chart.js is bundled from npm (no CDN, ADR-001) and needs no `unsafe-eval` [A]. Astro may **inline** small hoisted scripts and stylesheets, which `script-src 'self'` / `style-src 'self'` would block. Either (a) use Astro's built-in CSP hashing if the pinned Astro 7.x provides it [A verify], or (b) set `build.inlineStylesheets: 'never'` and `vite.build.assetsInlineLimit: 0` and keep all scripts in hoisted modules. Chart.js sets canvas sizes through the CSSOM (`element.style`), which `style-src` does not block [A]. Verify with a Playwright test that listens for `securitypolicyviolation` events on every page (S-21). No `'unsafe-inline'` for scripts; if styles truly need it, record it as an accepted Low finding.
- `robots.txt`: `Disallow: /` (reduces crawler traffic and credit use).
- [A] Netlify may already add HSTS on `*.netlify.app`; setting it ourselves is harmless.

### 8.2 Platform configuration
- No debug or dev error overlay in builds; `import.meta.env.DEV` code paths never ship sensitive behaviour.
- Edge middleware stays off (default `classic`, PoC §7); no Netlify Blobs; no `Astro.session`.
- Deploy previews: `DEMO_RESET_ENABLED` unset by default; previews use their own DB branch (ADR-001 F5).
- **Least-privilege DB credentials:** [A] Netlify Database injects one owner-level `NETLIFY_DB_URL`; a separate restricted role may not be available. Accepted risk (threat model AR-4) mitigated by banning `sql.unsafe` and keeping DDL in migrations only.

### 8.3 Errors and exceptional conditions (A10)
- Custom 403/404/500 pages; API errors use the `api-contract` error shape (`code`, `message`, optional `fields`). Never return stack traces, SQL text, constraint names or env values.
- Log the detail server-side (function log) with a short random error id shown to the user.
- **Fail closed:** an exception in middleware, in session lookup or in a permission check → deny (500/403), never "allow". Every write is one transaction (`sql.begin`): any error rolls back status, ledger and audit together (PoC §4).
- DB unreachable or waking → 503 generic message, no retry storm (at most one retry).
- Map known DB errors (unique violation → 409, check violation → 422); everything else → 500.

## 9. Audit logging (A09)

- `audit_log` (append-only, DB trigger blocks UPDATE/DELETE; PoC §3) records: user id, UTC timestamp, action, entity, record id, changed fields old → new, and for denials the attempted action. Written **in the same transaction** as the change.
- Logged events: every create/update/status change/approval/archive; login success; login failure; logout; 403 for signed-in users (role, identity rule, CSRF); demo reset (written **before** the data is cleared; the reset then **truncates `audit_log`** with the business tables and re-inserts one `DEMO_RESET` row after the reseed. Decided in T-016 D-5, in line with PD-9; the pre-reset row survives only when the reset fails. Test S-29 checks the re-inserted row); reporting-date and target changes.
- **Never logged:** passwords (even wrong ones), session tokens or their hashes, CSRF tokens, `NETLIFY_DB_URL`, env values, full request bodies.
- **Personal-data minimisation on a public site:** no IP addresses in `audit_log` (only the hashed client key in `login_attempts`, §3.3). For a failed login, record the attempted username **only if it matches an existing user**; otherwise record `unknown` (people sometimes type a password into the username box).
- Read access: Admin only (P-24), read-only screen. Alerting is out of scope for v1 (manual review); see AR-6.

## 10. Secrets, supply chain and CI (A02, A03, A04, A08)

### 10.1 Secrets
| Variable | Where set | Secret? | Notes |
|----------|-----------|:-------:|-------|
| `NETLIFY_DB_URL` | Injected by Netlify | Yes | Never logged or printed; never in the repo |
| `DEMO_ADMIN_PASSWORD` | Netlify env (production only), marked secret | Yes | Used by seed/reset to hash `demo.admin`'s password; unset → Admin created inactive on the deployed site (§11) |
| `DEMO_RESET_ENABLED` | Netlify env per context | No | `true` only where the user wants the reset |

- **Finding SR-01 (Medium, open):** the repository has **no root `.gitignore`** (only `spikes/poc-astro-netlify-db/.gitignore`). Before the app scaffold, add one covering at least `node_modules/`, `dist/`, `.astro/`, `.netlify/` (includes local DB data and `state.json`), `.env`, `.env.*` (except `.env.example`), `test-results/`, `playwright-report/`, `*.pem`, `*.key`. Owner: devops-engineer (Theo).
- `.env.example` documents variable names with empty values only.
- **gitleaks** runs in CI on every push/PR (use the gitleaks CLI binary or the action with full history on first run; [A] the gitleaks GitHub Action needs a licence key only for organization-owned repos, the repo is personal). Failure blocks merge.
- Turn on **GitHub secret scanning and push protection** (free for public repos [A verify]).
- If a secret is ever committed: rotate it first (Netlify UI), then clean history; a public repo must be assumed already scraped.
- Agents and reports reference secret locations only, never values.

### 10.2 Dependency policy
- Exact versions in `package.json`, `package-lock.json` committed, installs with `npm ci`. Direct runtime deps limited to ADR-001 §8 #7 (astro, @astrojs/netlify, @netlify/database, postgres, chart.js; zod via Astro). Any new runtime dependency needs a short justification in the PR and Sasha's review.
- Astro pinned at a version that includes the `checkOrigin` advisory fix (ADR-001; PoC pins Astro 7.4.13).
- CI gate: **`npm audit --audit-level=high`** (exit ≠ 0 on high/critical) fails the build. A high/critical advisory blocks release until fixed or explicitly accepted by the user with a written reason.
- **Never run `npm audit fix --force`** (it downgrades `@astrojs/netlify` to 6.5.13, PoC §10). Use targeted upgrades or `overrides` only after testing.
- **Moderate advisories — tracked, accepted for v1 (AR-3):** the 10 moderate `glob`/`minimatch` ReDoS/DoS advisories via `@astrojs/netlify > @netlify/vite-plugin > @netlify/dev > … > zip-it-and-ship-it / archiver`. Reason: build/dev tooling, not reachable from the request path, no attacker-controlled glob patterns. Tracking: each security review records `npm audit --json` counts (moderate/high/critical) and the advisory IDs in `docs/security/review-<date>.md`; re-check on every dependency bump and before release; an **increase** in moderate count or any moderate in a request-path package (`astro` runtime, `postgres`, `chart.js`, `@netlify/database` and its `pg`/`ws`/`waddler`/`@neondatabase/serverless`) is treated as High until triaged.
- Enable **Dependabot alerts** (free). Dependabot *version-update PRs* stay off or monthly-grouped, because each PR can trigger a deploy preview that costs credits.
- No CDN scripts or fonts.

### 10.3 CI and build integrity
- GitHub Actions workflows set `permissions: contents: read`; actions pinned to a major version from verified publishers (or a commit SHA for third-party actions such as gitleaks).
- CI needs **no secrets** (tests use `@netlify/database-dev`). Never add `NETLIFY_AUTH_TOKEN` or DB URLs to GitHub secrets for v1.
- Do not use `pull_request_target`.
- Netlify: [A verify in the UI] require approval for deploy previews from **fork PRs** / untrusted contributors and keep sensitive variables (marked secret) out of untrusted builds. Otherwise anyone can open a PR that runs arbitrary build code and spends credits.
- Production deploys only from `main`, only with user approval (CLAUDE.md rule 6).

## 11. Public demo site (Q-19) — proportionate approach

The demo is public, the repo is public and some passwords are published. Goal: a visitor can explore and try workflows, but cannot take over administration, see other visitors' data, or burn the credit budget easily.

| # | Control | Owner |
|---|---------|-------|
| PD-1 | **Demo-only accounts:** only the 7 seeded fictional users exist; no sign-up, no password reset, no email sending. | Dana, Diego |
| PD-2 | **Published:** passwords for `demo.viewer` (recommended), `demo.shipper1/2`, `demo.receiver`, `demo.quality`, `demo.supervisor` on the login page and README, labelled demo-only. **Not published:** `demo.admin` on the deployed site — its password comes from the secret `DEMO_ADMIN_PASSWORD`; if unset, the Admin account is inactive. Locally and in CI, all 7 use documented demo passwords. | Dana, Theo, user |
| PD-3 | **Env-gated Admin reset:** `DEMO_RESET_ENABLED=true` + Admin + CSRF + typed confirmation + **10-min cooldown** (429) + audit entry; returns 404 when disabled; ends all sessions; rebuilds demo users (undoes any vandalism, including to targets and lookups). | Diego |
| PD-4 | **Reset cadence:** **manual** reset by the presenter before each class session. No scheduled (nightly) reset by default: each run wakes the DB (≥ 5 min of compute), which costs credits every day. A scheduled reset needs Theo's credit estimate and user approval. | Theo, user |
| PD-5 | **Rate limits:** login (§3.3); reset cooldown; [P, Should] per-session write cap of 60 writes/min (counter on the session row) → 429. | Diego |
| PD-6 | **Cheap rejection paths:** no-cookie requests are rejected without a DB query; static assets are served from the CDN; `robots.txt Disallow: /` and `X-Robots-Tag: noindex` keep crawlers away; body size cap 64 KB. | Diego, Theo |
| PD-7 | **Credit watch and kill switch:** check Netlify usage weekly and after each class session (Free-plan rule). If usage spikes: (1) run the reset, (2) [P] Admin toggles a DB setting "demo read-only mode" (all writes → 503, no redeploy needed), (3) if needed, the user disables the site or stops builds in the Netlify UI. No plan upgrade, no auto-recharge, no purchase without the user's explicit approval. | Theo, user |
| PD-8 | **Visible warnings:** "DEMO – FICTIONAL DATA" banner on every page plus a line on the login page: "Public demo. Do not enter real or personal information. Data is reset regularly." | Felix |
| PD-9 | **No visitor data kept:** no IPs in the audit log; hashed client keys deleted after 24 h; free-text fields are fictional demo data and are wiped by reset. | Diego |
| PD-10 | **Host-level access control** (Netlify password protection) is not used: [A] it is a paid-plan feature, and the Free-plan rule forbids purchases without approval. | — |

Residual risk (accepted, AR-1): any visitor can make silly or offensive edits with an operational account until the next reset; the class presenter resets before demos.

## 12. Fictional-data policy

- Only the fictional cast from scope §3.6 and the `fictional-data-guardrails` skill: Cobalt Ridge Components, the 6 fictional customers, 4 suppliers, 4 carriers; `CRC-####-<rev>`, `SH-####`, `PE-####`, `RC-####`, `L<yy><ww>-<nnn>`; fictional tracking prefixes `SLP`/`HFL`/`TAX` that match no real carrier format.
- `example.com` emails, `555-01xx` phone numbers, obviously fake user names.
- No outbound network calls from the app (no ERP/MES/WMS/EDI/carrier/aerospace integration; v2 and mocked). [P] The CSP `connect-src 'self'` enforces this in the browser; a code review checks for server-side `fetch` to external hosts.
- No compliance claims (AS9100, ISO 9001, ITAR, CMMC). The README lists the consciously deferred controls (SSO, MFA, lockout, encryption at rest beyond provider defaults, pen test).

## 13. Security test list (what Quinn and Diego automate)

Owner: **D** = Diego (integration tests in Vitest against `@netlify/database-dev`), **Q** = Quinn (Playwright e2e / acceptance), **T** = Theo (CI checks). Every test runs in CI unless marked.

| ID | Test | Owner | Maps to |
|----|------|:-----:|---------|
| S-01 | Unit: the `permissions.ts` map equals permissions-matrix.md §2 (every action × role); a route without an entry is denied | D | SEC-01 |
| S-02 | Role-matrix integration suite: for **every write endpoint**, each role not allowed → 403 and **no row changes** (checksum of affected tables); allowed role → success. Covers T-6 to T-11, T-22 | D | SEC-01 |
| S-03 | Every protected page and endpoint without a session → 401 / redirect (T-12); public allow-list is exactly `/login`, assets, `robots.txt` | D, Q | SEC-01 |
| S-04 | e2e: hidden buttons are also blocked server-side (direct POST from a Viewer/Shipping browser session) | Q | SEC-01 |
| S-05 | Verifier ≠ packer T-1 to T-5, incl. Supervisor (T-4) and rework (T-5); concurrent verify by the packer and another user does not produce a self-verification | D, Q | SEC-02 |
| S-06 | Approver ≠ counter (T-15), R-5 (T-9), R-7 (T-13, T-19), R-8 (T-18), identity fields in body rejected (T-16) | D | SEC-02 |
| S-07 | For every write route: forged `Origin` + `application/json` + no token → 403, no change (the PoC R-1 case) | D | SEC-03 |
| S-08 | Wrong/missing content type → 415 (T-17); valid token + correct type → success | D | SEC-03 |
| S-09 | Logout and reset via GET → 405/no effect (T-21); responses carry no `Access-Control-Allow-Origin` | D | SEC-03 |
| S-10 | Stored password values: scrypt format, distinct salts for equal passwords, never equal to the demo password (US-002) | D | SEC-04 |
| S-11 | Login: wrong password and unknown user return the same message and status | D | SEC-04 |
| S-12 | Cookie flags on login response: name `__Host-sid`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`; DB stores only the hash | D | SEC-05 |
| S-13 | Session rotates on login; logout deletes the row and the old cookie gets 401 | D | SEC-05 |
| S-14 | Idle (30 min) and absolute (8 h) expiry with a fake clock; deactivated user's session stops working | D | SEC-05 |
| S-15 | 6th failed login for one username+client in 15 min → 429; other users unaffected; no lockout after the window | D | SEC-06 |
| S-16 | Zod: unknown fields, over-length strings, negative/oversized quantities, bad enums, bad ID formats → 400/422 with no SQL detail | D | SEC-07 |
| S-17 | Body > 64 KB → 413 | D | SEC-07 |
| S-18 | CI grep fails on `sql.unsafe`, `set:html`, `innerHTML`, `eval(`, `new Function`, `define:vars`, `Astro.session` in `src/` | T | SEC-08, SEC-09 |
| S-19 | XSS payload `<script>alert(1)</script>` and `"><img src=x onerror=alert(1)>` saved in a note / customer name renders as text on list, detail, dashboard and chart pages (no dialog, no CSP violation) | Q | SEC-09 |
| S-20 | CSV export: cells `=1+1`, `+cmd`, `-2+3`, `@SUM(A1)`, `\t=1` come out prefixed with `'`; numeric `-5` stays `-5`; headers `text/csv` + attachment | D | SEC-10 |
| S-21 | Headers present on SSR, API and static responses (§8.1); Playwright reports **zero** `securitypolicyviolation` events on every page incl. charts | Q, T | SEC-11 |
| S-22 | Forced DB error → generic 500 with error id, no stack/SQL in body; mid-transaction failure leaves no partial ledger/audit rows | D | SEC-12 |
| S-23 | Each write, login success/failure, logout and 403 writes one audit row; UPDATE/DELETE on `audit_log` rejected by trigger | D | SEC-13 |
| S-24 | Audit and function logs contain no password, token, CSRF token, IP address or `NETLIFY_DB_URL` (search the test log output and the audit table for the known test values) | D | SEC-13 |
| S-25 | gitleaks passes on the full history; `.gitignore` covers `.env`, `.netlify/` | T | SEC-14 |
| S-26 | `npm audit --audit-level=high` exits 0; moderate count recorded in the review | T | SEC-15 |
| S-27 | Workflow lint: `permissions: contents: read`, no `pull_request_target`, no secrets referenced | T | SEC-16 |
| S-28 | Reset: flag off → 404; non-Admin → 403; second reset < 10 min → 429; reset ends all sessions (T-20) | D | SEC-17 |
| S-29 | After reset, seed checksum equals a fresh seed and the reset audit entry exists | D | SEC-17 |
| S-30 | Seed with `DEMO_ADMIN_PASSWORD` unset in "deployed" mode → `demo.admin` inactive; with it set → login works (value never printed) | D | SEC-17 |
| S-31 | Seed data check: only fictional names from the cast, `example.com` emails, tracking prefixes `SLP/HFL/TAX`; no outbound `fetch` to external hosts in `src/` (grep) | D, T | SEC-18 |

Manual (pre-release, Sasha): review of `src/middleware.ts`, `permissions.ts`, the verify/approve/ship/reset handlers, `netlify.toml` headers and the Netlify site settings (env vars, fork-PR policy, auto-recharge off).

## 14. Release sign-off checklist (Sasha, before any production deploy)

Critical/High findings block release until re-verified (security-review-checklist).

- [ ] `docs/security/review-<date>.md` written for the release candidate: scope, commands and outputs, findings with severity/file:line/fix/owner.
- [ ] S-01 to S-31 green in CI on the release commit (link the run); no skipped security tests.
- [ ] Role-matrix suite covers every write route in the API contract (count routes vs tests).
- [ ] CSRF: forged-Origin JSON test (S-07) passes for every write route.
- [ ] `npm audit --audit-level=high` exit 0; moderate advisories listed and unchanged or reduced (AR-3).
- [ ] gitleaks clean on full history; root `.gitignore` present (SR-01 closed); no `.env` tracked (`git ls-files | grep -i env`).
- [ ] CI greps clean (`sql.unsafe`, `set:html`, `innerHTML`, `eval`, `define:vars`, `Astro.session`).
- [ ] Headers and CSP verified on the **deployed preview or production URL** (`curl -sI`), zero CSP violations in the Playwright run.
- [ ] Cookie flags verified on the deployed site (`__Host-sid`, Secure, HttpOnly, SameSite=Lax).
- [ ] Netlify settings checked by the user/Theo: `DEMO_ADMIN_PASSWORD` set as secret (production only), `DEMO_RESET_ENABLED` as intended per context, fork-PR deploy previews require approval, auto-recharge **off**, plan = Free, current credit usage recorded.
- [ ] Deployed `demo.admin` password is not in the repo, README or login page; published passwords are labelled demo-only.
- [ ] Banner and "do not enter real information" notice visible; README lists deferred controls and no compliance claims.
- [ ] Seed is fictional only (S-31); no real-system connections.
- [ ] Accepted risks in threat-model.md §6 re-read and still valid; any new accepted risk approved by the user.
- [ ] Sign-off line recorded in the review: **APPROVED / APPROVED WITH CONDITIONS / BLOCKED**, date, commit SHA.

## 15. Open items

| # | Item | Owner |
|---|------|-------|
| O-1 | **Answered by ADR-003 (accepted 2026-11-27, T-027)**: timeouts, login-form CSRF (O-3a), client IP (`context.clientAddress`). Still open: the scrypt timing measurement on the first hosted deploy (T-018) | Marcus + Sasha |
| O-2 | API contract: error codes and response order from permissions-matrix §1 | Diego + Marcus |
| O-3 | Astro 7.x CSP support vs. disabling inlining (§8.1) | Marcus / Felix, verify in build |
| O-4 | Netlify fork-PR / sensitive-variable settings and password-protection plan availability (re-verify in the account UI) | Theo + user |
| O-5 | SR-01 root `.gitignore` before scaffold | Theo |
| O-6 | Backlog updates (US-011, US-017, US-044, US-081, Q-19) | Priya |
