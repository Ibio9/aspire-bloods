import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  asMarkerStatus,
  formatDate,
  splitMarkerName,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ArcGauge } from '../../components/ui/ArcGauge';
import { TrendChart } from '../../components/ui/LazyCharts';
import { MarkerExplanationBody } from '../../components/patient/MarkerExplanation';
import { PrintHeader } from '../../components/patient/PrintDocument';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyButton } from '../../components/ui/CopyButton';
import { ClinicContactLines } from '../../components/patient/ClinicContact';
import { PreviousResults } from '../../components/patient/PreviousResults';
import { apiFetch } from '../../lib/api';
import type { MarkerNavState } from './markerNavState';

interface TrendPoint {
  reportId: string;
  sampleDate: string;
  value: number;
  unit: string;
  converted: boolean;
  originalValue: number;
  originalUnit: string;
  status: MarkerStatusInput;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the chart's band edges sit here. */
  severityThreshold?: number;
  sourceKey: string;
  amendedAt?: string | null;
}

interface MarkerDetail {
  markerId: string;
  name: string;
  unit: string;
  crossSourceComparable: boolean;
  /** Null for the majority of markers - those have no established optimal range and nothing is said about one. */
  optimal: OptimalRangeDTO | null;
  latest: {
    // Null when the latest result is textual — valueText carries it verbatim.
    value: number | null;
    valueText?: string | null;
    unit: string;
    referenceLow: number;
    referenceHigh: number;
    severityThreshold?: number;
    /** Null where this result has no position on its reference range. Never IN_RANGE by default. */
    status: MarkerStatusInput;
    optimal?: OptimalRangeDTO | null;
    amendedAt?: string | null;
  };
  trend: TrendPoint[];
  outOfRangeNotice: string | null;
  /**
   * Null only where a marker has no copy written against it at all. There is
   * no placeholder: the card is simply not rendered, in keeping with the rest
   * of the product, and no review status reaches the patient either way.
   */
  explanation: {
    whatItIs: string;
    highMeans: string | null;
    lowMeans: string | null;
    lifestyleContext: string | null;
  } | null;
}

