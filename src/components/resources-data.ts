// Single source: docs/plan/resources.md (T-021). Change the doc first, then this list.
export interface ResourceLink { title: string; url: string; description: string }
export interface ResourceGroup { id: string; title: string; intro?: string; links: ResourceLink[] }

export const resourceGroups: ResourceGroup[] = [
  {
    id: "technology",
    title: "Application technology: official documentation",
    links: [
      { title: "Astro documentation", url: "https://docs.astro.build/", description: "The web framework used for pages and server endpoints (server-side rendering)." },
      { title: "Astro: Netlify adapter", url: "https://docs.astro.build/en/guides/integrations-guide/netlify/", description: "How the app is built to run as Netlify Functions." },
      { title: "Netlify documentation", url: "https://docs.netlify.com/", description: "Hosting, builds and deploys for the demo site." },
      { title: "Netlify Functions overview", url: "https://docs.netlify.com/build/functions/overview/", description: "The serverless functions that run the pages and the API." },
      { title: "Netlify Database overview", url: "https://docs.netlify.com/build/data-and-storage/netlify-database/", description: "The managed PostgreSQL database that stores all demo records." },
      { title: "Netlify Database migrations", url: "https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/", description: "How forward-only SQL migrations change the schema." },
      { title: "PostgreSQL documentation", url: "https://www.postgresql.org/docs/", description: "The relational database behind the ledger, shipments and audit log." },
      { title: "postgres.js", url: "https://github.com/porsager/postgres", description: "The PostgreSQL client library used for parameterized queries." },
      { title: "Chart.js documentation", url: "https://www.chartjs.org/docs/latest/", description: "The charting library behind the dashboard charts." },
      { title: "Zod documentation", url: "https://zod.dev/", description: "The schema library used for server-side input validation." },
      { title: "Vitest documentation", url: "https://vitest.dev/", description: "The test runner for unit and integration tests, including the KPI tests." },
      { title: "Playwright documentation", url: "https://playwright.dev/docs/intro", description: "The browser test tool for end-to-end and accessibility checks." },
    ],
  },
  {
    id: "standards",
    title: "Security and accessibility standards",
    links: [
      { title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/", description: "The list of the most critical web application security risks the review is based on." },
      { title: "OWASP Application Security Verification Standard (ASVS)", url: "https://owasp.org/www-project-application-security-verification-standard/", description: "The checklist of security requirements used to review login, sessions and access control." },
      { title: "OWASP Authorization Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html", description: "Practical guidance for server-side role checks and deny-by-default." },
      { title: "Web Content Accessibility Guidelines (WCAG) 2.2", url: "https://www.w3.org/TR/WCAG22/", description: "The accessibility standard (level AA) the interface is checked against." },
      { title: "What is new in WCAG 2.2", url: "https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/", description: "A short summary of what changed from WCAG 2.1." },
    ],
  },
  {
    id: "research-sources",
    title: "Research sources",
    intro: "The source list is also included in the project documents below.",
    links: [
      { title: "Project source list", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/sources.md", description: "The full list of references behind the research documents, with the tag [R] researched, [A] assumption or [P] proposed." },
    ],
  },
  {
    id: "repository",
    title: "GitHub repository",
    links: [
      { title: "ManufacturingOpsTeam on GitHub", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam", description: "The public source code, documents and commit history of this prototype (fictional data only)." },
    ],
  },
  {
    id: "project-docs",
    title: "Project research and design documents",
    intro: "These open the matching file on the GitHub main branch. The app does not serve these files itself.",
    links: [
      { title: "Project scope (Version 1)", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/project-scope.md", description: "The contract: what version 1 includes, what is postponed, and the acceptance criteria." },
      { title: "ADR-001: Stack, persistence and deployment", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/ADR-001.md", description: "The architecture decision for Astro, TypeScript, Netlify and PostgreSQL, with options and risks." },
      { title: "01 Outgoing shipment tracking", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/01-outgoing-shipment-tracking.md", description: "Shipment dates, carriers, tracking numbers and the status lifecycle." },
      { title: "02 Packaging quality", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/02-packaging-quality.md", description: "Packaging error categories, rework and the mistake-proofing checklist." },
      { title: "03 Inventory management", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/03-inventory-management.md", description: "Receiving, the transaction ledger, cycle counts and lot traceability." },
      { title: "04 Shipping workflows and coordination", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/04-shipping-workflows-coordination.md", description: "Who does what in shipping: workflow, responsibilities and daily rhythm." },
      { title: "05 Performance metrics", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/05-performance-metrics.md", description: "The definition and formula of every KPI shown on the dashboard." },
      { title: "06 Lean Six Sigma", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/06-lean-six-sigma.md", description: "Root-cause analysis, 5 Whys and the improvement method, with the SH-1042 worked example." },
      { title: "07 Software design", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/07-software-design.md", description: "Roles, security checklist and user-interface rules." },
      { title: "08 Data model, forms, charts and reports", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/08-data-model-forms-charts-reports.md", description: "Tables, fields, forms, charts and reports the application implements." },
      { title: "Sources and references", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/sources.md", description: "The reference list behind the research documents." },
      { title: "Product backlog", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/plan/backlog.md", description: "User stories and acceptance criteria for version 1." },
      { title: "Permissions matrix", url: "https://github.com/pebble710-debug/ManufacturingOpsTeam/blob/main/docs/plan/permissions-matrix.md", description: "Which role may do what, enforced on the server." },
    ],
  },
];
