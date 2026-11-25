---
name: netlify-deployment
description: Constraints, Free-plan credit budget rules and checklist for deploying the ManufacturingOpsTeam dashboard to Netlify (Astro SSR via @astrojs/netlify + Netlify Database). Use when designing hosting, writing netlify.toml, configuring environment variables, provisioning Netlify resources, or planning a deploy.
user-invocable: false
---

# Netlify deployment

Status of these notes: researched 2026-11-25 (evidence in `docs/ADR-001.md` §1.1 and §14);
**re-verify against current Netlify docs before relying on them** and record evidence in ADR-002
(`docs/adr/`). Stack: Astro SSR + `@astrojs/netlify` (pages and `/api/v1/*` run as Netlify
Functions), Netlify Database (Postgres), one Netlify site, one deployable.

## Known constraints
- **[R]** Netlify Functions execute on demand in an **ephemeral runtime environment** and scale
  automatically ([Netlify – Functions overview](https://docs.netlify.com/build/functions/overview/)).
  Treat the function filesystem as temporary: no SQLite file, uploads or sessions stored on disk.
  Function limits: 60 s synchronous, Node.js runtime (ADR-001 F3).
- **[R]** Netlify Database (serverless Postgres, built on Neon) became generally available
  2026-04-28; package `@netlify/database`. The older beta "Netlify DB" (`@netlify/neon`) is
  deprecated ([Netlify changelog](https://www.netlify.com/changelog/2026-04-28-netlify-database/)).
- **[R]** Netlify Blobs is key/value object storage for files/assets; Netlify's own guidance is
  that dynamic structured data belongs in the database
  ([Netlify – Data & storage overview](https://docs.netlify.com/build/data-and-storage/overview/)).
- **[R]** Netlify Functions languages are TypeScript, JavaScript and Go. **Python is not supported
  as a Functions runtime** (Python exists only in the build image). (ADR-001 F1.)
- **[R]** Netlify Database migrations are applied on every production deploy before publish;
  deploy previews get their own database branch copied from production (ADR-001 F5).
- **[R]** On the Free plan, organization-owned private repos are not supported for contributors;
  the repo is public (user decision) (ADR-001 F10).

## Free-plan credit budget (user decision: Free plan only)
- **[R]** Free plan = **300 credits/month, hard limit**; when exhausted, **all projects pause**
  ("Site not available"). Each production deploy = 15 credits; DB compute 10 credits/CU-hour
  (sleeps after 5 min idle); function compute, requests and bandwidth are also metered (ADR-001 F8).
- **Never** upgrade the plan, enable paid add-ons, turn on auto-recharge/auto-purchase of credits,
  or buy anything without **explicit user approval** relayed by the Orchestrator. Fallbacks
  (Personal plan, external Neon free Postgres) also need user approval.
- **Before provisioning** anything (site, database, branches), verify the account's plan and
  current credit usage in the Netlify UI and record it in the hand-off. Stop if the account is
  not on the Free credit-based plan or would incur a charge.
- **Local-first:** develop and test against the local emulator (`astro dev` / `netlify dev`) and
  `@netlify/database-dev`, which cost no credits. Deploy only to verify what cannot be verified
  locally.
- Batch merges to `main` (target ≤ 1–2 production deploys per week); use deploy previews sparingly
  (ADR-002 decides whether automatic previews are off). Check credit usage weekly and before every
  deploy; report it in the hand-off.

## Checklist
- [ ] Account plan and credit usage checked and recorded before provisioning or deploying.
- [ ] `netlify.toml` committed: build command (`astro build`), publish dir `dist`, `[[headers]]`,
      context env (e.g., `DEMO_RESET_ENABLED`). Astro adapter generates the functions.
- [ ] Secrets only as Netlify environment variables (`NETLIFY_DB_URL` is injected by Netlify) —
      never committed.
- [ ] Deploy previews use their own database branch; demo reset disabled on previews unless enabled.
- [ ] Migrations in `netlify/database/migrations/`; `npm run db:reset-seed` documented.
- [ ] Security headers (CSP, X-Frame-Options/`frame-ancestors`, Referrer-Policy) configured.
- [ ] "DEMO – FICTIONAL DATA" banner visible on deployed site.
- [ ] Rollback procedure documented (Netlify keeps previous deploys).
- [ ] Production deploy only after Security Reviewer sign-off and user approval.

## Fallback
ADR-001 §4 fallbacks: external Neon free Postgres via env var (C-alt) if Netlify Database credits
are insufficient; a read-only static snapshot (Option E) if Netlify is unavailable for the demo.
Either fallback needs user approval.
