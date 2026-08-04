import { describe, it, expect } from 'vitest';
import { computeMarkerStatus } from '../src/lib/markerStatus.js';

describe('computeMarkerStatus', () => {
  it('classifies a value inside the range as IN_RANGE', () => {
    expect(computeMarkerStatus(4.5, 0, 5, 1.5, null)).toBe('IN_RANGE');
  });

  it('classifies a value at the exact boundary as IN_RANGE', () => {
    expect(computeMarkerStatus(5, 0, 5, 1.5, null)).toBe('IN_RANGE');
    expect(computeMarkerStatus(0, 0, 5, 1.5, null)).toBe('IN_RANGE');
  });

  it('classifies a mildly high value as HIGH, not SIGNIFICANT_HIGH', () => {
    // range width 5, threshold = 5*1.5 = 7.5; excess of 1.2 is well under threshold
    expect(computeMarkerStatus(6.2, 0, 5, 1.5, null)).toBe('HIGH');
  });

  it('classifies a severely high value as SIGNIFICANT_HIGH', () => {
    // TSH-shaped range: 0.4-4, width 3.6, threshold 5.4; value 12 has excess 8 > 5.4
    expect(computeMarkerStatus(12, 0.4, 4, 1.5, null)).toBe('SIGNIFICANT_HIGH');
  });

  it('classifies low values symmetrically', () => {
    expect(computeMarkerStatus(-2, 0, 5, 1.5, null)).toBe('LOW');
    expect(computeMarkerStatus(-10, 0, 5, 1.5, null)).toBe('SIGNIFICANT_LOW');
  });

  it('honours an absolute severity override instead of the range-multiple default', () => {
    // Without the override, excess of 2 against threshold 7.5 would be HIGH.
    // With a tight absolute override of 1, the same excess is SIGNIFICANT_HIGH.
    expect(computeMarkerStatus(7, 0, 5, 1.5, 1)).toBe('SIGNIFICANT_HIGH');
  });
});
