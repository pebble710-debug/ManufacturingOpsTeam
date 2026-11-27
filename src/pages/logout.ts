// POST /logout (form route F-logout). GET is 405 via the route table (Matrix R-13).
import type { APIRoute } from 'astro';
import { getSql } from '../lib/db';
import { logoutSession } from '../lib/services/auth';
import { sessionCookieName } from '../lib/auth/session';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies }) => {
  const token = cookies.get(sessionCookieName())?.value ?? null;
  if (locals.user) await logoutSession(getSql(), locals.user.id, token);
  cookies.delete(sessionCookieName(), { path: '/' });
  return new Response(null, { status: 303, headers: { Location: '/login?signed_out=1', 'Cache-Control': 'no-store' } });
};
