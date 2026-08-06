import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { bookingService } from '../../lib/booking/bookingService';
import { combineFasting, morningOnlyAddOn, timingNotesFor } from '../../lib/booking/prep';
import { BookingError, type Slot } from '../../lib/booking/types';
import { BookingSummary } from './BookingSummary';
import { FastingNotice } from './FastingNotice';
import { SlotPicker } from './SlotPicker';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from './bookingIcons';
import { ChooseLocation } from './steps/ChooseLocation';
import { ChooseTest } from './steps/ChooseTest';
import { Prepare } from './steps/Prepare';
import { addOnsFor, locationFor, panelFor, useCatalogue } from './useCatalogue';

/**
 * The booking flow — five steps, one page, one piece of state.
 *
 * The step lives in the query string rather than in component state so the
 * browser's own back button walks backwards through the flow instead of
 * dumping someone out of it entirely. That is the behaviour people already
 * have in their hands on a phone, and fighting it costs bookings.
 *
 * A step that isn't reachable yet is clamped rather than rejected: landing on
 * `?step=4` with nothing chosen puts you on the furthest step your answers
 * actually support, which is also what makes the deep link in the progress
 * bar safe.
 *
 * Everything below talks to `bookingService` and nothing else. Swapping the
 * mock for the real Randox client does not touch this file — see
 * `lib/booking/README.md`.
 */

const STEPS = [
  {
    key: 'test',
    short: 'Test',
    title: 'Choose your test',
    lede: 'Four panels, each covering a different amount of ground. Add anything alongside whichever you pick.',
  },
  {
    key: 'where',
    short: 'Where',
    title: 'Choose where',
    lede: 'Our own clinic on Mortimer Street, or one of the Randox clinics. The difference is practical, not clinical.',
  },
  {
    key: 'when',
    short: 'When',
    title: 'Choose when',
    lede: 'Pick a date, then a time. The count under each date is how many slots are left on it.',
  },
  {
    key: 'prepare',
    short: 'Prepare',
    title: 'Before you come',
    lede: 'What to do, and what not to do, between now and your appointment.',
  },
  {
    key: 'confirm',
    short: 'Confirm',
    title: 'Check and confirm',
    lede: 'Nothing is booked until you confirm. Change anything from here.',
  },
] as const;

