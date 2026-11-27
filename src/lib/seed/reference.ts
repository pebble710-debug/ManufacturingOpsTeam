// Fictional reference data (seed-plan section 4). Ids are the 1-based insertion order.
export const CUSTOMERS = [
  { code: 'ALDERVALE', name: 'Aldervale Aerostructures', city: 'Marlow Heights', state: 'OH', w: 22 },
  { code: 'BRIGHTWATER', name: 'Brightwater Marine Systems', city: 'Port Calder', state: 'ME', w: 18 },
  { code: 'PINECREST', name: 'Pinecrest Robotics', city: 'Elk Hollow', state: 'MN', w: 18 },
  { code: 'SUMMITVALLEY', name: 'Summit Valley Pumps', city: 'Harlan Ridge', state: 'CO', w: 16 },
  { code: 'IRONLEAF', name: 'Ironleaf Agricultural Equipment', city: 'Tillman Grove', state: 'IA', w: 14 },
  { code: 'NORTHGATE', name: 'Northgate Rail Services', city: 'Kingsbarrow', state: 'PA', w: 12 },
] as const;
export const C = { ALDERVALE: 1, BRIGHTWATER: 2, PINECREST: 3, SUMMITVALLEY: 4, IRONLEAF: 5, NORTHGATE: 6 } as const;

export const SUPPLIERS = [
  { code: 'GRAYSTONE', name: 'Graystone Metals Supply' },
  { code: 'KESTREL', name: 'Kestrel Fasteners' },
  { code: 'MERIDIAN', name: 'Meridian Polymer Co.' },
  { code: 'BLUEFIELD', name: 'Bluefield Packaging' },
] as const;

export const CARRIERS = [
  { name: 'SwiftLane Parcel', mode: 'Parcel', prefix: 'SLP', digits: 12, w: 55, service: 'Ground' },
  { name: 'Harbor Freight Lines LTL', mode: 'LTL', prefix: 'HFL', digits: 10, w: 20, service: 'Standard LTL' },
  { name: 'TransAxis Truckload', mode: 'Truckload', prefix: 'TAX', digits: 10, w: 10, service: 'Dedicated' },
  { name: 'Customer Pickup', mode: 'Pickup', prefix: '', digits: 0, w: 15, service: 'Will call' },
] as const;

export const LOCATIONS = [
  { code: 'RCV-01', type: 'Receiving', description: 'Receiving dock' },
  { code: 'HOLD-01', type: 'Hold', description: 'Quality hold cage' },
  { code: 'STK-A01', type: 'Stock', description: 'Stock aisle A, bay 1 (A items)' },
  { code: 'STK-A02', type: 'Stock', description: 'Stock aisle A, bay 2 (A items)' },
  { code: 'STK-A03', type: 'Stock', description: 'Stock aisle A, bay 3 (A items)' },
  { code: 'STK-B01', type: 'Stock', description: 'Stock aisle B, bay 1 (B items)' },
  { code: 'STK-B02', type: 'Stock', description: 'Stock aisle B, bay 2 (B items)' },
  { code: 'STK-C01', type: 'Stock', description: 'Stock aisle C, bay 1 (C items)' },
  { code: 'FG-01', type: 'FG', description: 'Finished goods' },
  { code: 'SHIP-01', type: 'Shipping', description: 'Shipping staging' },
] as const;
export const L = { RCV: 1, HOLD: 2, A01: 3, A02: 4, A03: 5, B01: 6, B02: 7, C01: 8, FG: 9, SHIP: 10 } as const;
export const LOC_TYPE: Record<number, string> = Object.fromEntries(LOCATIONS.map((l, i) => [i + 1, l.type]));

