# POC report: Astro + Netlify adapter + Netlify Database (local) — T-007

Date: 2026-11-25 · Author: devops-engineer (Theo), covering backend pieces · Inputs: `docs/ADR-001.md` §5, §12.1
Code: `spikes/poc-astro-netlify-db/` (throwaway; not the application). Fictional data only (Cobalt Ridge Components).

**Scope guard honoured:** nothing was created, linked, provisioned or deployed on Netlify. No `netlify` CLI was
installed or run. No credentials exist in this environment. Everything below ran locally.
`docs.netlify.com` and `www.netlify.com` do not resolve from this sandbox (not on the network allow-list), so
**no Netlify doc could be re-read this session**; platform facts in §4 are ADR-001's, not re-verified.

## 1. Versions used (exact, pinned in `package.json`)

Node 22.23.5, npm 10.9.9 (container). astro 7.4.13, @astrojs/netlify 8.2.14, @netlify/database 2.0.4,
@netlify/database-dev 1.0.2 (devDep), postgres 4.1.1, chart.js 4.6.2, vitest 5.1.1, typescript 5.9.3,
@astrojs/check 0.9.12, playwright 1.63.0 (matches the pre-installed `/opt/pw-browsers` Chromium; no browser download).
Transitively: @netlify/vite-plugin 3.0.1 / @netlify/dev (emulator), @electric-sql/pglite 0.3.x + pg-gateway
(inside database-dev).

## 2. Results at a glance

