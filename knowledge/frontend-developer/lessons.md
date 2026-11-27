# Lessons (Felix)

- 2026-11-26 T-026: Render .astro pages in a scratch test via `experimental_AstroContainer` + a throwaway vitest config using `getViteConfig` from astro/config (config file must live in the repo root to resolve `astro/config`; delete afterwards). Screenshot by `page.setContent` + `addStyleTag` of tokens.css+app.css (strip the @import).
- `import.meta.glob` lets a page reference a not-yet-written module (auth service) without breaking check/build; replace with a direct import when it exists.
- Type aria-* props with `as const` literals in spread objects or astro check fails.
- Screenshot taken right after load can catch CSS transitions mid-way (grey Sign out button); wait ~600 ms.
