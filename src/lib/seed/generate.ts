// Deterministic seed generator (seed-plan.md). Pure: no database, no clock, no Math.random.
// Produces plain row objects (column names = DB columns) for write.ts. Ids are the 1-based insertion order.
// Fictional data only (Cobalt Ridge Components, Inc.).
import { Rng, quota } from './prng.ts';
import { DAY, HOUR, MIN, dayStart, dow, isWeekend, isoDate, isoTs, isoWeek, ms, snapWeekdayBack } from './time.ts';
import { SEED } from './constants.ts';
import { DEMO_USERS } from './demo-credentials.ts';
import {
  C, CARRIERS, CUSTOMERS, L, LOCATIONS, LOC_TYPE, PARTS, R, REASONS, SUPPLIERS, partId, type Cls,
} from './reference.ts';

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------
const U = { admin: 1, sup: 2, s1: 3, s2: 4, rcv: 5, qual: 6, view: 7 } as const;
const SHIPPERS = [U.s1, U.s2] as const;

interface Hist { at: number; from: string | null; to: string; by: number; note?: string | null }
interface Ver { attempt: number; result: 'Pass' | 'Fail'; packer: number; by: number; at: number; failed: string[]; note?: string | null }
interface RW { action: string; start: number; end: number | null; by: number; reverified: boolean | null }
interface Line {
  ship: Ship; part: number; ordered: number; shipped: number | null; lot: string | null; loc: number | null;
  note: string | null; fixedLot?: string; id: number; lineNo: number;
}
interface CAPlan { desc: string; owner: number; due: number; status: 'Open' | 'In Progress' | 'Closed'; createdAt: number; closedAt: number | null; by: number }
interface ErrPlan {
  ship: Ship; stage: 'Before ship' | 'After ship'; role: 'Packer' | 'Verifier' | 'Quality' | 'Customer';
  category: string; subtype: string | null; severity: string; description: string; detectedAt: number; reportedBy: number;
  status: 'Open' | 'Contained' | 'Closed'; closedAt: number | null; rootCat: string | null; rootNote: string | null;
  reworks: RW[]; reworkMins: number[]; ca: CAPlan | null; story?: string; peak: boolean; id: number; no: string; episode: number | null;
}
type Kind = 'shipped' | 'cancelled' | 'open';
interface Ship {
  key: number; kind: Kind; status: string; customer: number; carrier: number; po: string; order: number; requested: number;
  promise: number; shipDate: number | null; shippedAt: number | null; lines: Line[]; creator: number; createdAt: number;
  packer: number | null; verifier: number | null; verifiedAt: number | null; rtp: number; hist: Hist[]; ver: Ver[];
  lateReason: number | null; peak: boolean; docs: [boolean, boolean, boolean, boolean]; notes: string | null;
  heldFrom: string | null; holdReason: number | null; holdOwner: string | null; reworkOrigin: string | null; reworkEpisode: number;
  tracking: string | null; packages: number | null; weight: number | null; shipUser: number; tags: Set<string>;
  errors: ErrPlan[]; no: number; id: number; updatedAt: number; shortLine: boolean;
}

