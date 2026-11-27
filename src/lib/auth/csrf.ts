// CSRF synchronizer token (ADR-003 D-8). The token lives in session.csrf_token.
import { safeEqual } from './tokens';

export function csrfFromHeader(request: Request): string | null {
  const v = request.headers.get('x-csrf-token');
  return v && v.length > 0 ? v : null;
}

/** Reads the single `_csrf` field from a urlencoded body (reads a clone; the handler reads the original). */
export async function csrfFromForm(request: Request): Promise<string | null> {
  const text = await request.clone().text();
  const all = new URLSearchParams(text).getAll('_csrf');
  return all.length === 1 && all[0] ? all[0] : null;
}

export function checkCsrf(sessionToken: string, presented: string | null): boolean {
  return !!presented && safeEqual(sessionToken, presented);
}
