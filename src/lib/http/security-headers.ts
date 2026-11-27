// Security headers (ADR-003 D-12). One CSP value, shared with netlify.toml (Sasha C-6; a unit test compares them).
export const CSP_BASE =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
export const CSP_DEPLOYED = `${CSP_BASE}; upgrade-insecure-requests`;

export function applySecurityHeaders(res: Response, opts: { deployed: boolean; requestId: string; noStore?: boolean }): Response {
  const h = res.headers;
  const set = (k: string, v: string) => h.set(k, v);
  set('Content-Security-Policy', opts.deployed ? CSP_DEPLOYED : CSP_BASE);
  set('X-Content-Type-Options', 'nosniff');
  set('Referrer-Policy', 'strict-origin-when-cross-origin');
  set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  set('Cross-Origin-Opener-Policy', 'same-origin');
  set('X-Frame-Options', 'DENY');
  set('X-Robots-Tag', 'noindex, nofollow');
  if (opts.deployed) set('Strict-Transport-Security', 'max-age=31536000');
  if (opts.noStore !== false) set('Cache-Control', 'no-store');
  set('X-Request-Id', opts.requestId);
  return res;
}