| # | Check | Result |
|---|-------|--------|
| 1 | Astro + `@astrojs/netlify`, `output:'server'`, TS strict, `astro build` | **PASS** (with deviation D1, D2) |
| 2 | `@netlify/database` + `@netlify/database-dev` exist and work | **PASS** (APIs differ from ADR wording, D3) |
| 3 | Forward-only migration + append-only trigger | **PASS** |
| 4 | postgres.js transaction (ship = status + ledger + audit), rollback shown | **PASS** |
| 5 | Persistence across restart | **PASS locally** (on-disk emulator); **NOT VERIFIABLE LOCALLY** for Netlify-hosted DB |
| 6 | Seed ~3,000 rows, batched, one transaction | **PASS locally** (0.57 s); **NOT VERIFIABLE LOCALLY** over the network to Netlify DB |
| 7 | Middleware runs server-side in the function context | **PASS** (default `middlewareMode` = `classic`) |
| 8 | Chart.js bundled via npm, build succeeds | **PASS** |
| 9 | Vitest headless (#3-#7) | **PASS** 17/17 |
| 9b | Playwright smoke vs `astro dev` | **PASS** (chart painted, no page errors); `astro preview` **FAIL** (D5) |
| 10 | `npm audit --audit-level=high` | **PASS** (exit 0; 10 moderate, 0 high/critical) |
| - | `astro dev` DB emulation without CLI/login | **PASS**, but migrations are NOT auto-applied (D4) |
| - | Edge Functions emulation in `astro dev` | **FAIL (non-blocking)**: "fetch failed" (D6) |
| - | `astro/zod` export (ADR §5 [A]) | **PASS** |
| - | Node >= 22.18 runs `.ts` scripts natively (ADR §5 [A]) | **PASS** (Node 22.23.5) |

## 3. Evidence by check

### 1. Scaffold and build
```
$ npx astro build
[build] output: "server"   [build] adapter: @astrojs/netlify
[@astrojs/netlify] Enabling sessions with Netlify Blobs
[@astrojs/netlify] Emitted _redirects
[@astrojs/netlify] Bundling function ../../../build/entry.mjs
[@astrojs/netlify] Generated SSR Function      [build] Complete!      (about 2 s)
$ npx astro check      -> 0 errors, 0 warnings, 0 hints
```
Output: `.netlify/v1/functions/ssr/ssr.mjs` (config: `path:'/*'`, `preferStatic:true`, generator
`@astrojs/netlify@8.2.14`), `.netlify/build/entry.mjs`, `.netlify/v1/config.json`, `dist/_astro/*.js`.

### 2. Packages and real APIs (read from `node_modules/*/dist/*.d.ts`)
- `@netlify/database-dev@1.0.2` exists. Exports `NetlifyDB` (`new NetlifyDB({directory?, port?, logger?})`,
  `start(): Promise<connectionString>`, `applyMigrations(dir, target?)`, `reset()`, `exec`, `query`, `transaction`,
  `stop()`), plus standalone `applyMigrations(db, dir)`, `initializeTrackingTable`, `resetDatabase`.
  Implementation: **PGlite (WASM Postgres) behind a pg-gateway TCP wire server**. No `directory` = in-memory; with
  `directory` = persisted on disk. `start()` returns `postgres://postgres@localhost:<random port>/postgres`.
  Its own README says it is an internal building block of `@netlify/dev`; "you probably want the CLI or Vite plugin".
- Migration folder rule (from source): name must match `^\d+_.+$`; either `NNNN_slug.sql` or
  `NNNN_slug/migration.sql`; each migration runs in a transaction with a tracking-table insert; re-apply is a no-op.
- `@netlify/database@2.0.4` exports `getDatabase(options?)` and `getConnectionString()` (throws
  `MissingDatabaseConnectionError` if `NETLIFY_DB_URL` unset). `getDatabase()` returns `{driver:'server'|'serverless', sql, pool, connectionString}`;
  `sql` is a **waddler** tagged-template client over `pg` (server) or `@neondatabase/serverless` (serverless).
  Runtime deps: `pg`, `ws`, `waddler`, `@neondatabase/serverless`.
- **postgres.js 4.1.1 works against the emulator** through `getConnectionString()`/`NETLIFY_DB_URL`
  (used by every test and by the API endpoint under `astro dev` and the built function). No need to fall back to `pg`.

### 3. Migration and append-only trigger
`netlify/database/migrations/0001_init/migration.sql`: `shipment`, `inventory_transaction`, `audit_log`, trigger
function `reject_mutation()` and `BEFORE UPDATE OR DELETE` triggers on `inventory_transaction` and `audit_log`.
`tests/migration.test.ts` (5 tests) proves: tables created; re-apply returns `[]`; UPDATE and DELETE raise
`... is append-only: UPDATE rejected`; **TRUNCATE is still allowed** (the seed/reset design in ADR §5 holds); CHECK
constraint rejects a bad status. Applying to a live emulator: `node scripts/migrate.ts` -> `applied: [ '0001_init' ]`,
second run `applied: []`.

### 4. Transaction and rollback
`src/lib/ship.ts` uses `sql.begin()`. `tests/ship.test.ts` (4 tests): commit writes status `Shipped` + 1 ledger row (qty -5)
+ 1 audit row; a thrown error after the ledger insert leaves status `Verified`, ledger 0, audit 0; a DB-level failure
(NOT NULL violation in the audit insert) rolls back the earlier two statements; a second ship is refused (status guard) with no extra rows.

### 5. Persistence
- **Verified locally (a):** `tests/persistence.test.ts` starts `NetlifyDB({directory})`, writes + ships, `sql.end()`+`db.stop()`,
  starts a new `NetlifyDB` on the same directory, re-applies migrations (no-op) and reads back status, ledger, audit; the trigger still fires.
- **Verified locally (b):** `astro dev` (Vite plugin) persists to `<project>/.netlify/db`. Wrote via the API, ran
  `astro dev stop`, restarted `astro dev` (new port in `.netlify/state.json`), read the data back: `{"s":600,"l":2402,"a":2}`,
  `SH-1001` and `SH-1004` still `Shipped`.
- **NOT VERIFIABLE LOCALLY:** that a Netlify-hosted database survives function cold starts, redeploys, idle sleep and
  deploy-preview branching; backup/restore; production migrations on publish. This only covers the emulator (a single-process PGlite),
  not Neon-backed Postgres.

### 6. Seed timing
`tests/seed.test.ts` and `node scripts/reset-seed.ts`: 600 shipments + 2,400 ledger rows = 3,000 rows, batches of 500 multi-row
INSERTs, one `sql.begin()` transaction, with `TRUNCATE ... RESTART IDENTITY CASCADE` first.
```
SEED_TIMING rows=3000 ms=568      (vitest, in-memory)      { rows: 3000, ms: 581 }   (script, on-disk, via TCP)
```
Re-seeding is deterministic (same `sum(qty_delta)`). Caveat: this is local, zero-latency PGlite. A remote DB adds a network
round trip per batch (here 12 statements plus begin/commit, so the added latency should be small), plus DB wake-from-sleep.
**Network-side timing and the 60 s function limit must be measured on Netlify** (ADR R4 still open).

### 7. Middleware in the function context
- `middlewareMode` default: `@astrojs/netlify/dist/index.js` line 466:
  `integrationConfig?.middlewareMode ?? (edgeMiddleware ? "edge" : "classic")` -> **`classic` by default**. Edge middleware is opt-in.
- Build evidence: our code is bundled in `.netlify/build/virtual_astro_middleware.mjs` (contains `poc_user`, `x-poc-middleware`),
  imported by `.netlify/build/entry.mjs`, which is the only function (`ssr`). `.netlify/v1/edge-functions/middleware/` is **empty**.
- Runtime evidence: `tests/built-function.test.ts` builds, then imports the *built* `ssr.mjs` handler and calls it with Web `Request`s
  and `NETLIFY_DB_URL` pointing at the emulator: no cookie -> **401**; Viewer role POST -> **403**; Shipping POST -> **200** with
  `x-poc-middleware: ran`, row changed in the DB; repeat -> **409** with no new ledger rows. Same behaviour under `astro dev` with curl.
- Caveat: this is the built handler run in plain Node, not the Netlify platform. Real function runtime behaviour (env injection,
  `NETLIFY_DB_URL` presence, cold start) is **NOT VERIFIABLE LOCALLY**.

**Security finding (important, see R-1):** Astro `security.checkOrigin: true` blocks cross-origin POSTs only for
form-style content types. Observed under `astro dev`:
```
POST Origin: http://evil.example  content-type: application/x-www-form-urlencoded -> 403 "Cross-site POST form submissions are forbidden"
POST Origin: http://evil.example  content-type: text/plain                        -> 403
POST Origin: http://evil.example  content-type: application/json                  -> 200 {"ok":true}   (state changed)
```
So JSON endpoints are not covered by `checkOrigin` (browsers need a CORS preflight for cross-origin JSON, so the practical risk is lower, but the
endpoint itself does not enforce anything). The ADR's own synchronizer token and "reject non-JSON content types" are therefore **required**, not optional.

### 8. Chart.js
`src/pages/index.astro` imports `chart.js` in a hoisted `<script>`; Vite emits one 135 KB file
`dist/_astro/index.astro_astro_type_script_index_0_lang.*.js` containing Chart.js; no CDN. Playwright (`scripts/smoke.mjs`, system Chromium
at `/opt/pw-browsers`, no `playwright install`) against `astro dev`: banner text present, canvas has painted pixels, 0 page errors.

### 9. Test commands
```
cd spikes/poc-astro-netlify-db
npm ci
npm test            # vitest run: 5 files, 17 tests, about 14 s, no network, no Netlify account  -> all passed
npx astro check     # 0 errors
npx astro dev --port 4399   # daemonised in Astro 7 (see D7); stop with: npx astro dev stop
npm run db:migrate && npm run db:reset-seed && npm run smoke
```
Playwright run: `{"banner":"DEMO – FICTIONAL DATA (spike)","chartPainted":true,"nonTransparentPixels":132737,"pageErrors":[]}`. The smoke script is a
plain Node script, not a Playwright Test suite; the CI `webServer` wiring (ADR R5, §12.1 item 8) was **not** done here.

### 10. Audit
```
$ npm audit --audit-level=high    -> exit 0   "10 moderate severity vulnerabilities"   (0 high, 0 critical)
$ npm audit --omit=dev --audit-level=high -> exit 0 (same 10 moderate; they sit in the production dependency tree)
```
All moderate, transitive: `glob`/`minimatch` DoS advisories via `@astrojs/netlify > @netlify/vite-plugin > @netlify/dev > ... > zip-it-and-ship-it / archiver`.
`npm audit fix --force` would *downgrade* `@astrojs/netlify` to 6.5.13, so do not use it. These live in build/dev tooling, but npm reports them under dependencies.
**Recommend Sasha records them as accepted risk** (build-time only, not in the request path).

## 4. Deviations from ADR-001 (what differed from the text)

| ID | ADR-001 says | Observed | Impact |
|----|--------------|----------|--------|
| D1 | Astro **5.x**, "pin >= the release that fixes the checkOrigin advisory" | Latest `@astrojs/netlify` 8.2.14 needs `astro ^7`; Astro 7.4.13 requires **Node >= 22.23.4** (ADR pins Node 24 so fine; `engines` here is >=22.23.4). | Update ADR: Astro 7.x + adapter 8.x. Re-check R2 (agent unfamiliarity: Astro 7 CLI differs). Use Node 24 in `.nvmrc`; note CI/Netlify must match. I could not test Node 24 here (container has 22.23.5). |
| D2 | `astro check` works with the strict preset | With only `extends: astro/tsconfigs/strict`, `astro check` reported `padStart does not exist ... lib es2017`. Fixed by explicit `"target":"ES2022","lib":["ES2022","DOM","DOM.Iterable"]` and `@types/node`. | Put these in the real tsconfig. Cause not investigated further (tooling quirk). |
| D3 | `getDatabase().sql`; "`db.sql`" as fallback driver | `getDatabase().sql` is **waddler**, not postgres.js; `getConnectionString()` + postgres.js works fine. `@netlify/database-dev` is documented by its authors as internal to `@netlify/dev`, but is exported and usable (`NetlifyDB`, `applyMigrations`). | ADR choice (postgres.js) confirmed. Note the dependency on a semi-internal package; pin exact version. `@netlify/database` pulls `pg`, `ws`, `waddler`, `@neondatabase/serverless` as runtime deps (more than the ADR §8 #7 list: "astro, adapter, @netlify/database, postgres, chart.js"). |
| D4 | Local flow: `npm run dev` -> `netlify database migrations apply` -> seed | `astro dev` starts the emulator (`NETLIFY_DB_URL` injected, data in `.netlify/db`) but **does not apply migrations**: first request failed with `relation "shipment" does not exist`. The `netlify` CLI was not used (see constraints). | Our `scripts/migrate.ts` (applyMigrations via postgres.js, reads `.netlify/state.json`) works without the CLI; either ship that or add the CLI later and confirm `netlify database migrations apply` works offline (**not tested**). |
| D5 | Playwright `webServer` can start `astro preview` | `astro preview` exits immediately ("Preview server process exited before becoming ready"); the Netlify adapter provides no preview entrypoint. | E2E must target `astro dev` (works), or `netlify dev/serve` (not tested). |
| D6 | "`astro dev` emulates Functions, Blobs, DB, headers, redirects, env vars" | Log line: `Middleware loaded. Emulating features: aiGateway, blobs, database, edgeFunctions, functions, geolocation, headers, images, redirects, server, static.` DB confirmed. But `An error occurred while setting up the Netlify Edge Functions environment: TypeError: fetch failed` (likely Deno download blocked in this sandbox; **cause not confirmed**). No effect on our app (classic middleware, no edge functions). | Low. Re-check on a networked CI runner. |
| D7 | `npm run dev` = `astro dev` | In Astro 7, `astro dev` **daemonises** (prints a JSON line and returns); `astro dev stop/status/logs`. Stopping it also cleans `.netlify/v1` build output. | Playwright `webServer` and CI need `--foreground` style handling or the stop/logs commands; investigate before ADR-002 CI design. |
| D8 | Adapter: ADR assumes no extra storage | Build prints `Enabling sessions with Netlify Blobs` (the adapter wires Astro sessions to Blobs automatically). We do not use Astro sessions (DB-backed own sessions per ADR). | Ensure no Blobs usage / credits; do not call `Astro.session`. |
| D9 | `astro/zod` re-export | Present (`z` object). | Confirmed. |
| D10 | Spike item 4/5/6/9 on Netlify | Not possible by instruction. | See §6. |

## 5. Recommendations to update ADR-001
1. Replace "Astro 5.x" with Astro 7.x and `@astrojs/netlify` 8.x (exact pins), record Node >= 22.23.4 requirement; mark the [A] on `.ts` scripts and `astro/zod` as verified.
2. Mark "default `middlewareMode`" as verified `classic` (runs in the SSR function).
3. §8 #4 CSRF: state that `checkOrigin` covers only form content types; JSON endpoints must require `Content-Type: application/json` plus the synchronizer token / custom header. Add a role-matrix e2e test for this.
4. §5 Local dev story: add the migrate step explicitly (`astro dev` does not apply migrations) and say which tool does it (`scripts/migrate.ts` or CLI). Note the Astro 7 daemonised `astro dev`.
5. §5 Testing / R5: Playwright `webServer` against `astro dev` works headless with system Chromium; `astro preview` is not supported with the Netlify adapter. Keep `@netlify/database-dev` for Vitest (verified).
6. §8 #7 dependency list: add the transitive runtime deps of `@netlify/database` (`pg`, `ws`, `waddler`, `@neondatabase/serverless`) and note the 10 moderate audit findings (accepted-risk decision for Sasha).
7. Keep the open items in §12.1 items 4-9 (deploy, redeploy persistence, cold start, remote seed timing, CI run, credit read) for after the user has provisioned Netlify.

## 6. NOT VERIFIABLE LOCALLY (needs the user's Netlify account) and verify-before-provisioning checklist
Public docs could not be fetched this session (hosts blocked), so these items are carried from ADR-001 F8/F10, still tagged [R] by Marcus on 2026-11-25,
and **must be re-read on the user's account before provisioning**:

- [ ] Account is on a **credit-based** plan (accounts created since 2025-09-04). Free plan = 300 credits/month, **hard limit; projects pause at 0 credits**.
- [ ] **Netlify Database is offered on Free** and what the Free limits are (1 CU max, sleep after 5 min idle, 48 CU-hours per DB per month, 5 GB storage, 3 DBs, 20 branches, backups).
- [ ] **Credit card required?** Unknown from here; check at sign-up and at DB enablement. If a card is requested, stop and ask the user.
- [ ] **Auto-recharge OFF** (Billing > credits). Keep it off; also no plan upgrade/purchase without explicit user approval.
- [ ] Credit rates still current: production deploy 15, DB compute 10/CU-hour, DB bandwidth 20/GB, functions 10/GB-hour, requests 2 per 10k.
- [ ] Whether **deploy previews/branch databases consume credits**; consider turning off automatic previews (ADR R1) and read the usage page after the first deploy.
- [ ] Repo access: Free plan cannot build organization-owned private repos (use public or personal repo). This repo is public: confirm nothing secret is in history.
- [ ] Enabling the DB: adding `@netlify/database` auto-provisions it; confirm what is created at first deploy and that `NETLIFY_DB_URL` is injected in function runtime and at build time (needed for migrations).
- [ ] Migrations run on publish: a failed migration blocks the deploy. Check preview-branch behaviour (copy of production data).
- [ ] Functional checks that need a deploy: redeploy persistence, cold start + DB wake latency, remote seed (3k rows) vs 60 s limit, `NETLIFY_DB_URL` TLS, connection limits with postgres.js `max:1-3`, Astro 7 adapter on Netlify's Node runtime.
- [ ] Env vars set in the Netlify UI only (`DEMO_RESET_ENABLED`); no secrets committed. Spike contains none (grep: no keys; the only values are fake demo cookie strings).

## 7. Open questions / risks
- R-1 (owner: backend-developer + security-reviewer): JSON endpoints not covered by `checkOrigin`; implement CSRF token and content-type enforcement.
- R-2 (owner: software-architect): ADR-001 should absorb D1-D8 above before "Accepted -> Implemented".
- R-3 (owner: devops-engineer): CI design must handle the daemonised `astro dev` and the missing `astro preview`; Edge Functions emulation fetch failure to be re-checked on a networked runner.
- R-4: Node 24 untested (container has Node 22.23.5).
- R-5 (owner: security-reviewer): 10 moderate transitive advisories; decide accept vs. track upstream.
- Housekeeping: a "WIP" commit `3dff979` containing part of the spike was created by someone else during my run (I did not commit or push). Spike files added or edited after it are uncommitted.
