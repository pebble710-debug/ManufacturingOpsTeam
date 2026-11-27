// Bridge to Diego's auth service (src/lib/services/auth.ts, ADR-003): `loginWithPassword()`.
// TODO(T-026): once src/lib/services/auth.ts exists, replace this file's lookup with a direct
//   import { loginWithPassword } from '../lib/services/auth';
// import.meta.glob is used so type-check and build pass while the module is still missing.
import type { AstroCookieSetOptions } from 'astro';

export interface LoginInput { username: string; password: string; clientKey: string }
export type SessionCookie = string | { name: string; value: string; options?: AstroCookieSetOptions };
export type LoginResult =
  | { ok: true; sessionCookie: SessionCookie }
  | { ok: false; status: number; code: string };
type LoginFn = (input: LoginInput) => Promise<LoginResult>;

const modules = import.meta.glob<{ loginWithPassword?: LoginFn }>('../lib/services/auth.ts');

export async function loginWithPassword(input: LoginInput): Promise<LoginResult> {
  const load = Object.values(modules)[0];
  const mod = load ? await load() : undefined;
  if (!mod?.loginWithPassword) return { ok: false, status: 503, code: 'AUTH_SERVICE_UNAVAILABLE' };
  return mod.loginWithPassword(input);
}
