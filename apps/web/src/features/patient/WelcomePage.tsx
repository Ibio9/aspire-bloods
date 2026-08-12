import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { RangeBar } from '../../components/ui/RangeBar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ClinicContactLines } from '../../components/patient/ClinicContact';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { AccountIcon, DocumentsIcon, LibraryIcon, PanelsIcon } from '../../components/nav/patientIcons';

/**
 * ===========================================================================
 *  THE FIRST SIGN-IN INTRODUCTION.
 * ===========================================================================
 *
 * Read once, and then moved past. Everything about how it is built follows
 * from that sentence:
 *
 *  · A SCREEN, NOT A MODAL. Nothing is thrown over a patient's results — the
 *    one thing a person signing in for the first time is here to look at. This
 *    is a page they arrive on and leave; their results are one press away and
 *    the sidebar is where it always is.
 *  · A SEQUENCE, NOT A SCROLL (changed Aug 2026). It was one long document,
 *    which is four headings' worth of reading with no sense of how much is
 *    left and no moment where anything is finished. One heading at a time,
 *    forward and back, with the same progress bar the registration form uses —
 *    a person arriving here has just filled that form in, so the mark for
 *    "where am I in this" is one they met ten seconds ago. Not one word of the
 *    copy changed, and it is still not a tour: nothing points at parts of an
 *    interface they have not seen, and every step is a thing you read rather
 *    than a thing you sit through.
 *  · THE ACTUAL MARKS, NOT AN ILLUSTRATION. The five states are shown using
 *    the product's own StatusBadge and RangeBar — the same components, the same
 *    tokens, the same shapes. A separate diagram of what a status looks like is
 *    a second source of truth, and it is wrong the first time either one
 *    changes.
 *  · DISMISSIBLE AT ANY POINT, and dismissing counts as seen. Skip is on every
 *    step and calls the same endpoint as finishing. Somebody who skips has
 *    decided, and showing it to them again tomorrow is not respecting that.
 *
 * EVERY STEP IS IN THE DOM AT ALL TIMES, and one is shown. That is what makes
 * it print as the single document it used to be: `.welcome-step` is a display
 * toggle in globals.css that `@media print` overrides, so a patient who prints
 * this gets all four sections in order and none of the controls. It also means
 * Ctrl+F finds copy on a step that is not on screen, which is the right
 * trade for a page whose whole content is four screens of prose.
 *
 * SEEN IS RECORDED SERVER-SIDE (User.walkthroughSeenAt). Not localStorage: a
 * first sign-in is a fact about the person, and a flag in storage brings this
 * screen back on their phone, in a private window, and after any cookie
 * clear-out.
 *
 * REACHABLE AFTERWARDS from Understanding results, for anyone who skipped it or
 * wants it again — which is also why marking it seen is idempotent server-side
 * rather than something this page has to be careful about.
 */

/** A calm, deliberately unremarkable example: one marker, mid-range. */
const EXAMPLE = { value: 4.6, low: 3.5, high: 5.3, unit: 'mmol/L' };

const STATES: { status: 'IN_RANGE' | 'HIGH' | 'LOW' | 'SIGNIFICANT_HIGH' | 'SIGNIFICANT_LOW'; meaning: string }[] = [
  { status: 'IN_RANGE', meaning: 'The result sits inside the range the laboratory applied to it.' },
  { status: 'HIGH', meaning: 'Above that range.' },
  { status: 'LOW', meaning: 'Below it.' },
  { status: 'SIGNIFICANT_HIGH', meaning: 'Further above it than the laboratory’s own threshold for this marker.' },
  { status: 'SIGNIFICANT_LOW', meaning: 'The same distance below it.' },
];

