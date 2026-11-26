# Resources Page Content (US-085)

**Task:** T-021 · **Owner:** Priya (product-manager) · **Date:** 2026-11-26 · **Consumer:** Felix (builds the page), Maya (layout), Quinn (link check)
**Story:** US-085 in [backlog.md](backlog.md) · **Scope:** [project-scope.md](../project-scope.md) §3.5 (Resources page) · **Origin:** user requirement of 2026-11-26.

This file is the **single source of the link list**. Felix renders it as a static page `/resources` (no database access, no user input). Titles and descriptions below are the exact on-screen text; change them here first, then in the page.

## Display rules (for Felix and Maya)

- Reachable from the **footer of every page and from the main navigation** (label: **Resources**). It is a static, read-only page.
- Group headings are real headings (h2); each group is a list. Each link is a real `<a>` with the title as link text, followed by its one-line description as plain text.
- **External links** (sections 1 to 3 and the GitHub repository) open in a new tab with `rel="noopener noreferrer"` and carry the visible text "(external site)" or an equivalent icon plus screen-reader text, so a keyboard or screen-reader user knows the link leaves the app. Links never rely on colour alone to look like links.
- **Project document links** (section 5) point to the GitHub **main** branch (`https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/<path>`). They are plain external links; the app never serves these files itself.
- Page intro text (use as written): "Official documentation for the technologies this prototype uses, standards it follows, and the project's own research and design documents. All companies, customers, parts and records in this application are fictional."
- No tracking, no embedded third-party content, no external scripts or fonts; links only.
- Visible to every signed-in role (see permissions matrix P-29). The page must meet the same accessibility and responsive criteria as every other page (US-077).
- [A] The external URLs were taken from ADR-001, `docs/07`, `docs/sources.md` and the products' public documentation home pages and have **not** been opened by Priya. Quinn runs a link check (HTTP status of every link) once before the final demo; a broken URL is a defect, fixed here first.

## 1. Application technology: official documentation

| Title | URL | Description |
|-------|-----|-------------|
| Astro documentation | https://docs.astro.build/ | The web framework used for pages and server endpoints (server-side rendering). |
| Astro: Netlify adapter | https://docs.astro.build/en/guides/integrations-guide/netlify/ | How the app is built to run as Netlify Functions. |
| Netlify documentation | https://docs.netlify.com/ | Hosting, builds and deploys for the demo site. |
| Netlify Functions overview | https://docs.netlify.com/build/functions/overview/ | The serverless functions that run the pages and the API. |
| Netlify Database overview | https://docs.netlify.com/build/data-and-storage/netlify-database/ | The managed PostgreSQL database that stores all demo records. |
| Netlify Database migrations | https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/ | How forward-only SQL migrations change the schema. |
| PostgreSQL documentation | https://www.postgresql.org/docs/ | The relational database behind the ledger, shipments and audit log. |
| postgres.js | https://github.com/porsager/postgres | The PostgreSQL client library used for parameterized queries. |
| Chart.js documentation | https://www.chartjs.org/docs/latest/ | The charting library behind the dashboard charts. |
| Zod documentation | https://zod.dev/ | The schema library used for server-side input validation. |
| Vitest documentation | https://vitest.dev/ | The test runner for unit and integration tests, including the KPI tests. |
| Playwright documentation | https://playwright.dev/docs/intro | The browser test tool for end-to-end and accessibility checks. |

## 2. Security and accessibility standards

| Title | URL | Description |
|-------|-----|-------------|
| OWASP Top 10 | https://owasp.org/www-project-top-ten/ | The list of the most critical web application security risks the review is based on. |
| OWASP Application Security Verification Standard (ASVS) | https://owasp.org/www-project-application-security-verification-standard/ | The checklist of security requirements used to review login, sessions and access control. |
| OWASP Authorization Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html | Practical guidance for server-side role checks and deny-by-default. |
| Web Content Accessibility Guidelines (WCAG) 2.2 | https://www.w3.org/TR/WCAG22/ | The accessibility standard (level AA) the interface is checked against. |
| What is new in WCAG 2.2 | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ | A short summary of what changed from WCAG 2.1. |

## 3. Research sources

Optional group (duplicate of one row in section 5, shown here for visibility).

| Title | URL | Description |
|-------|-----|-------------|
| Project source list | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/sources.md | The full list of references behind the research documents, with the tag [R] researched, [A] assumption or [P] proposed. |

## 4. GitHub repository

| Title | URL | Description |
|-------|-----|-------------|
| ManufacturingOpsTeam on GitHub | https://github.com/pebble710-debug/ManufacturingOpsTeam | The public source code, documents and commit history of this prototype (fictional data only). |

## 5. Project research and design documents (GitHub, `main` branch)

Base URL: `https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/`

| Title | URL | Description |
|-------|-----|-------------|
| Project scope (Version 1) | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/project-scope.md | The contract: what version 1 includes, what is postponed, and the acceptance criteria. |
| ADR-001: Stack, persistence and deployment | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/ADR-001.md | The architecture decision for Astro, TypeScript, Netlify and PostgreSQL, with options and risks. |
| 01 Outgoing shipment tracking | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/01-outgoing-shipment-tracking.md | Shipment dates, carriers, tracking numbers and the status lifecycle. |
| 02 Packaging quality | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/02-packaging-quality.md | Packaging error categories, rework and the mistake-proofing checklist. |
| 03 Inventory management | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/03-inventory-management.md | Receiving, the transaction ledger, cycle counts and lot traceability. |
| 04 Shipping workflows and coordination | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/04-shipping-workflows-coordination.md | Who does what in shipping: workflow, responsibilities and daily rhythm. |
| 05 Performance metrics | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/05-performance-metrics.md | The definition and formula of every KPI shown on the dashboard. |
| 06 Lean Six Sigma | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/06-lean-six-sigma.md | Root-cause analysis, 5 Whys and the improvement method, with the SH-1042 worked example. |
| 07 Software design | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/07-software-design.md | Roles, security checklist and user-interface rules. |
| 08 Data model, forms, charts and reports | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/08-data-model-forms-charts-reports.md | Tables, fields, forms, charts and reports the application implements. |
| Sources and references | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/sources.md | The reference list behind the research documents. |
| Product backlog | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/plan/backlog.md | User stories and acceptance criteria for version 1. |
| Permissions matrix | https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/plan/permissions-matrix.md | Which role may do what, enforced on the server. |

## Notes for Felix

- Copy the URLs from this file rather than retyping them; Quinn's link check must pass for every row.
- Section 3 contains only the project source list, which is also listed in section 5. If Maya prefers a shorter page, delete section 3 (no story changes).

## Acceptance (see US-085)

1. Page exists at `/resources`, linked from the footer of every page and from the main navigation.
2. Every title and URL in sections 1, 2, 4 and 5 is present as a working link; descriptions match this file.
3. External links are identifiable as external and open safely; project documents open the matching file on GitHub `main`.
4. The page passes the same accessibility scan as other pages and fits desktop, tablet and mobile widths without horizontal page scroll.