export function MarkerDetailPage() {
  const { markerId } = useParams<{ markerId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MarkerDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const navState = location.state as MarkerNavState | null;

  useEffect(() => {
    if (!markerId) return;
    // The prev/next arrows page through a report without unmounting this
    // component, so without clearing `detail` the previous marker's name,
    // value, range and chart stayed on screen under the next marker's URL
    // until the fetch landed — a value shown against the wrong marker, which
    // is the one thing a results page must never do, even for 200ms.
    // `current` guards the case where two clicks land out of order.
    let current = true;
    setDetail(null);
    setFailed(false);
    apiFetch<MarkerDetail>(`/patient/markers/${markerId}`)
      .then((d) => current && setDetail(d))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [markerId]);

  // Now that the sidebar search and All markers both deep-link here, a stale
  // bookmark or a marker with no released results is far easier to land on
  // than it was — it used to leave the skeleton up indefinitely.
  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Results', to: '/results?view=by-marker' }, { label: 'Not available' }]} />
        <TwoTierHeading eyebrow="Marker detail" title="We couldn’t open that marker" />
        <Card className="mt-10 max-w-xl">
          <p className="max-w-measure text-sm leading-relaxed text-espresso/90">
            You may not have a released result for this marker yet, or the link may be out of date.
          </p>
          <LinkButton to="/results?view=by-marker" className="mt-6">
            See every marker
          </LinkButton>
        </Card>
      </>
    );
  }

  if (!detail) {
    return (
      <div aria-busy="true" aria-label="Loading marker detail">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-3 h-11 w-64" />
        {/* The same shape as the real thing — two cards, 40/60 — so nothing
            jumps when the fetch lands. */}
        <div className="mt-10 grid grid-cols-1 gap-7 lg:grid-cols-5">
          <Skeleton className="h-[30rem] w-full lg:col-span-2" />
          <Skeleton className="h-[30rem] w-full lg:col-span-3" />
        </div>
      </div>
    );
  }

  // Narrowed once. Everything below that asks "was this result placed against
  // its range" asks this, rather than comparing the raw field against null.
  const latestStatus = asMarkerStatus(detail.latest.status);
  // The abbreviation and its expansion, from the one derivation the cards use.
  const name = splitMarkerName(detail.name);

  // Only present when arriving from a report's marker grid (see ReportView) — a direct/deep
  // link has no report context to page through, so the arrows simply don't render.
  const siblingIndex = navState?.markerIds.indexOf(markerId ?? '') ?? -1;
  const prevMarkerId = navState && siblingIndex > 0 ? navState.markerIds[siblingIndex - 1] : null;
  const nextMarkerId = navState && siblingIndex >= 0 && siblingIndex < navState.markerIds.length - 1 ? navState.markerIds[siblingIndex + 1] : null;

  function goToSibling(id: string) {
    navigate(`/markers/${id}`, { state: navState });
  }

  return (
    // The page arrives in sequence rather than all at once — breadcrumbs,
    // heading, the value, the trend, then everything quieter — which is the
    // reading order the layout is built on, said once in motion. Pure CSS, so
    // it plays on mount and never again: paging to the next marker with the
    // prev/next arrows remounts this and replays it, which is correct, and a
    // re-render does not. See `.stagger-in`.
    <div className="stagger-in">
      {/* The most recent draw this marker has a result from — the trend is
          sorted oldest first, so the sample date is the last row's. */}
      <PrintHeader sampleDate={detail.trend[detail.trend.length - 1]?.sampleDate ?? null} />
      <Breadcrumbs
        items={
          navState
            ? [
                { label: 'Overview', to: '/overview' },
                { label: navState.title, to: `/reports/${navState.reportId}` },
                { label: detail.name },
              ]
            : // Reached from the marker list, a comparison, the library or the sidebar search — none
              // of which is a report, so the trail goes back to the marker list rather than to a panel.
              [
                { label: 'Overview', to: '/overview' },
                { label: 'Results', to: '/results?view=by-marker' },
                { label: detail.name },
              ]
        }
      />

      {/* ── THE HEADER IS A LABEL, NOT THE HEADLINE (Aug 2026) ──────────────
          The marker's NAME used to be `.display-heading`, which is
          clamp(38px…72px) and therefore 72px at 1440 — while the value beneath
          it was 52px. So the biggest thing on a page about somebody's result
          was the word "Ferritin", and the number they came for was two thirds
          its size, sitting inside one of four cards of roughly equal weight.

          The name is a `.section-heading` now (38px, Fraunces medium). It is
          still the h1 and still the first thing read; it has simply stopped
          competing with its own answer. See `.hero-value` for the other half. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          {/* THE "MARKER DETAIL" STANDFIRST IS GONE (Aug 2026). It labelled the
              page as being a page about a marker, directly under a breadcrumb
              trail ending in the marker's own name and directly above the
              marker's own name set at 38px. Three statements of the same fact,
              of which this was the one carrying no information at all. */}
          {/* No `break-words`: a marker's name never breaks mid-word, here or
              on a result card. At 38px the page simply gives it another line.
              The ABBREVIATION leads where the name has one, exactly as on a
              card, with the expansion beneath at the section-heading's quieter
              sibling — one vocabulary for a marker's name across the product. */}
          <h1 className="section-heading">{name.primary}</h1>
          {name.expansion && <p className="mt-1.5 text-reading text-espresso/80">{name.expansion}</p>}
        </div>
        {navState && (siblingIndex >= 0) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevMarkerId}
              onClick={() => prevMarkerId && goToSibling(prevMarkerId)}
              className="rounded-full border border-taupe p-2 text-espresso transition duration-150 ease-out hover:border-bronze/60 hover:text-bronze disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous marker in this report"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9 2 4 7l5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-xs text-espresso/80">
              {siblingIndex + 1} of {navState.markerIds.length}
            </span>
            <button
              type="button"
              disabled={!nextMarkerId}
              onClick={() => nextMarkerId && goToSibling(nextMarkerId)}
              className="rounded-full border border-taupe p-2 text-espresso transition duration-150 ease-out hover:border-bronze/60 hover:text-bronze disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next marker in this report"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ═══ THE PAIR. LATEST RESULT AND TREND, 40/60 (restored Aug 2026) ═══
          The page spent a spell with the value and the chart uncarded and
          stacked full width, on the reasoning that a card says "this is one of
          several things" and the value is not one of several things. What that
          cost was the two facts belonging together: the number and the shape it
          sits at the end of are ONE answer read side by side, and stacked they
          became two screens with the second one below the fold.

          37.5/62.5, not an even split, because the two are not equal weight —
          the left card holds a number, a bar and a short history, the right
          holds the chart that is the reason to be on this page. EIGHT columns
          split three and five (it was five split two and three, i.e. 40/60):
          the chart was too narrow for its own height and the fix is a little
          of each, so it takes 2.5 points of the row here and gives back 64px
          of height in TrendChart. Below `lg` they stack full width, where a
          62.5% plot would be a slot.

          THE HIERARCHY THE UNCARDED VERSION WON IS KEPT, and it was never about
          the cards: the VALUE is bigger than the marker's NAME. The name is a
          `.section-heading` (38px) and the value is `.hero-value` (72px at
          1440), so a page about somebody's result is not headed by the word
          "Ferritin" set half again as large as the number they came for.

          SAME HEIGHT, DRIVEN BY CONTENT — which is what a grid row does on its
          own (`align-items: stretch`), and why neither card carries a height.
          NOT `flex flex-col` with `mt-auto` on the history: that pair is what
          opened a dead zone last time, pinning PREVIOUS RESULTS to the floor of
          a card whose height comes from the chart beside it. The sections
          follow each other at ordinary spacing and any slack falls at the
          bottom, where slack reads as nothing at all. */}
      <div className="mt-10 grid grid-cols-1 gap-7 lg:grid-cols-8">
        <Card className="lg:col-span-3">
          {/* THE COPY CONTROL SITS WITH THE LABEL, NOT UNDER THE GAUGE.
              It had its own centred row below the instrument, where a bare
              16px icon with no label beside it and 40px of card either side
              read as a stray glyph rather than as a control — and the row
              existed only because the value used to be there and the button
              used to be beside it. Up here it is where a copy affordance
              conventionally is, it is beside the thing it names ("Latest
              result"), and the space it vacated closes. */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="eyebrow">Latest result</p>
            <CopyButton
              value={`${detail.latest.valueText ?? detail.latest.value} ${detail.latest.unit}`}
              label="Copy result value"
            />
          </div>
          {/* ═══ THE VALUE IS INSIDE THE GAUGE NOW (Aug 2026) ═══════════════
              The bar was a separate object under a separate hero number and a
              separate status badge: three stacked statements about one result.
              An arc has a middle, and the middle of an instrument measuring one
              number is where that number goes — so the value, its unit and the
              status word are the gauge's centre and the three elements are one.

              WHAT SURVIVES FROM THE STACK, unchanged in kind:
              · The value is still the loudest thing on the page and still the
                ONE exception to "every number is mono" — Fraunces at the hero
                optical size with the unit in mono beside it, which is what makes
                the pair read as a measurement rather than as a title with a word
                after it. `.hero-value` was retuned to top out at 52px rather
                than 72px, because it now sits inside a ring with a fixed
                interior; it still clears the marker's name at 38px, so the
                ladder the page turns on is untouched.
              · The status is still the second thing read and still carries its
                chevron. It is under the value rather than under a bar.
              · The amendment note is still OUT of that group — it is a footnote
                about the record, and beside the finding it read as part of it.

              A textual result has no position on a numeric scale, and a result
              with no status was never placed on one — the gauge would be a guess
              in both cases, so where either is true the value is set on its own
              exactly as it used to be. */}
          {detail.latest.value !== null && latestStatus !== null ? (
            <ArcGauge
              value={detail.latest.value}
              low={detail.latest.referenceLow}
              high={detail.latest.referenceHigh}
              status={latestStatus}
              severityThreshold={detail.latest.severityThreshold}
              optimal={detail.optimal}
              unit={detail.latest.unit}
              className="mt-2"
            >
              <p className="hero-value flex flex-wrap items-baseline justify-center gap-x-2">
                <span className="tabular">{detail.latest.value}</span>
                <span className="numeric text-sm font-normal text-espresso/80">{detail.latest.unit}</span>
              </p>
              <div className="mt-2">
                <StatusBadge status={latestStatus} />
              </div>
            </ArcGauge>
          ) : (
            <>
              <p
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${
                  detail.latest.valueText ? 'hero-value-text' : 'hero-value'
                }`}
              >
                <span className="tabular">{detail.latest.valueText ?? detail.latest.value}</span>
                <span className="numeric text-base font-normal text-espresso/80">{detail.latest.unit}</span>
              </p>
              {latestStatus !== null && (
                <div className="mt-7">
                  <StatusBadge status={latestStatus} size="lead" />
                </div>
              )}
            </>
          )}
          {/* The amendment note is the one line that was NOT cut from this card:
              it says this number changed after the patient saw it. Centred under
              the gauge, and rendered only when there is one — an empty row here
              is what opened the dead space the copy control used to sit in. */}
          {detail.latest.amendedAt && (
            <p className="mt-3 text-center text-xs text-espresso/80">
              Amended <span className="numeric">{formatDate(detail.latest.amendedAt)}</span>
            </p>
          )}
          {/* The history, directly beneath the range bar. It is the same data
              the chart on the right plots, read as a list rather than as a
              shape — which is the form somebody wants when the question is
              "what was it last time" rather than "which way is it going", and
              having both on one row is the whole argument for the row. */}
          <PreviousResults trend={detail.trend} className="mt-7" />
        </Card>

        <Card className="lg:col-span-5">
          <p className="eyebrow mb-4">Trend over time</p>
          <TrendChart
            data={detail.trend}
            crossSourceComparable={detail.crossSourceComparable}
            optimal={detail.optimal}
            height="tall"
          />
        </Card>
      </div>

      {/* ═══ EVERYTHING ELSE, VISIBLY QUIETER. ═══════════════════════════════
          A wide margin above this, so the drop in weight is announced by space
          before anything is read. The reading order inside it is fixed and was
          once the wrong way round: the EXPLANATION comes before the
          out-of-range card. Somebody who has just been told their result is
          outside the usual range wants to know what the marker is before they
          are told who to ring about it — the definition is context for the
          prompt, not a footnote to it. */}
      {/* FULL WIDTH, and the PROSE is what is capped (Aug 2026).
          This wrapper carried `max-w-3xl` (768px), under a pair of cards
          spanning the whole 990px content column — so the explanation card
          stopped 222px short of the two above it and the page had a ragged
          right edge that was not a measure of anything: 768 is neither the 40%
          nor the 60% the row is built on, it is the number that was typed.

          The prose inside already caps itself at 68 characters
          (`max-w-measure` on MarkerExplanationBody's text column, and on both
          cards below), which is where a measure belongs — on the line length,
          not on the surface the line sits on. So the cards align with the pair
          and nothing about the reading width changes. */}
      <div className="mt-12">
        {detail.explanation && (
          // THE SECOND SURFACE REGISTER — see `.card-vellum` in globals.css.
          // The one class of content in the product that is prose rather than
          // data, on the one surface that is not the ordinary card.
          //
          // ── THE CARD IS THE SIZE OF THE TEXT IN IT (Aug 2026) ──────────
          // `padding="roomy"` is 48px on every side at sm+, on a card whose
          // content is a label, a sentence and three short pairs. Between that
          // and a 32px gap under the heading, roughly 130px of the card's
          // height was air. `default` (28px / 36px), and a 16px gap under the
          // heading.
          //
          // The ladder inside it is three levels — 16px labels, a 14px
          // Fraunces definition, 12px answers — the SIXTH setting of it and
          // the first with only one label class in the card. See
          // MarkerExplanation.tsx for the full record; do not adjust any of
          // the three by eye.
          //
          // "What this marker means" USED TO BE TYPED HERE, in a different
          // class from the three labels below it, which is precisely how four
          // labels of one kind ended up in two competing tiers. It is rendered
          // by the component now, with its three siblings, in one class.
          // GLASS ON VELLUM (Aug 2026). Vellum is the COLOUR — the warm
          // reading ground under the one class of content in the product that
          // is writing rather than data — and glass is the MATERIAL. The two
          // are orthogonal and this card wants both; `.glass-vellum` swaps the
          // ground without touching a number in the material.
          <Card surface="vellum-glass">
            <MarkerExplanationBody explanation={detail.explanation} />
          </Card>
        )}

        {/* Where a value sits inside the lab range but outside the optimal band,
            say so plainly and once. It is not an out-of-range result and must not
            borrow that treatment - no alert card, no status colour, no advice. */}
        {detail.optimal && detail.optimal.within === false && latestStatus === 'IN_RANGE' && (
          <Card className="mt-8">
            <p className="max-w-measure text-sm leading-relaxed text-espresso/90">
              This result is in range against the lab’s reference range and outside the optimal range of{' '}
              <span className="numeric">
                {detail.optimal.low != null && detail.optimal.high != null
                  ? `${detail.optimal.low}–${detail.optimal.high} ${detail.optimal.unit}`
                  : detail.optimal.high != null
                    ? `below ${detail.optimal.high} ${detail.optimal.unit}`
                    : `${detail.optimal.low} ${detail.optimal.unit} or above`}
              </span>
              . The optimal range is published guidance, separate from how the result was classified. Source:{' '}
              {detail.optimal.source}
            </p>
          </Card>
        )}

        {/* NO COLOURED OUTLINE. This card used to carry a red border, on the
            reasoning that an out-of-range result should be marked as such — but
            the result itself is already tinted and chevroned and worded three
            times over by the time anybody reaches this, and a red box drawn
            around the clinic's phone number reads as an emergency rather than as
            a way to ask a question. Hairline taupe, like every other card.

            The contact details come from the shared component rather than from
            the tail of the copy block, which is where they used to live as one
            comma-joined line. */}
        {detail.outOfRangeNotice && (
          <Card surface="glass" className="mt-8">
            <p className="max-w-measure whitespace-pre-line text-sm leading-relaxed text-espresso">
              {detail.outOfRangeNotice}
            </p>
            <ClinicContactLines className="mt-7" />
          </Card>
        )}
      </div>
    </div>
  );
}