const DESTINATIONS = [
  {
    to: '/results',
    icon: PanelsIcon,
    label: 'Results',
    body: 'Every marker you have, and every report. Search it, filter it, or open one report at a time.',
  },
  {
    to: '/library',
    icon: LibraryIcon,
    label: 'Understanding results',
    body: 'What each marker measures, in plain language. You can come back to this introduction from there.',
  },
  {
    to: '/documents',
    icon: DocumentsIcon,
    label: 'Documents',
    body: 'The laboratory’s own PDF, a summary of each report, and a one-page summary to take to your doctor.',
  },
  {
    to: '/account',
    icon: AccountIcon,
    label: 'Account & privacy',
    body: 'Your details, your consent choices, and what we hold about you.',
  },
];

/** One step of the sequence. `id` is the heading's id, so the section is labelled by its own heading. */
interface WelcomeStep {
  id: string;
  title: string;
  body: ReactNode;
}

const STEPS: WelcomeStep[] = [
  {
    id: 'welcome-states',
    title: 'Each result is placed against a range',
    body: (
      <>
        <p className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">
          The laboratory publishes a reference range for every marker it measures: the interval most people’s results
          fall in, for that test on that analyser. Your result is shown against that range, in one of five states.
        </p>

        <Card className="mt-6 max-w-3xl">
          {/* The real bar, with a real number on it. Somebody meeting this
              control for the first time here will meet the identical control on
              their own result an hour later. */}
          <p className="eyebrow mb-3">How a result is drawn</p>
          <RangeBar
            value={EXAMPLE.value}
            low={EXAMPLE.low}
            high={EXAMPLE.high}
            status="IN_RANGE"
            severityThreshold={(EXAMPLE.high - EXAMPLE.low) * 1.5}
            unit={EXAMPLE.unit}
          />
          <p className="numeric mt-4 text-xs text-espresso/80">
            {EXAMPLE.value} {EXAMPLE.unit} · reference range {EXAMPLE.low}–{EXAMPLE.high} {EXAMPLE.unit}
          </p>

          <ul className="mt-8 flex flex-col gap-3 border-t border-taupe pt-6">
            {STATES.map((s) => (
              <li key={s.status} className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                {/* The product's own badge. The chevron and the word carry the
                    state on their own — the colour reinforces them and is never
                    the only thing saying it, which is why this list reads
                    correctly in greyscale and to a colourblind reader. */}
                <StatusBadge status={s.status} />
                <p className="text-sm leading-relaxed text-espresso/90">{s.meaning}</p>
              </li>
            ))}
          </ul>
        </Card>
      </>
    ),
  },
  {
    id: 'welcome-outside',
    title: 'A result outside the range is common, and is not a diagnosis',
    body: (
      <div className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">
        <p>
          A reference range is built so that most healthy people fall inside it, which means some healthy people fall
          outside it. On a panel of a hundred markers, one or two sitting outside is the ordinary case rather than a
          finding.
        </p>
        <p className="mt-4">
          A single result is a measurement of one moment. What it means depends on your history, how you were on the
          day, what else was measured, and things a blood test does not see. That is a conversation with a doctor, not
          something this portal can answer.
        </p>
        <p className="mt-4">
          Wherever a result sits outside its range, the page says so plainly and points you at your GP, with our
          contact details beside it. Nothing here is a diagnosis and nothing here is advice.
        </p>
      </div>
    ),
  },
  {
    id: 'welcome-where',
    title: 'Where things are',
    body: (
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DESTINATIONS.map((d) => {
          const Icon = d.icon;
          return (
            <li key={d.to}>
              <Link to={d.to} className="block h-full rounded-card">
                <Card interactive className="h-full">
                  <p className="flex items-center gap-2.5 font-medium text-espresso">
                    <Icon className="h-[18px] w-[18px] shrink-0 text-bronze-700" />
                    {d.label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-espresso/85">{d.body}</p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    ),
  },
  {
    id: 'welcome-ask',
    title: 'Where to ask a question',
    body: (
      <>
        <p className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">
          If anything here needs explaining, or a result needs discussing, contact the clinic. The same details are at
          the bottom of the sidebar on every screen.
        </p>
        <Card className="mt-6 max-w-2xl">
          <ClinicContactLines />
        </Card>
      </>
    ),
  },
];

export function WelcomePage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [index, setIndex] = useState(0);
  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const isLast = index === STEPS.length - 1;

  async function finish() {
    setFinishing(true);
    try {
      await apiFetch('/patient/walkthrough-seen', { method: 'POST' });
      // Re-read /auth/me so `walkthroughSeen` is true in this session too —
      // otherwise HomeRouter would send them straight back here on the next
      // visit to "/", which is the screen refusing to be dismissed.
      await refresh();
    } catch {
      // A failed write is not a reason to trap somebody on this page. They go
      // to their results; the worst case is that they see this once more.
    } finally {
      setFinishing(false);
      navigate('/overview', { replace: true });
    }
  }

  /**
   * Left and right move through the sequence.
   *
   * Ignored when the key went to something that has its own use for it — a
   * text field, or a control that has opened a listbox. Nothing on these four
   * steps is a text field today, and a page that steals an arrow key from one
   * added later is a page that broke silently.
   */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [role="listbox"], [role="combobox"], [aria-expanded="true"]')) return;
    e.preventDefault();
    setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
  }

  return (
    // `key` on the step wrapper replays the entrance on every move rather than
    // only on mount; `motion-safe` strips it entirely under reduced motion, so
    // the step is simply there. Both are the product's ordinary conventions.
    <div onKeyDown={onKeyDown}>
      <TwoTierHeading
        eyebrow="Aspire Clinic · Patient portal"
        title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
      />
      <p className="mt-4 max-w-measure text-reading leading-relaxed text-espresso/90">
        A minute on how to read what is here, and then you need never see this page again.
      </p>

      {/* The same mark as the registration form's: one bar per step, filled
          behind, current in accent. Hidden from print, where every step is on
          the page and "where am I" has no meaning. */}
      <ol
        className="mt-8 flex max-w-md items-center gap-2 print:hidden"
        aria-label={`Step ${index + 1} of ${STEPS.length}`}
      >
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-hidden="true"
            className={`h-1.5 flex-1 rounded-full transition duration-150 ease-out ${
              i < index ? 'bg-bronze-700' : i === index ? 'bg-bronze' : 'bg-taupe'
            }`}
          />
        ))}
      </ol>

      <div key={index} className="motion-safe:animate-riseIn">
        {STEPS.map((step, i) => (
          <section
            key={step.id}
            // `.welcome-step` is display:none; `.is-current` shows it, and
            // @media print shows all of them. See globals.css.
            className={`welcome-step mt-12 ${i === index ? 'is-current' : ''}`}
            aria-labelledby={step.id}
          >
            <h2 id={step.id} className="font-display opsz-section text-xl leading-tight text-espresso">
              {step.title}
            </h2>
            {step.body}
          </section>
        ))}
      </div>

      {/* Skip is on every step and marks it seen, exactly as finishing does.
          Skipping is a decision, and showing this again tomorrow to somebody
          who has made it is not respecting it. */}
      <div className="mt-14 flex flex-wrap items-center gap-4 border-t border-taupe pt-8 print:hidden">
        {index > 0 && (
          <Button variant="secondary" onClick={() => setIndex((i) => i - 1)} disabled={finishing}>
            Back
          </Button>
        )}
        {isLast ? (
          <Button loading={finishing} onClick={() => void finish()}>
            Go to my results
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)}>Continue</Button>
        )}
        <button
          type="button"
          onClick={() => void finish()}
          className="rounded-input px-1 py-2 text-sm font-medium text-espresso/85 underline-offset-4 transition duration-150 ease-out hover:text-bronze hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
        >
          Skip this
        </button>
        <p className="basis-full text-xs text-espresso/80">
          You can read this again at any time from Understanding results. Left and right arrow keys move between steps.
        </p>
      </div>
    </div>
  );
}
