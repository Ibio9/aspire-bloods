import { Card } from '../../../components/ui/Card';
import {
  combineFasting,
  deadlinePhrase,
  fastingWindow,
  formatWeekdayDate,
  homeKitAddOns,
  timingNotesFor,
} from '../../../lib/booking/prep';
import type { AddOn, BookingLocation, Panel, Slot } from '../../../lib/booking/types';
import { FastingNotice } from '../FastingNotice';
import { AlertIcon, HomeKitIcon, TickIcon } from '../bookingIcons';

/**
 * Step four — everything that has to happen before the appointment, with the
 * fasting rule leading and expressed as a clock time rather than a duration.
 *
 * The acknowledgement at the bottom is required only when there is something
 * critical to acknowledge. A tickbox that appears on every booking regardless
 * teaches people to tick without reading, which is exactly the habit that
 * makes the one that matters fail.
 */

interface PrepareProps {
  panel: Panel;
  addOns: AddOn[];
  location: BookingLocation;
  slot: Slot;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  /** Set after a failed attempt to continue, so the error is announced rather than just coloured. */
  showAcknowledgeError: boolean;
}

export function Prepare({
  panel,
  addOns,
  location,
  slot,
  acknowledged,
  onAcknowledge,
  showAcknowledgeError,
}: PrepareProps) {
  const rule = combineFasting(panel, addOns);
  const window = fastingWindow(rule, slot.date, slot.time);
  const notes = timingNotesFor(panel, addOns);
  const kits = homeKitAddOns(addOns);
  const needsAcknowledgement = rule.required || notes.some((n) => n.critical);

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <FastingNotice panel={panel} addOns={addOns} date={slot.date} time={slot.time} />

      {notes.length > 0 && (
        <section aria-labelledby="timing-heading">
          <h3 id="timing-heading" className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
            Other things that affect the result
          </h3>
          <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
            {notes.map((note) => (
              <Card key={note.label} className="flex flex-col">
                <p className="flex items-start gap-2.5 font-display text-xl leading-tight text-espresso">
                  {/* Critical notes are flagged by an icon and by the word
                      "Important", never by colour alone. */}
                  {note.critical && <AlertIcon className="mt-1 shrink-0 text-bronze-700" />}
                  {note.label}
                </p>
                {note.critical && <p className="eyebrow mt-2">Important</p>}
                <p className="mt-3 text-reading leading-relaxed text-espresso/90">{note.detail}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {kits.length > 0 && (
        <section aria-labelledby="kit-heading">
          <h3 id="kit-heading" className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
            Your home kit
          </h3>
          <Card className="mt-7">
            <p className="flex items-center gap-2.5 font-display text-xl leading-tight text-espresso">
              <HomeKitIcon className="shrink-0 text-bronze-700" />
              {kits.map((k) => k.name).join(' and ')}
            </p>
            <p className="mt-3 text-reading leading-relaxed text-espresso/90">
              This one is not taken at your appointment. We'll post the kit within two working days, with a prepaid
              return envelope. Complete it whenever suits you — there is no window to hit, and your blood draw on{' '}
              {formatWeekdayDate(slot.date)} is unaffected.
            </p>
          </Card>
        </section>
      )}

      <section aria-labelledby="onday-heading">
        <h3 id="onday-heading" className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
          On the day
        </h3>
        <ul className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              title: 'Arrive five minutes early',
              body: `${location.name} opens onto ${location.addressLines[0]}. ${location.travelNote}`,
            },
            {
              title: 'Drink water',
              body: 'Being well hydrated makes the vein easier to find and the draw quicker. Water does not break a fast.',
            },
            {
              title: 'Short sleeves, or sleeves that roll',
              body: 'It sounds trivial until you are wearing a jumper you cannot get above your elbow.',
            },
            {
              title: 'Bring your medication list',
              body: 'Anything you take regularly, including supplements. Several of them move results, and the clinician reading yours needs to know.',
            },
          ].map((item) => (
            <li key={item.title}>
              <Card className="flex h-full flex-col">
                <p className="font-display text-xl leading-tight text-espresso">{item.title}</p>
                <p className="mt-2.5 text-reading leading-relaxed text-espresso/90">{item.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ── acknowledgement ─────────────────────────────────────────────── */}
      {needsAcknowledgement && (
        <section aria-labelledby="ack-heading">
          <h3 id="ack-heading" className="sr-only">
            Confirm you have read the preparation
          </h3>
          <label
            htmlFor="fasting-ack"
            className={`relative flex cursor-pointer items-start gap-3.5 rounded-card border p-6 transition duration-150 ease-out sm:p-7 ${
              acknowledged ? 'border-2 border-bronze bg-bronze-50 p-[23px] sm:p-[27px]' : 'border-taupe bg-cream-50'
            } ${showAcknowledgeError && !acknowledged ? 'border-status-significantHigh' : ''}`}
          >
            <input
              id="fasting-ack"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => onAcknowledge(e.target.checked)}
              aria-describedby={showAcknowledgeError && !acknowledged ? 'fasting-ack-error' : undefined}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-px rounded-card peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze"
            />
            <span
              aria-hidden="true"
              className={`relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition duration-150 ease-out ${
                acknowledged ? 'border-bronze bg-bronze' : 'border-taupe bg-white'
              }`}
            >
              <TickIcon className={`h-3 w-3 text-onaccent transition duration-150 ease-out ${acknowledged ? 'opacity-100' : 'opacity-0'}`} />
            </span>
            {/* The label names the actual time. "I have read the instructions"
                is not something anyone can be held to; "I will not eat after
                10:30pm on Monday" is. */}
            <span className="relative min-w-0 flex-1 text-reading leading-relaxed text-espresso">
              {window ? (
                <>
                  I understand I must not eat after{' '}
                  <span className="tabular font-semibold">{deadlinePhrase(window.closeBy)}</span>, and that if I do,
                  the sample can't be used.
                </>
              ) : (
                <>I've read the preparation above and understand what I need to do before this appointment.</>
              )}
            </span>
          </label>
          {showAcknowledgeError && !acknowledged && (
            <p id="fasting-ack-error" role="alert" className="mt-3 flex items-center gap-2 text-sm text-status-significantHigh">
              <AlertIcon className="shrink-0" />
              Please confirm you've read this before continuing.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
