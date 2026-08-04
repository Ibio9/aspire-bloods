import type { MarkerStatus } from '@aspire-bloods/shared';

/**
 * Severity tiers per brief §5: mild vs. significant out-of-range,
 * configurable per marker as either a multiple of the reference range's
 * width (default) or an absolute delta override.
 */
export function computeMarkerStatus(
  value: number,
  low: number,
  high: number,
  severityMultiplier: number,
  severityAbsoluteDelta: number | null,
): MarkerStatus {
  if (value >= low && value <= high) return 'IN_RANGE';

  const rangeWidth = high - low;
  const threshold = severityAbsoluteDelta ?? rangeWidth * severityMultiplier;

  if (value > high) {
    return value - high > threshold ? 'SIGNIFICANT_HIGH' : 'HIGH';
  }
  return low - value > threshold ? 'SIGNIFICANT_LOW' : 'LOW';
}
