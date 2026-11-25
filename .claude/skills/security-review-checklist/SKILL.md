---
name: security-review-checklist
description: Proportionate security review checklist for the ManufacturingOpsTeam prototype mapped to OWASP Top 10:2025, plus finding severity and report format. Use when reviewing code, configuration, dependencies or deployment, or when implementing auth, roles and input handling.
user-invocable: false
---

# Security review checklist

Baseline: `docs/07-software-design.md` §7.2 (10 controls + role table).
References: [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/),
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP ASVS](https://github.com/OWASP/ASVS).

| Area | Check | OWASP 2025 |
|------|-------|-----------|
| Access control | Deny by default; every route authenticated; role checked server-side on every write; verifier ≠ packer enforced server-side; adjustments Supervisor-only | A01 |
| Configuration | No debug in deployed builds; security headers (CSP, frame-ancestors, Referrer-Policy); generic error pages; least-privilege DB credentials | A02 |
| Supply chain | Dependencies pinned with lockfile; `npm audit` / `pip-audit` clean of High/Critical; no unvetted CDN scripts (or SRI hashes) | A03 |
| Crypto | Passwords hashed with argon2/bcrypt/scrypt; HTTPS only; secure, HttpOnly, SameSite cookies | A04 |
| Injection | Parameterized queries/ORM only; output encoding; no `eval`/raw HTML from input; CSV export guards against formula injection (`=`, `+`, `-`, `@`) | A05 |
| Design | Server-side validation of all fields; status transitions enforced; append-only ledger; rate limit login | A06 |
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
