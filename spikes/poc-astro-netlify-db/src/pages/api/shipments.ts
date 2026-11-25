import type { APIRoute } from 'astro';
import { getSql } from '../../lib/db';
import { shipShipment, ShipError } from '../../lib/ship';

export const prerender = false;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async () => {
  const rows = await getSql()`SELECT shipment_no, customer, status FROM shipment ORDER BY id LIMIT 20`;
  return json({ shipments: rows });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.user?.role !== 'Shipping') return json({ error: 'FORBIDDEN' }, 403);
  const body = (await request.json()) as { shipmentNo?: string; partNo?: string; qty?: number };
  if (!body.shipmentNo || !body.partNo || !Number.isInteger(body.qty)) return json({ error: 'VALIDATION_ERROR' }, 422);
  try {
    await shipShipment(getSql(), { shipmentNo: body.shipmentNo, partNo: body.partNo, qty: body.qty!, actor: locals.user.name });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ShipError) return json({ error: 'CONFLICT' }, 409);
    throw e;
  }
};
