// Identity and role-by-state predicates (permissions matrix R-1..R-15; ADR-003 D-10).
// Pure functions: the write path and the `allowed_actions` UI hints both call them.
import { can, type Role } from '../auth/permissions';

export const ERROR_CODES = {
  R1: 'VERIFIER_SAME_AS_PACKER',
  R4_COUNTER: 'APPROVER_SAME_AS_COUNTER',
  R4_SUBMITTER: 'APPROVER_SAME_AS_SUBMITTER',
  R5: 'FORBIDDEN_CANCEL_AT_STATUS',
  R7_RELEASE: 'FORBIDDEN_HOLD_RELEASE',
  R7_NON_HOLD: 'FORBIDDEN_NON_HOLD_TXN',
  R8: 'FORBIDDEN_AFTER_SHIP_ERROR',
} as const;

export type ShipmentStatus = 'Planned' | 'Ready to Pack' | 'Packing' | 'Verified' | 'Shipped' | 'On Hold' | 'Rework' | 'Cancelled';

/** R-1: the verifier must not be the recorded current packer. A shipment with no packer cannot trigger it. */
export function verifierIsPacker(packedBy: number | null, me: number): boolean {
  return packedBy !== null && packedBy === me;
}

/** R-5: Shipping may cancel only from Planned / Ready to Pack. Returns true when the role may cancel at this status. */
export function mayCancelAtStatus(role: Role, status: ShipmentStatus): boolean {
  if (role === 'Supervisor') return true;
  if (role === 'Shipping') return status === 'Planned' || status === 'Ready to Pack';
  return false;
}

/** R-8: Shipping logs Before-ship errors only, never against a Shipped shipment. */
export function mayLogErrorStage(role: Role, stage: 'Before ship' | 'After ship', shipmentStatus: ShipmentStatus): boolean {
  if (role !== 'Shipping') return true;
  return stage === 'Before ship' && shipmentStatus !== 'Shipped';
}

export type MoveDecision = 'ok' | typeof ERROR_CODES.R7_RELEASE | typeof ERROR_CODES.R7_NON_HOLD;
/**
 * R-7: movement rules by the DB type of the locations (never a request flag).
 * `src` is the source location type (TRANSFER/SCRAP), `dst` the destination type (TRANSFER, PRODUCTION_COMPLETE).
 */
export function decideMove(role: Role, txn: 'TRANSFER' | 'SCRAP' | 'PRODUCTION_COMPLETE', src: string | null, dst: string | null): MoveDecision {
  const srcHold = src === 'Hold';
  const dstHold = dst === 'Hold';
  if (role === 'Supervisor') return 'ok';
  if (role === 'Receiving') return srcHold && txn !== 'PRODUCTION_COMPLETE' ? ERROR_CODES.R7_RELEASE : 'ok';
  if (role === 'Quality') {
    if (txn === 'PRODUCTION_COMPLETE') return ERROR_CODES.R7_NON_HOLD;
    if (txn === 'SCRAP') return srcHold ? 'ok' : ERROR_CODES.R7_NON_HOLD;
    return srcHold || dstHold ? 'ok' : ERROR_CODES.R7_NON_HOLD;
  }
  return ERROR_CODES.R7_NON_HOLD;
}

/** R-4 widened by UD-2: returns the refusal code or null when the approver is independent. */
export function approverRefusal(me: number, counters: Iterable<number | null>, submittedBy: number | null): string | null {
  for (const c of counters) if (c !== null && c === me) return ERROR_CODES.R4_COUNTER;
  if (submittedBy !== null && submittedBy === me) return ERROR_CODES.R4_SUBMITTER;
  return null;
}

/** Late reason rule (UD-1): required iff ship_date > promise_date (calendar days), regardless of tolerance. */
export function lateReasonRequired(shipDate: string, promiseDate: string): boolean {
  return shipDate > promiseDate;
}

/** Shipment transitions (contract section 1.7). */
export const ALLOWED_FROM: Record<string, ShipmentStatus[]> = {
  'mark-ready': ['Planned'],
  'start-packing': ['Ready to Pack', 'Packing'],
  verify: ['Packing'],
  ship: ['Verified'],
  hold: ['Planned', 'Ready to Pack', 'Packing', 'Verified', 'Rework'],
  release: ['On Hold'],
  cancel: ['Planned', 'Ready to Pack', 'Packing', 'Verified', 'Rework', 'On Hold'],
  reopen: ['Rework'],
  correct: ['Shipped', 'Cancelled'],
};

export interface ShipmentHint { status: ShipmentStatus; packed_by: number | null }

/** `allowed_actions` hint for ShipmentDetail: base permission + R-1/R-5 + state. A UI hint, never a promise. */
export function allowedShipmentActions(user: { id: number; role: Role }, s: ShipmentHint): string[] {
  const out: string[] = [];
  const actionKey = (a: string) => (a === 'edit' ? 'shipment.write' : (`shipment.${a}` as const));
  for (const a of ['mark-ready', 'start-packing', 'verify', 'ship', 'hold', 'release', 'cancel', 'reopen', 'correct']) {
    if (!can(user.role, actionKey(a) as never)) continue;
    if (!ALLOWED_FROM[a].includes(s.status)) continue;
    if (a === 'start-packing' && s.status === 'Packing' && s.packed_by !== null) continue;
    if (a === 'verify' && (s.packed_by === null || verifierIsPacker(s.packed_by, user.id))) continue;
    if (a === 'cancel' && !mayCancelAtStatus(user.role, s.status)) continue;
    out.push(a);
  }
  if (can(user.role, 'shipment.write') && !['Shipped', 'Cancelled'].includes(s.status)) out.push('edit');
  return out;
}
