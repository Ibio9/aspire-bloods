/**
 * LIMS Void Codes from Randox Health
 * Supplied by: Chris Caulfield (christopher.caulfield@randox.com), Aug 19 2026
 * Source: LIMS Void Codes.xlsx
 *
 * Each code marks a result the lab could not report. All are VOID: the marker
 * produces no result row, per product rule 10.
 */

import type { RandoxCodeMap } from './config.js';

export const RANDOX_VOID_CODES: RandoxCodeMap = {
  VOIDA: { kind: 'VOID', description: 'Leaked / Damaged Sample' },
  VOIDB: { kind: 'VOID', description: 'Low Sample Volume' },
  VOIDF: { kind: 'VOID', description: 'Incorrect Tube Type' },
  VOIDH: { kind: 'VOID', description: 'Sample Tube Past Expiry' },
  VOIDM: { kind: 'VOID', description: 'Customer details on sample do not match those on TOF' },
  VOIDO: { kind: 'VOID', description: 'Sample serum indices fail' },
  VOIDQ: { kind: 'VOID', description: 'Instrument error' },
  VOIDS: { kind: 'VOID', description: 'Gel barrier not formed on SST after Centrifugation' },
  VOIDT: { kind: 'VOID', description: 'Stock unavailable for testing' },
  VOIDU: { kind: 'VOID', description: 'Received outside of pre-centrifugation sample stability time' },
  VOIDV: { kind: 'VOID', description: 'Test cancelled as sample not received' },
  VOIDW: { kind: 'VOID', description: 'Sample received more than 96hrs after collection' },
  VOIDX: { kind: 'VOID', description: 'Sample Arrived Without TOF/IFU' },
};
