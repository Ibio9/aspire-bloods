import { formatDate, formatReportHeading } from '@aspire-bloods/shared';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { SectionRail, type RailSection } from '../../components/patient/SectionRail';
import { AnimatedNumber } from '../../components/motion/AnimatedNumber';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon, LibraryIcon, MarkersIcon, TrendsIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { formatRelativeDate, type ChangeItem, type PatientOverview as Overview } from '../../lib/patientPortal';
import { MOVEMENT_COPY } from '../../lib/markerCopy';
import { BOOKING_ENABLED } from '../../lib/features';
import { UpcomingAppointments } from '../booking/UpcomingAppointments';

/**
 * The landing screen. Everything here answers one of the four questions
 * someone actually opens this portal with — what did my last test say, is
 * anything worth worrying about, has anything changed, and what do I do now
 * — and every answer has a route to the fuller version one click away.
 *
 * Nothing on this page interprets a result. It reports what a number did and
 * hands over to a clinician; the contact details sit right next to the thing
 * that prompts the question rather than on a page of their own.
 */

/**
 * A LABEL AND A VALUE, which is what most of this page's sentences actually
 * were.
 *
 * "Your last test was on 6 August" is one fact wearing a sentence: the reader
 * has to parse seven words to reach the only thing in it they came for. As a
 * pair it is RECENT TEST over "5 days ago", legible in a glance from across the
 * room, and it stacks with the pairs beside it into something that reads as a
 * dashboard of facts rather than a paragraph of prose.
 *
 * The three tiers, and they never vary: the label is small spaced-uppercase
 * Plex Sans; the value is Fraunces at a larger size; and a value that is a PURE
 * NUMBER is mono with tabular figures instead, because a column of numbers has
 * to line up and Fraunces' figures are proportional. `numeric` says which.
 *
 * `detail` is the exact date under a relative one — "5 days ago" is the useful
 * form and "6 August 2026" is the one somebody needs when they are filling in a
 * form, so both are there and the relative one leads.
 */
