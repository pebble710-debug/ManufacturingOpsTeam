import { defineMiddleware } from 'astro:middleware';

/** SPIKE: trivial cookie "poc_user=<name>:<Role>" check. NOT real auth. Deny by default for /api. */
export const onRequest = defineMiddleware(async (context, next) => {
  const raw = context.cookies.get('poc_user')?.value ?? '';
  const [name, role] = raw.split(':');
  if (name && role) context.locals.user = { name, role };

  if (context.url.pathname.startsWith('/api/') && !context.locals.user) {
    return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const res = await next();
  res.headers.set('x-poc-middleware', 'ran'); // evidence marker
  return res;
});
