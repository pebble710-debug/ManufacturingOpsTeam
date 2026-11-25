---
name: security-review-checklist
description: Proportionate security review checklist for the ManufacturingOpsTeam prototype mapped to OWASP Top 10:2025, plus finding severity and report format. Use when reviewing code, configuration, dependencies or deployment, or when implementing auth, roles and input handling.
user-invocable: false
---

# Security review checklist

Baseline: `docs/07-software-design.md` §7.2 (10 controls + role table), as implemented in
`docs/ADR-001.md` §8 (Astro SSR, postgres.js, scrypt, DB-backed sessions); ADR-003 (`docs/adr/`)
finalizes auth details.
References: [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/),
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP ASVS](https://github.com/OWASP/ASVS).

| Area | Check | OWASP 2025 |
|------|-------|-----------|
| Access control | Deny by default in Astro middleware; every route authenticated; role checked server-side on every write; verifier ≠ packer enforced server-side (Quality/Supervisor may verify); adjustments Supervisor-only | A01 |
| Configuration | No debug in deployed builds; security headers (CSP, frame-ancestors, Referrer-Policy); generic error pages; least-privilege DB credentials | A02 |
| Supply chain | Exact versions + `package-lock.json`; `npm audit --audit-level=high` clean; Astro pinned at a version patching the `checkOrigin` advisory; no CDN scripts (Chart.js bundled from npm) | A03 |
| Crypto | Passwords hashed with `node:crypto` scrypt, per-user random salt, `timingSafeEqual`; HTTPS only; `__Host-sid` cookie Secure, HttpOnly, SameSite=Lax; session token stored as SHA-256 hash | A04 |
| Injection | postgres.js tagged templates only — **`sql.unsafe` banned** (lint/grep); dynamic sort columns from allow-lists; Astro auto-escaping — **`set:html` banned** for user-controlled data; chart JSON embedded safely; no `eval`; CSV export guards against formula injection (`=`, `+`, `-`, `@`) | A05 |
| CSRF | Astro `security.checkOrigin: true` **and** a per-session synchronizer CSRF token in every form / `X-CSRF-Token` header; SameSite=Lax | A01/A06 |
| Design | Server-side Zod validation of all fields; status transitions enforced; append-only ledger/history/audit enforced by DB triggers; DB-backed login rate limit (no in-memory counters) | A06 |
| Authentication | Session timeout; logout invalidates session; no default credentials outside seeded demo; demo passwords flagged | A07 |
| Logging | Audit log for writes and 403s; no secrets/passwords in logs | A09 |
| Secrets | Secrets only in environment variables (Netlify env); `.env` git-ignored; run secret scan before release | A02/A04 |
| Data policy | Only fictional data; no real-system connections (`fictional-data-guardrails`) | — |

## Severity
Critical (exploitable auth bypass / secret exposure) · High (injection, missing role check on a
write) · Medium (missing header, weak config) · Low (hardening, hygiene).
Critical/High block release.

## Report format
`docs/security/review-<date>.md`: scope reviewed, commands run (with output summary), findings
table (ID, severity, file:line, issue, fix recommendation, owner), sign-off status.
The Security Reviewer reports; developers fix; the reviewer re-verifies.
