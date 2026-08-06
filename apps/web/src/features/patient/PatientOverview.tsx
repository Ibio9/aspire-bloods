import { formatDate } from '@aspire-bloods/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { ClinicContactCard } from '../../components/patient/ClinicContact';
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
          <span className="text-espresso/70">{change.previousValue}</span>
          <span aria-hidden="true" className="text-taupe">
            →
          </span>
          <span className="text-2xl font-semibold">{change.currentValue}</span>
          <span className="text-sm text-espresso/70">{change.unit}</span>
        </p>
        {/* Direction is stated in words and drawn as an arrow; the tone never rests on colour. */}
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-espresso">
          <MovementArrow direction={change.direction} />
          {copy.label}
        </p>
        <p className="mt-2 text-xs text-espresso/70">
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
  { to: '/markers', label: 'All markers', body: 'Every marker you have ever had tested, with its direction of travel.', icon: MarkersIcon },
  { to: '/trends', label: 'Trends', body: 'Put two or three markers on one timeline and see how they move together.', icon: TrendsIcon },
  { to: '/library', label: 'Understanding your results', body: 'Plain-English explanations of what each marker measures.', icon: LibraryIcon },
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
      <Card className="max-w-xl">
        <p className="font-display text-2xl text-espresso">We couldn't load your overview</p>
        <p className="mt-2 text-sm text-espresso/80">
          Please refresh the page. If it keeps happening, get in touch and we'll sort it out.
        </p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading your overview">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-12 w-80" />
        <Skeleton className="mt-4 h-4 w-64" />
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
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
    <div className="flex flex-col gap-14 md:gap-20">
      <header>
        <p className="eyebrow mb-3">Aspire Clinic · Patient portal</p>
        <h1 className="display-heading">
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

      {/* ---------------------------------------------------------------
          Anything booked comes first. It is the only thing on this screen
          with a deadline attached — a fast has to be started the night
          before, and a result can be read whenever. It renders its own
          prompt to book when the diary is empty, so the section never
          silently disappears.
          --------------------------------------------------------------- */}
      <UpcomingAppointments />

      {/* ---------------------------------------------------------------
          Empty state — a new patient gets an explanation of what will show
          up and when, not seven empty sections with headings on them.
          --------------------------------------------------------------- */}
      {!hasAnything && (
        <section aria-labelledby="whats-coming">
          <h2 id="whats-coming" className="font-display text-3xl text-espresso">
            What you'll see here
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <p className="eyebrow mb-3">Your account is ready</p>
              <p className="text-[15px] leading-relaxed text-espresso">
                There's nothing here yet, and nothing has gone wrong. A new account simply starts empty.
                Results appear once you've had a sample taken and the clinic has matched it to you.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">After your appointment</p>
              <p className="text-[15px] leading-relaxed text-espresso">
                Your sample goes to the laboratory, and the results come back to the Aspire clinical team first.
                They check the result is yours before it reaches your account, and a clinician reviews it before
                it's published. Nothing appears here automatically.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">When your results are ready</p>
              <p className="text-[15px] leading-relaxed text-espresso">
                We'll email you. You'll find the full panel under <span className="font-medium">My results</span>,
                every individual marker with its reference range and a plain-English explanation, and the original
                laboratory PDF under <span className="font-medium">Documents</span>.
              </p>
            </Card>
            <Card>
              <p className="eyebrow mb-3">Over time</p>
              <p className="text-[15px] leading-relaxed text-espresso">
                From your second test onwards, <span className="font-medium">All markers</span> and{' '}
                <span className="font-medium">Trends</span> start showing direction of travel: how each marker has
                moved, and how markers move in relation to one another.
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
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-espresso/90">
            {data.attention.length === 1 ? 'One of your results sits' : `${data.attention.length} of your results sit`} outside
            the usual reference range. That on its own is not a diagnosis. Reference ranges describe most people, not
            every person, and a single result can't be read without the rest of your history.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ul className="flex flex-col gap-5 lg:col-span-2">
              {data.attention.map((item) => (
                <li key={item.markerId}>
                  <Link to={`/markers/${item.markerId}`} className="block rounded-card">
                    <Card interactive>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-2xl leading-tight text-espresso">{item.name}</p>
                          <p className="tabular mt-2 flex items-baseline gap-1.5 text-3xl font-semibold text-espresso">
                            {item.value} <span className="text-sm font-normal text-espresso/70">{item.unit}</span>
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="mt-6 max-w-md">
                        <RangeBar value={item.value} low={item.referenceLow} high={item.referenceHigh} status={item.status} />
                      </div>
                      <p className="mt-4 text-xs text-espresso/70">
                        {item.panelName} · {formatDate(item.sampleDate)}
                        {item.fromEarlierReport && ' · not repeated in your most recent panel'}
                      </p>
                      <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
                        What this marker means <ArrowRightIcon />
                      </p>
                    </Card>
                  </Link>
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
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-espresso/90">
            Markers that moved meaningfully since your previous result, in either direction.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.changes.map((change) => (
              <ChangeCard key={change.markerId} change={change} />
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
          <Card className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="eyebrow mb-2">{formatDate(data.latest.sampleDate)}</p>
                <p className="font-display text-3xl leading-tight text-espresso">{data.latest.panelName}</p>
                <p className="mt-2 text-xs text-espresso/70">{data.latest.sourceLabel}</p>
              </div>
              <Link
                to={`/reports/${data.latest.reportId}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-bronze px-5 py-2.5 text-sm font-medium text-white transition duration-150 ease-out hover:bg-bronze-600"
              >
                View the full panel <ArrowRightIcon />
              </Link>
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-taupe pt-6 sm:grid-cols-3">
              <div>
                <dt className="eyebrow mb-1.5">Markers</dt>
                <dd className="tabular text-3xl text-espresso">{data.latest.markerCount}</dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">In the usual range</dt>
                <dd className="tabular text-3xl text-espresso">{data.latest.inRangeCount}</dd>
              </div>
              <div>
                <dt className="eyebrow mb-1.5">Needs attention</dt>
                <dd className="tabular text-3xl text-espresso">{data.latest.attentionCount}</dd>
              </div>
            </dl>
          </Card>
        </section>
      )}

      {data.nextSteps.length > 0 && (
        <section aria-labelledby="next-heading">
          <h2 id="next-heading" className="font-display text-3xl text-espresso">
            Next steps
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {data.nextSteps.map((step) => (
              <Card key={step.kind}>
                <p className="font-display text-2xl leading-tight text-espresso">{step.title}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-espresso/90">{step.body}</p>
              </Card>
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
            {QUICK_ROUTES.map(({ to, label, body, icon: Icon }) => (
              <Link key={to} to={to} className="rounded-card">
                <Card interactive className="flex h-full flex-col">
                  <Icon className="text-bronze-700" />
                  <p className="mt-4 font-display text-2xl leading-tight text-espresso">{label}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-espresso/90">{body}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-bronze-700">
                    Open <ArrowRightIcon />
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
