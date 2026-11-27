import { describe, expect, it } from 'vitest';
import {
  assess, buildPareto, compareTarget, daysLate, defaultPeriod, isCountableError, isoWeekLabel, isOnTime, percentileCont, previousPeriod, ratio1dp, round1, trendOf, weekBuckets,
} from '../../../src/lib/kpi/pure';
import { cycleTimeMeasure, type ShippedRow } from '../../../src/lib/kpi/compute';

describe('percentileCont (UD-10, linear interpolation)', () => {
  const cases: [number[], number | null, number | null][] = [
    [[10, 12, 20, 30], 16, 27.0], // n=4: h=1.5 -> 12+0.5*8; h=2.7 -> 20+0.7*10
    [[4, 8, 15, 16, 23], 15, 20.2], // n=5: h=2 -> 15; h=3.6 -> 16+0.6*7
    [[10, 30], 20, 28], // n=2
    [[7], 7, 7], // n=1
    [[], null, null], // n=0
  ];
  for (const [xs, med, p90] of cases) {
    it(`n=${xs.length}`, () => {
      const m = percentileCont(xs, 0.5), p = percentileCont(xs, 0.9);
      if (med === null) { expect(m).toBeNull(); expect(p).toBeNull(); } else { expect(m).toBeCloseTo(med, 9); expect(p).toBeCloseTo(p90!, 9); }
    });
  }
  it('does not depend on input order and does not mutate it', () => {
    const xs = [30, 10, 20, 12];
    expect(percentileCont(xs, 0.5)).toBe(16);
    expect(xs).toEqual([30, 10, 20, 12]);
  });
});

describe('rounding (G-5)', () => {
  it('ratio1dp uses integer half-up arithmetic', () => {
    expect(ratio1dp(1, 3)).toBe(33.3); expect(ratio1dp(2, 3)).toBe(66.7); expect(ratio1dp(3, 4)).toBe(75);
    expect(ratio1dp(1, 8)).toBe(12.5); expect(ratio1dp(1, 16)).toBe(6.3); // 6.25 rounds half up
    expect(ratio1dp(0, 5)).toBe(0); expect(ratio1dp(5, 5)).toBe(100);
  });
  it('division by zero is null, never 0 or 100 (G-4)', () => { expect(ratio1dp(0, 0)).toBeNull(); });
  it('round1', () => { expect(round1(26.35)).toBe(26.4); expect(round1(16)).toBe(16); });
});

describe('shipment rules', () => {
  it('daysLate / isOnTime with tolerance', () => {
    expect(daysLate('2026-11-04', '2026-11-03')).toBe(1);
    expect(daysLate('2026-11-05', '2026-11-10')).toBe(-5);
    expect(isOnTime('2026-11-03', '2026-11-03')).toBe(true);
    expect(isOnTime('2026-11-04', '2026-11-03')).toBe(false);
    expect(isOnTime('2026-11-04', '2026-11-03', 1)).toBe(true);
  });
  it('countable error rule (UD-9)', () => {
    expect(isCountableError({ detected_stage: 'Before ship', packaging_related: true })).toBe(true);
    expect(isCountableError({ detected_stage: 'After ship', packaging_related: true })).toBe(true);
    expect(isCountableError({ detected_stage: 'After ship', packaging_related: false })).toBe(false);
  });
});

describe('targets and trend (G-6, G-7)', () => {
  it('strict and inclusive comparisons on the 1-dp value', () => {
    expect(compareTarget(2, 2, '<')).toBe(false); expect(compareTarget(1.9, 2, '<')).toBe(true);
    expect(compareTarget(24, 24, '<=')).toBe(true); expect(compareTarget(95, 95, '>=')).toBe(true);
    expect(compareTarget(null, 95, '>=')).toBeNull(); expect(compareTarget(90, null, '>=')).toBeNull();
  });
  it('trend and assessment', () => {
    expect(trendOf(0.04)).toBe('Flat'); expect(trendOf(-0.06)).toBe('Down'); expect(trendOf(2)).toBe('Up'); expect(trendOf(null)).toBeNull();
    expect(assess('Up', 'up')).toBe('Better'); expect(assess('Up', 'down')).toBe('Worse'); expect(assess('Flat', 'down')).toBe('Same'); expect(assess(null, 'up')).toBeNull();
  });
});