export interface SeedMeta {
  anchorDate: string;
  stories: Record<string, string>;
  calibration: Record<string, number | string>;
}
export interface SeedData {
  tables: Record<string, Row[]>;
  meta: SeedMeta;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const ceil10 = (x: number): number => Math.ceil(x / 10) * 10;
const NOW_LIMIT = ms(2026, 11, 24, 17, 30, 0); // seed events end here (before the reporting date)
const PEAK0 = ms(2026, 10, 28);
const PEAK1 = ms(2026, 11, 20);
const isPeak = (t: number): boolean => dayStart(t) >= PEAK0 && dayStart(t) <= PEAK1;
const SUPPLY_START = ms(2026, 5, 4);

function tod(r: Rng, day: number, h0 = 7, h1 = 17): number {
  return dayStart(day) + h0 * HOUR + r.int(0, (h1 - h0) * 3600 - 1) * 1000;
}

// ---------------------------------------------------------------------------------------------------------------------
// Supply planner (just-in-time receipts / production events sized to demand)
// ---------------------------------------------------------------------------------------------------------------------
interface Dem { t: number; q: number }
interface Planned { day: number; qty: number }

function planSupply(demands: Dem[], target: number, leadDays: number): Planned[] {
  if (demands.length === 0) throw new Error('planSupply: part without demand');
  const sim = (Q: number): Planned[] => {
    let stock = 0;
    const out: Planned[] = [];
    for (const d of demands) {
      while (stock < d.q) {
        const size = Math.max(Q, ceil10(d.q - stock));
        out.push({ day: Math.max(SUPPLY_START, snapWeekdayBack(dayStart(d.t) - leadDays * DAY)), qty: size });
        stock += size;
      }
      stock -= d.q;
    }
    return out;
  };
  const total = ceil10(demands.reduce((s, d) => s + d.q, 0));
  let plan = sim(total);
  for (let Q = 10; Q <= total; Q += 10) {
    const p = sim(Q);
    if (p.length <= target) { plan = p; break; }
  }
  plan.sort((a, b) => a.day - b.day);
  while (plan.length < target) {
    let bi = 0;
    plan.forEach((p, i) => { if (p.qty > (plan[bi] as Planned).qty) bi = i; });
    const big = plan[bi] as Planned;
    if (big.qty < 20) throw new Error('planSupply: cannot split further');
    const half = Math.max(10, Math.floor(big.qty / 2 / 10) * 10);
    plan[bi] = { day: big.day, qty: big.qty - half };
    plan.push({ day: Math.max(SUPPLY_START, snapWeekdayBack(big.day - DAY)), qty: half });
    plan.sort((a, b) => a.day - b.day);
  }
  while (plan.length > target) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i + 1 < plan.length; i++) {
      const c = (plan[i] as Planned).qty + (plan[i + 1] as Planned).qty;
      if (c < best) { best = c; bi = i; }
    }
    plan.splice(bi, 2, { day: (plan[bi] as Planned).day, qty: best });
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------------------------------
export function generate(): SeedData {
  const rs = new Rng(SEED, 'shipments');
  const rq = new Rng(SEED, 'quality');
  const rr = new Rng(SEED, 'receipts');
  const rl = new Rng(SEED, 'ledger');
  const rc = new Rng(SEED, 'counts');
  const rt = new Rng(SEED, 'text');
  const calibration: Record<string, number | string> = {};

  // ---- A. shipped day grid -------------------------------------------------------------------------------------------
  const days: number[] = [];
  for (let t = ms(2026, 5, 26); t <= ms(2026, 11, 24); t += DAY) if (!isWeekend(t)) days.push(t);
  const peakDays = days.filter(isPeak);
  const otherDays = days.filter((d) => !isPeak(d));
  const slotDays: number[] = [];
  for (const [ds, total] of [[peakDays, 70], [otherDays, 204]] as const) {
    const q = quota(total, ds.map(() => 0.55 + rs.next()));
    ds.forEach((d, i) => { for (let k = 0; k < (q[i] as number); k++) slotDays.push(d); });
  }
  slotDays.sort((a, b) => a - b);

  let keySeq = 0;
  const mkShip = (kind: Kind): Ship => ({
    key: keySeq++, kind, status: '', customer: 0, carrier: 0, po: '', order: 0, requested: 0, promise: 0, shipDate: null,
    shippedAt: null, lines: [], creator: 0, createdAt: 0, packer: null, verifier: null, verifiedAt: null, rtp: 0, hist: [], ver: [],
    lateReason: null, peak: false, docs: [false, false, false, false], notes: null, heldFrom: null, holdReason: null,
    holdOwner: null, reworkOrigin: null, reworkEpisode: 0, tracking: null, packages: null, weight: null, shipUser: 0,
    tags: new Set(), errors: [], no: 0, id: 0, updatedAt: 0, shortLine: false,
  });

  const shipped: Ship[] = slotDays.map((day) => {
    const s = mkShip('shipped');
    s.status = 'Shipped';
    s.shippedAt = day + 6 * HOUR + rs.int(0, 12 * 3600 - 1) * 1000;
    s.shipDate = day;
    s.peak = isPeak(day);
    return s;
  });
  shipped.sort((a, b) => (a.shippedAt as number) - (b.shippedAt as number) || a.key - b.key);

  // specials
  const s1 = shipped.find((s) => (s.shipDate as number) >= ms(2026, 6, 16) && !s.peak) as Ship;
  const s2 = shipped.find((s) => (s.shipDate as number) >= ms(2026, 11, 9)) as Ship;
  s1.tags.add('S1'); s2.tags.add('S2');
  const s3Cands = shipped.filter((s) => (s.shipDate as number) >= ms(2026, 10, 2) && (s.shipDate as number) <= ms(2026, 11, 11) && !s.tags.size);
  const s3 = rs.shuffle(s3Cands).slice(0, 4).sort((a, b) => (a.shippedAt as number) - (b.shippedAt as number));
  s3.forEach((s) => s.tags.add('S3'));

  // customers, carriers
  const custPick = (): number => rs.weighted(CUSTOMERS.map((c, i) => [i + 1, c.w] as const));
  const carrierPick = (): number => rs.weighted(CARRIERS.map((c, i) => [i + 1, c.w] as const));
  shipped.forEach((s) => { s.customer = custPick(); });
  s1.customer = C.ALDERVALE; s2.customer = C.BRIGHTWATER;
  [C.ALDERVALE, C.ALDERVALE, C.PINECREST, C.IRONLEAF].forEach((c, i) => { (s3[i] as Ship).customer = c; });

  // ---- B. lines ------------------------------------------------------------------------------------------------------
  const classParts: Record<Cls, number[]> = { A: [], B: [], C: [] };
  PARTS.forEach((p, i) => { if (p.active !== false) classParts[p.cls].push(i + 1); });
  const qtyFor = (part: number): number => {
    const cls = (PARTS[part - 1] as (typeof PARTS)[number]).cls;
    return cls === 'A' ? rs.int(5, 40) : cls === 'B' ? rs.int(10, 120) : rs.int(50, 600);
  };
  const addLine = (s: Ship, part: number, ordered: number): Line => {
    const l: Line = { ship: s, part, ordered, shipped: null, lot: null, loc: null, note: null, id: 0, lineNo: s.lines.length + 1 };
    s.lines.push(l);
    return l;
  };
  const makeLines = (s: Ship): void => {
    const n = rs.weighted([[1, 40], [2, 30], [3, 20], [4, 10]] as const);
    const used = new Set<number>();
    while (s.lines.length < n) {
      const cls = rs.weighted([['A', 25], ['B', 30], ['C', 45]] as const) as Cls;
      const part = rs.pick(classParts[cls]);
      if (used.has(part)) continue;
      used.add(part);
      addLine(s, part, qtyFor(part));
    }
  };
  shipped.forEach(makeLines);
  // story lines
  s1.lines.length = 0; addLine(s1, partId('CRC-2041-C'), 120);
  s2.lines[0] = { ...(s2.lines[0] as Line), part: partId('CRC-3102-A'), ordered: 120 };
  const lotQty = [70, 65, 60, 75];
  s3.forEach((s, i) => {
    const l = s.lines[0] as Line;
    l.part = partId('CRC-2107-A'); l.ordered = lotQty[i] as number; l.fixedLot = 'S3';
    s.lines = s.lines.filter((x, idx) => idx === 0 || x.part !== l.part);
  });

  // short-shipped (5): non-story, single short line
  const shortCands = rs.shuffle(shipped.filter((s) => !s.tags.size && s.lines.every((l) => l.ordered >= 20)));
  const shortShips = shortCands.slice(0, 5);
  shortShips.forEach((s) => {
    s.shortLine = true;
    const l = s.lines[0] as Line;
    l.shipped = Math.max(1, l.ordered - Math.max(1, Math.round(l.ordered * rs.range(0.05, 0.15))));
    l.note = `Short shipped: ${l.ordered - l.shipped} pcs on backorder, customer notified.`;
  });
  shipped.forEach((s) => s.lines.forEach((l) => { if (l.shipped === null) l.shipped = l.ordered; }));

  // ---- C. quality plan -----------------------------------------------------------------------------------------------
  const normal = shipped.filter((s) => !s.tags.size);
  const peakPool = rq.shuffle(normal.filter((s) => s.peak));
  // two of the "other" errors are placed in the previous-period window (2026-09-27 .. 10-26) so that the
  // dashboard's period-over-period comparison shows a healthier previous period (seed-plan section 10).
  const otherShuffled = rq.shuffle(normal.filter((s) => !s.peak && (s.shipDate as number) <= ms(2026, 11, 2)));
  const inPrev = (s: Ship): boolean => (s.shipDate as number) >= ms(2026, 9, 27) && (s.shipDate as number) <= ms(2026, 10, 26);
  const prevC = otherShuffled.filter(inPrev);
  const restC = otherShuffled.filter((s) => !inPrev(s));
  const otherPool = [restC[0] as Ship, prevC[0] as Ship, prevC[1] as Ship, ...restC.slice(1), ...prevC.slice(2)];
  const beforeOther = otherPool.slice(0, 7);
  const beforePeak = peakPool.slice(0, 8);
  const newAfter = otherPool[7] as Ship;
  const sharedAfter = beforeOther[0] as Ship;
  const beforeShipped: Ship[] = [s1, ...beforeOther, ...beforePeak];
  const nonS1 = beforeShipped.filter((s) => s !== s1);
  const verifierDet = new Set<Ship>([s1, ...rq.shuffle(nonS1).slice(0, 8)]);

  const errCats = rq.shuffle([
    'Incorrect label', 'Incorrect label', 'Incorrect label', 'Incorrect label', 'Incorrect label',
    'Paperwork', 'Paperwork', 'Paperwork', 'Paperwork', 'Wrong quantity', 'Wrong quantity',
    'Packaging method', 'Wrong part', 'Wrong part', 'Other',
  ]);
  const sevPool = rq.shuffle([
    ...Array(5).fill('Low'), ...Array(6).fill('Medium'), ...Array(6).fill('High'), ...Array(2).fill('Critical'),
  ] as string[]);
  const subtypes = ['Packing slip', 'BOL', 'C of C', 'Customer-specific form', 'Commercial invoice'];
  const descFor = (cat: string, sub: string | null, ship: Ship): string => {
    switch (cat) {
      case 'Incorrect label': return rq.pick(['Shipping label shows the wrong ship-to suite.', 'Part label carries the wrong lot number.', 'Label barcode does not match the packing slip.', 'Label printed with an old revision.']);
      case 'Paperwork': return `${sub ?? 'Document'}: ${rq.pick(['quantity does not match the order.', 'customer PO number is missing.', 'document is unsigned.', 'revision is out of date.'])}`;
      case 'Wrong quantity': return `Counted ${(ship.lines[0] as Line).ordered + rq.int(2, 12)} pieces in the box; order shows ${(ship.lines[0] as Line).ordered}.`;
      case 'Packaging method': return 'Parts packed loose; the packaging instruction calls for separators.';
      case 'Wrong part': return 'A different part number (same family) was packed against this line.';
      case 'Damage': return 'Customer reports bent corners on arrival; packaging was too light for the load.';
      case 'Traceability': return 'Lot number on the packing slip does not match the lot packed.';
      default: return 'Mixed lot packed in one carton without a divider.';
    }
  };
  const failItems = (cat: string, sub: string | null): string[] => {
    switch (cat) {
      case 'Incorrect label': return ['labels'];
      case 'Paperwork': return [sub === 'C of C' ? 'coc' : 'packing_slip'];
      case 'Wrong quantity': return ['quantity'];
      case 'Wrong part': return ['part_number'];
      case 'Packaging method': return ['packaging_method'];
      default: return ['lot'];
    }
  };
  const mkErr = (ship: Ship, stage: ErrPlan['stage'], role: ErrPlan['role'], category: string): ErrPlan => {
    const subtype = category === 'Paperwork' ? rq.pick(subtypes) : null;
    const e: ErrPlan = {
      ship, stage, role, category, subtype, severity: '', description: '', detectedAt: 0, reportedBy: 0,
      status: 'Open', closedAt: null, rootCat: null, rootNote: null, reworks: [], reworkMins: [], ca: null, peak: ship.peak,
      id: 0, no: '', episode: stage === 'Before ship' ? 1 : null,
    };
    ship.errors.push(e);
    return e;
  };
  const allErrors: ErrPlan[] = [];
  // S-1
  {
    const e = mkErr(s1, 'Before ship', 'Verifier', 'Paperwork');
    e.subtype = 'Packing slip'; e.severity = 'High'; e.story = 'S1';
    e.description = 'Packing slip lists revision B; the parts packed are revision C.';
    allErrors.push(e);
  }
  const before = [...beforeOther, ...beforePeak];
  const nonVerifier = before.filter((s) => !verifierDet.has(s));
  const packerShips = new Set(nonVerifier.slice(0, 4));
  before.forEach((s, i) => {
    const role = verifierDet.has(s) ? 'Verifier' : packerShips.has(s) ? 'Packer' : 'Quality';
    const cat = errCats[i] as string;
    const e = mkErr(s, 'Before ship', role, cat);
    allErrors.push(e);
  });
  // After ship errors
  const mkAfter = (s: Ship, cat: string, story?: string): ErrPlan => {
    const e = mkErr(s, 'After ship', 'Customer', cat);
    if (story) { e.story = story; e.severity = 'High'; }
    allErrors.push(e);
    return e;
  };
  mkAfter(s2, 'Wrong quantity', 'S2');
  mkAfter(newAfter, 'Damage');
  mkAfter(sharedAfter, 'Traceability');
  // severity for S-1/S-2 already fixed; others got pops above: rebalance not needed (pool has exactly 19 for others)

  // ---- D. open and cancelled shipments (created later in section G) -----------------------------------------------------

  // ---- E. timelines of shipped shipments -------------------------------------------------------------------------------
  const shippingUsers = [U.s1, U.s2, U.sup];
  const pickPacker = (): number => rs.weighted([[U.s1, 45], [U.s2, 45], [U.sup, 10]] as const);
  const pickVerifier = (packer: number): number => {
    const opts: Array<readonly [number, number]> = [];
    for (const u of SHIPPERS) if (u !== packer) opts.push([u, 60]);
    opts.push([U.qual, 25]);
    if (packer !== U.sup) opts.push([U.sup, 15]);
    return rs.weighted(opts);
  };
  const otherShipper = (u: number): number => (u === U.s1 ? U.s2 : u === U.s2 ? U.s1 : rs.pick(SHIPPERS));
  const fixWeekend = (t: number): number =>
    isWeekend(t) ? dayStart(snapWeekdayBack(t)) + 15 * HOUR + rs.int(0, 59) * MIN : t;

  // rework durations first (needed for chains)
  for (const e of allErrors) {
    if (e.stage !== 'Before ship') continue;
    e.reworkMins = [Math.round(rq.tri(10, 90, 35))];
  }
  (allErrors.find((e) => e.story === 'S1') as ErrPlan).reworkMins = [35];
  // two extra events: one label error, one packaging method (shipped) -> second event
  const extraLabel = allErrors.find((e) => e.category === 'Incorrect label' && e.stage === 'Before ship' && !e.story);
  const extraPm = allErrors.find((e) => e.category === 'Packaging method' && e.stage === 'Before ship' && !e.story);
  [extraLabel, extraPm].forEach((e) => { if (e) e.reworkMins.push(Math.round(rq.tri(10, 40, 20))); });
  const actionFor = (e: ErrPlan, k: number): string => {
    switch (e.category) {
      case 'Incorrect label': return 'Relabel';
      case 'Paperwork': return 'Reprint paperwork';
      case 'Wrong quantity': return k === 0 ? 'Recount' : 'Repack'; // refined below
      case 'Packaging method': return 'Repack';
      case 'Wrong part': return 'Replace part';
      default: return 'Other';
    }
  };

  for (const s of shipped) {
    s.shipUser = rs.weighted([[U.s1, 45], [U.s2, 45], [U.sup, 10]] as const);
    s.creator = rs.weighted([[U.s1, 40], [U.s2, 40], [U.sup, 20]] as const);
    const shippedAt = s.shippedAt as number;
    const verified = shippedAt - rs.int(20, 120) * MIN - rs.int(0, 59) * 1000;
    const err = s.errors.find((e) => e.stage === 'Before ship') ?? null;
    let rtp: number; let pack: number;
    if (!err) {
      const packer = pickPacker();
      const verifier = pickVerifier(packer);
      const H0 = clamp(rs.lognormal(s.peak ? 30 : 20, 0.45), 4, 120);
      rtp = fixWeekend(shippedAt - Math.round(H0 * HOUR));
      pack = rtp + Math.round(rs.range(0.15, 0.4) * (verified - rtp));
      s.packer = packer; s.verifier = verifier;
      s.hist = [
        { at: rtp, from: 'Planned', to: 'Ready to Pack', by: s.creator },
        { at: pack, from: 'Ready to Pack', to: 'Packing', by: packer },
        { at: verified, from: 'Packing', to: 'Verified', by: verifier },
        { at: shippedAt, from: 'Verified', to: 'Shipped', by: s.shipUser },
      ];
      s.ver = [{ attempt: 1, result: 'Pass', packer, by: verifier, at: verified, failed: [] }];
    } else {
      const story = err.story === 'S1';
      const reopenAt = verified - rs.int(20, 60) * MIN;
      let cursor = reopenAt - rs.int(2, 10) * MIN;
      const evs: RW[] = [];
      for (let k = err.reworkMins.length - 1; k >= 0; k--) {
        const end = cursor;
        const start = end - (err.reworkMins[k] as number) * MIN;
        evs.unshift({ action: actionFor(err, k), start, end, by: story ? U.s2 : rs.pick([U.s1, U.s2, U.qual]), reverified: true });
        cursor = start - rs.int(2, 10) * MIN;
      }
      // actions for k computed in reverse order: fix Recount/Repack determinism
      err.reworks = evs;
      const detectedAt = (evs[0] as RW).start - rs.int(3, 15) * MIN;
      pack = detectedAt - rs.int(15, 90) * MIN;
      rtp = fixWeekend(pack - rs.int(30, 240) * MIN);
      err.detectedAt = detectedAt;
      const reopenBy = story ? U.qual : rs.pick([U.qual, U.sup]);
      if (err.role === 'Verifier') {
        const packer1 = story ? U.s1 : pickPacker();
        const verifier1 = story ? U.qual : pickVerifier(packer1);
        const packer2 = story ? U.s2 : otherShipper(packer1);
        const verifier2 = story ? U.s1 : pickVerifier(packer2);
        const fi = failItems(err.category, err.subtype);
        err.reportedBy = verifier1;
        s.packer = packer2; s.verifier = verifier2;
        s.hist = [
          { at: rtp, from: 'Planned', to: 'Ready to Pack', by: s.creator },
          { at: pack, from: 'Ready to Pack', to: 'Packing', by: packer1 },
          { at: detectedAt, from: 'Packing', to: 'Rework', by: verifier1, note: `Verification failed: ${fi.join(', ')}` },
          { at: reopenAt, from: 'Rework', to: 'Packing', by: reopenBy, note: 'Reopened after rework' },
          { at: verified, from: 'Packing', to: 'Verified', by: verifier2 },
          { at: shippedAt, from: 'Verified', to: 'Shipped', by: s.shipUser },
        ];
        s.ver = [
          { attempt: 1, result: 'Fail', packer: packer1, by: verifier1, at: detectedAt, failed: fi, note: err.description.slice(0, 200) },
          { attempt: 2, result: 'Pass', packer: packer2, by: verifier2, at: verified, failed: [] },
        ];
      } else {
        const packer = pickPacker();
        const detector = err.role === 'Packer' ? packer : U.qual;
        const verifier = pickVerifier(packer);
        err.reportedBy = detector;
        s.packer = packer; s.verifier = verifier;
        s.hist = [
          { at: rtp, from: 'Planned', to: 'Ready to Pack', by: s.creator },
          { at: pack, from: 'Ready to Pack', to: 'Packing', by: packer },
          { at: detectedAt, from: 'Packing', to: 'Rework', by: detector, note: 'Error logged during packing' },
          { at: reopenAt, from: 'Rework', to: 'Packing', by: reopenBy, note: 'Reopened after rework' },
          { at: verified, from: 'Packing', to: 'Verified', by: verifier },
          { at: shippedAt, from: 'Verified', to: 'Shipped', by: s.shipUser },
        ];
        s.ver = [{ attempt: 1, result: 'Pass', packer, by: verifier, at: verified, failed: [] }];
      }
      s.reworkEpisode = 1;
    }
    s.rtp = rtp;
    s.verifier = s.verifier as number;
    s.verifiedAt = verified;
  }
  // Recount / Repack resolution for the two Wrong-quantity errors (first = Recount, second = Repack)
  {
    const wq = allErrors.filter((e) => e.category === 'Wrong quantity' && e.stage === 'Before ship');
    wq.forEach((e, i) => e.reworks.forEach((r) => { r.action = i === 0 ? 'Recount' : 'Repack'; }));
  }

  // after-ship errors: detection after the shipment
  for (const e of allErrors.filter((x) => x.stage === 'After ship')) {
    const sh = e.ship;
    const latest = Math.min(NOW_LIMIT - 2 * HOUR, (sh.shippedAt as number) + 6 * DAY);
    e.detectedAt = Math.min(latest, (sh.shippedAt as number) + rq.int(1, 5) * DAY + rq.int(0, 6) * HOUR);
    e.role = 'Customer';
    e.reportedBy = U.qual;
  }
  // descriptions
  for (const e of allErrors) {
    if (!e.description) e.description = descFor(e.category, e.subtype, e.ship);
  }
  (allErrors.find((e) => e.story === 'S2') as ErrPlan).description = 'Customer count shows 118 pieces; packing slip and order show 120.';
  // verification notes (re-set for failed rows)
  for (const s of shipped) for (const v of s.ver) if (v.result === 'Fail') v.note = (s.errors[0] as ErrPlan).description.slice(0, 200);
  // verifier-detected fail rows: error role Verifier; detector user is reportedBy (already set)
  // rework performed_by already set; verification flags
  void shippingUsers;

  // ---- F. lateness and dates -----------------------------------------------------------------------------------------
  const errShipsPeak = beforePeak;
  const errShipsOther = beforeOther;
  const lateSet = new Map<Ship, number>(); // ship -> reason id
  lateSet.set(s1, R.LATE_PAPERWORK as number);
  const pkgPeak = errShipsPeak.slice(0, 3);
  const pkgOther = errShipsOther.slice(1, 3);
  [...pkgPeak, ...pkgOther].forEach((s) => lateSet.set(s, R.LATE_PKG_REWORK as number));
  const restReasons = rs.shuffle([
    ...Array(5).fill('LATE_MATERIAL'), ...Array(4).fill('LATE_QUALITY_HOLD'), ...Array(3).fill('LATE_PAPERWORK'),
    ...Array(4).fill('LATE_CARRIER'), ...Array(4).fill('LATE_CAPACITY'), ...Array(2).fill('LATE_CUST_CHANGE'),
  ] as string[]);
  const freePeak = rs.shuffle(shipped.filter((s) => s.peak && !s.tags.size && !lateSet.has(s) && !s.errors.length)).slice(0, 9);
  const freeOther = rs.shuffle(shipped.filter((s) => !s.peak && !s.tags.size && !lateSet.has(s) && !s.errors.length)).slice(0, 13);
  [...freePeak, ...freeOther].forEach((s) => lateSet.set(s, R[restReasons.pop() as string] as number));
  calibration.lateTotal = lateSet.size;

  const FRI_NOV18 = ms(2026, 11, 18);
  for (const s of shipped) {
    const shipDay = s.shipDate as number;
    const late = lateSet.get(s);
    if (late) {
      s.lateReason = late;
      s.promise = shipDay - (s === s1 ? 1 : rs.int(1, 6)) * DAY;
    } else {
      s.promise = shipDay + rs.int(0, 3) * DAY;
    }
    let order = dayStart(s.rtp) - rs.int(1, 4) * DAY;
    if (shipDay >= ms(2026, 11, 17)) order = Math.min(order, FRI_NOV18);
    order = Math.min(order, s.promise);
    order = Math.max(order, ms(2026, 5, 12));
    // order must be strictly before the ready-to-pack day so Planned precedes it
    if (order >= dayStart(s.rtp)) order = dayStart(s.rtp) - DAY;
    s.order = order;
    s.requested = Math.max(order, s.promise - rs.int(0, 3) * DAY);
    s.createdAt = order + 7 * HOUR + rs.int(0, 8 * 60) * MIN;
    s.hist.unshift({ at: s.createdAt, from: null, to: 'Planned', by: s.creator });
  }

  // carriers, docs, tracking, weight
  const trackFor = (cid: number): string | null => {
    const c = CARRIERS[cid - 1] as (typeof CARRIERS)[number];
    return c.prefix ? c.prefix + rt.digits(c.digits) : null;
  };
  const partWeight = (part: number): number => {
    const cls = (PARTS[part - 1] as (typeof PARTS)[number]).cls;
    return cls === 'A' ? 1.8 : cls === 'B' ? 0.9 : 0.15;
  };
  const finish = (s: Ship): void => {
    const cid = s.carrier || carrierPick();
    s.carrier = cid;
    s.po = `PO-${(CUSTOMERS[s.customer - 1] as (typeof CUSTOMERS)[number]).code.slice(0, 4)}-${rt.digits(5)}`;
    const qty = s.lines.reduce((a, l) => a + (l.shipped ?? l.ordered), 0);
    const wt = s.lines.reduce((a, l) => a + (l.shipped ?? l.ordered) * partWeight(l.part), 0);
    s.packages = clamp(Math.ceil(qty / 150), 1, 12);
    s.weight = Math.round((wt + s.packages * 1.5) * 100) / 100;
    const needsCoc = s.lines.some((l) => (PARTS[l.part - 1] as (typeof PARTS)[number]).coc);
    s.docs = [true, cid !== 4, needsCoc, true];
  };
  for (const s of shipped) {
    finish(s);
    s.tracking = trackFor(s.carrier);
    s.updatedAt = s.shippedAt as number;
  }
  // errors that detect on after-ship need shipment link: line 1

  // ---- G. open and cancelled shipments -------------------------------------------------------------------------------
  const spread = (from: number, to: number, n: number): number[] => {
    const f = Array.from({ length: n }, () => rs.range(0.05, 1)).sort((a, b) => a - b);
    return f.map((x) => Math.floor(from + x * (to - from)));
  };
  interface OpenDef { st: string; from?: string; reason?: string; owner?: string; packer?: number; verifier?: number; promise?: string; order: string }
  const openDefs: OpenDef[] = [
    { st: 'On Hold', from: 'Packing', reason: 'HOLD_QUALITY_INSPECTION', owner: 'Quality', packer: U.s2, promise: '2026-11-20', order: '2026-11-19' },
    { st: 'On Hold', from: 'Ready to Pack', reason: 'HOLD_CUSTOMER_REQUEST', owner: 'Customer', order: '2026-11-19' },
    { st: 'On Hold', from: 'Planned', reason: 'HOLD_AWAITING_DOCS', owner: 'Shipping', order: '2026-11-19' },
    { st: 'Rework', packer: U.s1, order: '2026-11-19' },
    { st: 'Rework', packer: U.s2, verifier: U.s1, order: '2026-11-20' },
    { st: 'Verified', packer: U.s1, verifier: U.s2, promise: '2026-11-27', order: '2026-11-20' },
    { st: 'Verified', packer: U.s2, verifier: U.qual, promise: '2026-11-24', order: '2026-11-20' },
    { st: 'Packing', packer: U.s1, order: '2026-11-20' },
    { st: 'Packing', packer: U.s2, order: '2026-11-23' },
    { st: 'Packing', packer: U.sup, order: '2026-11-23' },
    { st: 'Ready to Pack', order: '2026-11-23' }, { st: 'Ready to Pack', order: '2026-11-23' },
    { st: 'Ready to Pack', order: '2026-11-23' }, { st: 'Ready to Pack', order: '2026-11-23' },
    { st: 'Planned', order: '2026-11-24' }, { st: 'Planned', order: '2026-11-24' }, { st: 'Planned', order: '2026-11-24' },
    { st: 'Planned', order: '2026-11-24' }, { st: 'Planned', order: '2026-11-24' }, { st: 'Planned', order: '2026-11-24' },
  ];
  const dateMs = (d: string): number => ms(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)));
  const openShips: Ship[] = openDefs.map((d, idx) => {
    const s = mkShip('open');
    s.status = d.st; s.customer = custPick(); s.carrier = carrierPick();
    s.order = dateMs(d.order);
    s.creator = rs.weighted([[U.s1, 40], [U.s2, 40], [U.sup, 20]] as const);
    s.createdAt = s.order + (dow(s.order) ? 7 : 7) * HOUR + rs.int(0, d.order === '2026-11-24' ? 180 : 480) * MIN;
    s.promise = d.promise ? dateMs(d.promise) : s.order + rs.int(4, 9) * DAY;
    if (s.promise < s.order) s.promise = s.order;
    s.requested = Math.max(s.order, s.promise - rs.int(0, 2) * DAY);
    makeLines(s);
    s.lines.forEach((l) => { l.shipped = null; });
    const hist: Hist[] = [{ at: s.createdAt, from: null, to: 'Planned', by: s.creator }];
    const seq: Array<[string, string, number, string?]> = [];
    const path = (to: string): Array<[string, string]> => {
      const order = ['Planned', 'Ready to Pack', 'Packing', 'Verified'];
      const out: Array<[string, string]> = [];
      for (let i = 0; i < order.indexOf(to); i++) out.push([order[i] as string, order[i + 1] as string]);
      return out;
    };
    const byFor = (to: string): number => (to === 'Packing' ? (d.packer ?? s.creator) : to === 'Verified' ? (d.verifier ?? U.qual) : s.creator);
    if (d.st === 'On Hold') {
      for (const [f, t] of path(d.from as string)) seq.push([f, t, byFor(t)]);
      seq.push([d.from as string, 'On Hold', U.qual, `Hold: ${d.reason}`]);
    } else if (d.st === 'Rework') {
      for (const [f, t] of path('Packing')) seq.push([f, t, byFor(t)]);
      if (idx === 3) seq.push(['Packing', 'Rework', U.qual, 'Verification failed: labels']);
      else { seq.push(['Packing', 'Verified', d.verifier as number]); seq.push(['Verified', 'Rework', U.qual, 'Error logged by Quality']); }
    } else {
      for (const [f, t] of path(d.st)) seq.push([f, t, byFor(t)]);
    }
    const times = spread(s.createdAt + 30 * MIN, NOW_LIMIT - 20 * MIN, seq.length);
    seq.forEach(([f, t, by, note], i) => hist.push({ at: times[i] as number, from: f, to: t, by, note: note ?? null }));
    s.hist = hist;
    s.updatedAt = (hist[hist.length - 1] as Hist).at;
    s.packer = d.packer ?? null;
    if (d.st === 'Verified') { s.verifier = d.verifier as number; s.verifiedAt = (hist[hist.length - 1] as Hist).at; }
    s.rtp = (hist.find((h) => h.to === 'Ready to Pack')?.at) ?? 0;
    if (d.st === 'Verified') s.ver = [{ attempt: 1, result: 'Pass', packer: d.packer as number, by: d.verifier as number, at: s.verifiedAt as number, failed: [] }];
    if (d.st === 'On Hold') {
      s.heldFrom = d.from as string; s.holdReason = R[d.reason as string] as number; s.holdOwner = d.owner as string;
      if (d.from === 'Packing') s.packer = d.packer ?? null;
    }
    const full = ['Verified'];
    s.docs = idx >= 14 ? [false, false, false, false] : full.includes(d.st) ? [true, true, false, true] : [rs.chance(0.5), false, false, rs.chance(0.5)];
    const needsCoc = s.lines.some((l) => (PARTS[l.part - 1] as (typeof PARTS)[number]).coc);
    if (needsCoc && d.st === 'Verified') s.docs[2] = true;
    s.packages = null; s.weight = null;
    s.notes = d.st === 'On Hold' ? 'On hold pending resolution.' : null;
    return s;
  });
  // open-shipment verification attempts and errors
  {
    const sh84 = openShips[3] as Ship; const sh85 = openShips[4] as Ship;
    const h84 = sh84.hist.find((h) => h.to === 'Rework') as Hist;
    sh84.ver = [{ attempt: 1, result: 'Fail', packer: U.s1, by: U.qual, at: h84.at, failed: ['labels'], note: 'Label shows the wrong ship-to suite.' }];
    sh84.reworkOrigin = 'VERIFICATION_FAILED'; sh84.reworkEpisode = 1;
    const e84 = mkErr(sh84, 'Before ship', 'Verifier', 'Incorrect label');
    e84.description = 'Shipping label shows the wrong ship-to suite.'; e84.detectedAt = h84.at; e84.reportedBy = U.qual;
    e84.reworks = [{ action: 'Relabel', start: h84.at + 10 * MIN, end: h84.at + 10 * MIN + 25 * MIN, by: U.s2, reverified: null }];
    e84.reworkMins = [25]; allErrors.push(e84);
    sh84.updatedAt = Math.max(sh84.updatedAt, h84.at + 40 * MIN);
    const hv85 = sh85.hist.find((h) => h.to === 'Verified') as Hist;
    const hr85 = sh85.hist.find((h) => h.to === 'Rework') as Hist;
    sh85.ver = [{ attempt: 1, result: 'Pass', packer: U.s2, by: U.s1, at: hv85.at, failed: [] }];
    sh85.reworkOrigin = 'ERROR_LOGGED'; sh85.reworkEpisode = 1;
    const e85 = mkErr(sh85, 'Before ship', 'Quality', 'Packaging method');
    e85.description = 'Parts packed loose; the packaging instruction calls for separators.';
    e85.detectedAt = hr85.at; e85.reportedBy = U.qual;
    e85.reworks = [{ action: 'Repack', start: hr85.at + 10 * MIN, end: null, by: U.s2, reverified: null }];
    e85.reworkMins = []; e85.story = 'S6'; allErrors.push(e85);
    // fix severities for these two from the remaining pool (already popped in mkErr)
    for (const s of [sh84, sh85]) {
      const lastAt = Math.max(...s.hist.map((h) => h.at), ...s.errors.flatMap((e) => e.reworks.map((r) => r.end ?? r.start)));
      s.updatedAt = lastAt;
    }
    // SH-1284: error detected by Verifier (quality) is one of the 10 Verifier errors; keep counts consistent
  }
  // cancelled
  const cancelDefs = [
    { order: '2026-06-02', from: 'Planned', by: U.s1 }, { order: '2026-07-14', from: 'Ready to Pack', by: U.s2 },
    { order: '2026-08-20', from: 'Planned', by: U.s2 }, { order: '2026-09-17', from: 'Ready to Pack', by: U.s1 },
    { order: '2026-10-14', from: 'Packing', by: U.sup }, { order: '2026-11-05', from: 'Packing', by: U.sup },
  ];
  const cancelled: Ship[] = cancelDefs.map((d, i) => {
    const s = mkShip('cancelled');
    s.status = 'Cancelled'; s.customer = custPick(); s.carrier = carrierPick(); s.order = dateMs(d.order);
    s.creator = rs.pick(SHIPPERS); s.createdAt = s.order + 8 * HOUR + rs.int(0, 300) * MIN;
    s.promise = s.order + rs.int(7, 14) * DAY; s.requested = Math.max(s.order, s.promise - rs.int(0, 3) * DAY);
    makeLines(s); s.lines.forEach((l) => { l.shipped = null; });
    const steps = d.from === 'Planned' ? 0 : d.from === 'Ready to Pack' ? 1 : 2;
    const times = spread(s.createdAt + HOUR, s.createdAt + 5 * DAY, steps + 1);
    const hist: Hist[] = [{ at: s.createdAt, from: null, to: 'Planned', by: s.creator }];
    const order = ['Planned', 'Ready to Pack', 'Packing'];
    for (let k = 0; k < steps; k++) hist.push({ at: times[k] as number, from: order[k] as string, to: order[k + 1] as string, by: k === 1 ? rs.pick(SHIPPERS) : s.creator });
    const reasonTxt = ['Customer cancelled the order', 'Duplicate order entered', 'Customer revised drawing; order replaced', 'Order withdrawn by customer', 'Material no longer available; customer cancelled', 'Customer moved to a different supplier'][i] as string;
    hist.push({ at: times[steps] as number, from: d.from, to: 'Cancelled', by: d.by, note: `Cancelled: ${reasonTxt}` });
    s.hist = hist; s.notes = `Cancelled: ${reasonTxt}.`; s.updatedAt = (hist[hist.length - 1] as Hist).at;
    s.packer = steps === 2 ? s.creator : null; s.docs = [false, false, false, false];
    s.rtp = (hist.find((h) => h.to === 'Ready to Pack')?.at) ?? 0;
    return s;
  });
  openShips.concat(cancelled).forEach((s) => { s.po = `PO-${(CUSTOMERS[s.customer - 1] as (typeof CUSTOMERS)[number]).code.slice(0, 4)}-${rt.digits(5)}`; });

  // ---- H. numbering, ids ---------------------------------------------------------------------------------------------
  // numbering must follow supply/sim edits to lines (splits), so do the order sort now, assign line ids after the ledger.
  const allShips = [...shipped, ...cancelled, ...openShips];
  allShips.sort((a, b) => a.order - b.order || a.key - b.key);
  allShips.forEach((s, i) => { s.no = 1001 + i; });
  {
    const holder = allShips.find((s) => s.no === 1042) as Ship;
    if (holder !== s1) { holder.no = s1.no; s1.no = 1042; }
  }
  allShips.sort((a, b) => a.no - b.no);
  allShips.forEach((s, i) => { s.id = i + 1; });
  const s1Date = isoDate(s1.shipDate as number);
  if (s1Date < '2026-06-15' || s1Date > '2026-06-30') calibration.WARN_S1_DATE = s1Date;

  // ---- I. error statuses, root cause, corrective actions -------------------------------------------------------------
  allErrors.sort((a, b) => a.detectedAt - b.detectedAt || a.ship.id - b.ship.id);
  allErrors.forEach((e, i) => { e.id = i + 1; e.no = `PE-${String(i + 1).padStart(4, '0')}`; if (!e.severity) e.severity = sevPool.pop() as string; });
  {
    const s1e = allErrors.find((e) => e.story === 'S1') as ErrPlan;
    const s2e = allErrors.find((e) => e.story === 'S2') as ErrPlan;
    const s85 = allErrors.find((e) => e.story === 'S6') as ErrPlan;
    s1e.status = 'Closed'; s2e.status = 'Open'; s85.status = 'Open';
    const others = allErrors.filter((e) => e !== s1e && e !== s2e && e !== s85);
    others.forEach((e, i) => { e.status = i < 11 ? 'Closed' : i < 14 ? 'Contained' : 'Open'; });
    const capClose = ms(2026, 11, 24, 16, 0, 0);
    for (const e of allErrors) {
      if (e.status === 'Closed') {
        const want = e.detectedAt + (e.story === 'S1' ? 20 : rq.int(3, 12)) * DAY;
        e.closedAt = Math.max(e.detectedAt + 2 * HOUR, Math.min(want, capClose));
      }
    }
    // root cause
    const causes = rq.shuffle(['Method', 'Method', 'Method', 'Method', 'People', 'People', 'People', 'People', 'Material', 'Material', 'Machine', 'Machine', 'Measurement', 'Environment', 'Environment', 'Environment']);
    s1e.rootCat = 'Method';
    s1e.rootNote = [
      'Why 1: Shipment was reopened to replace the packing slip.',
      'Why 2: The slip listed revision B while the parts packed were revision C.',
      'Why 3: The slip template pulled the revision from an old customer PO line.',
      'Why 4: Revision changes are not pushed to the shipping-document template.',
      'Why 5: No step in the engineering-change process updates shipping documents.',
    ].join('\n');
    const withCause = allErrors.filter((e) => e !== s1e && (e.status !== 'Open' || e === s2e || e.id === (others.filter((x) => x.status === 'Open')[0] as ErrPlan).id));
    for (const e of withCause) {
      let k = 0;
      if (e.peak) { const j = causes.findIndex((c) => c === 'People' || c === 'Environment'); if (j >= 0) k = j; }
      e.rootCat = causes.splice(k, 1)[0] as string;
      e.rootNote = `Contributing factor (${e.rootCat}): reviewed with the team; see corrective action.`;
    }
    // corrective actions (14): Closed 8, In Progress 4, Open 2
    const closedErrs = allErrors.filter((e) => e.status === 'Closed' && e !== s1e);
    const pickClosed = rq.shuffle(closedErrs).slice(0, 7);
    const rest = rq.shuffle(allErrors.filter((e) => e !== s1e && e !== s2e && !pickClosed.includes(e)));
    const inProg = [s2e, ...rest.slice(0, 3)];
    const openCA = rest.slice(3, 5);
    const caText: Record<string, string> = {
      'Incorrect label': 'Add a label-to-order scan check at the packing station.',
      Paperwork: 'Add a document revision check to the verification checklist.',
      'Wrong quantity': 'Introduce count-by-weight verification for lines above 100 pieces.',
      'Packaging method': 'Update the packaging instruction and add a photo to the work instruction.',
      'Wrong part': 'Separate similar part families at the pick location with a visual divider.',
      Damage: 'Upgrade carton and dunnage specification for heavy parts.',
      Traceability: 'Print the lot number on the packing slip from the ledger, not by hand.',
      Other: 'Add a mixed-lot check to the packing checklist.',
    };
    const mkCA = (e: ErrPlan, status: CAPlan['status'], overdue: boolean): void => {
      const created = Math.min(e.detectedAt + rq.int(1, 3) * DAY, ms(2026, 11, 24, 16, 0, 0));
      const createdAt = Math.max(created, e.detectedAt + HOUR);
      const owner = e === s1e ? U.qual : e === s2e ? U.sup : rq.pick([U.qual, U.sup, U.s1, U.s2]);
      let due = dayStart(createdAt) + rq.int(14, 30) * DAY;
      if (overdue) due = e === s2e ? ms(2026, 11, 20) : ms(2026, 11, rq.int(5, 18));
      else if (status !== 'Closed' && due < ms(2026, 11, 26)) due = ms(2026, 12, rq.int(5, 20));
      let closedAt: number | null = null;
      if (status === 'Closed') closedAt = Math.max(createdAt + HOUR, Math.min(createdAt + rq.int(5, 20) * DAY, ms(2026, 11, 24, 17, 0, 0)));
      e.ca = {
        desc: e === s1e ? "Add a shipping-document update step to the engineering-change checklist and add 'revision matches' to the verification checklist" : (caText[e.category] as string),
        owner, due, status, createdAt, closedAt, by: owner === U.s1 || owner === U.s2 ? U.sup : owner,
      };
    };
    mkCA(s1e, 'Closed', false);
    const ca1: CAPlan = { ...(s1e.ca as CAPlan), due: dayStart(s1e.detectedAt) + 30 * DAY, createdAt: s1e.detectedAt + DAY, closedAt: Math.min(s1e.detectedAt + 20 * DAY, ms(2026, 11, 24, 17, 0, 0)) };
    if ((ca1.closedAt as number) <= ca1.createdAt) ca1.closedAt = ca1.createdAt + HOUR;
    s1e.ca = ca1;
    pickClosed.forEach((e) => mkCA(e, 'Closed', false));
    inProg.forEach((e, i) => mkCA(e, 'In Progress', i === 0 || i === 1));
    openCA.forEach((e, i) => mkCA(e, 'Open', i === 0));
  }

  // ---- J. supply plan (receipts, production) ------------------------------------------------------------------------
  interface Supply {
    kind: 'receipt' | 'prod'; part: number; qty: number; at: number; loc: number | null; status: 'Accepted' | 'On Hold' | 'Rejected';
    supplier: number; po: string; notes: string | null; lot: string; tag: string; no: number; id: number; releaseAt?: number; transferAt?: number;
  }
  const supplies: Supply[] = [];
  const demandByPart = new Map<number, Dem[]>();
  for (const s of shipped) {
    for (const l of s.lines) {
      if (l.fixedLot) continue;
      const arr = demandByPart.get(l.part) ?? [];
      arr.push({ t: s.shippedAt as number, q: Math.ceil((l.shipped as number) * 1.08) + 2 });
      demandByPart.set(l.part, arr);
    }
  }
  for (const arr of demandByPart.values()) arr.sort((a, b) => a.t - b.t);
  const bought = PARTS.map((p, i) => ({ p, id: i + 1 })).filter((x) => !x.p.inhouse && x.p.active !== false);
  const inhouse = PARTS.map((p, i) => ({ p, id: i + 1 })).filter((x) => x.p.inhouse);
  const boughtTargets = quota(131, bought.map((b) => 2 + (demandByPart.get(b.id)?.length ?? 0)));
  const mkSupply = (kind: Supply['kind'], part: number, qty: number, at: number, loc: number | null, status: Supply['status'], tag: string, notes: string | null = null): Supply => {
    const def = PARTS[part - 1] as (typeof PARTS)[number];
    const sp: Supply = { kind, part, qty, at, loc, status, supplier: def.supplier ?? 0, po: kind === 'receipt' ? `SPO-${rr.digits(6)}` : '', notes, lot: '', tag, no: 0, id: 0 };
    supplies.push(sp);
    return sp;
  };
  bought.forEach((b, i) => {
    for (const pl of planSupply(demandByPart.get(b.id) as Dem[], boughtTargets[i] as number, 5)) {
      mkSupply('receipt', b.id, pl.qty, tod(rr, pl.day), b.p.loc, 'Accepted', 'jit');
    }
  });
  const ihTargets = [3, 3, 2, 2, 2];
  inhouse.forEach((b, i) => {
    for (const pl of planSupply(demandByPart.get(b.id) as Dem[], ihTargets[i] as number, 3)) {
      mkSupply('prod', b.id, pl.qty, tod(rr, pl.day), L.FG, 'Accepted', 'prod');
    }
  });
  // story lots
  const s3Receipt = mkSupply('receipt', partId('CRC-2107-A'), 400, ms(2026, 9, 28, 6, 0, 0), L.A01, 'Accepted', 'S3');
  const s4Receipt = mkSupply('receipt', partId('CRC-3118-A'), 120, ms(2026, 11, 9, 6, 0, 0), L.HOLD, 'On Hold', 'S4', 'Awaiting incoming inspection.');
  // tail receipts into RCV-01
  const tailParts = rr.shuffle(bought.filter((b) => b.p.cls !== 'A' && b.id !== partId('CRC-3118-A'))).slice(0, 8);
  const tailDays = [ms(2026, 11, 19), ms(2026, 11, 19), ms(2026, 11, 20), ms(2026, 11, 20), ms(2026, 11, 23), ms(2026, 11, 23), ms(2026, 11, 23), ms(2026, 11, 23)];
  tailParts.forEach((b, i) => {
    const sp = mkSupply('receipt', b.id, rr.int(10, 40) * 10, tod(rr, tailDays[i] as number, 7, 15), L.RCV, 'Accepted', 'tail');
    if (i < 3) sp.transferAt = ms(2026, 11, 23, 8 + i, rr.int(0, 59), rr.int(0, 59));
  });
  // held (7 more) and rejected (2)
  const heldParts = rr.shuffle(bought).slice(0, 7);
  const heldDays = days.filter((d) => d >= ms(2026, 6, 15) && d <= ms(2026, 11, 5));
  heldParts.forEach((b, i) => {
    const sp = mkSupply('receipt', b.id, rr.int(5, 20) * 10, tod(rr, rr.pick(heldDays)), L.HOLD, 'On Hold', 'held', 'Held for incoming inspection.');
    if (i < 5) {
      let rel = tod(rr, sp.at + rr.int(3, 10) * DAY);
      if (isWeekend(rel)) rel += 2 * DAY;
      sp.releaseAt = rel; sp.notes = 'Held for incoming inspection; released by Quality.';
    }
  });
  rr.shuffle(bought).slice(0, 2).forEach((b) => {
    mkSupply('receipt', b.id, rr.int(2, 10) * 10, tod(rr, rr.pick(heldDays)), null, 'Rejected', 'rejected', 'Rejected on receipt: damaged packaging.');
  });
  void s3Receipt; void s4Receipt;
  const receiptsN = supplies.filter((x) => x.kind === 'receipt').length;
  calibration.receipts = receiptsN;
  // order and lot numbers
  supplies.sort((a, b) => a.at - b.at);
  const weekCounter = new Map<number, number>();
  supplies.forEach((sp, i) => {
    sp.no = i;
    const w = isoWeek(sp.at);
    const n = (weekCounter.get(w) ?? 0) + 1;
    weekCounter.set(w, n);
    sp.lot = `L26${String(w).padStart(2, '0')}-${String(n).padStart(3, '0')}`;
  });
  let rcNo = 0;
  supplies.forEach((sp) => { if (sp.kind === 'receipt') sp.id = ++rcNo; });
  const s3Lot = (s3Receipt as Supply).lot;
  const s4Lot = (s4Receipt as Supply).lot;
  if (s3Lot !== 'L2640-001') calibration.WARN_S3_LOT = s3Lot;
  if (s4Lot !== 'L2646-001') calibration.WARN_S4_LOT = s4Lot;

  // ---- K. ledger simulation ------------------------------------------------------------------------------------------
  interface Txn {
    type: string; part: number; loc: number; lot: string; qty: number; reason: number | null; receipt: Supply | null;
    line: Line | null; ccLine: CCLine | null; group: string | null; note: string | null; at: number; by: number; seq: number;
  }
  interface CCLine {
    cc: CC; part: number; loc: number; lot: string; cls: Cls; tol: number; system: number; counted: number | null; countedBy: number | null;
    countedAt: number | null; recount: number | null; recountedBy: number | null; recountedAt: number | null; id: number;
  }
  interface CC {
    idx: number; no: string; created: number; scheduled: number; status: 'Open' | 'Counted' | 'Approved'; lines: CCLine[];
    submittedAt: number | null; approvedAt: number | null; id: number;
  }
  const ledger: Txn[] = [];
  const bal = new Map<string, number>();
  const partKeys = new Map<number, string[]>();
  const lotArrival = new Map<string, number>();
  const reserved = new Set<string>([s3Lot]);
  const keyOf = (p: number, l: number, lot: string): string => `${p}|${l}|${lot}`;
  const parseKey = (k: string): { p: number; l: number; lot: string } => {
    const [p, l, lot] = k.split('|');
    return { p: Number(p), l: Number(l), lot: lot as string };
  };
  let txSeq = 0;
  const post = (t: Omit<Txn, 'seq'>): void => {
    const k = keyOf(t.part, t.loc, t.lot);
    if (!bal.has(k)) { const arr = partKeys.get(t.part) ?? []; arr.push(k); partKeys.set(t.part, arr); }
    const nb = (bal.get(k) ?? 0) + t.qty;
    if (nb < 0) throw new Error(`ledger: negative balance ${nb} for ${k} (${t.type} at ${isoTs(t.at)})`);
    bal.set(k, nb);
    ledger.push({ ...t, seq: txSeq++ });
  };
  const base = { reason: null, receipt: null, line: null, ccLine: null, group: null, note: null } as const;
  const eligible = (part: number, minBal = 1): string[] =>
    (partKeys.get(part) ?? [])
      .filter((k) => {
        const { l, lot } = parseKey(k);
        return (LOC_TYPE[l] === 'Stock' || LOC_TYPE[l] === 'FG') && (bal.get(k) ?? 0) >= minBal && !reserved.has(lot);
      })
      .sort((a, b) => (lotArrival.get(parseKey(a).lot) as number) - (lotArrival.get(parseKey(b).lot) as number) || (a < b ? -1 : 1));

  interface Ev { at: number; rank: number; seq: number; run: () => void }
  const events: Ev[] = [];
  let evSeq = 0;
  const ev = (at: number, rank: number, run: () => void): void => { events.push({ at, rank, seq: evSeq++, run }); };

  for (const sp of supplies) {
    lotArrival.set(sp.lot, sp.at);
    if (sp.kind === 'prod') {
      ev(sp.at, 0, () => post({ ...base, type: 'PRODUCTION_COMPLETE', part: sp.part, loc: sp.loc as number, lot: sp.lot, qty: sp.qty, at: sp.at, by: U.sup, note: 'Production complete to finished goods' }));
      continue;
    }
    if (sp.status === 'Rejected') continue;
    ev(sp.at + 5 * MIN, 0, () => post({ ...base, type: 'RECEIPT', part: sp.part, loc: sp.loc as number, lot: sp.lot, qty: sp.qty, receipt: sp, at: sp.at + 5 * MIN, by: U.rcv }));
    const home = (PARTS[sp.part - 1] as (typeof PARTS)[number]).loc;
    const xfer = (at: number, from: number, to: number, by: number, note: string): void => {
      ev(at, 1, () => {
        const g = rl.uuid();
        post({ ...base, type: 'TRANSFER', part: sp.part, loc: from, lot: sp.lot, qty: -sp.qty, group: g, at, by, note });
        post({ ...base, type: 'TRANSFER', part: sp.part, loc: to, lot: sp.lot, qty: sp.qty, group: g, at, by, note });
      });
    };
    if (sp.releaseAt) xfer(sp.releaseAt, L.HOLD, home, rl.pick([U.qual, U.sup]), 'Released from hold after inspection');
    if (sp.transferAt) xfer(sp.transferAt, L.RCV, home, U.rcv, 'Put away from receiving');
  }

  // ship events
  for (const s of shipped) {
    ev(s.shippedAt as number, 4, () => {
      const newLines: Line[] = [];
      for (const l of s.lines) {
        const need = l.shipped as number;
        if (l.fixedLot) {
          const key = keyOf(l.part, L.A01, s3Lot);
          if ((bal.get(key) ?? 0) < need) throw new Error('story lot exhausted');
          l.lot = s3Lot; l.loc = L.A01;
          post({ ...base, type: 'SHIP', part: l.part, loc: L.A01, lot: s3Lot, qty: -need, line: l, at: s.shippedAt as number, by: s.shipUser });
          continue;
        }
        const cands = eligible(l.part);
        const single = cands.find((k) => (bal.get(k) as number) >= need);
        if (single) {
          const { l: loc, lot } = parseKey(single);
          l.lot = lot; l.loc = loc;
          post({ ...base, type: 'SHIP', part: l.part, loc, lot, qty: -need, line: l, at: s.shippedAt as number, by: s.shipUser });
          continue;
        }
        let remaining = need;
        let first = true;
        let orderedLeft = l.ordered;
        for (const k of cands) {
          if (remaining <= 0) break;
          const take = Math.min(bal.get(k) as number, remaining);
          const { l: loc, lot } = parseKey(k);
          const target: Line = first ? l : { ship: s, part: l.part, ordered: 0, shipped: 0, lot: null, loc: null, note: null, id: 0, lineNo: 100 + newLines.length };
          if (!first) newLines.push(target);
          target.lot = lot; target.loc = loc; target.shipped = take;
          target.ordered = take;
          orderedLeft -= take;
          remaining -= take;
          post({ ...base, type: 'SHIP', part: l.part, loc, lot, qty: -take, line: target, at: s.shippedAt as number, by: s.shipUser });
          first = false;
        }
        if (remaining > 0) throw new Error(`stock-out for part ${l.part} at ${isoTs(s.shippedAt as number)} (short ${remaining})`);
        // remaining ordered quantity and the short note go to the last piece
        const lastLine = (newLines.length ? newLines[newLines.length - 1] : l) as Line;
        lastLine.ordered += orderedLeft;
        if (l.note) { lastLine.note = l.note; if (lastLine !== l) l.note = null; }
      }
      s.lines.push(...newLines);
    });
  }

  // scrap events
  const scrapReasons = ['SCR_DAMAGED', 'SCR_NONCONFORMING', 'SCR_OBSOLETE'];
  ev(ms(2026, 10, 20, 10, 20, 0), 5, () => post({ ...base, type: 'SCRAP', part: partId('CRC-2107-A'), loc: L.A01, lot: s3Lot, qty: -5, reason: R.SCR_DAMAGED as number, at: ms(2026, 10, 20, 10, 20, 0), by: U.rcv, note: 'Damaged in handling' }));
  for (let i = 0; i < 5; i++) {
    const at = tod(rl, rl.pick(days.filter((d) => d >= ms(2026, 7, 6) && d <= ms(2026, 11, 10))), 8, 16);
    ev(at, 5, () => {
      const all = PARTS.map((_, idx) => idx + 1).flatMap((p) => eligible(p, 60));
      const k = rl.pick(all);
      const { p, l, lot } = parseKey(k);
      post({ ...base, type: 'SCRAP', part: p, loc: l, lot, qty: -rl.int(2, 12), reason: R[rl.pick(scrapReasons)] as number, at, by: rl.pick([U.rcv, U.qual]), note: 'Scrapped at stock location' });
    });
  }

  // cycle counts
  const ccs: CC[] = [];
  const tolFor: Record<Cls, number> = { A: 0, B: 2, C: 5 };
  const mondays = [0, 2, 4, 7, 9, 11, 13, 16, 18, 20].map((w) => ms(2026, 6, 15) + w * 7 * DAY);
  const ccDays = [...mondays, ms(2026, 11, 16), ms(2026, 11, 23)];
  const lineCounts = [17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 18, 12];
  const classW = [75, 65, 48];
  const perClass = lineCounts.map((n) => quota(n, classW));
  // miss plan (slots: [count idx, class idx, slot idx])
  interface Slot { miss: boolean; fix: boolean; inTol: boolean }
  const slots: Slot[][][] = perClass.map((pc) => pc.map((n) => Array.from({ length: n }, () => ({ miss: false, fix: false, inTol: false }))));
  const pickSlot = (k: number, excl: number[], onlyIdx?: number[]): Slot => {
    const choices: Array<[number, number]> = [];
    slots.forEach((cnt, i) => {
      if (i === 11 || excl.includes(i)) return;
      if (onlyIdx && !onlyIdx.includes(i)) return;
      (cnt[k] as Slot[]).forEach((s, j) => { if (!s.miss) choices.push([i, j]); });
    });
    const [i, j] = rc.pick(choices);
    return ((slots[i] as Slot[][])[k] as Slot[])[j] as Slot;
  };
  ((slots[9] as Slot[][])[0] as Slot[])[0] = { miss: true, fix: true, inTol: false }; // S-3 line
  pickSlot(0, [9]).miss = true;
  pickSlot(1, [9]).miss = true;
  ((slots[9] as Slot[][])[2] as Slot[])[0] = { miss: true, fix: false, inTol: false };
  for (let n = 0; n < 4; n++) { const sl = pickSlot(2, [9]); sl.miss = true; sl.fix = n < 2; }
  for (let n = 0; n < 10; n++) { const k = rc.pick([1, 2]); const sl = pickSlot(k, [9, 10, 11]); sl.inTol = true; }

  ccDays.forEach((day, i) => {
    const cc: CC = {
      idx: i, no: `CC-${String(i + 1).padStart(4, '0')}`, created: day + 5 * HOUR + 30 * MIN + 7000, scheduled: i === 11 ? ms(2026, 11, 25) : day,
      status: i < 10 ? 'Approved' : i === 10 ? 'Counted' : 'Open', lines: [], submittedAt: null, approvedAt: null, id: i + 1,
    };
    if (i < 10) { cc.submittedAt = day + DAY + 14 * HOUR; cc.approvedAt = day + 2 * DAY + 10 * HOUR + 5000; }
    if (i === 10) cc.submittedAt = day + 2 * DAY + 14 * HOUR;
    ccs.push(cc);
    ev(cc.created, 2, () => {
      const used = new Set<string>();
      (['A', 'B', 'C'] as Cls[]).forEach((cls, k) => {
        const clsParts = PARTS.map((p, idx) => ({ p, id: idx + 1 })).filter((x) => x.p.cls === cls && x.p.active !== false).map((x) => x.id);
        const all: string[] = [];
        for (const pid of clsParts) {
          for (const key of partKeys.get(pid) ?? []) {
            const { l, lot } = parseKey(key);
            if ((LOC_TYPE[l] === 'Stock' || LOC_TYPE[l] === 'FG') && (bal.get(key) ?? 0) >= 15) { void lot; all.push(key); }
          }
        }
        const sorted = all.sort();
        let pool = rc.shuffle(sorted);
        const sl = (slots[i] as Slot[][])[k] as Slot[];
        sl.forEach((slot, j) => {
          let key: string | undefined;
          if (i === 9 && k === 0 && j === 0) key = keyOf(partId('CRC-2107-A'), L.A01, s3Lot);
          else {
            const pref = slot.inTol ? pool.find((x) => (bal.get(x) as number) >= 60 && !used.has(x)) : undefined;
            key = pref ?? pool.find((x) => !used.has(x));
          }
          if (!key) { calibration[`short_cc${i + 1}_${cls}`] = ((calibration[`short_cc${i + 1}_${cls}`] as number) ?? 0) + 1; return; }
          used.add(key);
          pool = pool.filter((x) => x !== key);
          const { p, l, lot } = parseKey(key);
          const sys = bal.get(key) as number;
          const line: CCLine = { cc, part: p, loc: l, lot, cls, tol: tolFor[cls], system: sys, counted: null, countedBy: null, countedAt: null, recount: null, recountedBy: null, recountedAt: null, id: 0 };
          if (i <= 10) {
            let d = 0;
            if (slot.miss) d = cls === 'A' ? rc.int(1, Math.max(1, Math.round(sys * 0.03))) : Math.floor((sys * tolFor[cls]) / 100) + rc.int(1, cls === 'B' ? 3 : 4);
            else if (slot.inTol) { const mx = Math.floor((sys * tolFor[cls]) / 100); d = mx >= 1 ? rc.int(1, mx) : 0; }
            let sign = rc.chance(0.5) ? -1 : 1;
            if (sys + sign * d < 0 || (i === 9 && cls === 'A' && j === 0)) sign = 1;
            if (sys <= 0) sign = 1;
            line.counted = sys + sign * d;
            line.countedBy = U.rcv; line.countedAt = day + 8 * HOUR + rc.int(0, 3 * 3600) * 1000;
            if (slot.miss) {
              line.recount = slot.fix ? sys : line.counted;
              line.recountedBy = U.qual; line.recountedAt = day + DAY + 9 * HOUR + rc.int(0, 5400) * 1000;
            }
          }
          cc.lines.push(line);
        });
      });
    });
    if (cc.approvedAt) {
      ev(cc.approvedAt, 6, () => {
        for (const l of cc.lines) {
          const fin = l.recount ?? l.counted ?? l.system;
          const v = fin - l.system;
          if (v !== 0) post({ ...base, type: 'ADJUST', part: l.part, loc: l.loc, lot: l.lot, qty: v, reason: R.ADJ_COUNT_VARIANCE as number, ccLine: l, at: cc.approvedAt as number, by: U.sup, note: `Cycle count ${cc.no} variance` });
        }
      });
    }
  });

  events.sort((a, b) => a.at - b.at || a.rank - b.rank || a.seq - b.seq);
  for (const e of events) e.run();

  // ---- L. final ids and rows ------------------------------------------------------------------------------------------
  const BASE_TS = isoTs(ms(2026, 5, 1, 8, 0, 0));
  const tables: Record<string, Row[]> = {};
  // line numbering / ids
  let lineId = 0;
  for (const s of allShips) {
    s.lines.sort((a, b) => a.lineNo - b.lineNo || (a.lot ?? '').localeCompare(b.lot ?? ''));
    s.lines.forEach((l, i) => { l.lineNo = i + 1; l.id = ++lineId; });
  }
  tables.customer = CUSTOMERS.map((c) => ({ code: c.code, name: c.name, ship_to_city: c.city, ship_to_state: c.state, active: true, created_at: BASE_TS, updated_at: BASE_TS }));
  tables.supplier = SUPPLIERS.map((c) => ({ code: c.code, name: c.name, active: true, created_at: BASE_TS, updated_at: BASE_TS }));
  tables.carrier = CARRIERS.map((c) => ({ name: c.name, mode: c.mode, active: true, created_at: BASE_TS, updated_at: BASE_TS }));
  tables.location = LOCATIONS.map((c) => ({ code: c.code, type: c.type, description: c.description, active: true, created_at: BASE_TS, updated_at: BASE_TS }));
  tables.reason_code = REASONS.map((r) => ({ category: r[0], code: r[1], label: r[2], active: true, created_at: BASE_TS, updated_at: BASE_TS }));
  tables.part = PARTS.map((p) => {
    const pn = p.pn;
    return {
      part_number: pn, revision: pn.slice(-1), description: p.desc, unit_of_measure: 'EA', abc_class: p.cls,
      packaging_instruction_ref: `PKG-${pn.slice(4, 8)}-1`, requires_coc: !!p.coc, active: p.active !== false, created_at: BASE_TS, updated_at: BASE_TS,
    };
  });
  // lots
  tables.lot = supplies.map((sp) => ({ lot_number: sp.lot, part_id: sp.part, created_at: isoTs(sp.at) }));
  // shipments
  tables.shipment = allShips.map((s) => ({
    shipment_no: `SH-${s.no}`, customer_id: s.customer, customer_po: s.po, order_date: isoDate(s.order), requested_date: isoDate(s.requested),
    promise_date: isoDate(s.promise), status: s.status, held_from_status: s.heldFrom, hold_reason_id: s.holdReason, hold_owner_dept: s.holdOwner,
    rework_origin: s.reworkOrigin, rework_episode: s.reworkEpisode, late_reason_id: s.lateReason,
    ship_date: s.shipDate === null ? null : isoDate(s.shipDate), shipped_at: s.shippedAt === null ? null : isoTs(s.shippedAt),
    carrier_id: s.kind === 'cancelled' ? null : s.carrier, tracking_number: s.tracking, service_level: s.kind === 'shipped' ? (CARRIERS[s.carrier - 1] as (typeof CARRIERS)[number]).service : null,
    packages_count: s.packages, total_weight_lb: s.weight, doc_packing_slip: s.docs[0], doc_bol: s.docs[1], doc_coc: s.docs[2], doc_labels: s.docs[3],
    packed_by: s.packer,
    verified_by: s.status === 'Shipped' || s.status === 'Verified' ? s.verifier : null,
    verified_at: s.status === 'Shipped' || s.status === 'Verified' ? isoTs(s.verifiedAt as number) : null,
    notes: s.notes, created_by: s.creator, created_at: isoTs(s.createdAt), updated_at: isoTs(s.updatedAt),
  }));
  tables.shipment_line = allShips.flatMap((s) => s.lines.map((l) => ({
    shipment_id: s.id, line_no: l.lineNo, part_id: l.part, qty_ordered: l.ordered, qty_shipped: l.shipped, lot_number: l.lot, location_id: l.loc,
    short_note: l.note, created_at: isoTs(s.createdAt), updated_at: isoTs(s.updatedAt),
  })));
  // history, verification
  tables.shipment_status_history = allShips.flatMap((s) => s.hist.map((h) => ({
    shipment_id: s.id, from_status: h.from, to_status: h.to, changed_at: isoTs(h.at), business_date: isoDate(h.at), changed_by: h.by, note: h.note ?? null, created_at: isoTs(h.at),
  })));
  const checklistOf = (failed: string[]): Row => ({
    part_number: !failed.includes('part_number'), revision: !failed.includes('revision'), quantity: !failed.includes('quantity'),
    lot: !failed.includes('lot'), labels: !failed.includes('labels'), packing_slip: !failed.includes('packing_slip') && !failed.includes('coc'),
    packaging_method: !failed.includes('packaging_method'),
  });
  tables.shipment_verification = allShips.flatMap((s) => s.ver.map((v) => ({
    shipment_id: s.id, attempt_no: v.attempt, result: v.result, packer_id: v.packer, verified_by: v.by, checklist: checklistOf(v.failed),
    failed_items: v.failed, note: v.note ?? null, verified_at: isoTs(v.at), business_date: isoDate(v.at),
  })));
  // receipts
  const receiptsSorted = supplies.filter((x) => x.kind === 'receipt');
  tables.receipt = receiptsSorted.map((sp) => ({
    receipt_no: `RC-${String(sp.id).padStart(4, '0')}`, supplier_id: sp.supplier, supplier_po: sp.po, part_id: sp.part, qty_received: sp.qty,
    lot_number: sp.lot, arrived_at: isoTs(sp.at), location_id: sp.loc, inspection_status: sp.status, received_by: U.rcv, notes: sp.notes,
    created_at: isoTs(sp.at), updated_at: isoTs(sp.at),
  }));
  // errors
  tables.packaging_error = allErrors.map((e) => ({
    error_no: e.no, shipment_id: e.ship.id, shipment_line_id: (e.ship.lines[0] as Line).id, detected_at: isoTs(e.detectedAt), rework_episode: e.episode,
    detected_by_role: e.role, detected_stage: e.stage, category: e.category, paperwork_subtype: e.subtype, severity: e.severity, description: e.description,
    root_cause_category: e.rootCat, root_cause_note: e.rootNote, status: e.status, packaging_related: true, closed_at: e.closedAt === null ? null : isoTs(e.closedAt),
    reported_by: e.reportedBy, created_at: isoTs(e.detectedAt), updated_at: isoTs(e.closedAt ?? e.detectedAt),
  }));
  tables.rework_event = allErrors.flatMap((e) => e.reworks.map((r) => ({
    packaging_error_id: e.id, shipment_id: e.ship.id, action: r.action, started_at: isoTs(r.start), completed_at: r.end === null ? null : isoTs(r.end),
    performed_by: r.by, reverified_ok: r.reverified, created_at: isoTs(r.start), updated_at: isoTs(r.end ?? r.start),
  })));
  tables.corrective_action = allErrors.filter((e) => e.ca).map((e) => {
    const c = e.ca as CAPlan;
    return {
      packaging_error_id: e.id, action_description: c.desc, owner_id: c.owner, due_date: isoDate(c.due), status: c.status,
      closed_at: c.closedAt === null ? null : isoTs(c.closedAt), created_by: c.by, created_at: isoTs(c.createdAt), updated_at: isoTs(c.closedAt ?? c.createdAt),
    };
  });
  // cycle counts
  let ccLineId = 0;
  for (const cc of ccs) {
    cc.lines.sort((a, b) => a.cls.localeCompare(b.cls) || a.part - b.part || a.loc - b.loc || (a.lot < b.lot ? -1 : 1));
    cc.lines.forEach((l) => { l.id = ++ccLineId; });
  }
  tables.cycle_count = ccs.map((cc) => ({
    count_no: cc.no, scheduled_date: isoDate(cc.scheduled), status: cc.status, scope_abc_class: null, scope_location_id: null, created_by: U.sup,
    submitted_by: cc.submittedAt === null ? null : U.rcv, submitted_at: cc.submittedAt === null ? null : isoTs(cc.submittedAt),
    approved_by: cc.approvedAt === null ? null : U.sup, approved_at: cc.approvedAt === null ? null : isoTs(cc.approvedAt),
    approved_business_date: cc.approvedAt === null ? null : isoDate(cc.approvedAt), approval_reason_code_id: cc.approvedAt === null ? null : R.ADJ_COUNT_VARIANCE,
    approval_note: null, created_at: isoTs(cc.created), updated_at: isoTs(cc.approvedAt ?? cc.submittedAt ?? cc.created),
  }));
  tables.cycle_count_line = ccs.flatMap((cc) => cc.lines.map((l) => ({
    cycle_count_id: cc.id, part_id: l.part, location_id: l.loc, lot_number: l.lot, abc_class: l.cls, tolerance_pct: l.tol, system_qty: l.system,
    counted_qty: l.counted, counted_by: l.countedBy, counted_at: l.countedAt === null ? null : isoTs(l.countedAt), recount_qty: l.recount,
    recounted_by: l.recountedBy, recounted_at: l.recountedAt === null ? null : isoTs(l.recountedAt), created_at: isoTs(cc.created), updated_at: isoTs(l.recountedAt ?? l.countedAt ?? cc.created),
  })));
  // ledger (ids = chronological)
  ledger.sort((a, b) => a.at - b.at || a.seq - b.seq);
  tables.inventory_transaction = ledger.map((t) => ({
    txn_type: t.type, part_id: t.part, location_id: t.loc, lot_number: t.lot, qty_change: t.qty, reason_code_id: t.reason,
    receipt_id: t.receipt ? t.receipt.id : null, shipment_line_id: t.line ? t.line.id : null, cycle_count_line_id: t.ccLine ? t.ccLine.id : null,
    txn_group: t.group, note: t.note, txn_at: isoTs(t.at), created_by: t.by, created_at: isoTs(t.at),
  }));

  calibration.shipments = allShips.length;
  return {
    tables,
    meta: {
      anchorDate: '2026-11-25',
      stories: {
        'SH-1042': `SH-${s1.no}`,
        S2_customer_found_error_shipment: `SH-${s2.no}`,
        S3_lot: s3Lot,
        S4_held_lot: s4Lot,
        S3_shipments: s3.map((s) => `SH-${s.no}`).join(','),
      },
      calibration,
    },
  };
}

/** Demo users (hash filled in by the caller). */
export function demoUserRows(createdAt: string): Array<{ username: string; display_name: string; email: string; role: string; created_at: string; updated_at: string }> {
  return DEMO_USERS.map((u) => ({
    username: u.username, display_name: u.displayName, email: `${u.username}@example.com`, role: u.role, created_at: createdAt, updated_at: createdAt,
  }));
}