export const REASONS = [
  ['late', 'LATE_MATERIAL', 'Late: material'], ['late', 'LATE_QUALITY_HOLD', 'Late: quality hold'],
  ['late', 'LATE_PAPERWORK', 'Late: paperwork'], ['late', 'LATE_CARRIER', 'Late: carrier'],
  ['late', 'LATE_PKG_REWORK', 'Late: packaging rework'], ['late', 'LATE_CAPACITY', 'Late: capacity'],
  ['late', 'LATE_CUST_CHANGE', 'Late: customer change'],
  ['hold', 'HOLD_QUALITY_INSPECTION', 'Hold: quality inspection'], ['hold', 'HOLD_CUSTOMER_REQUEST', 'Hold: customer request'],
  ['hold', 'HOLD_AWAITING_MATERIAL', 'Hold: awaiting material'], ['hold', 'HOLD_AWAITING_DOCS', 'Hold: awaiting documents'],
  ['adjust', 'ADJ_COUNT_VARIANCE', 'Adjust: count variance'], ['adjust', 'ADJ_MISPICK_CORRECTION', 'Adjust: mispick correction'],
  ['scrap', 'SCR_DAMAGED', 'Scrap: damaged'], ['scrap', 'SCR_NONCONFORMING', 'Scrap: nonconforming'], ['scrap', 'SCR_OBSOLETE', 'Scrap: obsolete'],
] as const;
export const R: Record<string, number> = Object.fromEntries(REASONS.map((r, i) => [r[1], i + 1]));

export type Cls = 'A' | 'B' | 'C';
export interface PartDef { pn: string; desc: string; cls: Cls; coc?: boolean; inhouse?: boolean; supplier?: number; loc: number; active?: boolean }
// supplier ids: 1 Graystone, 2 Kestrel, 3 Meridian, 4 Bluefield
export const PARTS: readonly PartDef[] = [
  { pn: 'CRC-2041-C', desc: 'Bracket, Machined', cls: 'A', coc: true, supplier: 1, loc: L.A02 },
  { pn: 'CRC-2107-A', desc: 'Flange, Turned', cls: 'A', supplier: 1, loc: L.A01 },
  { pn: 'CRC-2230-B', desc: 'Housing, Pump', cls: 'A', coc: true, inhouse: true, loc: L.FG },
  { pn: 'CRC-2315-A', desc: 'Spindle, Ground', cls: 'A', inhouse: true, loc: L.FG },
  { pn: 'CRC-2488-A', desc: 'Manifold Block', cls: 'A', inhouse: true, loc: L.FG },
  { pn: 'CRC-2041-B', desc: 'Bracket, Machined (superseded revision)', cls: 'A', supplier: 1, loc: L.A02, active: false },
  { pn: 'CRC-3102-A', desc: 'Clamp Plate', cls: 'B', supplier: 1, loc: L.B01 },
  { pn: 'CRC-3118-A', desc: 'Cover, Polymer', cls: 'B', supplier: 3, loc: L.B02 },
  { pn: 'CRC-3205-B', desc: 'Gear Blank', cls: 'B', inhouse: true, loc: L.FG },
  { pn: 'CRC-3290-A', desc: 'Coupling Sleeve', cls: 'B', supplier: 1, loc: L.B01 },
  { pn: 'CRC-3344-A', desc: 'Mounting Plate', cls: 'B', supplier: 1, loc: L.B02 },
  { pn: 'CRC-3401-A', desc: 'Guide Rail', cls: 'B', inhouse: true, loc: L.FG },
  { pn: 'CRC-3467-C', desc: 'Bushing, Flanged', cls: 'B', supplier: 1, loc: L.B01 },
  { pn: 'CRC-3512-A', desc: 'Cap, Sealed', cls: 'B', supplier: 3, loc: L.B02 },
  { pn: 'CRC-4102-A', desc: 'Clip, Retaining', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4110-A', desc: 'Bolt M8', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4115-A', desc: 'Nut, Locking', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4120-A', desc: 'Pin, Dowel', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4133-A', desc: 'Spacer', cls: 'C', supplier: 4, loc: L.C01 },
  { pn: 'CRC-4140-A', desc: 'Grommet, Polymer', cls: 'C', supplier: 3, loc: L.C01 },
  { pn: 'CRC-4151-A', desc: 'Insert, Threaded', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4166-A', desc: 'Standoff', cls: 'C', supplier: 2, loc: L.C01 },
  { pn: 'CRC-4172-A', desc: 'Mount, Cable Tie', cls: 'C', supplier: 4, loc: L.C01 },
  { pn: 'CRC-4188-A', desc: 'Seal Ring', cls: 'C', supplier: 3, loc: L.C01 },
  { pn: 'CRC-4195-A', desc: 'Plug, Cap', cls: 'C', supplier: 3, loc: L.C01 },
  { pn: 'CRC-4203-A', desc: 'Holder, Label', cls: 'C', supplier: 4, loc: L.C01 },
];
export const partId = (pn: string): number => PARTS.findIndex((p) => p.pn === pn) + 1;
