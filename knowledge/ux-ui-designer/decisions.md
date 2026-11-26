# Decisions — UX/UI Designer (Maya)

Full spec: `docs/design/ui-spec.md` (revision 2, 2026-11-26).

- **R-UI-1: hide what a role can never do; explain what it cannot do right now.** Unavailable buttons use `aria-disabled="true"` plus visible reason text (never the `disabled` attribute), so keyboard and screen-reader users find the reason and, without JavaScript, the server still answers 403/409 with the same wording.
- **Verifier = packer** is explained on Pack & Verify (states A to D), at Start packing, and on the detail page. Admin and Viewer see read-only content plus a one-line role note.
- **Fixed reporting date label** is plain text, repeated on dashboard, reports, a compact chip on every page, and date-field hints.
- **Hand-calculated contrast ratios** are in spec section 3.3. They must be re-checked with a tool on built CSS.
- **No inline script or style** (CSP `script-src 'self'; style-src 'self'`): classes only, external scripts, chart data in `data-*` or escaped JSON blocks.
- **Session UX**: expiry message on login, no lockout, 429 message with fixed "15 minutes" text; WCAG 2.2.1 handled as the essential-security exception with an optional prompt left open.
- Rework gate applies to "Start packing again" (contract E-16), so that button is shown unavailable with the missing step named.