export function BookingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { catalogue, failed } = useCatalogue();

  const [panelId, setPanelId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showAckError, setShowAckError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const ackRef = useRef<HTMLDivElement>(null);

  const panel = panelFor(catalogue, panelId);
  const addOns = addOnsFor(catalogue, addOnIds);
  const location = locationFor(catalogue, locationId);
  const fasting = combineFasting(panel, addOns);
  const needsAcknowledgement = fasting.required || timingNotesFor(panel, addOns).some((n) => n.critical);

  // How far the answers so far actually justify going. Used both to clamp the
  // requested step and to decide which progress markers are navigable.
  const furthest =
    !panelId ? 0
    : !locationId ? 1
    : !slot ? 2
    : needsAcknowledgement && !acknowledged ? 3
    : 4;

  const requested = Number(params.get('step') ?? '1') - 1;
  const step = Math.max(0, Math.min(Number.isFinite(requested) ? requested : 0, furthest));

  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(next, furthest));
    setParams({ step: String(clamped + 1) }, { replace: false });
  }

  // Each step is a new screen as far as the reader is concerned, so focus goes
  // to its heading and the page goes back to the top. Without this, a screen
  // reader stays parked wherever the Continue button was and a phone stays
  // scrolled to the bottom of the step you just left.
  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  /* Changing the test or the clinic invalidates the slot — the appointment
     length and the diary both come from them. Silently keeping a stale slot
     would book the wrong duration at the wrong site. */
  function changePanel(id: string) {
    setPanelId(id);
    setSlot(null);
    setAcknowledged(false);
  }
  function changeAddOns(ids: string[]) {
    setAddOnIds(ids);
    setSlot(null);
    setAcknowledged(false);
  }
  function changeLocation(id: string) {
    setLocationId(id);
    setSlot(null);
  }
  function changeSlot(next: Slot) {
    setSlot(next);
    // A different time means a different fasting deadline, so the
    // acknowledgement of the old one no longer means anything.
    setAcknowledged(false);
    setShowAckError(false);
  }

  async function confirm() {
    if (!panel || !location || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const appointment = await bookingService.book({
        panelId: panel.id,
        addOnIds,
        locationId: location.id,
        slotId: slot.id,
        date: slot.date,
        time: slot.time,
        fastingAcknowledged: acknowledged,
      });
      navigate(`/appointments/${appointment.id}?booked=1`, { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Nothing has been booked.';
      setSubmitError(message);
      // A lost slot is recoverable and only invalidates the time — send the
      // patient back to the diary with everything else still chosen.
      if (e instanceof BookingError && e.code === 'SLOT_TAKEN') {
        setSlot(null);
        setParams({ step: '3' }, { replace: true });
      }
      setSubmitting(false);
    }
  }

  /* ── shell ───────────────────────────────────────────────────────────── */

  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Book a test' }]} />
        <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="We couldn't load the booking page" />
        <Card className="mt-8 max-w-xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            Please refresh and try again. If it keeps happening, call the clinic and we'll book you in over the phone.
            Nothing you do here is ever the only way to get an appointment.
          </p>
        </Card>
      </>
    );
  }

  const current = STEPS[step];

  return (
    <>
      <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Book a test' }]} />

      <StepProgress step={step} furthest={furthest} onJump={goToStep} />

      <h1 ref={headingRef} tabIndex={-1} className="display-heading mt-8 outline-none">
        {current.title}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">{current.lede}</p>

      {/* Someone arriving here who already has an appointment wants the diary,
          not the flow — and the sidebar entry is called "Book a test". */}
      {step === 0 && (
        <Link
          to="/appointments"
          className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
        >
          Already booked? See your appointments <ArrowRightIcon />
        </Link>
      )}

      {submitError && (
        <div role="alert" className="mt-8 rounded-card border border-status-significantHigh bg-cream-50 p-5 sm:p-6">
          <p className="flex items-start gap-2.5 text-[15px] leading-relaxed text-espresso">
            <AlertIcon className="mt-0.5 shrink-0 text-status-significantHigh" />
            <span>
              <span className="font-medium">Nothing has been booked.</span> {submitError}
            </span>
          </p>
        </div>
      )}

      <div className="mt-12">
        {!catalogue ? (
          <div aria-busy="true" aria-label="Loading the booking options" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-6 h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            {step === 0 && (
              <ChooseTest
                panels={catalogue.panels}
                addOns={catalogue.addOns}
                panelId={panelId}
                onPanelChange={changePanel}
                addOnIds={addOnIds}
                onAddOnsChange={changeAddOns}
              />
            )}

            {step === 1 && (
              <ChooseLocation
                locations={catalogue.locations}
                selectedAddOns={addOns}
                locationId={locationId}
                onChange={changeLocation}
              />
            )}

            {step === 2 && location && panel && (
              <div className="flex flex-col gap-10">
                {/* The fasting requirement is repeated here, before a time is
                    picked, because it is the thing that makes an early slot
                    worth holding out for. */}
                <FastingNotice panel={panel} addOns={addOns} variant="summary" />
                <SlotPicker
                  locationId={location.id}
                  panelId={panel.id}
                  addOnIds={addOnIds}
                  value={slot}
                  onChange={changeSlot}
                  fastingRequired={fasting.required}
                  morningRequiredBy={morningOnlyAddOn(addOns)?.name ?? null}
                />
              </div>
            )}

            {step === 3 && panel && location && slot && (
              <div ref={ackRef}>
                <Prepare
                  panel={panel}
                  addOns={addOns}
                  location={location}
                  slot={slot}
                  acknowledged={acknowledged}
                  onAcknowledge={(v) => {
                    setAcknowledged(v);
                    if (v) setShowAckError(false);
                  }}
                  showAcknowledgeError={showAckError}
                />
              </div>
            )}

            {step === 4 && panel && location && slot && (
              <Card padding="roomy">
                <BookingSummary
                  panel={panel}
                  addOns={addOns}
                  location={location}
                  date={slot.date}
                  time={slot.time}
                  durationMinutes={slot.durationMinutes}
                  onEdit={{
                    test: () => goToStep(0),
                    location: () => goToStep(1),
                    slot: () => goToStep(2),
                  }}
                />
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── actions ─────────────────────────────────────────────────────── */}
      {/* Floats above the content on a phone so Continue is always in reach,
          and returns to the flow of the page from md up. */}
      <div className="sticky bottom-4 z-20 mt-12 flex items-center justify-between gap-3 rounded-full border border-taupe bg-cream-50/95 p-2 shadow-card backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate('/overview') : goToStep(step - 1))}
          className="shrink-0"
        >
          <ChevronLeftIcon />
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => {
              if (step === 3 && needsAcknowledgement && !acknowledged) {
                setShowAckError(true);
                ackRef.current?.querySelector<HTMLInputElement>('#fasting-ack')?.focus();
                return;
              }
              goToStep(step + 1);
            }}
            disabled={step < 3 && furthest <= step}
            disabledReason={
              step === 0
                ? 'Choose a panel to continue'
                : step === 1
                  ? 'Choose a clinic to continue'
                  : 'Choose a time to continue'
            }
            className="shrink-0"
          >
            Continue
            <ChevronRightIcon />
          </Button>
        ) : (
          <Button onClick={() => void confirm()} loading={submitting} className="shrink-0">
            Confirm booking
          </Button>
        )}
      </div>
    </>
  );
}

/* ── progress ───────────────────────────────────────────────────────────── */

/**
 * Five steps is enough that "where am I and how much is left" needs
 * answering. Completed steps are real buttons back to themselves; steps ahead
 * are not, because jumping to one you have not earned lands you on a clamp.
 */
function StepProgress({ step, furthest, onJump }: { step: number; furthest: number; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Booking progress">
      {/* Phone: one line and a bar, because five labelled markers at 375px are
          four truncated words and a scrollbar. */}
      <div className="md:hidden">
        <p className="tabular flex items-baseline justify-between text-sm">
          <span className="font-medium text-espresso">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-espresso/75">{STEPS[step].short}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-300">
          <div
            className="h-full rounded-full bg-bronze transition-[width] duration-200 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="hidden items-center gap-2 md:flex">
        {STEPS.map((s, i) => {
          const done = i < step;
          const currentStep = i === step;
          const reachable = i <= furthest;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  currentStep
                    ? 'border-bronze bg-bronze text-white'
                    : done
                      ? 'border-bronze bg-bronze-50 text-bronze-700'
                      : 'border-taupe bg-white text-espresso/60'
                }`}
              >
                {i + 1}
              </span>
              <span className={currentStep ? 'font-semibold text-espresso' : done ? 'text-espresso' : 'text-espresso/60'}>
                {s.short}
              </span>
            </>
          );

          return (
            <li key={s.key} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-taupe" />}
              {reachable && !currentStep ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="flex min-h-[44px] items-center gap-2 rounded-full px-1 text-sm transition duration-150 ease-out hover:text-bronze-700"
                >
                  {content}
                  <span className="sr-only">, go back to {s.title}</span>
                </button>
              ) : (
                <span
                  aria-current={currentStep ? 'step' : undefined}
                  className="flex min-h-[44px] items-center gap-2 px-1 text-sm"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
