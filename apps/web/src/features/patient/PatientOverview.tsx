import { formatDate, formatReportHeading } from '@aspire-bloods/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { ClinicContactCard, ClinicContactLines } from '../../components/patient/ClinicContact';
import { AnimatedNumber } from '../../components/motion/AnimatedNumber';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon, LibraryIcon, MarkersIcon, TrendsIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
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

export function PatientOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

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
          <p className="font-display opsz-section text-xl text-espresso">We couldn't load your overview</p>
          <p className="mt-2 text-sm text-espresso/80">
            Please refresh the page. If it keeps happening, get in touch and we'll sort it out.
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

      <div className="mt-14 flex flex-col gap-16 md:gap-24">
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
                A new account starts empty. Results appear once you've had a sample taken and the clinic has
                matched it to you.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">After your test</p>
              <p className="max-w-measure text-reading leading-relaxed text-espresso">
                Your sample goes to the laboratory and the results come back to the Aspire clinical team. A
                clinician reviews every one before it's published, and we'll email you when yours is ready.
              </p>
            </Card>
            <ClinicContactCard />
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------
          Needs attention — stated plainly, never interpreted, with a route
          to a human sitting immediately beside it.
          --------------------------------------------------------------- */}
      {data.attention.length > 0 && (
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="section-heading">
            Worth a conversation
          </h2>
          <p className="mt-4 max-w-measure text-reading leading-relaxed text-espresso/90">
            {data.attention.length === 1 ? 'One of your results sits' : `${data.attention.length} of your results sit`} outside
            the usual reference range.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ul className="flex flex-col gap-5 lg:col-span-2">
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

            <div className="lg:sticky lg:top-8 lg:self-start">
              <ClinicContactCard />
            </div>
          </div>

          {/* No coloured outline. The card carried a red border, on the
              reasoning that an out-of-range result should be marked as such —
              but every card above it is already tinted, chevroned and worded,
              and a red box around the calmest paragraph on the page reads as
              an escalation of it. Hairline taupe, like every other card, with
              the clinic's details one item per line beneath. */}
          {data.outOfRangeNotice && (
            <Card className="mt-8 max-w-3xl">
              <p className="max-w-measure whitespace-pre-line text-sm leading-relaxed text-espresso">
                {data.outOfRangeNotice}
              </p>
              <ClinicContactLines className="mt-7" />
            </Card>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------
          What's changed — improvements carry exactly the same weight as
          declines. Someone whose vitamin D has climbed out of deficiency
          should see that as prominently as someone whose ferritin fell.
          --------------------------------------------------------------- */}
      {data.changes.length > 0 && (
        <section aria-labelledby="changes-heading">
          <h2 id="changes-heading" className="section-heading">
            What's changed
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

      {/* --------------------------------------------------------------- */}
      {data.latest && (
        <section aria-labelledby="latest-heading">
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

      {data.nextSteps.length > 0 && (
        <section aria-labelledby="next-heading">
          <h2 id="next-heading" className="section-heading">
            Next steps
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {data.nextSteps.map((step, i) => (
              <Reveal key={step.kind} delay={staggerDelay(i)} className="h-full">
                <Card className="h-full">
                  <p className="font-display opsz-small text-lg leading-tight text-espresso">{step.title}</p>
                  <p className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {hasAnything && (
        <section aria-labelledby="explore-heading">
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
      </div>
    </>
  );
}
