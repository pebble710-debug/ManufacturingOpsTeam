# 7. Software Design Recommendations

**Research date:** 2026-11-25 · Tags: **[R]** researched · **[A]** assumption · **[P]** proposed

Goal: a **simple, secure, user-friendly** web dashboard that a small team of AI coding agents can
build, test and demo within a class assignment.

## 7.1 Architecture (proposed)

**[P]** Keep it a single, small, monolithic web app with a relational database.

| Layer | Recommendation | Why |
|-------|---------------|-----|
| Backend | Python 3 + **Flask** (or FastAPI) | Small, well-documented, easy for agents to test |
| Database | **SQLite** (file-based) via an ORM (SQLAlchemy) | Zero setup; ledger/joins need SQL; swap to PostgreSQL in v2 |
| Frontend | Server-rendered HTML templates + a light CSS framework; **Chart.js** for charts | No SPA build chain; fewer moving parts |
| Auth | Session-based login with hashed passwords (e.g., Werkzeug/argon2/bcrypt) | Simple, standard |
| Tests | pytest: KPI formula unit tests + route tests | KPIs must be provably correct |
| Seed data | A `seed` script that generates deterministic fictional data | Reproducible demos |

- **[A]** Equivalent stacks (Node/Express + SQLite, Django) are fine; the important part is that
  the team picks **one** and documents it before coding.
- **[P]** Suggested module layout: `shipments/`, `quality/` (errors, rework), `inventory/`
  (receipts, transactions, cycle counts), `dashboard/` (KPI service + charts), `admin/`
  (users, lookups, targets), `reports/`.
- **[P]** Put all KPI math in **one service module** with unit tests; charts and reports call it.
  This prevents the same KPI being calculated two different ways.

## 7.2 Security (proportionate for a prototype)

- **[R]** OWASP Top 10:2025 — the current edition — ranks **A01 Broken Access Control** first,
  then A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic
  Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures (see the official list
  for A08–A10). ([OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/);
  [The Register](https://www.theregister.com/2025/11/11/new_owasp_top_ten_broken/))
- **[R]** Authorization should deny by default, enforce least privilege, and log access-control
  failures so violations are attributable. ([OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html))
- **[R]** Role-Based Access Control (users → roles → permissions) is a NIST-originated model,
  standardized as ANSI/INCITS 359. ([NIST RBAC](https://csrc.nist.gov/Projects/role-based-access-control))
- **[R]** OWASP ASVS is the companion checklist of verifiable web-app security requirements.
  ([OWASP ASVS (GitHub)](https://github.com/OWASP/ASVS))

**[P]** v1 security checklist (mapped to OWASP):

| # | Control | OWASP |
|---|---------|-------|
| 1 | Every route requires login; role checked **server-side** on every write | A01 |
| 2 | Parameterized queries / ORM only; no string-built SQL | A05 |
| 3 | Template auto-escaping on; no raw HTML from user input | A05 |
| 4 | CSRF tokens on all forms | A01/A06 |
| 5 | Passwords hashed (argon2/bcrypt); no default passwords in production mode; demo users only in seed data | A04/A07 |
| 6 | Secret key from environment variable, never committed; debug mode off outside dev | A02 |
| 7 | Pin dependency versions; run `pip-audit` (or equivalent) | A03 |
| 8 | Server-side input validation (types, ranges, required fields, allowed lists) | A06 |
| 9 | Append-only audit log: user, timestamp, action, record, old→new | logging |
| 10 | Generic error pages; no stack traces to users | A02 |

**[P]** Roles (from [04-shipping-workflows-coordination.md](04-shipping-workflows-coordination.md)):

| Role | Can |
|------|-----|
| Viewer | View dashboard and reports |
| Shipping | Create/edit shipments, pack, verify (not own pack), log errors/rework |
| Receiving / Inventory | Receipts, transfers, enter cycle counts |
| Quality | Holds/releases, edit error root cause & corrective actions |
| Supervisor | Approve inventory adjustments, manage targets & lookups |
| Admin | Manage users and roles |

**[A]** Out of scope for the prototype: SSO, MFA, encryption at rest, formal penetration test,
regulatory compliance (ITAR/CMMC/AS9100). Note these explicitly in the README so reviewers know
they were consciously deferred.

## 7.3 Usability

- **[R]** A dashboard does its main job if it tells you at a glance whether you need to act, and
  then opens the door to detail (Stephen Few, as quoted in *Performance Dashboards*).
  ([O'Reilly – Performance Dashboards, ch. 12](https://www.oreilly.com/library/view/performance-dashboards-measuring/9780470918425/ecke_9780470918425_oeb_c12_r1.html))
- **[R]** Show KPIs with context (target, previous period); limit the number of visual elements
  (one guide suggests ≤ 7); place the most important items where eyes land first; avoid relying
  on red/green alone because they look alike to color-blind users.
  ([Esri – Author effective dashboards](https://enterprise.arcgis.com/en/portal/10.6/use/author-effective-dashboards.htm))
  *(secondary source; specific numbers not verified against Few's books)*
- **[R]** WCAG 2.2 (W3C Recommendation, also ISO/IEC 40500:2025) is the current accessibility
  standard; it includes contrast and visible-focus criteria.
  ([W3C – WCAG 2.2](https://www.w3.org/TR/WCAG22/); [W3C – What's new in 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/))

**[P]** UX rules for the build agents:

1. Home dashboard: one row of KPI tiles (value, target, vs. last period, arrow + text label, not
   color alone), then ≤ 6 charts, then "needs attention" lists.
2. Every KPI tile and chart click-throughs to the filtered record list behind it.
3. Forms: short, logical order, dropdowns for controlled values, sensible defaults (today's date,
   current user), clear inline validation messages.
4. Big touch targets and readable fonts — shop-floor users may use tablets or gloves **[A]**.
5. Consistent status colors **plus** text/icons; meet WCAG 2.2 AA contrast.
6. Plain-language labels (e.g., "Tracking number", not "TRK_NO").
7. A visible "DEMO – FICTIONAL DATA" banner.

## 7.4 Data integrity

- **[P]** Inventory on-hand is derived from an append-only transaction ledger (see §3.2).
- **[P]** Status changes are only possible via defined transitions with required fields.
- **[P]** Soft-delete (archive) instead of hard-delete for shipments, errors and transactions.
- **[P]** Store timestamps in UTC, display in local time.

## 7.5 Agent-team working agreements (proposed)

- **[P]** Each agent owns a module; shared contracts (DB schema, KPI service interface) live in
  `docs/` and change only via a reviewed commit.
- **[P]** Definition of done per feature: form + validation + list view + tests + seed data
  coverage + docs updated.

## Sources

See inline links; full list in [sources.md](sources.md).
