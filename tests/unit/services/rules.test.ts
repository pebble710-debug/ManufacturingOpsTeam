import { describe, expect, it } from 'vitest';
import { allowedShipmentActions, approverRefusal, decideMove, lateReasonRequired, mayCancelAtStatus, mayLogErrorStage, verifierIsPacker } from '../../../src/lib/services/rules';

describe('R-1 verifier is not the packer', () => {
  it('refuses the current packer, allows others, never triggers without a packer', () => {
    expect(verifierIsPacker(5, 5)).toBe(true);
    expect(verifierIsPacker(5, 6)).toBe(false);
    expect(verifierIsPacker(null, 6)).toBe(false);
  });
});
describe('R-4 / UD-2 approver independence', () => {
  it('counter, recounter and submitter are refused with distinct codes', () => {
    expect(approverRefusal(1, [2, 1], 3)).toBe('APPROVER_SAME_AS_COUNTER');
    expect(approverRefusal(1, [2, null], 1)).toBe('APPROVER_SAME_AS_SUBMITTER');
    expect(approverRefusal(1, [2, null], 3)).toBeNull();
  });
});
describe('R-5 cancel and R-8 error stage', () => {
  it('Shipping cancels only early; Supervisor any time; others never', () => {
    expect(mayCancelAtStatus('Shipping', 'Planned')).toBe(true);
    expect(mayCancelAtStatus('Shipping', 'Ready to Pack')).toBe(true);
    for (const s of ['Packing', 'Verified', 'Rework', 'On Hold', 'Shipped'] as const) expect(mayCancelAtStatus('Shipping', s)).toBe(false);
    expect(mayCancelAtStatus('Supervisor', 'Verified')).toBe(true);
    expect(mayCancelAtStatus('Quality', 'Planned')).toBe(false);
  });
  it('Shipping logs Before-ship errors on unshipped shipments only', () => {
    expect(mayLogErrorStage('Shipping', 'Before ship', 'Packing')).toBe(true);
    expect(mayLogErrorStage('Shipping', 'After ship', 'Shipped')).toBe(false);
    expect(mayLogErrorStage('Shipping', 'Before ship', 'Shipped')).toBe(false);
    expect(mayLogErrorStage('Quality', 'After ship', 'Shipped')).toBe(true);
  });
});
describe('R-7 moves by location type', () => {
  it('Receiving cannot move out of Hold but may move into it', () => {
    expect(decideMove('Receiving', 'TRANSFER', 'Hold', 'Stock')).toBe('FORBIDDEN_HOLD_RELEASE');
    expect(decideMove('Receiving', 'SCRAP', 'Hold', null)).toBe('FORBIDDEN_HOLD_RELEASE');
    expect(decideMove('Receiving', 'TRANSFER', 'Stock', 'Hold')).toBe('ok');
    expect(decideMove('Receiving', 'PRODUCTION_COMPLETE', null, 'FG')).toBe('ok');
  });
  it('Quality only touches Hold; never production complete', () => {
    expect(decideMove('Quality', 'TRANSFER', 'Hold', 'Stock')).toBe('ok');
    expect(decideMove('Quality', 'TRANSFER', 'Stock', 'Hold')).toBe('ok');
    expect(decideMove('Quality', 'SCRAP', 'Hold', null)).toBe('ok');
    expect(decideMove('Quality', 'TRANSFER', 'Stock', 'FG')).toBe('FORBIDDEN_NON_HOLD_TXN');
    expect(decideMove('Quality', 'PRODUCTION_COMPLETE', null, 'FG')).toBe('FORBIDDEN_NON_HOLD_TXN');
    expect(decideMove('Supervisor', 'TRANSFER', 'Hold', 'Stock')).toBe('ok');
  });
});
describe('UD-1 late reason and allowed_actions hints', () => {
  it('late iff ship_date > promise_date', () => {
    expect(lateReasonRequired('2026-11-26', '2026-11-25')).toBe(true);
    expect(lateReasonRequired('2026-11-25', '2026-11-25')).toBe(false);
  });
  it('hints respect R-1 and R-5', () => {
    expect(allowedShipmentActions({ id: 1, role: 'Shipping' }, { status: 'Packing', packed_by: 1 })).not.toContain('verify');
    expect(allowedShipmentActions({ id: 2, role: 'Shipping' }, { status: 'Packing', packed_by: 1 })).toContain('verify');
    expect(allowedShipmentActions({ id: 2, role: 'Shipping' }, { status: 'Packing', packed_by: 1 })).not.toContain('cancel');
    expect(allowedShipmentActions({ id: 3, role: 'Viewer' }, { status: 'Planned', packed_by: null })).toEqual([]);
    expect(allowedShipmentActions({ id: 3, role: 'Quality' }, { status: 'Rework', packed_by: 1 })).toContain('reopen');
  });
});
