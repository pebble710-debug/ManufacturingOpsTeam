// The only module that reads process.env for mode decisions (ADR-003 D-13). Fail-safe: 'local' needs a positive signal.
export function appEnv(): 'local' | 'deployed' {
  const netlifyMarker = ['NETLIFY', 'SITE_ID', 'DEPLOY_ID', 'CONTEXT'].some((k) => !!process.env[k]);
  if (import.meta.env?.DEV === true) return 'local';
  if (process.env.APP_ENV === 'local' && !netlifyMarker) return 'local';
  return 'deployed';
}
export function isDemoResetEnabled(): boolean {
  return process.env.DEMO_RESET_ENABLED === 'true';
}
/** True only for the Astro dev server (build-time constant): selects the non-__Host- cookie name. */
export function isDevServer(): boolean {
  return import.meta.env?.DEV === true;
}
