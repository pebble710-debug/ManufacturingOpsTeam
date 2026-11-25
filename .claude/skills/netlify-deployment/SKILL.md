---
name: netlify-deployment
description: Constraints and checklist for deploying the ManufacturingOpsTeam dashboard to Netlify (static site + Netlify Functions + a persistent managed store). Use when designing hosting, writing netlify.toml, configuring environment variables, or planning a deploy.
user-invocable: false
---

# Netlify deployment

Status of these notes: researched 2026-11-25; **re-verify against current Netlify docs before
relying on them** and record evidence in ADR-002.

## Known constraints
- **[R]** Netlify Functions execute on demand in an **ephemeral runtime environment** and scale
  automatically ([Netlify – Functions overview](https://docs.netlify.com/build/functions/overview/)).
  Treat the function filesystem as temporary: no SQLite file, uploads or sessions stored on disk.
- **[R]** Netlify Database (serverless Postgres, built on Neon) became generally available
  2026-04-28; package `@netlify/database`. The older beta "Netlify DB" (`@netlify/neon`) is
  deprecated ([Netlify changelog](https://www.netlify.com/changelog/2026-04-28-netlify-database/)).
- **[R]** Netlify Blobs is key/value object storage for files/assets; Netlify's own guidance is
  that dynamic structured data belongs in the database
  ([Netlify – Data & storage overview](https://docs.netlify.com/build/data-and-storage/overview/)).
- **[A]** Netlify Functions' first-class languages are JavaScript/TypeScript and Go; Python is
  not assumed to be supported as a Functions runtime. The architect must confirm.

## Checklist
- [ ] `netlify.toml` committed: build command, publish dir, functions dir, redirects for `/api/*`.
- [ ] All secrets (DB URL, session secret) set as Netlify environment variables — never committed.
- [ ] Separate contexts: deploy previews use a separate/demo database or re-seeded data.
- [ ] Seed/migration command documented and runnable from local CLI against the target DB.
- [ ] Security headers (CSP, X-Frame-Options/`frame-ancestors`, Referrer-Policy) configured.
- [ ] "DEMO – FICTIONAL DATA" banner visible on deployed site.
- [ ] Rollback procedure documented (Netlify keeps previous deploys).
- [ ] Production deploy only after Security Reviewer sign-off and user approval.

## Fallback
If ADR-001 rejects Netlify for the backend, document the fallback (e.g., run locally only, or
static Netlify front end with a demo-only data snapshot) and get user approval.
