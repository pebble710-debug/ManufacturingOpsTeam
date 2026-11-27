# ADR-003: Authentication, sessions, CSRF and the request pipeline

Status: **Accepted — reviewed by security-reviewer (Sasha) 2026-11-27, approved for implementation**
(binding conditions in §8; review report `docs/security/review-2026-11-27-design.md`, task T-027).
Proposed 2026-11-26.
Date: 2026-11-26   Author: software-architect (Marcus)   Task: T-022 (W1), part A (formerly T-009)
Builds on: [ADR-001](../ADR-001.md) §5 and §8 (accepted conditionally) · [security-plan.md](../security/security-plan.md)
§3–§5, §8, §9, §11 · [api/contract.md](../api/contract.md) §1.2, §1.3, §1.8, §1.12, E-02–E-04, E-52 ·
[permissions-matrix.md](../plan/permissions-matrix.md) R-1–R-13 · [build-plan.md](../plan/build-plan.md) UD-2, UD-3, UD-4 ·
[schema.md](../data-model/schema.md) §4.1 and §9 (`app_user`, `session`, `login_attempt`, `setting`).

> Tags: **[R]** verified in a source listed in §7 (accessed 2026-11-26) · **[A]** assumption, still to verify ·
> **[P]** proposal. All data is fictional (Cobalt Ridge Components, Inc.). This ADR adds no external
> integration, no paid service and no new runtime dependency. Everything here uses `node:crypto`,
> postgres.js and Astro 7.4.13, which are already pinned.

---

## 1. Context

ADR-001 §8 fixes the outline: scrypt passwords, DB-backed sessions, the `__Host-sid` cookie, Astro
`checkOrigin`, a synchronizer CSRF token, and content-type enforcement. The last two are required
because of PoC finding R-1: a forged-Origin JSON POST changed state. The security plan (§3–§5) proposes
parameters and leaves the items marked [P] to this ADR. The contract (§1.3) fixes the order of checks.
This ADR turns those inputs into decisions concrete enough that Diego can write `src/lib/auth/**`,
`src/lib/http/**` and `src/middleware.ts` without having to invent anything.

Constraints:
- **Ephemeral Netlify Functions:** no in-memory state. Sessions, rate limits and locks live in Postgres
  (ADR-001 F3, scope AC-10).
- **Free plan (300 credits):** abuse paths must be cheap. A request with no cookie is rejected without a
  DB query, and a throttled login does no scrypt work.
- **Public repo, public demo:** six demo passwords are published. The deployed Admin password is not
  (security plan PD-2).
- **Two surfaces, one service layer** (contract §1.12): urlencoded HTML forms with PRG, and JSON under
  `/api/v1`.
- **No `Astro.session`.** The Netlify adapter backs it with Netlify Blobs (PoC D8).

## 2. Options considered

| # | Question | Options | Chosen |
|---|----------|---------|--------|
| O-1 | Session mechanism | (a) **Opaque random token in a cookie, SHA-256 stored in `session`** · (b) signed stateless cookie or JWT (no DB row) · (c) Astro sessions (Netlify Blobs) | **(a)**. (b) cannot be revoked at logout, on role change or on deactivation without a deny-list, which is a DB table anyway (R-11 needs immediate revocation). (c) is banned (PoC D8, ADR-001). |
| O-2 | CSRF token | (a) **Synchronizer token per session, stored in the session row** · (b) double-submit cookie · (c) Origin check only | **(a)**. (b) adds a second cookie and needs signing to resist cookie tossing. (c) is what failed in the PoC. (a) costs nothing, because the session row is read anyway. |
| O-3 | Login-form CSRF (no session yet) | (a) **Origin / Sec-Fetch-Site check + content-type allow-list + SameSite** · (b) pre-session token (anonymous session row, created by a POST) | **(a)**. Login CSRF can at worst sign a victim into a *published* demo account. (b) costs a DB write for every anonymous visitor (credits) and reintroduces anonymous session rows. Revisit if the threat model changes. |
| O-4 | Password hashing | (a) **`node:crypto` scrypt** · (b) argon2id (native npm module) · (c) bcrypt (npm) | **(a)**. It needs no dependency and no native build on Netlify, and its OWASP parameters are documented. (b) is preferred by OWASP but adds a native dependency (supply chain, build risk). (c) has a 72-byte input limit and adds a dependency. |
| O-5 | Login rate limit | (a) **DB fixed-window counters per (username, client) and per client** · (b) in-memory · (c) per-account lockout | **(a)**. (b) does not work in ephemeral functions. (c) lets any visitor lock out the published demo accounts (security plan §3.3). |
| O-6 | Where the role check lives | (a) **One route table + permission map used by middleware (base role) and services (conditional rules)** · (b) a `requireRole()` call in each handler only | **(a)**, with a per-handler `requireAction()` as a second line. With (b) alone, a forgotten call fails open. (a) fails closed, because a route with no entry is refused. |
| O-7 | CSP for Astro pages | (a) **CSP header from middleware; no inline script or style (Astro inlining disabled)** · (b) Astro 7 `security.csp` (hash-based) | **(a)** now, **(b)** as the fallback. (a) is one static header that is easy to test (S-21). (b) exists in 7.4.13 [R] but would add per-page hashes, and `frame-ancestors` still needs a header. |

**Scored evaluation** (ADR criteria; 3 = best). Only the rows with a real alternative are shown.

| Criterion (weight) | O-1a | O-1b | O-2a | O-2b | O-3a | O-3b | O-4a | O-4b |
|--------------------|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|
| Netlify with persistent shared data (H) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2 |
| Simplicity for the team (H) | 3 | 2 | 3 | 2 | 3 | 2 | 3 | 2 |
| Supports v1 scope: roles, audit, revocation (H) | 3 | 1 | 3 | 3 | 3 | 3 | 3 | 3 |
| Security posture (M) | 3 | 2 | 3 | 2 | 2 | 3 | 2 | 3 |
| Local dev and tests easy (M) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2 |
| Free-tier cost (M) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 3 |
| **Weighted total (H = 3, M = 2)** | **45** | 34 | **45** | 40 | **43** | 36 | **43** | 38 |

