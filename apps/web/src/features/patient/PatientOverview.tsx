import { formatDate, formatReportHeading } from '@aspire-bloods/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { ClinicContactCard } from '../../components/patient/ClinicContact';
import { AnimatedNumber } from '../../components/motion/AnimatedNumber';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon, LibraryIcon, MarkersIcon, TrendsIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
import { formatRelativeDate, type ChangeItem, type PatientOverview as Overview } from '../../lib/patientPortal';
import { MOVEMENT_COPY } from '../../lib/markerCopy';
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
        <p className="font-display text-2xl leading-tight text-espresso">{change.name}</p>
        <p className="tabular mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-espresso">
          <span className="text-espresso/80">{change.previousValue}</span>
          <span aria-hidden="true" className="text-taupe">
            →
          </span>
          <span className="text-2xl font-semibold">{change.currentValue}</span>
          <span className="text-sm text-espresso/80">{change.unit}</span>
        </p>
        {/* Direction is stated in words and drawn as an arrow; the tone never rests on colour. */}
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-espresso">
          <MovementArrow direction={change.direction} />
          {copy.label}
        </p>
        <p className="mt-2 text-xs text-espresso/80">
          Compared with {formatDate(change.previousDate)}
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
          <p className="font-display text-2xl text-espresso">We couldn't load your overview</p>
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
        {data.lastTestedDate ? (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
            Your most recent sample was taken on{' '}
            <span className="font-medium">{formatDate(data.lastTestedDate)}</span>, {formatRelativeDate(data.lastTestedDate)}.
            {data.trackedMarkerCount > 0 && (
              <>
                {' '}
                We're tracking <span className="tabular font-medium">{data.trackedMarkerCount}</span> marker
                {data.trackedMarkerCount === 1 ? '' : 's'} for you.
              </>
            )}
          </p>
        ) : (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
            {data.pendingReportCount > 0
              ? 'Your first sample is with the clinical team. Nothing is published here until a clinician has reviewed it.'
              : 'Once you have had a sample taken, everything about it will appear here.'}
          </p>
        )}
      </header>

      <div className="mt-10 flex flex-col gap-14 md:gap-20">
      {/* ---------------------------------------------------------------
          Anything booked comes first. It is the only thing on this screen
          with a deadline attached — a fast has to be started the night
          before, and a result can be read whenever. It renders its own
          prompt to book when the diary is empty, so the section never
          silently disappears.
          --------------------------------------------------------------- */}
      <UpcomingAppointments />

      {/* ---------------------------------------------------------------
          Empty state — what is happening and what happens next, and only
          that. Two of the four cards here used to be a tour of the sidebar
          ("you'll find the full panel under My results", "All markers and
          Trends start showing direction of travel"), which is a product
          walkthrough rather than an answer to "why is this empty".
          --------------------------------------------------------------- */}
      {!hasAnything && (
        <section aria-labelledby="whats-coming">
          <h2 id="whats-coming" className="font-display text-3xl text-espresso">
            What happens next
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <p className="eyebrow mb-3">Your account is ready</p>
              <p className="text-reading leading-relaxed text-espresso">
                Nothing has gone wrong. A new account simply starts empty, and results appear once you've had a
                sample taken and the clinic has matched it to you.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">After your appointment</p>
              <p className="text-reading leading-relaxed text-espresso">
                Your sample goes to the laboratory, and the results come back to the Aspire clinical team. A
                clinician reviews every result before it's published, and we'll email you when yours is ready.
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
          <h2 id="attention-heading" className="font-display text-3xl text-espresso">
            Worth a conversation
          </h2>
          <p className="mt-3 max-w-2xl text-reading leading-relaxed text-espresso/90">
            {data.attention.length === 1 ? 'One of your results sits' : `${data.attention.length} of your results sit`} outside
            the usual reference range. That on its own is not a diagnosis. Reference ranges describe most people, not
            every person, and a single result can't be read without the rest of your history.
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
                          <p className="font-display text-2xl leading-tight text-espresso">{item.name}</p>
                          <p className="tabular mt-2 flex items-baseline gap-1.5 text-3xl font-semibold text-espresso">
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
                      <p className="mt-4 text-xs text-espresso/80">
                        {item.panelName ? `${item.panelName} · ` : ''}
                        {formatDate(item.sampleDate)}
                        {item.fromEarlierReport && ' · not repeated in your most recent panel'}
                      </p>
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

          {data.outOfRangeNotice && (
            <Card className="mt-6 border-status-significantHigh">
              <p className="whitespace-pre-line text-sm leading-relaxed text-espresso">{data.outOfRangeNotice}</p>
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
          <h2 id="changes-heading" className="font-display text-3xl text-espresso">
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
          <h2 id="latest-heading" className="font-display text-3xl text-espresso">
            Your most recent panel
          </h2>
          <Reveal>
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="eyebrow mb-2">{formatDate(data.latest.sampleDate)}</p>
                {/* Never blank — a report with no panel behind it rendered
                    this heading empty, on the most prominent card of the
                    landing page. The heading form rather than the full title,
                    because the eyebrow above is already the date. */}
                <p className="font-display text-3xl leading-tight text-espresso">
                  {formatReportHeading(data.latest.panelName, data.latest.markerCount)}
                </p>
                <p className="mt-2 text-xs text-espresso/80">{data.latest.sourceLabel}</p>
              </div>
              <LinkButton to={`/reports/${data.latest.reportId}`} variant="primary">
                View the full panel <ArrowRightIcon />
              </LinkButton>
            </div>

            {/* Counts, not clinical values — the one place a number is allowed
                to count up as it enters (see AnimatedNumber). */}
            <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-taupe pt-6 sm:grid-cols-3">
              <div>
                <dt className="eyebrow mb-1.5">Markers</dt>
                <dd className="tabular text-3xl text-espresso">
                  <AnimatedNumber value={data.latest.markerCount} />
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">In the usual range</dt>
                <dd className="tabular text-3xl text-espresso">
                  <AnimatedNumber value={data.latest.inRangeCount} />
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">Needs attention</dt>
                <dd className="tabular text-3xl text-espresso">
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
          <h2 id="next-heading" className="font-display text-3xl text-espresso">
            Next steps
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {data.nextSteps.map((step, i) => (
              <Reveal key={step.kind} delay={staggerDelay(i)} className="h-full">
                <Card className="h-full">
                  <p className="font-display text-2xl leading-tight text-espresso">{step.title}</p>
                  <p className="mt-3 text-reading leading-relaxed text-espresso/90">{step.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {hasAnything && (
        <section aria-labelledby="explore-heading">
          <h2 id="explore-heading" className="font-display text-3xl text-espresso">
            Go deeper
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {QUICK_ROUTES.map(({ to, label, body, icon: Icon }, i) => (
              <Reveal key={to} delay={staggerDelay(i)} className="h-full">
                <Link to={to} className="block h-full rounded-card">
                  <Card interactive className="flex h-full flex-col">
                    <Icon className="text-bronze-700" />
                    <p className="mt-4 font-display text-2xl leading-tight text-espresso">{label}</p>
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
