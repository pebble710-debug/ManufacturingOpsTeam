import { describe, expect, it } from 'vitest';
import { formatReportingDate, safeNextPath } from '../../../src/components/locals';
import { navFor } from '../../../src/components/nav-permissions';
import { pageWindow, withParams } from '../../../src/components/query';

const labels = (role: Parameters<typeof navFor>[0]) =>
  navFor(role).flatMap((g) => [g.label, ...(g.children?.map((c) => c.label) ?? [])]);

describe('nav visibility (ui-spec 2.3)', () => {
  it('Viewer sees no Admin group and no Move stock', () => {
    const l = labels('Viewer');
    expect(l).not.toContain('Admin');
    expect(l).not.toContain('Move stock');
    expect(l).toContain('Resources');
  });
  it('Receiving can move stock but not open Admin', () => {
    const l = labels('Receiving');
    expect(l).toContain('Move stock');
    expect(l).not.toContain('Admin');
  });
  it('Supervisor sees Settings and Lookups but not Audit log; Admin sees all three', () => {
    expect(labels('Supervisor')).toEqual(expect.arrayContaining(['Settings', 'Lookups']));
    expect(labels('Supervisor')).not.toContain('Audit log');
    expect(labels('Admin')).toEqual(expect.arrayContaining(['Settings', 'Lookups', 'Audit log']));
  });
});

describe('safeNextPath', () => {
  it('accepts local paths only', () => {
    expect(safeNextPath('/shipments?page=2')).toBe('/shipments?page=2');
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('/\\evil')).toBeNull();
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

describe('formatting and query helpers', () => {
  it('formats the reporting date in UTC', () => {
    expect(formatReportingDate('2026-11-25')).toBe('25 Nov 2026');
  });
  it('withParams keeps filters and resets page', () => {
    const u = new URL('http://x/shipments?status=Packing&page=3');
    expect(withParams(u, { sort: 'ship_date', page: null })).toBe('/shipments?status=Packing&sort=ship_date');
  });
  it('pageWindow inserts gaps', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });
});