## 3. Decision

### D-1 Module layout (Diego owns these files; names are binding, internals are not)

| File | Exports (signature sketch) | Notes |
|------|----------------------------|-------|
| `src/lib/env.ts` | `appEnv(): 'local' \| 'deployed'` · `isDemoResetEnabled(): boolean` | §D-13. The only place that reads `process.env` for mode decisions. |
| `src/lib/clock.ts` | `realNow(): Date` (injectable for tests: `setClockForTests(fn)`) | All auth timing uses it (S-14 fake clock). The business clock (contract §1.6) is a separate helper. |
| `src/lib/auth/password.ts` | `hashPassword(plain): Promise<string>` · `verifyPassword(plain, stored \| null): Promise<boolean>` · `needsRehash(stored): boolean` · `SCRYPT_PARAMS` · `DUMMY_HASH` | D-2 |
| `src/lib/auth/tokens.ts` | `newToken(): string` (32 random bytes, base64url, 43 chars) · `sha256(token): Buffer` · `safeEqual(a: string, b: string): boolean` | `safeEqual` returns false on a length mismatch, otherwise `crypto.timingSafeEqual`. |
| `src/lib/auth/cookies.ts` | `SESSION_COOKIE` · `sessionCookieOptions(expiresAt)` · `setSessionCookie(cookies, token, expiresAt)` · `clearSessionCookie(cookies)` · `readSessionCookie(cookies): string \| null` | D-4 |
| `src/lib/auth/session.ts` | `createSession(tx, userId, now) → { token, csrfToken, expiresAt }` · `loadSession(sql, token, now) → SessionContext \| { reason: 'missing' \| 'expired' \| 'inactive' }` · `deleteSessionByToken(sql, token)` · `deleteUserSessions(tx, userId)` · `purgeExpiredSessions(sql, now)` | D-3 |
| `src/lib/auth/csrf.ts` | `csrfFromHeader(request): string \| null` · `csrfFromForm(request): Promise<string \| null>` · `checkCsrf(ctx: SessionContext, presented): boolean` | D-8 |
| `src/lib/auth/rate-limit.ts` | `clientKeys(sql, username, clientIp) → { userKey, clientKey }` · `isThrottled(sql, keys, now) → { throttled, retryAfterS }` · `recordFailure(tx, keys, now)` · `clearUserKey(tx, keys)` | D-6 |
| `src/lib/auth/permissions.ts` | `type Role` · `type ActionKey` · `PERMISSIONS: Record<ActionKey, { matrix: string; roles: readonly Role[] }>` · `can(role, action): boolean` · `capabilitiesFor(role): ActionKey[]` | D-9. The single source for API, forms and UI hints. |
| `src/lib/auth/routes.ts` | `ROUTES: RouteSpec[]` · `matchRoute(method, pathname) → { spec, params } \| null` | D-9 |
| `src/lib/auth/guards.ts` | `requireAction(locals, action): void` (throws `HttpError(403, 'FORBIDDEN_ROLE')`) · `denyIdentity(code, details)` (throws an `IdentityDenied` that is audited after rollback) | D-10 |
| `src/lib/auth/login.ts` | `login(sql, { username, password, clientIp, presentedToken }, now) → LoginResult` · `logout(sql, ctx)` | D-5, D-7. Both surfaces call these functions. |
| `src/lib/http/pipeline.ts` | `checkOrigin(request, siteOrigin)` · `checkContentType(request, surface)` · `readBodyCapped(request, 65_536)` | D-8, D-11 |
| `src/lib/http/security-headers.ts` | `applySecurityHeaders(response, { kind: 'page' \| 'api' \| 'csv', deployed })` | D-12 |
| `src/lib/http/errors.ts` | `HttpError`, `errorResponse(err, surface, requestId)` (contract §1.4 envelope; forms per §1.12) | Already in Diego's area. |
| `src/lib/audit.ts` | `audit(tx, entry)` · `auditDenied(sql, entry)` (own short transaction) | Contract §1.8 |
| `src/middleware.ts` | `onRequest`: the pipeline of D-9 | Classic mode (not edge, PoC §7) |

`Astro.locals` (typed in `src/env.d.ts`): `user: { id, username, displayName, role } | null`,
`session: { id, csrfToken, expiresAt, idleExpiresAt } | null`, `capabilities: ActionKey[]`, `requestId: string`,
`route: RouteSpec | null`. Pages render the token through one component, `<CsrfField />` (Felix), which
outputs `<input type="hidden" name="_csrf" value={Astro.locals.session.csrfToken}>`.

### D-2 Password hashing (scrypt)

