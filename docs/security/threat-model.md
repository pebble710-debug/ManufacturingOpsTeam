# Threat Model — v1 (STRIDE, short)

**Status:** PROPOSED — security-reviewer (Sasha), 2026-11-25 · **Task:** T-015
**System:** Manufacturing Shipping & Inventory Operations Dashboard v1 — Astro SSR on Netlify Functions, Netlify Database (Postgres), public GitHub repo, public demo site, Netlify Free plan ([ADR-001](../ADR-001.md)).
**Controls:** [security-plan.md](security-plan.md) (SEC-xx, PD-x, S-xx) · **Roles:** [permissions-matrix.md](../plan/permissions-matrix.md).
All data is fictional (Cobalt Ridge Components, Inc.). This is a proportionate model for a class prototype, not a formal assessment.

## 1. Assets

| ID | Asset | Why it matters | Value |
|----|-------|----------------|-------|
| A1 | Integrity of operational records (shipments, verification, ledger, counts, adjustments) | The demo teaches second-person verification and correct KPIs; forged or self-approved records defeat the lesson | High |
| A2 | Audit trail (`audit_log`, status history) | Makes every change attributable | High |
| A3 | `NETLIFY_DB_URL` (owner-level DB credential) | Full read/write/DDL on the database | High |
| A4 | Netlify account and GitHub repo (deploy rights, env vars, `main`) | Control of the site and the code | High |
| A5 | **Availability and Free-plan credits** (300/month, hard stop; all of the owner's projects pause at 0) | Abuse can take the demo and the owner's other sites offline | High |
| A6 | Admin capabilities (reporting date, users, audit view, demo reset) | Can wipe or reconfigure the whole demo | Medium |
| A7 | Session tokens and CSRF tokens | Impersonation of a signed-in user | Medium |
| A8 | Visitor-supplied data (IPs, anything typed into free text) | Could be real personal data despite the fictional-only policy | Medium |
| A9 | Published demo passwords (non-Admin) | Public by design; low value | Low |

## 2. Trust boundaries and data flow

```text
 [Visitor browser] --HTTPS--> (TB1) [Netlify CDN/edge] --> [SSR Function: middleware -> handlers]
                                                              |
                                                     (TB2) postgres.js over TLS
                                                              v
                                                   [Netlify Database (Postgres)]

 [Contributor / fork PR] --(TB3)--> [GitHub public repo] --> [GitHub Actions CI (no secrets)]
                                                       \--> [Netlify build + deploy previews] (TB4: env vars)
 [Owner / agents on dev machine] --(TB5)--> repo, Netlify UI
```

- **TB1** Internet → app: everything from the browser is untrusted (headers, cookies, body, Origin).
- **TB2** App → DB: the app holds an owner credential; the DB enforces append-only via triggers.
- **TB3** Public contributors → repo: anyone can read code and open PRs.
- **TB4** Repo → Netlify build: build code runs with env vars; untrusted PRs must not reach secrets.
- **TB5** Owner/agents → repo/Netlify: risk of committing secrets or real data by mistake.

## 3. Top threats (STRIDE)

| ID | STRIDE | Threat (one sentence) | Asset | Likelihood / Impact | Mitigations (security-plan) |
|----|--------|-----------------------|-------|---------------------|-----------------------------|
| T01 | **E**levation | A signed-in Viewer/Shipping user calls a write endpoint directly (bypassing hidden buttons) to approve counts or change targets. | A1, A6 | High / High | Deny-by-default middleware, `requireRole` per handler from one permission map, role-matrix suite S-01–S-04 (SEC-01) |
| T02 | **E**/**R** | A packer verifies their own shipment (or a Supervisor approves their own count), incl. by racing two requests or sending another user's id. | A1 | Medium / High | Identity rule in the SQL transaction; ids only from session; `.strict()` Zod (R-1, R-4, R-12; S-05, S-06) |
| T03 | **T**ampering | A malicious site makes a victim's browser submit a cross-origin JSON write (PoC R-1: `checkOrigin` let it through). | A1 | Medium / High | Synchronizer token + content-type allow-list (415) + `checkOrigin` + SameSite=Lax, no CORS (SEC-03; S-07–S-09) |
| T04 | **T**/**I** | SQL injection through search, sort or filter parameters. | A1, A3 | Low / High | Tagged templates only, `sql.unsafe` banned, allow-listed identifiers, LIKE escaping (SEC-08; S-18) |
| T05 | **T**/**I** | Stored XSS from a note or name field steals a session's CSRF token and acts as that user. | A7, A1 | Medium / Medium | Astro escaping, `set:html`/`innerHTML` banned, safe chart JSON, strict CSP, HttpOnly cookie (SEC-09, SEC-11; S-19, S-21) |
| T06 | **T** | CSV formula injection: a crafted value runs a formula when a student opens the export in a spreadsheet. | Users' machines | Medium / Medium | Prefix guard on text cells (SEC-10; S-20) |
| T07 | **S**poofing | Password guessing / credential stuffing against demo and Admin accounts. | A6, A7 | High / Medium | Admin password not published (PD-2); scrypt; DB-backed rate limit → 429; no lockout to avoid DoS (SEC-04, SEC-06; S-15) |
| T08 | **S** | Session theft or fixation (token in logs, reused pre-login token, long-lived session). | A7 | Low / Medium | `__Host-sid` HttpOnly/Secure, hash at rest, rotate on login, 30 min idle / 8 h absolute, logout deletes (SEC-05; S-12–S-14) |
| T09 | **D**enial of service / budget | Bots or a prankster flood logins, writes or resets so function/DB compute burns the 300 credits and **all** owner projects pause. | A5 | Medium / High | Cheap no-cookie rejection, rate limits, reset cooldown, body cap, noindex, manual reset only, weekly credit check, read-only kill switch (PD-3–PD-7) |
| T10 | **T** (vandalism) | A visitor with a published operational account edits or deletes demo data or posts offensive text before a class. | A1 | High / Low | Fictional data only; Admin reset rebuilds everything; presenter resets before demos; audit shows who (AR-1) |
| T11 | **I**nformation disclosure | A secret (`NETLIFY_DB_URL`, `DEMO_ADMIN_PASSWORD`) is committed to the public repo or printed in logs/errors. | A3, A4 | Medium / High | Env vars only, root `.gitignore` (SR-01), gitleaks + GitHub push protection, generic errors, log hygiene (SEC-12–SEC-14; S-22, S-24, S-25) |
| T12 | **E**/**T** (supply chain) | A compromised or vulnerable npm package (or a malicious fork PR build) runs code in CI/build with access to env vars. | A3, A4 | Low / High | Exact pins + lockfile + `npm ci`, audit gate, minimal deps, no CI secrets, no `pull_request_target`, fork-PR previews need approval (SEC-15, SEC-16) |
| T13 | **R**epudiation | A user denies a change, or an attacker hides their tracks by editing the audit log. | A2 | Low / Medium | Audit row in the same transaction; DB triggers block UPDATE/DELETE; no app path to edit (R-10; S-23) |
| T14 | **I** | Visitors' personal data (IPs, a password typed as a username, real names in notes) is stored and shown to other visitors. | A8 | Medium / Low | No IPs in audit log, hashed/expiring client keys, unknown usernames logged as `unknown`, "do not enter real information" notice, reset wipes text (PD-8, PD-9) |
| T15 | **D**/**I** (exceptional conditions) | An exception or DB timeout in middleware falls through to "allow", or leaves a half-written shipment/ledger. | A1 | Low / High | Fail closed; one transaction per write; generic 503/500 (SEC-12; S-22) |
| T16 | **E** | A missing permission entry on a new route makes it open by default. | A1 | Medium / High | Middleware refuses non-GET on routes with no declared permission; S-01 map-vs-matrix test |

## 4. Out of scope for this model

Netlify platform compromise, TLS/CDN attacks, physical/insider attacks on the owner's machine, nation-state actors, and any real-world plant data (none exists: fictional data only).

## 5. Residual risk summary

With the controls in security-plan.md, the remaining material risks are vandalism of demo data (T10), credit exhaustion under determined abuse (T09) and the owner-level DB credential (AR-4). All three are acceptable for a fictional class prototype with a manual reset and weekly credit checks.

## 6. Accepted risks (v1)

| ID | Risk | Why accepted | Accepted by | Revisit |
|----|------|--------------|-------------|---------|
| AR-1 | Anyone can sign in with a published operational account and change or vandalize fictional data | Needed for a hands-on public demo; data is fictional; reset restores it; Admin is not published | Sasha (proposed) — **user to confirm** | Before each class demo |
| AR-2 | No MFA, SSO, account lockout, password change/reset, or alerting | v2 per scope §4 / docs/07 §7.2 | Scope (user-approved) | v2 |
| AR-3 | 10 moderate transitive `glob`/`minimatch` advisories in Netlify build/dev tooling | Not in the request path; `audit fix --force` would downgrade the adapter; tracked per review | Sasha (proposed per PoC R-5) — user informed | Every dependency bump and release |
| AR-4 | App uses an owner-level `NETLIFY_DB_URL`; a restricted DB role may not be available [A] | Platform limitation; mitigated by tagged templates only, `sql.unsafe` ban, DDL in migrations only | Sasha (proposed) | ADR-002 / if Netlify adds roles |
| AR-5 | Credit exhaustion is possible under a determined flood; Netlify's own edge protections are not under our control | No paid WAF/password protection on Free plan; kill switch and manual response instead | Sasha (proposed) — **user to confirm** | Weekly credit check |
| AR-6 | Audit log is reviewed manually; no real-time alerting | Proportionate for a class prototype | Sasha (proposed) | v2 |
| AR-7 | Hashed client keys for rate limiting are reversible in theory (IPv4 space is small) even with a per-DB salt | Salt stays in the DB, rows expire after 24 h, keys are never displayed | Sasha (proposed) | — |
