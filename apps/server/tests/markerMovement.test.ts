import { describe, it, expect } from 'vitest';
import {
  MEANINGFUL_CHANGE_FRACTION,
  classifyMovement,
  distanceOutsideRange,
  isMeaningfulChange,
  movementMagnitude,
  referenceBandWidth,
  type ComparablePoint,
} from '../src/modules/patients/markerMovement.js';

/** Ferritin-shaped: wide band, µg/L. */
const ferritin = (value: number, status: ComparablePoint['status']): ComparablePoint => ({
  value,
  status,
  referenceLow: 30,
  referenceHigh: 300,
});

/** HbA1c-shaped: narrow band, mmol/mol. The pair is the point — one rule has to serve both. */
const hba1c = (value: number, status: ComparablePoint['status']): ComparablePoint => ({
  value,
  status,
  referenceLow: 20,
  referenceHigh: 42,
});

describe('referenceBandWidth', () => {
  it('is the width of the reference range', () => {
    expect(referenceBandWidth(ferritin(100, 'IN_RANGE'))).toBe(270);
    expect(referenceBandWidth(hba1c(35, 'IN_RANGE'))).toBe(22);
  });

  it('falls back to the value when the range has zero width', () => {
    expect(referenceBandWidth({ value: 8, status: 'IN_RANGE', referenceLow: 5, referenceHigh: 5 })).toBe(8);
  });

  it('never returns zero, so callers can divide by it', () => {
    expect(referenceBandWidth({ value: 0, status: 'IN_RANGE', referenceLow: 0, referenceHigh: 0 })).toBe(1);
  });
});

describe('distanceOutsideRange', () => {
  it('is zero anywhere inside the range, boundaries included', () => {
    expect(distanceOutsideRange(100, 30, 300)).toBe(0);
    expect(distanceOutsideRange(30, 30, 300)).toBe(0);
    expect(distanceOutsideRange(300, 30, 300)).toBe(0);
  });

  it('measures from the nearer bound on each side', () => {
    expect(distanceOutsideRange(10, 30, 300)).toBe(20);
    expect(distanceOutsideRange(350, 30, 300)).toBe(50);
  });
});

describe('isMeaningfulChange', () => {
  it('always reports a status change, however small the numeric move', () => {
    // 300 -> 301 is a third of a percent, but it crossed the reference ceiling.
    expect(isMeaningfulChange(ferritin(301, 'HIGH'), ferritin(300, 'IN_RANGE'))).toBe(true);
  });

  it('ignores drift below the threshold when the status is unchanged', () => {
    // 270 * 0.15 = 40.5; a 30 µg/L wander inside a wide band is noise.
    expect(isMeaningfulChange(ferritin(130, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(false);
  });

  it('reports a move at or above the threshold', () => {
    expect(isMeaningfulChange(ferritin(141, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(true);
  });

  it('is inclusive at exactly the threshold', () => {
    const moved = 270 * MEANINGFUL_CHANGE_FRACTION; // 40.5
    expect(isMeaningfulChange(ferritin(100 + moved, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(true);
  });

  it('scales to the marker, so the same absolute move differs between markers', () => {
    // A 4-unit move is noise across ferritin's 270-wide band...
    expect(isMeaningfulChange(ferritin(104, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(false);
    // ...and meaningful across HbA1c's 22-wide one (threshold 3.3). This is
    // the whole reason the threshold is a fraction and not a constant.
    expect(isMeaningfulChange(hba1c(34, 'IN_RANGE'), hba1c(30, 'IN_RANGE'))).toBe(true);
  });

  it('treats a fall exactly like a rise of the same size', () => {
    expect(isMeaningfulChange(ferritin(59, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(true);
    expect(isMeaningfulChange(ferritin(141, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe(true);
  });
});

describe('classifyMovement', () => {
  it('reports coming back into range', () => {
    // The vitamin-D-out-of-deficiency case from the brief: an improvement has
    // to surface as loudly as a decline.
    expect(classifyMovement(ferritin(80, 'IN_RANGE'), ferritin(12, 'SIGNIFICANT_LOW'))).toBe('MOVED_INTO_RANGE');
  });

  it('reports leaving the range', () => {
    expect(classifyMovement(ferritin(12, 'LOW'), ferritin(80, 'IN_RANGE'))).toBe('MOVED_OUT_OF_RANGE');
  });

  it('distinguishes improving from worsening while still outside', () => {
    expect(classifyMovement(ferritin(25, 'LOW'), ferritin(10, 'LOW'))).toBe('CLOSER_TO_RANGE');
    expect(classifyMovement(ferritin(10, 'LOW'), ferritin(25, 'LOW'))).toBe('FURTHER_FROM_RANGE');
  });

  it('reports movement that stays inside the range as neither good nor bad', () => {
    expect(classifyMovement(ferritin(200, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBe('CHANGED_WITHIN_RANGE');
  });

  it('counts a severity change as still-outside, not a crossing', () => {
    expect(classifyMovement(ferritin(5, 'SIGNIFICANT_LOW'), ferritin(25, 'LOW'))).toBe('FURTHER_FROM_RANGE');
    expect(classifyMovement(ferritin(25, 'LOW'), ferritin(5, 'SIGNIFICANT_LOW'))).toBe('CLOSER_TO_RANGE');
  });

  it('crossing clean through the range counts as still-outside on both sides', () => {
    // Low to high is not "moved into range"; it never settled inside one.
    expect(classifyMovement(ferritin(400, 'HIGH'), ferritin(10, 'LOW'))).toBe('FURTHER_FROM_RANGE');
  });

  it('uses each reading’s own reference range', () => {
    // Same value both times, but the second lab reports a wider range, so the
    // result now sits closer to being normal. Re-deriving one range for both
    // would call this unchanged.
    const previous: ComparablePoint = { value: 20, status: 'LOW', referenceLow: 40, referenceHigh: 300 };
    const current: ComparablePoint = { value: 20, status: 'LOW', referenceLow: 25, referenceHigh: 300 };
    expect(classifyMovement(current, previous)).toBe('CLOSER_TO_RANGE');
  });
});

describe('movementMagnitude', () => {
  it('measures the move in reference-band widths', () => {
    expect(movementMagnitude(ferritin(370, 'HIGH'), ferritin(100, 'IN_RANGE'))).toBeCloseTo(1);
  });

  it('is direction-agnostic', () => {
    expect(movementMagnitude(ferritin(150, 'IN_RANGE'), ferritin(100, 'IN_RANGE'))).toBeCloseTo(
      movementMagnitude(ferritin(50, 'IN_RANGE'), ferritin(100, 'IN_RANGE')),
    );
  });

  it('ranks a large move on a narrow band above a small one on a wide band', () => {
    // The bug this replaced divided by the current value, so a small-numbered
    // marker outranked everything regardless of how far it had actually moved.
    const bigHba1c = movementMagnitude(hba1c(41, 'IN_RANGE'), hba1c(30, 'IN_RANGE')); // 11/22 = 0.5
    const smallFerritin = movementMagnitude(ferritin(145, 'IN_RANGE'), ferritin(100, 'IN_RANGE')); // 45/270 ≈ 0.17
    expect(bigHba1c).toBeGreaterThan(smallFerritin);
  });

  it('agrees with the meaningful-change threshold at the boundary', () => {
    const atThreshold = ferritin(100 + 270 * MEANINGFUL_CHANGE_FRACTION, 'IN_RANGE');
    expect(movementMagnitude(atThreshold, ferritin(100, 'IN_RANGE'))).toBeCloseTo(MEANINGFUL_CHANGE_FRACTION);
  });
});
