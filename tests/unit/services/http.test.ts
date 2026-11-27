import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkOrigin, contentTypeOk, safeNext } from '../../../src/lib/http/pipeline';
import { CSP_DEPLOYED } from '../../../src/lib/http/security-headers';
import { decodeForm } from '../../../src/lib/http/form';
import { guardCell, toCsv } from '../../../src/lib/services/reports';
import { sessionCookieName, sessionCookieOptions } from '../../../src/lib/auth/session';
import { DUMMY_HASH, SCRYPT_PARAMS, hashPassword, needsRehash, verifyPassword } from '../../../src/lib/auth/password';
import { scrub } from '../../../src/lib/audit';
import { computeClock } from '../../../src/lib/clock';
import { parseInput } from '../../../src/lib/validation/common';
import { createShipmentSchema, verifySchema } from '../../../src/lib/validation/shipments';

const req = (h: Record<string, string>) => new Request('http://localhost:4321/x', { method: 'POST', headers: h });

describe('step 2a Origin / Sec-Fetch-Site', () => {
  const site = 'http://localhost:4321';
  it('accepts same origin, refuses foreign and null', () => {
    expect(checkOrigin(req({ origin: site }), site)).toBe(true);
    expect(checkOrigin(req({ origin: 'https://evil.example' }), site)).toBe(false);
    expect(checkOrigin(req({ origin: 'null' }), site)).toBe(false);
  });
  it('falls back to Sec-Fetch-Site when Origin is absent; no headers passes (curl)', () => {
    expect(checkOrigin(req({ 'sec-fetch-site': 'cross-site' }), site)).toBe(false);
    expect(checkOrigin(req({ 'sec-fetch-site': 'same-origin' }), site)).toBe(true);
    expect(checkOrigin(req({ 'sec-fetch-site': 'none' }), site)).toBe(true);
    expect(checkOrigin(req({}), site)).toBe(true);
  });
});
describe('step 2b content-type allow-list', () => {
  it('api accepts only JSON; form only urlencoded', () => {
    expect(contentTypeOk('application/json', 'api')).toBe(true);
    expect(contentTypeOk('Application/JSON; charset=UTF-8', 'api')).toBe(true);
    expect(contentTypeOk('application/json; boundary=x', 'api')).toBe(false);
    for (const t of ['text/plain', 'multipart/form-data; boundary=a', 'application/x-www-form-urlencoded', null, '']) expect(contentTypeOk(t, 'api')).toBe(false);
    expect(contentTypeOk('application/x-www-form-urlencoded', 'form')).toBe(true);
    for (const t of ['application/json', 'text/plain', 'multipart/form-data', null]) expect(contentTypeOk(t, 'form')).toBe(false);
  });
});
describe('C-8 next redirect allow-list', () => {
  it('refuses open redirects', () => {
    for (const bad of ['//evil.example', '/\\evil.example', '/%2F%2Fevil.example', '/%5Cevil.example', 'https://evil.example', '/a\nb', '/login', 'javascript:alert(1)', '/%0d%0aSet-Cookie:x']) expect(safeNext(bad)).toBeNull();
    expect(safeNext('/shipments?status=Packing')).toBe('/shipments?status=Packing');
  });
});
describe('C-6 one CSP value', () => {
  it('netlify.toml header equals the middleware constant', () => {
    const toml = readFileSync(new URL('../../../netlify.toml', import.meta.url), 'utf8');
    const m = /Content-Security-Policy = "([^"]+)"/.exec(toml);
    expect(m?.[1]).toBe(CSP_DEPLOYED);
    expect(CSP_DEPLOYED).not.toContain('unsafe-inline');
  });
});
describe('S-12 cookies', () => {
  it('built mode: __Host-sid, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain', () => {
    expect(sessionCookieName(false)).toBe('__Host-sid');
    const o = sessionCookieOptions(new Date(Date.now() + 3600_000), new Date(), false);
    expect(o).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' });
    expect('domain' in o).toBe(false);
  });
  it('dev mode: sid without Secure', () => {
    expect(sessionCookieName(true)).toBe('sid');
    expect(sessionCookieOptions(new Date(Date.now() + 1000), new Date(), true).secure).toBe(false);
  });
});
describe('scrypt', () => {
  it('uses ADR-003 parameters; dummy hash uses exactly SCRYPT_PARAMS (C-2)', () => {
    expect(SCRYPT_PARAMS).toEqual({ log2N: 17, r: 8, p: 1 });
    expect(DUMMY_HASH.startsWith('scrypt$17$8$1$')).toBe(true);
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });
  it('hashes with a random salt and verifies; null hash never verifies', async () => {
    const p = { log2N: 10, r: 8, p: 1 };
    const a = await hashPassword('correct horse', p);
    const b = await hashPassword('correct horse', p);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(needsRehash(a)).toBe(true);
  });
});
describe('audit payload scrubbing (C-7)', () => {
  it('drops passwords, tokens, csrf and ip keys', () => {
    expect(scrub({ username: 'x', password: 'p', nested: { csrf_token: 't', ok: 1 }, ip: '1.2.3.4' })).toEqual({ username: 'x', nested: { ok: 1 } });
  });
});
describe('form adapter (contract 1.12)', () => {
  it('nests rows, drops reserved names, empty = missing, numbers strict, booleans by presence', () => {
    const f = decodeForm('_csrf=abc&intent=fail&customer_id=3&customer_po=PO-1&notes=&lines[0][part_id]=7&lines[0][qty_ordered]=12&lines[1][part_id]=8&lines[1][qty_ordered]=x&doc_coc=on&checklist[labels]=pass&add_line=1', { booleans: ['doc_coc', 'doc_bol'] });
    expect(f.intent).toBe('fail');
    expect(f.rowAction).toBe(true);
    expect(f.input).toEqual({ customer_id: 3, customer_po: 'PO-1', lines: [{ part_id: 7, qty_ordered: 12 }, { part_id: 8, qty_ordered: 'x' }], doc_coc: true, doc_bol: false, checklist: { labels: 'pass' } });
  });
  it('actor fields become UNKNOWN_FIELD through the strict schema', () => {
    const f = decodeForm('customer_id=1&customer_po=P&order_date=2026-11-10&requested_date=2026-11-11&promise_date=2026-11-12&packed_by=2&lines[0][part_id]=1&lines[0][qty_ordered]=1');
    expect(() => parseInput(createShipmentSchema, f.input)).toThrowError(/not accepted/);
  });
  it('rejects malformed names', () => expect(() => decodeForm('a[b=1')).toThrow());
});
describe('validation', () => {
  it('quantities must be whole numbers >= 1; text and fractions rejected', () => {
    const base = { customer_id: 1, customer_po: 'P', order_date: '2026-11-10', requested_date: '2026-11-11', promise_date: '2026-11-12' };
    for (const q of [0, -1, 1.5, '5']) {
      try { parseInput(createShipmentSchema, { ...base, lines: [{ part_id: 1, qty_ordered: q }] }); throw new Error('accepted'); }
      catch (e: any) { expect(e.status).toBe(422); expect(e.fields['lines[0].qty_ordered']).toBeDefined(); }
    }
  });
  it('verify: note required on fail, outcome must agree', () => {
    const all = { part_number: 'pass', revision: 'pass', quantity: 'pass', lot: 'pass', labels: 'fail', packing_slip: 'pass', packaging_method: 'pass' };
    expect(() => parseInput(verifySchema, { checklist: all })).toThrow();
    expect(() => parseInput(verifySchema, { checklist: all, note: 'x', outcome: 'pass' })).toThrow();
    expect(parseInput(verifySchema, { checklist: all, note: 'x', outcome: 'fail' }).note).toBe('x');
    expect(() => parseInput(verifySchema, { checklist: { ...all, labels: 'pass' }, outcome: 'fail' })).toThrow();
  });
});
describe('business clock (contract 1.6)', () => {
  it('fixed mode keeps the reporting date with the real time of day; live uses the real date', () => {
    const real = new Date('2026-12-03T14:30:15.250Z');
    const f = computeClock('fixed', '2026-11-25', real);
    expect(f.today).toBe('2026-11-25');
    expect(f.now.toISOString()).toBe('2026-11-25T14:30:15.250Z');
    expect(f.label).toBe('Reporting date: 25 Nov 2026 (fixed demo date)');
    expect(computeClock('live', '2026-11-25', real).today).toBe('2026-12-03');
  });
});
describe('CSV formula-injection guard (contract 1.10)', () => {
  it('prefixes text cells starting with = + - @ TAB CR; never numbers', () => {
    expect(guardCell('=SUM(A1)', 'text')).toBe("'=SUM(A1)");
    expect(guardCell('  +1', 'text')).toBe("'  +1");
    expect(guardCell('-4 units', 'text')).toBe("'-4 units");
    expect(guardCell('@x', 'text')).toBe("'@x");
    expect(guardCell('\tx', 'text')).toBe("'\tx");
    expect(guardCell(-4, 'number')).toBe('-4');
    expect(guardCell('2026-11-25', 'date')).toBe('2026-11-25');
  });
  it('quotes commas and doubles quotes, CRLF line ends, None text', () => {
    const csv = toCsv([{ key: 'a', label: 'A', type: 'text' }, { key: 'rework_minutes', label: 'Rework', type: 'number' }], [{ a: 'x,"y"', rework_minutes: null }]);
    expect(csv).toBe('A,Rework\r\n"x,""y""",None\r\n');
  });
});
