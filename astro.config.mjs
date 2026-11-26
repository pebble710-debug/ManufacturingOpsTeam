import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// ADR-001 section 5 / ADR-002. Server-rendered app on Netlify Functions.
// - output 'server': pages and /api/v1/* run in the SSR function.
// - checkOrigin: blocks cross-origin FORM posts only; JSON endpoints still need the
//   synchronizer CSRF token and content-type enforcement (ADR-001 section 8 #4, ADR-003).
// - Do NOT set middlewareMode 'edge' (default 'classic' runs middleware in the SSR function).
// - We do not use Astro sessions (own DB-backed sessions); Astro.session is banned by lint.
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  security: { checkOrigin: true },
  // Keep scripts and styles as external files so the CSP in netlify.toml can stay
  // `script-src 'self'` with no inline scripts (ADR-002 section 9).
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
