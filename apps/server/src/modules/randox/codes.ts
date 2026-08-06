import { prisma } from '../../db/client.js';
import { loadCodeMap, type RandoxCodeEntry } from './config.js';

/**
 * Void and caveat code handling.
 *
 * We do not have Randox's code list. The whole of this module is built on
 * the assumption that we never will have a complete one — labs add codes,
 * and a code added next quarter must not be able to put a bad number in
 * front of a patient. So:
 *
 *   1. A code in the map marked VOID  → the result is not reported.
 *   2. A code in the map marked CAVEAT → the result is reported, annotated.
 *   3. A code NOT in the map          → treated as VOID.
 *
 * (3) is the important one and it is not a fallback, it is the design. An
 * unknown code is an unknown reason the lab attached to a number; the only
 * safe reading of "we don't know why they flagged this" is "don't show it".
 * Every unrecognised code is recorded (recordUnknownCode) so the real list
 * can be assembled from what actually arrives.
 *
 * VOID here means "not reportable to the patient". It is deliberately NOT
 * rendered as a greyed-out value, a struck-through number, or a value with
 * a warning — the marker produces no ReportResult row at all, only a
 * ReportResultExclusion, so there is no value in the database for a read
 * path to leak. See randoxIngestionService.ts.
 */

export type CodeVerdict =
  | { kind: 'VOID'; code: string; recognised: boolean; description: string }
  | { kind: 'CAVEAT'; code: string; recognised: true; description: string; patientSafeNote: string | null };

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Classifies one code. Unknown → VOID with recognised:false. Callers must
 * pass the result to recordUnknownCode() so the sighting is logged.
 */
export function classifyCode(rawCode: string): CodeVerdict {
  const code = normaliseCode(rawCode);
  const entry: RandoxCodeEntry | undefined = loadCodeMap().map[code];

  if (!entry) {
    return {
      kind: 'VOID',
      code,
      recognised: false,
      description: `Unrecognised lab code "${code}": treated as void because its meaning is unknown.`,
    };
  }

  if (entry.kind === 'VOID') {
    return { kind: 'VOID', code, recognised: true, description: entry.description };
  }

  return {
    kind: 'CAVEAT',
    code,
    recognised: true,
    description: entry.description,
    // Empty string is as good as absent — a caveat with no agreed patient
    // wording is admin-only, which is the default until we know what each
    // code actually means.
    patientSafeNote: entry.patientSafeNote?.trim() ? entry.patientSafeNote.trim() : null,
  };
}

export interface CodeAssessment {
  /** True if ANY code on this result voids it. */
  isVoid: boolean;
  /** Codes that caused the void, in the order received. */
  voidCodes: CodeVerdict[];
  /** Caveats to attach as metadata on a reportable result. */
  caveatCodes: Extract<CodeVerdict, { kind: 'CAVEAT' }>[];
  /** Every code that wasn't in the map. Logged, and each one voids. */
  unrecognisedCodes: string[];
  /** Admin-facing single-line summary of why this was voided. */
  voidReason: string | null;
}

/**
 * Assesses all codes attached to one result — both the order-level codes
 * (which apply to every analyte) and the analyte's own. One void code
 * anywhere is enough: they are not weighed against each other, and a
 * caveat never rescues a void.
 */
export function assessCodes(input: { voidCodes: string[]; caveatCodes: string[] }): CodeAssessment {
  const voids: CodeVerdict[] = [];
  const caveats: Extract<CodeVerdict, { kind: 'CAVEAT' }>[] = [];
  const unrecognised: string[] = [];

  // Both lists go through the same classifier. Randox putting a code in
  // the "caveat" field does not make it a caveat: if our map says that
  // code is void, or doesn't know it, it voids. The field a code arrived
  // in is a hint, not an authority — trusting the field name would let a
  // mislabelled void code through as a mere annotation.
  for (const raw of [...input.voidCodes, ...input.caveatCodes]) {
    if (!raw || !raw.trim()) continue;
    const verdict = classifyCode(raw);
    if (verdict.kind === 'VOID') {
      voids.push(verdict);
      if (!verdict.recognised) unrecognised.push(verdict.code);
    } else {
      caveats.push(verdict);
    }
  }

  return {
    isVoid: voids.length > 0,
    voidCodes: voids,
    caveatCodes: caveats,
    unrecognisedCodes: unrecognised,
    voidReason: voids.length > 0 ? voids.map((v) => `${v.code}: ${v.description}`).join('; ') : null,
  };
}

/**
 * Records that a code we don't recognise has arrived, so the gap in the
 * configured map is visible in the admin area instead of only ever showing
 * up as results quietly not being reported.
 *
 * Never throws: a logging failure must not abort an ingestion run that is
 * otherwise behaving correctly (the result is already being withheld,
 * which is the safe outcome).
 */
export async function recordUnknownCode(
  code: string,
  context: { orderNumber?: string | null; markerName?: string | null },
): Promise<void> {
  const normalised = normaliseCode(code);
  try {
    await prisma.randoxUnknownCode.upsert({
      where: { code: normalised },
      create: {
        code: normalised,
        sampleOrderNumber: context.orderNumber ?? null,
        sampleMarkerName: context.markerName ?? null,
      },
      update: { sightings: { increment: 1 }, lastSeenAt: new Date() },
    });
  } catch (e) {
    console.error(`[randox] failed to record unrecognised code "${normalised}":`, e);
  }
  console.warn(
    `[randox] unrecognised result code "${normalised}" (order ${context.orderNumber ?? 'unknown'}, marker ${context.markerName ?? 'unknown'}) — treated as VOID; result withheld.`,
  );
}

/** The neutral note a patient sees where a voided marker would have been. */
export const PATIENT_VOID_NOTE = 'This test could not be reported.';