- **Parameters:** `N = 2^17 (131072), r = 8, p = 1`, 16-byte random salt per hash, 64-byte key,
  `maxmem = 256 MiB` (Node's default `maxmem` of 32 MiB is too small: memory ≈ 128·N·r = 128 MiB). These are
  the OWASP minimum scrypt parameters [R, security plan §3.1].
- **Format:** `scrypt$<log2N>$<r>$<p>$<salt base64url>$<hash base64url>`, e.g. `scrypt$17$8$1$…$…`. This
  matches the DB CHECK `password_hash ~ '^scrypt\$'`. `verifyPassword` parses the parameters from the
  stored string, so the parameters can change later without a migration.
- **Compare** with `crypto.timingSafeEqual` on equal-length buffers.
- **Unknown, inactive or hash-less user:** verify against `DUMMY_HASH`, a constant committed in
  `password.ts` (the scrypt hash of a random string that is thrown away; it is not a secret). The response
  time then does not reveal whether a username exists. Do not compute the dummy hash at cold start
  (that costs about 128 MiB plus one hash).
- **Upgrade on login:** if `needsRehash(stored)` (the parameters differ from `SCRYPT_PARAMS`), re-hash
  inside the successful-login transaction.
- **Measuring cost in a Function [A, to verify on the first hosted deploy, T-018].** Locally, a script
  `scripts/measure-scrypt.ts` (Diego) prints the median and p95 over 10 hashes. On the deployed site, the
  login handler writes one structured log line `auth.scrypt_ms=<n>` to the function log. That line holds
  only the duration: no username, no hash. **Decision rule:** keep 2^17/8/1 if p95 < 500 ms and memory is
  fine (the function default is 1024 MB [R, ADR-001 F3]). Otherwise switch `SCRYPT_PARAMS` to the
  OWASP-equivalent **N = 2^15, r = 8, p = 3** (32 MiB; same strength class). Existing hashes keep working
  and are re-hashed at the next login. Record the measured values in the ADR-002 evidence log.
- Hashing runs on the libuv thread pool (`util.promisify(crypto.scrypt)`). The seed hashes its users
  **sequentially** (seed-plan §2).

### D-3 DB-backed sessions

The table is `session` from migration 0001 (schema.md §4.1). **No new columns are needed.**

| Column | Meaning in this ADR |
|--------|---------------------|
| `token_hash bytea` (32 bytes, unique) | `sha256(token)`; the raw token exists only in the cookie |
| `user_id` | FK `app_user` |
| `csrf_token text` | `newToken()` (43 chars, CHECK ≥ 32) |
| `created_at` | login time (real clock) |
| `last_seen_at` | last recorded activity (throttled, see below) |
| `expires_at` | **absolute** expiry = `created_at + 8 h` |
| `write_window_start`, `write_count` | optional write cap (security plan PD-5; not in V1-CORE unless Olivia adds it) |

- **Lookup (`loadSession`):** if no cookie, return `missing` without a query. Otherwise run one query:
  ```sql
  SELECT s.id, s.user_id, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at,
         u.username, u.display_name, u.role, u.active
    FROM session s JOIN app_user u ON u.id = s.user_id
   WHERE s.token_hash = ${sha256(token)}
  ```
  Then decide in code with `now = realNow()`:
  - no row → `missing`;
  - `now >= expires_at` (absolute 8 h) or `now >= last_seen_at + 30 min` (idle) → delete the row,
    return `expired`;
  - `NOT u.active` → delete the row, return `inactive`.

  The role always comes from `app_user`, never from the cookie or the client (R-11).
- **Idle 30 min, absolute 8 h.** `last_seen_at` is updated **at most every 5 minutes** (security plan §3.2,
  credit saving): `UPDATE session SET last_seen_at = ${now} WHERE id = ${id} AND last_seen_at < ${now} - interval '5 minutes'`.
  This is the only write a GET may perform (R-13 exception). Effect: the idle timeout fires 25 to 30
  minutes after the last real activity. This is accepted and documented in the UI copy as "about 30 minutes".
  `idleExpiresAt` = `last_seen_at + 30 min`, capped at `expires_at`. It is returned by E-02 and E-04.
- **Creation (`createSession`):** `INSERT … (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at)`
  with `created_at = last_seen_at = now` and `expires_at = now + 8 h`.
- **Rotation on login:** a successful login **always** creates a new row with a new token and a new CSRF
  token. If the request carried a session cookie, that row is deleted in the same transaction (it is
  never reused or upgraded). A pre-login cookie value is ignored.
- **Cleanup:** `purgeExpiredSessions` runs inside each successful login transaction:
  `DELETE FROM session WHERE expires_at < now OR last_seen_at < now - interval '30 minutes'`. This is cheap
  and needs no scheduled job (a scheduled job would wake the DB and cost credits).
- **Role change or deactivation** (user management is v1.1; the rule is fixed now): the service that
  changes `app_user.role` or `active` calls `deleteUserSessions(tx, userId)` in the **same transaction**.
  The per-request join already refuses an inactive user, so this is belt and braces. The demo reset
  truncates `session` (contract E-52).
- Multiple concurrent sessions per user are allowed (a demo account is shared by many visitors). There
  is no per-user cap.

### D-4 Cookies

| Mode | Name | Attributes | When |
|------|------|------------|------|
| **Built app** (every `astro build` output: Netlify production, previews, `netlify serve`, CI e2e against a build) | **`__Host-sid`** | `Secure; HttpOnly; SameSite=Lax; Path=/`; **no `Domain`**; `Max-Age` = seconds until `expires_at` | `import.meta.env.DEV === false` |
| **Local dev server** (`astro dev` over `http://localhost`) | **`sid`** | `HttpOnly; SameSite=Lax; Path=/`; no `Domain`; `Max-Age` as above; **no `Secure`** | `import.meta.env.DEV === true` only |

- `import.meta.env.DEV` is a **build-time constant**, so a production bundle cannot emit or accept `sid`.
  The middleware reads only the cookie name for the current mode. A `sid` cookie sent to a deployed site
  is ignored, and so is `__Host-sid` sent to the dev server.
- Why a different dev name: the `__Host-` prefix requires `Secure`. Chromium and Firefox accept `Secure`
  cookies on `http://localhost`, but Safari does not [A, browser behaviour, re-check if Safari is used].
  A non-prefixed dev name works in every browser and is never confused with the real cookie. Playwright
  (Chromium) may run against a local build on `http://localhost` with `__Host-sid` [A, verify in Quinn's
  first e2e run; if it fails, e2e uses the dev server].
- Logout and expiry clear the cookie with the same name, `Path=/`, `Max-Age=0` (and `Secure` in built mode).
- **Test S-12** asserts the built-mode flags on a unit level (`sessionCookieOptions` with `DEV = false`)
  and, at release, with `curl -sI` on the deployed site (security plan §14).

### D-5 Login flow (E-02 JSON and the `/login` form)

Both surfaces call `login()`. They differ only in parsing and in the response. Order, as the
login-specific case of contract §1.3:

1. **Method:** POST only (GET `/login` renders the page; GET `/api/v1/auth/login` → 405).
2. **Origin (2a):** if `Origin` is present it must equal the site origin. If `Origin` is absent and
   `Sec-Fetch-Site` is present, it must be `same-origin` or `none`. Otherwise → 403 `CSRF_INVALID`. A
   request with neither header (curl, tests) passes this step, because a cross-site browser request
   always carries at least one of them. *This refines contract §1.3 2a for **all** state-changing
   requests, not only login.*
3. **Content type and size (2b):** the form accepts only `application/x-www-form-urlencoded`; the API
   accepts only `application/json`. Anything else → 415. Body > 64 KB → 413.
4. **Parse and validate (4):** `{ username: 1..64, password: 1..200 }`, `.strict()`; `username` is trimmed
   and lower-cased. Failure → 400/422 (form: re-render with the generic error summary). No audit.
5. **Rate limit (7, checked first among the costly steps):** `isThrottled` → 429 `TOO_MANY_ATTEMPTS`
   with `Retry-After`, the generic message, **no scrypt and no audit row** (cheap path). Throttled
   attempts are not counted (no write amplification).
6. **Verify:** `SELECT id, password_hash, active, role, display_name FROM app_user WHERE username = ${u}`.
   Then run `verifyPassword(password, row?.active ? row.password_hash : null)` (a missing or inactive user
   is verified against `DUMMY_HASH`).
7. **Failure** (one transaction): `recordFailure`, then audit `LOGIN_FAILED` with
   `changes = { username: <the username if a user row exists, else "unknown"> }`. Respond 401
   `INVALID_CREDENTIALS` "Username or password is incorrect." The response is identical for a wrong
   password, an unknown user and an inactive user (S-11).
8. **Success** (one transaction): delete the presented session (if any), `purgeExpiredSessions`,
   `createSession`, `clearUserKey`, `UPDATE app_user SET last_login_at = now` (plus a re-hash if needed),
   audit `LOGIN_SUCCESS`. Then set the cookie.
   - **API:** 200 with the E-02 body (`user`, `csrf_token`, `session.expires_at`, `session.idle_expires_at`).
   - **Form:** 303 to `next` if it is a **relative path** that starts with a single `/` (not `//`, not `/\`,
     no scheme) and matches a page route in `ROUTES`. Otherwise 303 to `/dashboard`.

There is **no pre-session CSRF token** (O-3; E-01 stays withdrawn). Astro `checkOrigin: true` stays on
and rejects cross-site urlencoded posts before our middleware runs. Its 403 is Astro's plain-text
response, not our envelope. That is acceptable: only forged requests reach it.

### D-6 Login rate limit (DB-stored)

- **Keys:** `client_key_salt` is read once per cold start from `setting` (system row, created by
  migration 0001) and cached in module scope, which is safe because it never changes.
  `clientKey = 'c:' + hex(sha256(salt + '\0' + ip))`;
  `userKey = 'u:' + hex(sha256(salt + '\0' + username + '\0' + ip))`. Both are ≤ 128 chars (DB CHECK 8..128).
  No raw IP and no raw username is stored (PD-9).
- **Client IP:** use Astro's `context.clientAddress`. The Netlify adapter fills it from the Function's
  `context.ip` in production and from `x-nf-client-connection-ip` / the socket address in the dev server
  [R, adapter 8.2.14 source]. **Never** read `X-Forwarded-For` ourselves. If `clientAddress` throws or is
  empty, use the literal `unknown`, so all such clients share one bucket (fails closed).
- **Windows:** fixed 15-minute buckets, `window_start = floor(now / 15 min)`. Throttled when the user key's
  current bucket has `fail_count >= 5` **or** the client key's has `>= 30`. `Retry-After` is the number of
  seconds until the bucket ends. Fixed windows allow at most two windows' worth at a boundary, which is
  accepted for a demo.
- **Writes:** `INSERT … ON CONFLICT (key, window_start) DO UPDATE SET fail_count = login_attempt.fail_count + 1, updated_at = now`
  for both keys. On each failure, also `DELETE FROM login_attempt WHERE window_start < now - interval '24 hours'`.
  A successful login deletes the user key's rows (`clearUserKey`). The client counter stays.
- **No per-account lockout** (security plan §3.3).

### D-7 Logout

- Routes: form `POST /logout` and API `POST /api/v1/auth/logout` (GET → 405, R-13). The full pipeline
  runs, including the CSRF token (a forged logout is harmless but is still refused).
- Effect: `deleteSessionByToken`, audit `LOGOUT` (same transaction), `clearSessionCookie`. API → 204.
  Form → 303 `/login?signed_out=1`.
- With an expired or missing session: API → 401. Form → 303 `/login`. The cookie is cleared anyway.

### D-8 CSRF synchronizer token and content-type allow-list

- **Token:** one per session (`session.csrf_token`). It is created at login and rotates only with the
  session. It is not per request, so back-button forms keep working.
- **Where it is presented:** API writes send the `X-CSRF-Token` header. Form posts send exactly one
  `_csrf` field. Two or more `_csrf` fields → invalid. The token never appears in a URL.
- **Reading the form token in middleware:** after the content-type and size checks,
  `csrfFromForm` reads `request.clone()` as text (≤ 64 KB, already bounded), parses it with
  `URLSearchParams` and takes `getAll('_csrf')`. The handler later reads the original body. The form
  adapter (`src/lib/http/form.ts`) drops `_csrf` before Zod (contract §1.12).
- **Compare:** `safeEqual(ctx.csrfToken, presented)`. Missing or wrong → 403 `CSRF_INVALID` plus an
  `ACCESS_DENIED` audit row (`changes.code = 'CSRF_INVALID'`, method, path; **never the token values**).
- **Content-type allow-list** (`checkContentType`) for POST/PUT/PATCH/DELETE:
  - parse the media type case-insensitively;
  - the only parameter allowed is `charset=utf-8`;
  - `/api/v1/*` accepts `application/json`, and form routes accept `application/x-www-form-urlencoded`;
  - `multipart/form-data`, `text/plain`, a missing header, or the other surface's type → **415**
    `UNSUPPORTED_MEDIA_TYPE`, before any body is parsed;
  - a zero-length JSON body is read as `{}`.
- **Body limit:** `readBodyCapped` rejects bodies over 65,536 bytes with 413 `PAYLOAD_TOO_LARGE`. It
  checks `Content-Length` first and streams with a counter when the header is absent.
- **Fetch enhancement (optional):** client scripts read the token from
  `<meta name="csrf-token" content="…">`, rendered by the layout for signed-in users, and send it as
  `X-CSRF-Token`. This is a meta tag, not an inline script, so it is CSP-safe.

### D-9 Deny-by-default middleware and the single permission map

**Permission map (`permissions.ts`).** One entry per matrix action (permissions-matrix §2, plus the
UD rows the matrix is gaining). The keys are symbolic, and `matrix` holds the P-id so that test S-01 can
compare the map with the matrix table:

```ts
export const PERMISSIONS = {
  'session':               { matrix: 'P-01', roles: ALL_ROLES },
  'dashboard.read':        { matrix: 'P-02', roles: ALL_ROLES },
  'records.read':          { matrix: 'P-03', roles: ALL_ROLES },
  'shipment.write':        { matrix: 'P-04', roles: ['Supervisor', 'Shipping'] },
  'shipment.mark-ready':   { matrix: 'P-05', roles: ['Supervisor', 'Shipping'] },
  'shipment.start-packing':{ matrix: 'P-06', roles: ['Supervisor', 'Shipping'] },
  'shipment.reopen':       { matrix: 'P-26', roles: ['Supervisor', 'Quality'] },   // UD-4, R-15 [Sasha T-027: matrix row now exists]
  'shipment.verify':       { matrix: 'P-07', roles: ['Supervisor', 'Shipping', 'Quality'] },   // + R-1
  'shipment.ship':         { matrix: 'P-08', roles: ['Supervisor', 'Shipping'] },
  'shipment.correct':      { matrix: 'P-28', roles: ['Supervisor'] },               // UD-3, R-14 [Sasha T-027]
  // … P-09 … P-25 exactly as permissions-matrix §2; 'error.contain' = P-27 (Supervisor, Quality; UD-4, R-15);
  // 'resources.read' = P-29 (ALL_ROLES). ALL_ROLES = the six roles incl. Viewer. [Sasha T-027 correction]
} as const satisfies Record<string, { matrix: string; roles: readonly Role[] }>;
```

**Route table (`routes.ts`).** Every route the app serves has exactly one entry:
`{ method, pattern, surface: 'api' | 'form' | 'page' | 'public', action: ActionKey | 'public', flag?: 'DEMO_RESET_ENABLED' }`.
Examples: `POST /api/v1/shipments/:id/actions/verify → api, shipment.verify` and
`POST /shipments/:no/pack-verify → form, shipment.verify`. Page GETs map to `dashboard.read` or
`records.read`, and `/admin/*` pages to their admin action. Public entries: `GET|POST /login`,
`GET /robots.txt`, `GET /favicon.*`, and `/_astro/*` (static, normally served by the CDN before any
function runs).

**The middleware (`src/middleware.ts`)** runs these steps in this order (contract §1.3):

| Step | Check | Failure |
|------|-------|---------|
| — | Assign `requestId` | — |
| 0 | `matchRoute`. No entry: a GET/HEAD continues to step 1 and then to Astro's 404 page; **any other method → 404 `NOT_FOUND` without running a handler** (a forgotten route fails closed). Method not allowed for a known pattern → 405. | 404 / 405 |
| 1 | Public route → skip to step 2a (login only). Otherwise `readSessionCookie`: no cookie → 401 / 303 `/login?next=…` **without a DB query**; else `loadSession` → 401 with `details.reason`. | 401 |
| 1b | Route has `flag` and `isDemoResetEnabled()` is false → 404 `FEATURE_DISABLED` (contract E-52: before CSRF) | 404 |
| 2a | State-changing method: Origin / `Sec-Fetch-Site` rule (D-5 step 2) | 403 `CSRF_INVALID` + audit |
| 2b | Content type for the route's surface; body ≤ 64 KB | 415 / 413 |
| 2c | Synchronizer token (D-8); not for `/login` | 403 `CSRF_INVALID` + audit |
| 3 | `can(user.role, route.action)` (base permission, Y and Y\* both pass) | 403 `FORBIDDEN_ROLE` + audit |
| — | Set `locals`, call `next()`, apply security headers (D-12) to the response | — |
| 4–7 | Inside the handler/service: Zod (400/422) → load and lock the row (404) → identity / role-by-state rules (403, D-10) → state (409) → limits (429) | as contract |

- Fail closed: any exception in steps 0–3 → 500 generic (never `next()`).
- Every handler also starts with `requireAction(locals, '<action>')`. This duplicates step 3, so a route
  table mistake is caught twice (S-02).
- **Test S-01** compares `PERMISSIONS` with permissions-matrix §2 row by row. **Test S-03** asserts that
  the public entries are exactly the allow-list above. A further test asserts that every file under
  `src/pages/api/**` and every form handler has a `ROUTES` entry.
- **UI hints come from the same map:** `locals.capabilities = capabilitiesFor(role)` (also returned by
  E-04). Per-record hints (`allowed_actions` on ShipmentDetail, `can_approve` on a count) are computed in
  the service layer by `allowedShipmentActions(user, shipment)` / `canApproveCount(user, count)`. Both
  call `can()` and then apply the same identity and state predicates as the write path (shared functions,
  next section). No page or component contains its own role list.

### D-10 Identity rules inside the write transaction

All are evaluated in the service, **inside `sql.begin()`**, on a row locked with `SELECT … FOR UPDATE`,
using the actor id **from the session** (R-12; `.strict()` Zod rejects actor fields with 400). The
predicates live in `src/lib/services/rules.ts`, which both the write path and the `allowed_actions`
hints use:

| Rule | Predicate (row read under lock) | Refusal |
|------|----------------------------------|---------|
| R-1 verifier ≠ packer | `shipment.packed_by <> me` (the current packer, set by `start-packing` **and** `reopen`) | 403 `VERIFIER_SAME_AS_PACKER`; no verification row |
| R-4 + **UD-2** approver independent | no line with `counted_by = me OR recounted_by = me`, **and** `cycle_count.submitted_by <> me` | 403 `APPROVER_SAME_AS_COUNTER` (`details.reason` = `counted` \| `recounted`) or 403 `APPROVER_SAME_AS_SUBMITTER` (matrix §1 step 5, T-26) *[Sasha T-027 correction: separate code to match the matrix]* |
| R-5 Shipping cancels early only | `role <> 'Shipping' OR status IN ('Planned','Ready to Pack')` | 403 `FORBIDDEN_CANCEL_AT_STATUS` |
| R-7 Hold moves | `source.type` from `location` (DB); Receiving with a Hold source → refuse; Quality without Hold at source/destination, or PRODUCTION_COMPLETE → refuse | 403 `FORBIDDEN_HOLD_RELEASE` / `FORBIDDEN_NON_HOLD_TXN` |
| R-8 after-ship errors | `role <> 'Shipping' OR (stage = 'Before ship' AND status <> 'Shipped')` | 403 `FORBIDDEN_AFTER_SHIP_ERROR` |

Mechanics: the service throws `IdentityDenied(code, details)`, the transaction rolls back, and the
handler then calls `auditDenied()` in its own short transaction (contract §1.8), so the denial is
recorded even though nothing else is written. DB backstops (CHECK `verified_by <> packer_id`, CHECK
`approved_by <> submitted_by`, trigger `cycle_count_approval_guard`) turn a missed check into a 500,
never into a silent self-approval.

### D-11 Check-order summary

As contract §1.3, with two refinements from this ADR:

1. Step 2a also uses `Sec-Fetch-Site` when `Origin` is absent (D-5).
2. Unmatched non-GET routes are 404 at step 0 (D-9).

Login: 2a → 2b → 4 → 429 → credentials.

### D-12 Security headers and CSP (Astro + bundled Chart.js)

`applySecurityHeaders` sets these headers on every SSR and API response. Theo mirrors them in
`netlify.toml` `[[headers]]` for static assets (`/*`):

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
X-Frame-Options: DENY                                  (legacy duplicate of frame-ancestors)
X-Robots-Tag: noindex, nofollow
Strict-Transport-Security: max-age=31536000           (deployed only; ignored over http anyway)
Cache-Control: no-store                                (every SSR page, /api/v1/*, CSV)
```

- **Keeping Astro output CSP-clean** (Theo, `astro.config.mjs`): `build.inlineStylesheets: 'never'`,
  `vite.build.assetsInlineLimit: 0` (so Astro does not inline small processed scripts or assets
  [A, verify on the first build]), `security.checkOrigin: true`, `security.csp: false`.
  - CI greps `src/` for `is:inline`, `define:vars`, `set:html`, `innerHTML`, `style=` and `on[a-z]+=`
    attributes (UI spec §10.1, S-18).
  - Chart.js is imported from npm into a hoisted module (`src/scripts/charts.ts`). It needs no
    `unsafe-eval`, and it sizes canvases through the CSSOM, which `style-src` does not block [A].
  - Chart data arrives through `data-*` attributes or a `<script type="application/json">` block, and
    is read with `JSON.parse` (security plan §7.2).
- **Verification:** Playwright listens for `securitypolicyviolation` on every page, including the
  dashboard with charts, and expects **zero** violations (S-21).
- **Fallback, only if S-21 fails because of Astro-generated inline code:** enable Astro 7's
  `security.csp` (hash-based; present in 7.4.13 with `algorithm`, `directives`, `scriptDirective`,
  `styleDirective` [R, installed schema]) for `script-src`/`style-src`. Keep `frame-ancestors` and the
  other non-fetch directives in the header. `'unsafe-inline'` for scripts is never acceptable. For styles
  it is a Low finding that needs Sasha's written acceptance.
- No CORS headers anywhere. `robots.txt` contains `Disallow: /`.

### D-13 Demo users, `DEMO_ADMIN_PASSWORD`, and detecting "deployed"

**Environment rule (`src/lib/env.ts`), fail-safe.** `appEnv()` returns `'local'` **only** on a positive
local signal:
- `import.meta.env.DEV === true` (inside `astro dev`), or
- `process.env.APP_ENV === 'local'`, which is set by local entry points only: `scripts/reset-seed.ts`,
  `scripts/migrate.ts`, and `vitest.config.ts` `test.env`.

**Every other case is `'deployed'`**, including Netlify Functions, `netlify serve`, and an unknown runtime.

*[Sasha T-027 correction, binding]* **The seed's credential branch is decided by the target database, not
only by `appEnv()`.** `scripts/reset-seed.ts` sets `APP_ENV=local`, but the first production seed is that
same script run with `--remote` (ADR-002 §7). Therefore: when the seed runs with `--remote` (or against any
non-local host), it **must use the `'deployed'` column of the table below** (Admin from
`DEMO_ADMIN_PASSWORD` or inactive), whatever `appEnv()` says. Implement it as one function, e.g.
`seedCredentialMode({ remote }) → 'local' | 'deployed'`, with a unit test (S-30).
As a second guard, `APP_ENV=local` is **ignored** when any Netlify runtime marker is present (`NETLIFY`,
`SITE_ID`, `DEPLOY_ID`, `CONTEXT`) [A: which of these are present at Function run time is not verified;
docs.netlify.com was not reachable from this session]. The safe default means an unverified variable
name can only make a site *more* restrictive. `APP_ENV` must never be set in the Netlify UI (Theo
documents this in ADR-002 and `.env.example`).

`isDemoResetEnabled()` = `process.env.DEMO_RESET_ENABLED === 'true'` (exact string; contract E-52).

**Demo users (Dana's seed, `src/lib/seed/`):** the seven fictional users of permissions-matrix §4, defined
in **one** module, `src/lib/seed/demo-credentials.ts`: username, display name, role, and the demo-only
password for the six published accounts. The README and the login-page credentials table (Felix) import
from this module, so there is one source.

| Account | `appEnv() === 'local'` (dev, tests, `db:reset-seed` locally) | `appEnv() === 'deployed'` |
|---------|------------------------------------------------------------|--------------------------|
| six non-Admin users | published demo-only passwords | the same published demo-only passwords |
| `demo.admin` | documented local demo password (in the module, labelled local-only) | password = `process.env.DEMO_ADMIN_PASSWORD`. If it is unset, **or shorter than 16 characters**, the account is created `active = false` with `password_hash = NULL` (DB CHECK allows this), and the seed summary says `admin: inactive (DEMO_ADMIN_PASSWORD not usable)`. **The value is never logged, printed, audited or returned.** |

- The login page lists the six published accounts. It lists `demo.admin` only when `appEnv() === 'local'`.
- Every published password is labelled "demo-only, never reuse". It is hashed at seed time like any
  other (random salt, S-10).
- S-30 covers both branches. A grep test asserts that `DEMO_ADMIN_PASSWORD` is referenced only in
  `src/lib/seed/` and `src/lib/env.ts`.
- The first production seed (seed-plan SQ-1 / DQ-9) stays an ADR-002 question for Theo, Sasha and
  Diego. Nothing in this ADR creates a bootstrap endpoint.

### D-14 Audit events of the auth layer

Written by `src/lib/audit.ts` in the same transaction as the change (contract §1.8):

| Event | When |
|-------|------|
| `LOGIN_SUCCESS` | successful login |
| `LOGIN_FAILED` | failed login (username or `unknown`) |
| `LOGOUT` | logout |
| `ACCESS_DENIED` | every 403 for a signed-in user (`CSRF_INVALID`, `FORBIDDEN_ROLE`, identity codes). Written in its own transaction. |

Not audited: anonymous 401s, 415/413, and 429 (cheap paths). Never stored: passwords, tokens, token
hashes, CSRF values, IP addresses, env values.

## 4. Consequences

| Area | Change | Owner |
|------|--------|-------|
| Code (W2) | `src/lib/auth/**`, `src/lib/http/{pipeline,security-headers,errors,form}.ts`, `src/lib/env.ts`, `src/lib/clock.ts`, `src/lib/audit.ts`, `src/middleware.ts` per D-1 to D-14 | Diego |
| Config | `astro.config.mjs` options of D-12; `netlify.toml` headers; `vitest.config.ts` `test.env.APP_ENV = 'local'`; `.env.example` lists `DEMO_ADMIN_PASSWORD`, `DEMO_RESET_ENABLED` (empty values) and warns never to set `APP_ENV` on Netlify | Theo |
| UI | `<CsrfField />` in every form; `<meta name="csrf-token">` for signed-in pages; login page credentials table from `demo-credentials.ts`; idle copy "about 30 minutes"; no inline script or style | Felix, Maya |
| Seed | `demo-credentials.ts`; the admin rule of D-13; sequential hashing | Dana |
| Contract | §1.3 step 2a gains the `Sec-Fetch-Site` rule and the unmatched-route 404 (edited in T-022 with tag *(ADR-003)*); E-01 stays withdrawn; Q-S closed | Marcus (done), Diego |
| Schema | **none** (the `session`, `login_attempt` and `setting` columns of 0001 are sufficient) | — |
| Matrix | rows for `reopen` (UD-4) and `correct` (UD-3) so S-01 can compare them | Priya |
| Tests | S-01 to S-31 unchanged in intent. Added: D-9 route-coverage test, `next` open-redirect test, `Sec-Fetch-Site: cross-site` without `Origin` → 403, duplicate `_csrf` → 403, `APP_ENV=local` ignored with a Netlify marker | Diego, Quinn |
| Security plan | §3.2 [P] items, §5 login-form note and §15 O-1 are answered by this ADR (Sasha updates her plan at review) | Sasha |

Risks: **(1)** the scrypt cost in a cold Function is unmeasured (D-2 decision rule). **(2)** Netlify
runtime variable names are unverified (D-13 is fail-safe). **(3)** Astro may still inline something under
CSP (D-12 fallback). **(4)** Fixed-window throttling allows bursts at the boundary (accepted).

## 5. Compliance with ADR-001 and the Free plan

This ADR uses no new runtime dependency (`node:crypto`, postgres.js, Astro 7.4.13), no Netlify Blobs, no
`Astro.session`, no scheduled function and no paid feature. The only writes on read paths are the
throttled `last_seen_at` update and opportunistic deletes of expired rows.

## 6. Open questions for review

| # | Question | Owner |
|---|----------|-------|
| A3-1 | Accept the 25–30 min effective idle window (5-minute `last_seen_at` throttle), or update every minute? | Sasha |
| A3-2 | Minimum length 16 for `DEMO_ADMIN_PASSWORD`: enough, or also require a mix of character classes? | Sasha |
| A3-3 | Confirm the Netlify runtime markers for D-13 on the first hosted deploy (T-018) and record them in ADR-002 | Theo |
| A3-4 | `Sec-Fetch-Site` refinement of contract §1.3 2a: accept? | Sasha, Diego |

## 7. Evidence

| Item | Source | Tag |
|------|--------|-----|
| scrypt N = 2^17, r = 8, p = 1 (and N = 2^15, r = 8, p = 3 as an equivalent) | [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), as cited by security-plan §3.1 (2026-11-25); not re-fetched in this session | [R] via security plan |
| Astro 7.4.13 has `security.csp` (default `false`) with `algorithm`, `directives`, `scriptDirective`, `styleDirective`, and `security.checkOrigin` | Installed package `spikes/poc-astro-netlify-db/node_modules/astro/dist/core/config/schemas/base.js` and `defaults.js`, read 2026-11-26 | [R] |
| Netlify adapter maps `clientAddress` to the Function `context.ip`; the dev server uses `x-nf-client-connection-ip` or the socket address | `node_modules/@astrojs/netlify/dist/ssr-function.js` and `dist/index.js` (adapter 8.2.14), read 2026-11-26 | [R] |
| `checkOrigin` covers only form content types; a JSON forged-Origin POST passed | [PoC report](../poc/poc-report.md) §7, finding R-1 | [R] |
| Astro sessions on the Netlify adapter use Netlify Blobs | PoC D8 (ADR-001 §15) | [R] |
| Function limits (1024 MB default memory, 60 s synchronous) | ADR-001 F3 (Netlify docs, accessed 2026-11-25) | [R] |
| Netlify runtime environment variable names at Function run time | **Not verified:** docs.netlify.com did not resolve from this session (it must be allowed in the session network settings). D-13 is designed to be safe without it. | [A] |
| Safari rejects `Secure` cookies on `http://localhost`; Chromium and Firefox accept them | Not verified in this session | [A] |

## 8. Security review (security-reviewer, Sasha, 2026-11-27, T-027)

**Verdict: APPROVED for implementation**, with the corrections tagged *[Sasha T-027]* above and the binding
conditions below. Full findings: [review-2026-11-27-design.md](../security/review-2026-11-27-design.md).

Answers to §6: **A3-1** accept the 5-minute `last_seen_at` throttle (25–30 min effective idle). **A3-2**
16 characters minimum is enough; no character-class rule. The user generates the value randomly (for example
`openssl rand -base64 24`) and stores it only in the Netlify UI. **A3-3** stays with Theo; the design is
fail-safe in the meantime. **A3-4** accept the `Sec-Fetch-Site` refinement. `Origin: null` must be refused
(it never equals the site origin).

Binding conditions (Diego unless stated otherwise; Quinn tests them):

| # | Condition |
|---|-----------|
| C-1 | `siteOrigin` comes from `new URL(request.url).origin` (as Astro's `checkOrigin` does) or a fixed allow-list. It is **never** derived from the `Origin` or `Referer` header. |
| C-2 | `DUMMY_HASH` uses exactly `SCRYPT_PARAMS`. If the D-2 fallback parameters are adopted, regenerate it in the same change, so unknown-user timing stays equal (S-11). |
| C-3 | Seed credential mode follows the target DB (D-13 correction). A `--remote` seed never gives `demo.admin` the published local password. Test it. |
| C-4 | `APPROVER_SAME_AS_SUBMITTER` is a separate 403 code (D-10 correction). Marcus adds it to contract §1.4/§1.3 step 5 and E-40. |
| C-5 | `PERMISSIONS` uses the matrix ids P-26 to P-29. `ALL_ROLES` includes Viewer. S-01 compares every row, including P-26 to P-29. |
| C-6 | Exactly **one** CSP value: a shared constant used by middleware, and `netlify.toml` set to the same string (Theo removes `'unsafe-inline'` from `style-src`, see ADR-002 §10). Any relaxation needs my written acceptance (D-12 fallback). |
| C-7 | Steps 0–3 fail closed (as D-9). `ACCESS_DENIED` and `LOGIN_FAILED` rows never contain the password, the tokens, the CSRF values, the IP or a raw unknown username (D-14). Add a grep or unit test on the audit payloads. |
| C-8 | The `next` redirect check also refuses control characters and percent-encoded `/` or `\` after decoding. Test `//evil.example`, `/\evil.example`, `/%2F%2Fevil.example` and `https://evil.example`. |
| C-9 | No bootstrap or first-run endpoint, ever, without a new security review (ADR-002 §7 risk 1). |
| C-10 | Contract change for Marcus: remove the E-08 exception "a Supervisor sending only `notes`" on Shipped or Cancelled shipments (contract E-08 notes). It contradicts R-14 (notes are locked; P-28 correction only). |

Accepted residual risks (Low): login CSRF into a published demo account (O-3); per-(username, IP) limit means
a distributed guesser is limited only per IP, which is acceptable because the only unpublished password is
random and ≥ 16 characters; a signed-in visitor can create `ACCESS_DENIED` rows (the optional PD-5 write cap
stays a "Should"); scrypt CPU spent per failed login inside the 30-per-client window (credit risk, PD-7 watch).