describe('periods and ISO weeks (spec 10.1)', () => {
  it('default and previous period', () => {
    expect(defaultPeriod('2026-11-25')).toEqual({ from: '2026-10-27', to: '2026-11-25', days: 30 });
    expect(previousPeriod(defaultPeriod('2026-11-25'))).toEqual({ from: '2026-09-27', to: '2026-10-26', days: 30 });
  });
  it('year boundary labels', () => {
    expect(isoWeekLabel('2026-11-23')).toBe('2026-W48'); expect(isoWeekLabel('2026-12-28')).toBe('2026-W53');
    expect(isoWeekLabel('2027-01-04')).toBe('2027-W01'); expect(isoWeekLabel('2025-12-29')).toBe('2026-W01'); expect(isoWeekLabel('2026-11-01')).toBe('2026-W44');
  });
  it('week buckets are clipped and flagged partial', () => {
    const b = weekBuckets('2026-11-01', '2026-11-30');
    expect(b.map((x) => x.week)).toEqual(['2026-W44', '2026-W45', '2026-W46', '2026-W47', '2026-W48', '2026-W49']);
    expect(b[0]).toMatchObject({ partial: true, range_from: '2026-11-01', range_to: '2026-11-01', week_start: '2026-10-26' });
    expect(b[1].partial).toBe(false);
    expect(b[5]).toMatchObject({ partial: true, range_from: '2026-11-30', range_to: '2026-11-30' });
  });
});

describe('Pareto (C3)', () => {
  it('backlog fixture 5/3/2 gives 50, 80, 100', () => {
    const p = buildPareto({ 'Incorrect label': 5, Paperwork: 3, Other: 2, Damage: 0 }, { Paperwork: 4 });
    expect(p.series.map((s) => s.category)).toEqual(['Incorrect label', 'Paperwork', 'Other']);
    expect(p.series.map((s) => s.cumulative_pct)).toEqual([50, 80, 100]);
    expect(p.series[1]).toMatchObject({ pct: 30, previous_count: 4 }); expect(p.total).toBe(10); expect(p.previous_total).toBe(4);
  });
  it('ties sort by category ascending and the last cumulative is exactly 100', () => {
    const p = buildPareto({ 'Wrong quantity': 1, Paperwork: 1, 'Incorrect label': 1 }, {});
    expect(p.series.map((s) => s.category)).toEqual(['Incorrect label', 'Paperwork', 'Wrong quantity']);
    expect(p.series[0].cumulative_pct).toBeCloseTo(33.333, 2); expect(p.series[2].cumulative_pct).toBe(100);
  });
  it('empty', () => { expect(buildPareto({}, {})).toEqual({ series: [], total: 0, previous_total: 0 }); });
});

describe('cycle time measure', () => {
  const row = (h: number | null): ShippedRow => ({ ship_date: '2026-11-01', days_late: 0, in_full: true, cycle_hours: h, errors: 0, internal: 0, escape: 0, excluded: 0 });
  it('fixture A values and unmeasured shipments', () => {
    const m = cycleTimeMeasure([10, 12, 20, 30, null].map(row), 24);
    expect(m.value).toBe(16); expect(m.extra.p90_h).toBeCloseTo(27, 9); expect(m.denominator).toBe(4); expect(m.numerator).toBeNull(); expect(m.extra.within_target_pct).toBe(75);
  });
  it('no data', () => { const m = cycleTimeMeasure([], 24); expect(m.value).toBeNull(); expect(m.extra.within_target_pct).toBeNull(); });
});
