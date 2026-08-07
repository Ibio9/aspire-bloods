// Shared enums and DTO shapes between apps/server and apps/web.
// These mirror apps/server/prisma/schema.prisma — keep in sync by hand.

export type UserRole = 'PATIENT' | 'ADMIN' | 'CLINICIAN';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export type TwoFactorMethod = 'EMAIL' | 'SMS';

export type Sex = 'MALE' | 'FEMALE' | 'ANY';

export type MarkerReviewStatus = 'DRAFT' | 'REVIEWED' | 'PUBLISHED';

export type ReportStatus =
  | 'UPLOADED'
  | 'PARSED'
  | 'ADMIN_VERIFIED'
  | 'CHANGES_REQUESTED'
  | 'CLINICIAN_REVIEWED'
  | 'RELEASED';

export type MarkerStatus = 'IN_RANGE' | 'HIGH' | 'LOW' | 'SIGNIFICANT_HIGH' | 'SIGNIFICANT_LOW';

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
  status: MarkerStatus;
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION. Decides which section this
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
