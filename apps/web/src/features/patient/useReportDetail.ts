import { useEffect, useMemo, useState } from 'react';
import { hasResultValue } from '@aspire-bloods/shared';
import { statusFilterCounts, type StatusFilter } from '../../lib/markerCopy';
import { apiFetch } from '../../lib/api';
import type { MarkerCardResult } from './MarkerResultCard';
import type { SummaryCategory } from './ResultsSummary';

/**
 * One report, fetched once and read by both halves of the page.
 *
 * The report used to be fetched inside the component that drew its markers,
 * which was fine while its title, its downloads and its counts strip were drawn
 * there too. They are not: the header now sits ABOVE the control bar and the
 * markers below it, so two elements on either side of the bar need the same
 * payload. Hence a hook — one request, one derivation, two readers, and the
 * page can answer the bar's health-area picker and status counts out of what it
 * already holds rather than having them reported back up to it.
 */

export interface MarkerCard extends MarkerCardResult {
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION. Absent on a payload from
   * before result types existed, which is treated as MEASURED — that is what
   * everything was.
   */
  resultType?: string;
  categoryKeys?: string[];
  aliases?: string[];
  gloss: string;
  amendedAt?: string | null;
}

export interface ReportDetail {
  reportId: string;
  panelName: string | null;
  markerCount?: number;
  title: string;
  sampleDate: string;
  sourceLabel?: string;
  /** False for a manually entered report — there is no laboratory PDF behind one. */
  hasOriginalPdf?: boolean;
  originalFilename?: string | null;
  categories?: SummaryCategory[];
  markers: MarkerCard[];
}

export interface ReportDetailData {
  /** Null while loading, and after a failure — `failed` separates the two. */
  report: ReportDetail | null;
  failed: boolean;
  /** Split by result type: only `measured` reaches the grid, the counts strip and the group headings. */
  byType: {
    measured: MarkerCard[];
    genetic: MarkerCard[];
    sensitivity: MarkerCard[];
    composition: MarkerCard[];
  };
  /**
   * Undefined until the report has landed. A picker that says "Above range (0)"
   * about a report it has not read yet is a statement, and a false one.
   */
  statusCounts?: Record<StatusFilter, number>;
  /** Only the areas this report actually has MEASURED markers in. */
  categories: SummaryCategory[];
  /** The same, as the shape the health-area picker takes. */
  categoryOptions: { key: string; name: string }[];
  /** Health area → the catalogue's overlap caveat, for the group headings. */
  areaNotes: Map<string, string | null>;
}

/** Absent means MEASURED — see MarkerCard.resultType. */
function resultTypeOf(m: MarkerCard): string {
  return m.resultType ?? 'MEASURED';
}

const NO_MARKERS: MarkerCard[] = [];

export function useReportDetail(reportId: string | undefined): ReportDetailData {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      setFailed(false);
      return;
    }
    // Reset on every id change, and ignore a response that arrives after the
    // id has moved on. Without the reset, navigating from one report to
    // another showed the previous report's markers under the new one's URL
    // until the fetch landed; and `failed` was write-once, so a single bad
    // link left "We couldn't open that panel" pinned over every subsequent
    // report for the rest of the session.
    let current = true;
    setReport(null);
    setFailed(false);
    apiFetch<ReportDetail>(`/patient/reports/${reportId}`)
      .then((r) => current && setReport(r))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [reportId]);

  // Split by result type once. Only MEASURED reaches the grid, the counts strip
  // and the group headings; the other three get their own sections below.
  const byType = useMemo(() => {
    // A marker with no result renders nowhere — never a placeholder, never an
    // empty row. The server no longer sends one; this is the second lock on
    // the same door, because the cost of one slipping through is a patient
    // being told something about a test that was never performed.
    const all = (report?.markers ?? NO_MARKERS).filter(hasResultValue);
    return {
      measured: all.filter((m) => resultTypeOf(m) === 'MEASURED'),
      genetic: all.filter((m) => resultTypeOf(m) === 'GENETIC'),
      sensitivity: all.filter((m) => resultTypeOf(m) === 'SENSITIVITY'),
      composition: all.filter((m) => resultTypeOf(m) === 'COMPOSITION'),
    };
  }, [report]);

  // The count beside each status-filter option, in one pass rather than one
  // filter per option per render.
  const counts = useMemo(() => statusFilterCounts(byType.measured), [byType.measured]);

  // Only the areas this report actually has markers in — an empty category in
  // the picker is a filter that can only ever produce nothing.
  const categories = useMemo(() => {
    const present = new Set(byType.measured.flatMap((m) => m.categoryKeys ?? []));
    return (report?.categories ?? []).filter((c) => c.resultType === 'MEASURED' && present.has(c.key));
  }, [report, byType.measured]);

  const categoryOptions = useMemo(() => categories.map((c) => ({ key: c.key, name: c.name })), [categories]);

  const areaNotes = useMemo(
    () => new Map((report?.categories ?? []).map((c) => [c.key, c.note])),
    [report],
  );

  return {
    report,
    failed,
    byType,
    statusCounts: report ? counts : undefined,
    categories,
    categoryOptions,
    areaNotes,
  };
}