function Stat({
  label,
  value,
  detail,
  numeric = false,
}: {
  label: string;
  value: string | number;
  detail?: string | null;
  /** The value is a pure number: mono and tabular rather than Fraunces. */
  numeric?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <p className={numeric ? 'numeric tabular text-xl font-semibold leading-none text-espresso' : 'stat-value'}>
        {value}
      </p>
      {detail && <p className="numeric mt-2 text-xs text-espresso/80">{detail}</p>}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function MovementArrow({ direction }: { direction: 'UP' | 'DOWN' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      {direction === 'UP' ? (
        <path d="M8 13V3m0 0L4 7m4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M8 3v10m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function ChangeCard({ change }: { change: ChangeItem }) {
  const copy = MOVEMENT_COPY[change.movement];
  return (
    <Link to={`/markers/${change.markerId}`} className="rounded-card">
      <Card interactive className="flex h-full flex-col">
        <p className="font-display opsz-small text-lg leading-tight text-espresso">{change.name}</p>
        <p className="numeric tabular mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-espresso">
          <span className="text-espresso/80">{change.previousValue}</span>
          <span aria-hidden="true" className="text-taupe">
            →
          </span>
          <span className="text-xl font-semibold">{change.currentValue}</span>
          <span className="text-sm text-espresso/80">{change.unit}</span>
        </p>
        {/* Direction is stated in words and drawn as an arrow; the tone never rests on colour. */}
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-espresso">
          <MovementArrow direction={change.direction} />
          {copy.label}
        </p>
        <p className="mt-2 text-xs text-espresso/80">
          Compared with <span className="numeric">{formatDate(change.previousDate)}</span>
        </p>
        <div className="mt-4">
          <StatusBadge status={change.currentStatus} />
        </div>
      </Card>
    </Link>
  );
}

const QUICK_ROUTES = [
  { to: '/results?view=by-marker', label: 'Every marker', body: 'All of them, with direction of travel.', icon: MarkersIcon },
  { to: '/results?view=compare', label: 'Compare markers', body: 'Two or three on one timeline.', icon: TrendsIcon },
  { to: '/library', label: 'Understanding your results', body: 'What each marker measures.', icon: LibraryIcon },
];

/** The collapsed/expanded preference, per patient. See the note beside it. */
const ATTENTION_OPEN_KEY = 'aspire_overview_attention_open';
/** Named once so `aria-controls` and the region it points at cannot drift apart. */
const ATTENTION_REGION_ID = 'attention-results';

/**
 * ── THE FOUR SECTIONS, IN ORDER, AND THEIR IDS ────────────────────────────
 *
 * Worth a conversation, then the most recent panel, then Go deeper, then
 * What's changed — and nothing between them. The order answers the questions a
 * patient opens this screen with in the order they actually ask them: is
 * anything worth worrying about, what did my last test say, where do I look
 * next, and what has moved.
 *
 * The ids are here rather than inline because three things must agree on them
 * and nothing else can check that they do: the `<section>` element, the anchor
 * in the rail beside it, and the `#fragment` in the URL after a dot is clicked.
 * A section that renders under an id the rail does not know about is a dot that
 * scrolls nowhere, and there is no type that catches it.
 *
 * NOT the same strings as the `aria-labelledby` heading ids, which name the
 * HEADING. These name the SECTION, which is the thing being scrolled to.
 */
const SECTION_IDS = {
  attention: 'worth-a-conversation',
  latest: 'recent-panel',
  explore: 'go-deeper',
  changes: 'whats-changed',
} as const;

/**
 * THE NON-DIAGNOSTIC FRAMING, WHICH IS NOT OPTIONAL AND IS NO LONGER A CARD.
 *
 * It used to be `outOfRangeNotice` — a seeded copy block — rendered in a card
 * of its own below the list, with the clinic's contact details under it. Three
 * things were wrong with that and only one of them was the card. Its opening
 * sentence ("One or more of your results falls outside the usual reference
 * range") restated, less precisely, the count line four inches above it; the
 * contact details under it were the third appearance of the same four lines on
 * one screen; and a paragraph of framing set apart in its own box below the
 * results reads as a footnote to them rather than as part of how they are to be
 * read.
 *
 * So it is two sentences, in the section, immediately under the count and above
 * the cards — where somebody meets it BEFORE the results rather than after
 * them. The middle sentence is preserved word for word, because it is the
 * sentence the whole product rests on.
 *
 * WHY IT IS WRITTEN HERE AND NOT FETCHED. The copy block still exists and is
 * still rendered, unchanged, in the two places where nothing else on the page
 * says it: the marker detail page and the "Next steps" block of both PDFs. It
 * is not shortened for them, because there it is the only framing there is.
 * What the Overview needed was the same idea at the length this section has
 * room for, and slicing sentences off a clinician-editable block at render time
 * would silently eat an edit the first time somebody made one.
 */
const ATTENTION_FRAMING =
  'This is not a diagnosis. Many things affect a single result, and only a clinician who knows your full history can interpret it properly. Your GP or the Aspire Clinic clinical team can talk you through it.';

export function PatientOverview() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * ── WHETHER THE OUT-OF-RANGE LIST IS OPEN ───────────────────────────────
   *
   * OPEN BY DEFAULT. A patient with results outside the usual range should see
   * them without asking; the fold is for somebody who has read them and wants
   * the rest of their overview back, which is a decision they make once.
   *
   * PERSISTED PER PATIENT, not per browser. The sidebar's contact panel keys on
   * nothing because it is a chrome preference; this one is about a particular
   * person's results, and an admin who is also a patient of the practice shares
   * a browser with their own account. Keyed on the user id, so a preference
   * cannot follow the machine onto somebody else's overview.
   *
   * A try/catch around every access: a locked-down browser losing the
   * preference is not worth a broken render, which is the same reasoning the
   * sidebar's collapse state carries.
   */
  const storageKey = user ? `${ATTENTION_OPEN_KEY}:${user.id}` : null;
  const [attentionOpen, setAttentionOpen] = useState(true);
  /**
   * WHETHER THE STORED PREFERENCE HAS BEEN READ YET, and this flag is the whole
   * of why the persistence works.
   *
   * Without it the two effects below fight on mount and the write wins. They
   * run in declaration order in the same commit: the read sets state to
   * `false`, and then the write — still holding the `true` the state was
   * initialised with, because the re-render has not happened — puts 'true' back
   * in storage. The preference was overwritten by its own default every single
   * time the page loaded, so it survived navigation (no remount) and never
   * survived a reload. Caught by asserting the reload rather than by clicking
   * about, which is exactly the sort of thing a click-through misses.
   */
  const [hydrated, setHydrated] = useState(false);

  // Read AFTER mount rather than in the initialiser, because `user` is null on
  // the first render while /auth/me is in flight — an initialiser would key on
  // nothing and then never re-read.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      // Only an explicit 'false' closes it. Absent means "never chosen", which
      // is open — the default has to survive a browser with no storage at all.
      if (stored !== null) setAttentionOpen(stored !== 'false');
    } catch {
      /* no stored preference is the same as never having set one */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      localStorage.setItem(storageKey, String(attentionOpen));
    } catch {
      /* a locked-down browser losing the preference is not worth a broken render */
    }
  }, [storageKey, hydrated, attentionOpen]);

  /**
   * Escape closes it, but ONLY when focus is inside the section.
   *
   * Bound to the section rather than to the document, so Escape pressed
   * anywhere else on the overview does nothing — a global handler would fold
   * this away while somebody was dismissing a toast at the other end of the
   * page. React's synthetic keydown bubbles from whatever is focused, so being
   * on the section IS the "focus is inside" test.
   *
   * Focus is then moved to the disclosure. Collapsing the region takes the
   * focused element out of the tab order (see .collapse-region's visibility
   * rule), and focus left on a hidden element lands on <body> — so the next Tab
   * starts from the top of the document.
   */
  const attentionToggleRef = useRef<HTMLButtonElement>(null);
  function onAttentionKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key !== 'Escape' || !attentionOpen) return;
    e.stopPropagation();
    setAttentionOpen(false);
    attentionToggleRef.current?.focus();
  }


  useEffect(() => {
    apiFetch<Overview>('/patient/overview')
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <>
        <p className="eyebrow mb-3">Aspire Clinic · Patient portal</p>
        <h1 className="display-heading break-words">Overview</h1>
        <Card className="mt-10 max-w-xl">
          <p className="font-display opsz-section text-xl text-espresso">We couldn’t load your overview</p>
          <p className="mt-2 text-sm text-espresso/80">
            Please refresh the page. If it keeps happening, get in touch and we’ll sort it out.
          </p>
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading your overview">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-12 w-80" />
        <Skeleton className="mt-4 h-4 w-64" />
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-32" />
              <Skeleton className="mt-4 h-4 w-40" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const hasAnything = data.releasedReportCount > 0 || data.pendingReportCount > 0;

  // Only the sections that actually render. A rail entry pointing at a section
  // a patient does not have is a dot that scrolls nowhere, and the conditions
  // are already written once each below — so they are read from the same data
  // here rather than restated.
  const railSections: RailSection[] = [
    data.attention.length > 0 && { id: SECTION_IDS.attention, label: 'Worth a conversation' },
    data.latest && { id: SECTION_IDS.latest, label: 'Your most recent panel' },
    hasAnything && { id: SECTION_IDS.explore, label: 'Go deeper' },
    data.changes.length > 0 && { id: SECTION_IDS.changes, label: 'What’s changed' },
  ].filter(Boolean) as RailSection[];

  return (
    // The header sits outside the section column on purpose. Inside it, the
    // gap that separates one whole section from the next — deliberately large,
    // these are separate subjects — was also doing duty as the gap between the
    // H1 and the first card, which is not the same relationship and made this
    // page read differently from every other one. Out here it takes the same
    // mt-10 the rest of the portal uses, and the sections keep their rhythm.
    <>
      <header>
        <p className="eyebrow mb-3">Aspire Clinic · Patient portal</p>
        <h1 className="display-heading break-words">
          {greeting()}
          {data.firstName ? `, ${data.firstName}` : ''}
        </h1>
        {/* Label and value, not a sentence. "Your most recent sample was taken
            on 6 August 2026, 5 days ago. We're tracking 437 markers for you."
            was two facts and twenty words, and the two facts were the only
            part anybody read. */}
        {data.lastTestedDate ? (
          <dl className="mt-9 flex flex-wrap gap-x-16 gap-y-8">
            <Stat
              label="Recent test"
              value={formatRelativeDate(data.lastTestedDate)}
              detail={formatDate(data.lastTestedDate)}
            />
            {data.trackedMarkerCount > 0 && (
              <Stat label="Markers tracked" value={data.trackedMarkerCount} numeric />
            )}
            {data.releasedReportCount > 0 && (
              <Stat label="Reports released" value={data.releasedReportCount} numeric />
            )}
          </dl>
        ) : (
          /* The one place a paragraph earns its keep on this page: somebody
             with no results needs to know what is happening and what happens
             next, and neither is a value with a label on it. */
          <p className="mt-7 max-w-measure text-lg leading-relaxed text-espresso">
            {data.pendingReportCount > 0
              ? 'Your first sample is with the clinical team. Nothing is published here until a clinician has reviewed it.'
              : 'Once you have had a sample taken, everything about it will appear here.'}
          </p>
        )}
      </header>

      {/* `relative` is what the rail positions against, and `xl:pr-36` is the
          room it takes — see .section-rail in globals.css, where the whole of
          "it cannot collide with anything" is derived from this box being the
          content column rather than the viewport, and from the content inside
          it being inset by exactly the padding the rail is drawn in. The
          reservation does not change with the rail's state, so the page does
          not reflow under the reader on their first scroll. */}
      <div className="relative mt-14 flex flex-col gap-16 md:gap-24 xl:pr-36">
      <SectionRail sections={railSections} />

      {/* ---------------------------------------------------------------
          Anything booked comes first. It is the only thing on this screen
          with a deadline attached — a fast has to be started the night
          before, and a result can be read whenever. It renders its own
          prompt to book when the diary is empty, so the section never
          silently disappears.

          Off with booking (see lib/features.ts). Appointments are made on
          the clinic's main website, so this portal has no diary to show.
          --------------------------------------------------------------- */}
      {BOOKING_ENABLED && <UpcomingAppointments />}

      {/* ---------------------------------------------------------------
          Empty state — what is happening and what happens next, and only
          that. Two of the four cards here used to be a tour of the sidebar
          ("you'll find the full panel under My results", "All markers and
          Trends start showing direction of travel"), which is a product
          walkthrough rather than an answer to "why is this empty".
          --------------------------------------------------------------- */}
      {!hasAnything && (
        <section aria-labelledby="whats-coming">
          <h2 id="whats-coming" className="section-heading">
            What happens next
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <p className="eyebrow mb-3">Your account is ready</p>
              <p className="max-w-measure text-reading leading-relaxed text-espresso">
                A new account starts empty. Results appear once you’ve had a sample taken and the clinic has
                matched it to you.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">After your test</p>
              <p className="max-w-measure text-reading leading-relaxed text-espresso">
                Your sample goes to the laboratory and the results come back to the Aspire Clinic clinical team. A
                clinician reviews every one before it’s published, and we’ll email you when yours is ready.
              </p>
            </Card>
            {/* No contact card here either. The sidebar carries the clinic's
                details on every screen, one action away, and a third copy of
                them on the emptiest page in the product was the least useful
                of the three. */}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          Needs attention — stated plainly, never interpreted, with a route
          to a human sitting immediately beside it.
          --------------------------------------------------------------- */}
      {data.attention.length > 0 && (
        <section
          id={SECTION_IDS.attention}
          // `tabIndex={-1}` so the rail can move focus here after a smooth
          // scroll: without it, focus() does nothing and a keyboard user is
          // scrolled to a section while their focus stays in the rail, so the
          // next Tab walks the rail instead of the section they just chose.
          tabIndex={-1}
          className="scroll-mt-24 outline-none"
          aria-labelledby="attention-heading"
          onKeyDown={onAttentionKeyDown}
        >
          {/* THE HEADING ROW IS THE TOGGLE, and the whole row is the target.
              A chevron on its own is a 12px hit area beside a 38px heading, and
              the heading is what somebody reaches for. `aria-expanded` on the
              control, `aria-controls` pointing at the region it opens.

              A <button> inside the <h2> rather than around it: the heading has
              to stay a heading in the accessibility tree, and wrapping it in a
              button would make the page's outline read "button" where a section
              title should be. */}
          <h2 id="attention-heading" className="section-heading">
            <button
              ref={attentionToggleRef}
              type="button"
              onClick={() => setAttentionOpen((o) => !o)}
              aria-expanded={attentionOpen}
              aria-controls={ATTENTION_REGION_ID}
              // BESIDE THE HEADING, not at the far edge of the page. `w-full
              // justify-between` put the chevron a thousand pixels from the
              // words it belongs to, which reads as an unrelated control that
              // happens to share a row. `inline-flex` keeps the whole row a
              // target (the button is still as wide as its content, and its
              // content is the heading) while the mark stays attached to it.
              className="group inline-flex max-w-full items-center gap-3 rounded-input text-left transition-colors duration-150 ease-out hover:text-bronze focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze"
            >
              <span>Worth a conversation</span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className={`mt-1 shrink-0 text-bronze-700 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  attentionOpen ? '' : '-rotate-90'
                }`}
              >
                <path d="M3 5.5 8 10.5l5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </h2>
          {/* OUTSIDE the collapsing region on purpose. Collapsing hides the
              cards, not the fact — a patient who folds this away should still
              see, on the page, that there are results outside the range. */}
          {/* OUTSIDE the collapsing region, both of them. Collapsing hides the
              CARDS; it must not hide that there are results outside the range,
              and it must not hide how they are to be read. The framing comes
              second and sits above the list rather than below it, so somebody
              meets "this is not a diagnosis" on the way IN to their results
              rather than as a footnote after them. */}
          <p className="mt-4 max-w-measure text-reading leading-relaxed text-espresso/90">
            {data.attention.length === 1
              ? 'One of your markers sits'
              : `${data.attention.length} of your markers sit`}{' '}
            outside the usual reference range. That is the most recent result for each marker you have, across every
            report, rather than only your latest panel.
          </p>
          <p className="mt-3 max-w-measure text-sm leading-relaxed text-espresso/80">{ATTENTION_FRAMING}</p>

          {/* ONE COLUMN, and the second one is gone with the contact card that
              used to be in it (Aug 2026). The grid was two-plus-one at lg so
              that "Talk to someone" could travel beside the list; with the
              clinic's details in the sidebar on every screen, that card was
              their third appearance on this page and the column existed only
              to hold it.

              What is left is the list, collapsing on its own, at the section's
              full width — which is also what the cards inside it wanted: a
              range bar in a two-thirds column at 1440px was drawing a scale
              into about 380px. */}
          <div className="mt-8">
            <div
              id={ATTENTION_REGION_ID}
              className={`collapse-region ${attentionOpen ? 'is-open' : ''}`}
            >
            <ul className="flex flex-col gap-5">
              {data.attention.map((item, i) => (
                <li key={item.markerId}>
                  <Reveal delay={staggerDelay(i)}>
                  <Link to={`/markers/${item.markerId}`} className="block rounded-card">
                    <Card interactive>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-display opsz-small text-lg leading-tight text-espresso">{item.name}</p>
                          <p className="numeric tabular mt-2 flex items-baseline gap-1.5 text-xl font-semibold text-espresso">
                            {item.value} <span className="text-sm font-normal text-espresso/80">{item.unit}</span>
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-6 max-w-md">
                        <RangeBar
                          value={item.value}
                          low={item.referenceLow}
                          high={item.referenceHigh}
                          status={item.status}
                          severityThreshold={item.severityThreshold}
                          unit={item.unit}
                        />
                      </div>
                      {/* Panels are optional, so the panel name is a segment
                          that may not exist. Printed raw it left an orphaned
                          "· 5 August 2026" leading the line. */}
                      {/* Panel, date and provenance — one per line, the date
                          on its own and in mono, the same arrangement the
                          marker cards use. Panels are optional, so a raw join
                          left an orphaned "· 5 August 2026" leading the
                          line. */}
                      <div className="mt-5 flex flex-col gap-0.5 text-xs text-espresso/80">
                        {item.panelName && <span>{item.panelName}</span>}
                        <span className="numeric">{formatDate(item.sampleDate)}</span>
                        {item.fromEarlierReport && <span>Not repeated in your most recent panel</span>}
                      </div>
                      <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
                        What this marker means <ArrowRightIcon />
                      </p>
                    </Card>
                  </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          The last panel, second. What a patient came for after "is anything
          worth worrying about" is "what did my last test say".
          --------------------------------------------------------------- */}
      {data.latest && (
        <section
          id={SECTION_IDS.latest}
          tabIndex={-1}
          className="scroll-mt-24 outline-none"
          aria-labelledby="latest-heading"
        >
          <h2 id="latest-heading" className="section-heading">
            Your most recent panel
          </h2>
          <Reveal>
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="eyebrow mb-2"><span className="numeric">{formatDate(data.latest.sampleDate)}</span></p>
                {/* Never blank — a report with no panel behind it rendered
                    this heading empty, on the most prominent card of the
                    landing page. The heading form rather than the full title,
                    because the eyebrow above is already the date. */}
                <p className="font-display opsz-section text-xl leading-tight text-espresso">
                  {formatReportHeading(data.latest.panelName, data.latest.markerCount)}
                </p>
                {/* Empty for anything the clinic analysed itself — see
                    lib/sourceLabel.ts. */}
                {data.latest.sourceLabel && (
                  <p className="mt-2 text-xs text-espresso/80">{data.latest.sourceLabel}</p>
                )}
              </div>
              <LinkButton to={`/reports/${data.latest.reportId}`} variant="primary">
                View the full panel <ArrowRightIcon />
              </LinkButton>
            </div>

            {/* Counts, not clinical values — the one place a number is allowed
                to count up as it enters (see AnimatedNumber). Mono and
                tabular, like every other pure number in the product, so the
                three line up as a row rather than drifting with their digits. */}
            <dl className="mt-9 grid grid-cols-2 gap-8 border-t border-taupe pt-8 sm:grid-cols-3">
              <div>
                <dt className="eyebrow mb-2">Markers</dt>
                <dd className="numeric tabular text-xl font-semibold leading-none text-espresso">
                  <AnimatedNumber value={data.latest.markerCount} />
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-2">In the usual range</dt>
                <dd className="numeric tabular text-xl font-semibold leading-none text-espresso">
                  <AnimatedNumber value={data.latest.inRangeCount} />
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-2">Needs attention</dt>
                <dd className="numeric tabular text-xl font-semibold leading-none text-espresso">
                  <AnimatedNumber value={data.latest.attentionCount} />
                </dd>
              </div>
            </dl>
          </Card>
          </Reveal>
        </section>
      )}

      {/* ---------------------------------------------------------------
          "NEXT STEPS" IS GONE (Aug 2026), not moved. Three cards, of which
          the load-bearing one was titled "Worth a conversation" and said, in
          a paragraph, what the section of that name three screens above
          already says with the actual results in it. The other two were a
          "results are on their way" notice — which the empty state and the
          reports list both carry — and a retest prompt, which is a booking
          affordance on a portal whose booking flow is deliberately off.

          The server no longer computes it either: a DTO field nothing renders
          is the next screen's accidental resurrection of a section somebody
          removed on purpose.
          --------------------------------------------------------------- */}

      {hasAnything && (
        <section
          id={SECTION_IDS.explore}
          tabIndex={-1}
          className="scroll-mt-24 outline-none"
          aria-labelledby="explore-heading"
        >
          <h2 id="explore-heading" className="section-heading">
            Go deeper
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {QUICK_ROUTES.map(({ to, label, body, icon: Icon }, i) => (
              <Reveal key={to} delay={staggerDelay(i)} className="h-full">
                <Link to={to} className="block h-full rounded-card">
                  <Card interactive className="flex h-full flex-col">
                    <Icon className="text-bronze-700" />
                    <p className="mt-4 font-display opsz-small text-lg leading-tight text-espresso">{label}</p>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-espresso/90">{body}</p>
                    <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
                      Open <ArrowRightIcon />
                    </p>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          What's changed — improvements carry exactly the same weight as
          declines. Someone whose vitamin D has climbed out of deficiency
          should see that as prominently as someone whose ferritin fell.

          Last, because it is the only section that is about the past rather
          than about the panel in front of the reader.
          --------------------------------------------------------------- */}
      {data.changes.length > 0 && (
        <section
          id={SECTION_IDS.changes}
          tabIndex={-1}
          className="scroll-mt-24 outline-none"
          aria-labelledby="changes-heading"
        >
          <h2 id="changes-heading" className="section-heading">
            What’s changed
          </h2>
          {/* No standfirst: every card below carries its own movement label and
              the date it is compared with, which is the whole of what the
              sentence said. */}
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.changes.map((change, i) => (
              <Reveal key={change.markerId} delay={staggerDelay(i)} className="h-full">
                <ChangeCard change={change} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
      </div>
    </>
  );
}
