import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startDb } from './helpers';

const root = fileURLToPath(new URL('..', import.meta.url));
let ctx: Awaited<ReturnType<typeof startDb>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: (req: Request, c: any) => Promise<Response>;
const netlifyCtx = { cookies: { get() {}, set() {}, delete() {} }, geo: {}, ip: '127.0.0.1', requestId: 't', params: {}, waitUntil() {}, next() {}, json: (b: unknown) => Response.json(b) };
const call = (path: string, init: RequestInit = {}) => handler(new Request('http://localhost' + path, init), netlifyCtx);
const shipper = { cookie: 'poc_user=demo.shipper:Shipping' };

beforeAll(async () => {
  execFileSync('npx', ['astro', 'build'], { cwd: root, stdio: 'pipe' });
  ctx = await startDb();
  process.env.NETLIFY_DB_URL = ctx.url; // what Netlify injects in a deployed function
  await ctx.sql`INSERT INTO shipment (shipment_no, customer, status) VALUES ('SH-1042','Aldervale Aerostructures','Verified')`;
  handler = (await import(pathToFileURL(root + '.netlify/v1/functions/ssr/ssr.mjs').href)).default;
}, 120_000);
afterAll(async () => { await ctx.sql.end(); await ctx.db.stop(); });

describe('#7 built Netlify function: middleware + API endpoint run server-side', () => {
  it('adapter default middlewareMode is "classic": bundled in the function, no edge function emitted', () => {
    const cfg = readFileSync(root + '.netlify/build/virtual_astro_middleware.mjs', 'utf8');
    expect(cfg).toContain('poc_user'); // our middleware code is inside the function bundle
    expect(execFileSync('ls', [root + '.netlify/v1/edge-functions/middleware']).toString().trim()).toBe('');
  });
  it('401 without a session (deny by default)', async () => {
    const r = await call('/api/shipments');
    expect(r.status).toBe(401);
  });
  it('403 for a non-Shipping role on POST', async () => {
    const r = await call('/api/shipments', { method: 'POST', headers: { cookie: 'poc_user=demo.viewer:Viewer', origin: 'http://localhost', 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(403);
  });
  it('Shipping role can ship; DB rows written by the function are visible via the DB', async () => {
    const r = await call('/api/shipments', { method: 'POST', headers: { ...shipper, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 4 }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('x-poc-middleware')).toBe('ran');
    const [row] = await ctx.sql`SELECT status FROM shipment WHERE shipment_no='SH-1042'`;
    expect(row.status).toBe('Shipped');
    const r2 = await call('/api/shipments', { headers: shipper });
    expect((await r2.json()).shipments[0].status).toBe('Shipped');
  });
  it('shipping again returns 409 and does not add ledger rows', async () => {
    const r = await call('/api/shipments', { method: 'POST', headers: { ...shipper, origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ shipmentNo: 'SH-1042', partNo: 'CRC-2041-B', qty: 4 }) });
    expect(r.status).toBe(409);
    const [n] = await ctx.sql`SELECT count(*)::int AS n FROM inventory_transaction`;
    expect(n.n).toBe(1);
  });
  it('#8 Chart.js is bundled into dist (no CDN)', () => {
    const files = execFileSync('ls', [root + 'dist/_astro']).toString();
    expect(files).toMatch(/index\.astro_astro_type_script/);
    const js = readFileSync(root + 'dist/_astro/' + files.split('\n').find((f) => f.endsWith('.js'))!, 'utf8');
    expect(js).toContain('Chart');
  });
});
