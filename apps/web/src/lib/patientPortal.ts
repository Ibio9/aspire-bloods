import { useEffect, useState } from 'react';
import type { MarkerStatus, OptimalRangeDTO } from '@aspire-bloods/shared';
import { apiFetch } from './api';

/**
 * Shapes returned by the patient portal's cross-report endpoints
 * (apps/server/src/modules/patients/portalService.ts), plus the couple of
 * tiny hooks that more than one screen needs. Kept in one file so the
 * Overview / All markers / Trends screens agree on the contract without
 * three copies of the same interface drifting apart.
 */

export type MarkerMovement =
  | 'MOVED_INTO_RANGE'
  | 'MOVED_OUT_OF_RANGE'
  | 'CLOSER_TO_RANGE'
  | 'FURTHER_FROM_RANGE'
  | 'CHANGED_WITHIN_RANGE';

export interface AttentionItem {
  markerId: string;
  name: string;
  value: number;
  unit: string;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the range bar's gradient turns here. */
  severityThreshold?: number;
  reportId: string;
  panelName: string;
  sampleDate: string;
  fromEarlierReport: boolean;
}

export interface ChangeItem {
  markerId: string;
  name: string;
  unit: string;
  currentValue: number;
  currentStatus: MarkerStatus;
  currentDate: string;
  previousValue: number;
  previousStatus: MarkerStatus;
  previousDate: string;
  delta: number;
  direction: 'UP' | 'DOWN';
  movement: MarkerMovement;
}

export interface NextStep {
  kind: string;
  title: string;
  body: string;
}

export interface PatientOverview {
  firstName: string | null;
  lastTestedDate: string | null;
  retestDueDate: string | null;
  releasedReportCount: number;
  pendingReportCount: number;
  trackedMarkerCount: number;
  latest: {
    reportId: string;
    panelName: string;
    sampleDate: string;
    sourceLabel: string;
    markerCount: number;
    inRangeCount: number;
    attentionCount: number;
  } | null;
  attention: AttentionItem[];
  changes: ChangeItem[];
  nextSteps: NextStep[];
  outOfRangeNotice: string | null;
}

export interface SparkPoint {
  sampleDate: string;
  value: number;
  status: MarkerStatus;
}

export interface MarkerRow {
  markerId: string;
  name: string;
  /** Abbreviations and alternate spellings; search matches these as well as the name. */
  aliases?: string[];
  /** Health areas this marker belongs to. A marker can be in several. */
  categoryKeys?: string[];
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION. Absent on an older payload,
   * which is treated as MEASURED. Only MEASURED markers appear on All markers,
   * in Trends or in any count — the other three have no reference range and so
   * no status, no direction of travel and nothing to plot.
   */
  resultType?: string;
  unit: string;
  // Null when the latest result is textual ("< 0.6", "Not detected") —
  // valueText then carries the lab's wording verbatim.
  value: number | null;
  valueText?: string | null;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the sparkline's band edges sit here. */
  severityThreshold?: number;
  /** Advisory optimal band; null when this marker has no established one. Never folded into `status`. */
  optimal?: OptimalRangeDTO | null;
  sampleDate: string;
  reportId: string;
  panelName: string;
  sourceLabel: string;
  amendedAt: string | null;
  resultCount: number;
  comparable: boolean;
  delta: number | null;
  direction: 'UP' | 'DOWN' | null;
  spark: SparkPoint[];
}

export interface TrendSeries {
  markerId: string;
  name: string;
  unit: string;
  comparable: boolean;
  points: {
    sampleDate: string;
    value: number;
    status: MarkerStatus;
    referenceLow: number;
    referenceHigh: number;
    /** Where significantly-out begins for this marker, in its own units. */
    severityThreshold?: number;
    sourceLabel: string;
    reportId: string;
  }[];
}

export interface LibraryEntry {
  markerId: string;
  name: string;
  unit: string;
  hasResults: boolean;
  panels: string[];
  explanation: {
    whatItIs: string;
    highMeans: string | null;
    lowMeans: string | null;
    lifestyleContext: string | null;
    pending: boolean;
  };
}

export interface PatientDocument {
  reportId: string;
  panelName: string;
  sampleDate: string;
  releasedAt: string | null;
  sourceLabel: string;
  markerCount: number;
  hasOriginalPdf: boolean;
  originalFilename: string | null;
}

export interface ClinicContact {
  name: string;
  addressLines: string[];
  email: string;
  phone: string | null;
  hours: string;
  emergencyNote: string;
}

/**
 * The clinic's details sit in the sidebar of every patient screen and again
 * on Overview, so this caches the one response at module scope — a patient
 * navigating between five screens shouldn't produce five identical requests
 * for a string that changes about once a year.
 */
let clinicContactPromise: Promise<ClinicContact> | null = null;

export function useClinicContact(): ClinicContact | null {
  const [contact, setContact] = useState<ClinicContact | null>(null);

  useEffect(() => {
    let active = true;
    clinicContactPromise ??= apiFetch<ClinicContact>('/content/clinic-contact');
    clinicContactPromise
      .then((c) => {
        if (active) setContact(c);
      })
      .catch(() => {
        // A missing contact panel is a degraded sidebar, not a broken page —
        // the footer disclaimer already carries the 999/111 line.
        clinicContactPromise = null;
      });
    return () => {
      active = false;
    };
  }, []);

  return contact;
}

/** Marker index for the sidebar's search box — fetched once per session, shared by every mount. */
let markerIndexPromise: Promise<MarkerRow[]> | null = null;

export function loadMarkerIndex(): Promise<MarkerRow[]> {
  markerIndexPromise ??= apiFetch<MarkerRow[]>('/patient/markers').catch((e) => {
    markerIndexPromise = null;
    throw e;
  });
  return markerIndexPromise;
}

/**
 * Dropped on sign-out. The marker index is one patient's own marker names —
 * signing out and signing in as someone else on a shared machine never
 * reloads the page, so without this the next person's sidebar search would
 * be primed with the previous person's markers.
 */
export function resetPatientPortalCaches() {
  markerIndexPromise = null;
  clinicContactPromise = null;
}

/** "12 March 2026" — the portal's one date format. Long form, because a patient reads it once, not scans a column of them. */

/**
 * "Jun 25" — for chart axis ticks only. The long form is the portal's date
 * format everywhere a human reads one date, but three of them across a
 * 375px-wide axis need to be short, and month+year still separates every
 * sample in a screening history without printing an ISO string at someone.
 */
export function formatAxisDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/** "3 months ago" — relative time for "when was my last test", which is what people actually want to know. */
export function formatRelativeDate(iso: string): string {
  const then = new Date(`${iso}T00:00:00`);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return months === 1 ? 'a month ago' : `${months} months ago`;
  return `${Math.round(months / 12)} years ago`;
}
