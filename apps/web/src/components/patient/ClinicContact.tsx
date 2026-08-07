import { useEffect, useState } from 'react';
import { useClinicContact } from '../../lib/patientPortal';
import { MailIcon, PhoneIcon, PinIcon } from '../nav/patientIcons';

/**
 * The clinic's phone, email and address. Rendered twice on every patient
 * screen by design: pinned to the bottom of the sidebar (compact) and again
 * beside anything out of range (card). Someone who has just read that a
 * result sits outside the usual range should not then have to go looking for
 * a way to ask about it.
 *
 * The phone row is conditional — see the server's clinicContact.ts. Until
 * CLINIC_PHONE is set there is no phone number to show, and a dead "call us"
 * affordance is worse than an email address that works.
 */

function AddressBlock({ lines }: { lines: string[] }) {
  return (
    <address className="not-italic">
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

const OPEN_KEY = 'aspire_patient_contact_open';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
    >
      <path d="M4 6.5 L8 10.5 L12 6.5" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Sidebar footer variant — one compact row that opens in place.
 *
 * It was a permanently-expanded card, and at a normal window height it took
 * roughly half the sidebar: the navigation, which is what a sidebar is for,
 * was squeezed into a scrolling strip below it. The details still have to be
 * one action away — someone who has just read that a result is out of range
 * should not go hunting for a phone number — but "one action away" and
 * "permanently occupying half the column" are not the same requirement.
 *
 * Open state persists, so a patient who wants the number visible keeps it
 * visible across pages and sessions. Expanding in place rather than in a
 * popover on purpose: the same component has to work inside the mobile
 * drawer, where a floating layer would have nowhere sensible to go.
 */
export function ClinicContactPanel() {
  const contact = useClinicContact();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      /* a locked-down browser losing the preference is not worth a broken render */
    }
  }, [open]);

  if (!contact) return null;

  return (
    // A flex column so the details below can be the one thing in the whole
    // sidebar that ever takes a scrollbar. On any ordinary window it doesn't:
    // there is room for the card and the account row under it both. On a
    // genuinely short one the card scrolls inside its own border and the row
    // stays put — which is the right thing to give up, because the row is a
    // name and a sign-out and the card is four lines of reference detail.
    <div className="flex min-h-0 flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="clinic-contact-details"
        className="flex w-full shrink-0 items-center gap-2.5 rounded-input px-2.5 py-2 text-left text-[13px] font-medium text-espresso/85 transition-colors duration-150 ease-out hover:bg-cream-200 hover:text-espresso"
      >
        <PhoneIcon className="shrink-0 text-bronze-700" />
        <span className="min-w-0 flex-1 truncate">Contact the clinic</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          id="clinic-contact-details"
          className="scroll-thin mt-2 min-h-0 overflow-y-auto rounded-card border border-taupe bg-cream-100 p-3.5 motion-safe:animate-riseIn"
        >
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-espresso">
            {contact.phone && (
              <li className="flex items-start gap-2">
                <PhoneIcon className="mt-0.5 shrink-0 text-bronze-700" />
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="rounded-sm underline-offset-2 hover:underline">
                  {contact.phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2">
              <MailIcon className="mt-0.5 shrink-0 text-bronze-700" />
              <a href={`mailto:${contact.email}`} className="break-all rounded-sm underline-offset-2 hover:underline">
                {contact.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <PinIcon className="mt-0.5 shrink-0 text-bronze-700" />
              <AddressBlock lines={contact.addressLines} />
            </li>
          </ul>
          <p className="mt-3 border-t border-taupe pt-2.5 text-[12px] leading-relaxed text-espresso/80">
            {contact.hours}. {contact.emergencyNote}
          </p>
        </div>
      )}
    </div>
  );
}

/** In-page variant — larger targets, used on Overview next to anything needing attention. */
export function ClinicContactCard({ className = '' }: { className?: string }) {
  const contact = useClinicContact();
  if (!contact) return null;

  return (
    <div className={`card p-6 sm:p-8 ${className}`}>
      <p className="eyebrow mb-3">Talk to someone</p>
      <p className="text-reading leading-relaxed text-espresso">
        Your GP knows your full history and is the right first call about any result. The Aspire clinical team can
        also talk you through what you're looking at.
      </p>
      <ul className="mt-5 flex flex-col gap-3 text-reading text-espresso">
        {contact.phone && (
          <li className="flex items-center gap-2.5">
            <PhoneIcon className="shrink-0 text-bronze-700" />
            <a
              href={`tel:${contact.phone.replace(/\s/g, '')}`}
              className="rounded-sm font-medium underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          </li>
        )}
        <li className="flex items-center gap-2.5">
          <MailIcon className="shrink-0 text-bronze-700" />
          <a href={`mailto:${contact.email}`} className="break-all rounded-sm font-medium underline-offset-4 hover:underline">
            {contact.email}
          </a>
        </li>
        <li className="flex items-start gap-2.5">
          <PinIcon className="mt-1 shrink-0 text-bronze-700" />
          <AddressBlock lines={contact.addressLines} />
        </li>
      </ul>
      <p className="mt-5 border-t border-taupe pt-4 text-sm leading-relaxed text-espresso/80">
        {contact.hours}. {contact.emergencyNote}
      </p>
    </div>
  );
}
