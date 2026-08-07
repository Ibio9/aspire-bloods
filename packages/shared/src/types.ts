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
