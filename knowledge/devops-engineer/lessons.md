# Lessons (Theo)

## 2026-11-25 T-007 POC (Astro + Netlify Database, local)
- `astro dev` (Astro 7 + @astrojs/netlify 8) emulates Netlify DB (PGlite, persisted in `.netlify/db`, URL in `.netlify/state.json`) but does NOT apply migrations. Use `applyMigrations` from `@netlify/database-dev` (see spikes/poc-astro-netlify-db/scripts/migrate.ts) or the CLI.
- `astro dev` daemonises in Astro 7 (`astro dev stop|status|logs`); `astro preview` does not work with the Netlify adapter.
- `checkOrigin` only guards form content types; JSON POSTs need our own CSRF.
- Vitest + `NetlifyDB` (in-memory) is a fast, headless integration-test base; the built SSR handler can be imported and called with Web Requests.
- docs.netlify.com / www.netlify.com were not reachable from the sandbox; re-verify Netlify facts where network allows.

## 2026-11-26 T-024 skeleton + ADR-002
- `npm install` fails ("edgesOut" of null) without `.npmrc` `legacy-peer-deps=true`; committed in `.npmrc` (also `save-exact`).
- `astro dev` auto-backgrounds only when it detects an agent (`isRunByAgent`); `--ignore-lock` forces a foreground server. Playwright webServer uses `astro dev --ignore-lock --port N`, url `/health`.
- `.netlify/state.json` (DB url) appears only after `astro dev` finished starting; `db:migrate` reads it. Testing the runner leaves tables in `.netlify/db`: delete that dir afterwards.
- Astro inlines small scripts/styles by default; set `build.inlineStylesheets:'never'` + `vite.build.assetsInlineLimit:0` to keep CSP `script-src 'self'`.
- `netlify.toml` headers likely do not cover SSR function responses [A]; middleware must set them too.
