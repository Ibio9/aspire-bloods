// Shared enums and DTO shapes between apps/server and apps/web.
// These mirror apps/server/prisma/schema.prisma — keep in sync by hand.

export type UserRole = 'PATIENT' | 'ADMIN' | 'CLINICIAN';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export type TwoFactorMethod = 'EMAIL' | 'SMS';

export type Sex = 'MALE' | 'FEMALE' | 'ANY';

export type MarkerReviewStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED';

/**
 * RESULTS RELEASE AUTOMATICALLY (changed Aug 2026). NO HUMAN GATE.
 *
 *   UPLOADED → PARSED → RELEASED
 *
 * with CHANGES_REQUESTED as a loop back rather than a fourth forward stage.
 * ADMIN_VERIFIED went first (it caught transcription errors from a PDF, and
 * results arrive structured through the Randox API now); CLINICIAN_REVIEWED has
 * followed it, because a result waiting in a queue for somebody to press a
 * second button is a result the patient does not have.
 *
 * PARSED is "read, not released". Whether the parse was CLEAN is `holdReasons`
 * on the report, not a status — see server lib/cleanParse.ts — and it is the one
 * thing that stops an automatic release. A clean parse releases itself; a held
 * one waits for a person to acknowledge what is wrong with it.
 */
export type ReportStatus =
  | 'UPLOADED'
  | 'PARSED'
  | 'CHANGES_REQUESTED'
  | 'RELEASED';

/**
 * Five states, three hues, and no sixth member.
 *
 * "No data" is deliberately NOT in this union. A result that could not be
 * placed against a reference range carries `null` where a status would be —
 * see MarkerStatusOrNone in resultPresence.ts. Adding NO_DATA here would make
 * absence look like a traffic light, and would give every status-defaulting
 * expression in the codebase somewhere to default TO.
 *
 * The five are a runtime list first and a type second, because the type alone
 * is worth nothing at the wire: a payload is cast, never validated, so
 * "this is a MarkerStatus" is an assertion the compiler makes and the network
 * has no obligation to honour. Every lookup that turns a status into a colour,
 * a label or a class goes through `asMarkerStatus` in resultPresence.ts, which
 * is the one place that list is actually checked.
 */
export const MARKER_STATUSES = ['IN_RANGE', 'HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW'] as const;

export type MarkerStatus = (typeof MARKER_STATUSES)[number];

export type EscalationSeverity = 'MILD' | 'SIGNIFICANT';

export type ConsentType = 'DATA_PROCESSING' | 'RESULTS_STORAGE' | 'COMMS_EMAIL' | 'COMMS_SMS';

// ---------------------------------------------------------------------------
// Patient-facing DTOs
// ---------------------------------------------------------------------------

export interface PanelCardDTO {
  reportId: string;
  panelName: string | null;
  title: string; // panelName, or a derived "{N} markers · {date}" fallback
  sampleDate: string; // ISO date
  markerCount: number;
  inRangeCount: number;
  attentionCount: number;
  status: ReportStatus;
}

/**
 * The advisory optimal band that rides alongside the lab reference range.
 * Absent (null on the DTO) whenever there is no established optimal for this
 * marker, or none that applies to this patient — never sent as an empty or
 * placeholder band, because a blank "optimal" reads as a missing value rather
 * than as a marker that genuinely has none.
 *
 * `low`/`high` may individually be null where the guidance bounds one side
 * only ("below 5.0 mmol/L"). Never both.
 */
export interface OptimalRangeDTO {
  low: number | null;
  high: number | null;
  unit: string;
  /** The guideline this came from, named. Shown to the patient so the band isn't an unattributed claim. */
  source: string;
  /**
   * Whether the value sits inside the band. Null when it can't be said —
   * a textual result has no position on a numeric band.
   *
   * This is NOT a status. Status comes from the lab reference range and
   * nothing else; this is a separate, calmer statement alongside it.
   */
  within: boolean | null;
}

/** A health area, as the catalogue groups markers. See MarkerCategory in the schema. */
export interface MarkerCategoryDTO {
  key: string;
  name: string;
  resultType: string;
  /** Framing shown above the section where a patient needs it ("recorded at your appointment"). */
  note: string | null;
  sortOrder: number;
}

export interface MarkerCardDTO {
  markerId: string;
  name: string;
  // Null when the lab reported text rather than a number — valueText then
  // carries the verbatim result ("< 0.6", "Not detected"). Exactly one of
  // the two is set.
  value: number | null;
  valueText?: string | null;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  /**
   * How far past a reference bound this result has to sit before it counts as
   * significantly out, in the same units as the value. Optional so an older
   * payload still renders — see severityThresholdFor, which falls back to the
   * schema's default multiplier on the range's own width.
   *
   * Sent because the portal DRAWS it: the trend chart's yellow bands end and
   * its red bands begin here, and the range bar's gradient turns here. It is
   * not itself a status and is never shown as a number to the patient.
   */
  severityThreshold?: number;
  /**
   * Null when this result has no position on its reference range — a
   * qualitative outcome ("Not detected"), or a detection limit that straddles
   * the range. Null is not a state a colour, a tint, a shape mark or a count
   * may be derived from; it means the comparison was never made, and the card
   * says so in words instead. It is never IN_RANGE. See resultPresence.ts.
   */
  status: MarkerStatus | null;
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION / QUALITATIVE. Decides which section this
   * result renders in, whether it counts toward the counts strip and the
   * category bars, whether it gets a status tint, and whether it can be
   * plotted. Optional on the DTO so a client reading an older payload treats
   * everything as MEASURED, which is what it was.
   */
  resultType?: string;
  /** Health areas this marker belongs to. A marker can be in several. */
  categoryKeys?: string[];
  /** Abbreviations and alternate spellings, matched by search alongside the name. */
  aliases?: string[];
  /** Null when this marker has no established optimal range. See OptimalRangeDTO. */
  optimal?: OptimalRangeDTO | null;
  gloss: string; // one-line plain-English summary
}

export interface TrendPointDTO {
  reportId: string;
  sampleDate: string;
  value: number;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
  /** See MarkerCardDTO.severityThreshold — this point's own band boundaries. */
  severityThreshold?: number;
}

export interface MarkerDetailDTO {
  markerId: string;
  name: string;
  unit: string;
  latest: MarkerCardDTO;
  trend: TrendPointDTO[];
  explanation: {
    whatItIs: string;
    highMeans: string | null;
    lowMeans: string | null;
    lifestyleContext: string | null;
    reviewStatus: MarkerReviewStatus;
  };
}
