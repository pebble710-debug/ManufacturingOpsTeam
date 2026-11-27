// Real clock (injectable) and the business clock of contract section 1.6.
import type { Sql } from './db';

let override: (() => Date) | undefined;
export function realNow(): Date {
  return override ? override() : new Date();
}
export function setClockForTests(fn: (() => Date) | undefined): void {
  override = fn;
}

export interface BusinessClock {
  mode: 'fixed' | 'live';
  reportingDate: string;
  today: string; // business_today, YYYY-MM-DD
  now: Date; // business_now
  label: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function formatLabel(mode: 'fixed' | 'live', today: string): string {
  const d = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return mode === 'fixed' ? `Reporting date: ${d} (fixed demo date)` : `Live date: ${d}`;
}

export function computeClock(mode: string, reportingDate: string, real: Date = realNow()): BusinessClock {
  const m = mode === 'live' ? 'live' : 'fixed';
  if (m === 'live') {
    const today = isoDate(real);
    return { mode: m, reportingDate, today, now: real, label: formatLabel(m, today) };
  }
  const tod = real.toISOString().slice(10); // 'THH:MM:SS.mmmZ'
  return { mode: m, reportingDate, today: reportingDate, now: new Date(`${reportingDate}${tod}`), label: formatLabel(m, reportingDate) };
}

/** Reads the two settings rows (one tiny query). `q` is a postgres.js Sql or transaction. */
export async function getBusinessClock(q: Sql): Promise<BusinessClock> {
  const rows = await q<{ key: string; value: string }[]>`SELECT key, value FROM setting WHERE key IN ('reporting_mode','reporting_date')`;
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return computeClock(m.reporting_mode ?? 'fixed', m.reporting_date ?? '2026-11-25');
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
