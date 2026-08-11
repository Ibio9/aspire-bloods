import { useEffect, useState } from 'react';
import { useClinicContact } from '../../lib/patientPortal';
import { MailIcon, PhoneIcon, PinIcon } from '../nav/patientIcons';

/**
 * The clinic's address, opening hours, emergency line and email — in ONE
 * component, rendered by every surface that shows them.
 *
 * That is the whole point of the file. The details used to be assembled
 * separately on each surface, so the sidebar, the out-of-range card, the PDF
 * footer and the seeded copy block had each drifted into their own comma-joined
 * arrangement of the same four facts. Four items comma-joined onto one line is
 * how "Aspire Clinic, Aspire Group of Companies, 27 Mortimer Street, London"
 * happened, and it is unreadable at exactly the moment it matters most:
 * somebody has just read that a result sits outside the usual range and is
 * looking for a way to ask about it.
 *
 * ONE ITEM PER LINE, everywhere, in one order: address, opening hours,
 * emergency line, email. The phone number joins the top of that list when
 * there is one — see the server's clinicContact.ts. Until CLINIC_PHONE is set
 * there is no number to show, and a dead "call us" affordance is worse than an
 * email address that works.
 */

/**
 * An email address with its own break opportunities, and no others.
 *
 * `break-all` is what this used to carry, and `break-all` gives the browser
 * permission to break between ANY two characters — so a 250px column split
 * "clinical-team@theaspireclinic.com" as "theaspireclinic." / "com" and the
 * address stopped being readable as an address. `break-word` is no better
 * here: an email is one unbroken word, so it either overflows the card or
 * breaks at an arbitrary letter.
 *
 * An address has exactly three kinds of place a reader will accept a line
 * ending: after the `@`, and after each dot in the domain. `<wbr>` marks those
 * and nothing else, so a narrow column breaks at a boundary that is part of
 * the address's own structure and a wide one does not break at all.
 *
 * Also used for the phone number, whose separators are spaces and which
 * therefore needs nothing beyond not being told to break anywhere.
 */
function BreakableAddress({ value }: { value: string }) {
  // Split AFTER each @ or dot, keeping the separator on the end of the piece
  // before it — a line ending in "@" or "." reads as continuing, whereas one
  // beginning with them reads as a typo.
  const pieces = value.split(/(?<=[@.])/);
  return (
    <>
      {pieces.map((piece, i) => (
        <span key={`${piece}-${i}`}>
          {piece}
          {i < pieces.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

/** The four (or five) lines, and the only place their order is decided. */
export function ClinicContactLines({
  className = '',
  size = 'default',
}: {
  className?: string;
  /** `compact` is the sidebar's density; `default` is everywhere with room. */
  size?: 'default' | 'compact';
}) {
  const contact = useClinicContact();
  if (!contact) return null;

  const text = size === 'compact' ? 'text-xs' : 'text-sm';
  const gap = size === 'compact' ? 'gap-2.5' : 'gap-3.5';

  return (
    // `break-words` on the list, never `break-all`: a long word that genuinely
    // has nowhere to break still stays inside the card rather than painting out
    // of it, but ordinary words are left alone. The email and the phone number
    // carry their own break points instead — see BreakableAddress.
    <ul className={`flex min-w-0 flex-col break-words ${gap} ${text} leading-relaxed text-espresso ${className}`}>
      {contact.phone && (
        <li className="flex items-start gap-2.5">
          <PhoneIcon className="mt-0.5 shrink-0 text-bronze-700" />
          <span className="min-w-0">
            <span className="eyebrow mb-0.5 block">Phone</span>
            <a
              href={`tel:${contact.phone.replace(/\s/g, '')}`}
              className="numeric rounded-input font-medium underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          </span>
        </li>
      )}

      <li className="flex items-start gap-2.5">
        <PinIcon className="mt-0.5 shrink-0 text-bronze-700" />
        <span className="min-w-0">
          <span className="eyebrow mb-0.5 block">Address</span>
          {/* Each line of the address on its own line too — a postal address
              is a stack, and joining it with commas to save two rows is how it
              stops looking like one. */}
          <address className="not-italic">
            <span className="block">{contact.name}</span>
            {contact.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </span>
      </li>

      <li className="flex items-start gap-2.5">
        <ClockIcon className="mt-0.5 shrink-0 text-bronze-700" />
        <span className="min-w-0">
          <span className="eyebrow mb-0.5 block">Opening hours</span>
          <span className="block">{contact.hours}</span>
        </span>
      </li>

      <li className="flex items-start gap-2.5">
        <PhoneLineIcon className="mt-0.5 shrink-0 text-bronze-700" />
        <span className="min-w-0">
          <span className="eyebrow mb-0.5 block">Emergency line</span>
          <span className="block">{contact.emergencyNote}</span>
        </span>
      </li>

      <li className="flex items-start gap-2.5">
        <MailIcon className="mt-0.5 shrink-0 text-bronze-700" />
        <span className="min-w-0">
          <span className="eyebrow mb-0.5 block">Email</span>
          <a
            href={`mailto:${contact.email}`}
            className="block rounded-input font-medium underline-offset-4 hover:underline"
          >
            <BreakableAddress value={contact.email} />
          </a>
        </span>
      </li>
    </ul>
  );
}

/** Opening hours. Outline only, at the same weight as the other three. */
function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8l2.5 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The emergency line. A handset, deliberately not a warning triangle: nothing
 * on a results screen escalates, and this is a phone number for a situation,
 * not an alarm about the results above it.
 */
function PhoneLineIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.2 4.1c0 5.4 4.3 9.7 9.7 9.7l1.9-1.9-2.9-1.9-1.6 1.1a10.8 10.8 0 0 1-3.5-3.5l1.1-1.6L5 3.1 3.1 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
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
        className="flex w-full shrink-0 items-center gap-2.5 rounded-input px-2.5 py-2 text-left text-sm font-medium text-espresso/85 transition-colors duration-150 ease-out hover:bg-cream-200 hover:text-espresso"
      >
        <PhoneIcon className="shrink-0 text-bronze-700" />
        <span className="min-w-0 flex-1 truncate">Contact the clinic</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          id="clinic-contact-details"
          className="scroll-thin mt-2 min-h-0 overflow-y-auto rounded-card border border-taupe bg-cream-100 p-4 motion-safe:animate-riseIn"
        >
          <ClinicContactLines size="compact" />
        </div>
      )}
    </div>
  );
}

/**
 * In-page variant — larger targets, used beside anything out of range and on
 * Overview's empty state.
 *
 * The card carries the ordinary hairline border in the warm neutral tone. It
 * is deliberately not outlined in red: the tinted fill on the result itself
 * already says the result is out of range, and a red box drawn around a phone
 * number reads as an emergency rather than as a way to ask a question.
 */
export function ClinicContactCard({ className = '' }: { className?: string }) {
  const contact = useClinicContact();
  if (!contact) return null;

  return (
    // `p-7` at every width, not `p-7 sm:p-9`. The padding step is keyed to the
    // VIEWPORT and this card lives in the narrowest column on the page — a
    // third of the content width beside the out-of-range results — so a 1440px
    // window was spending 72px of a ~350px column on padding and squeezing the
    // address into what was left. `min-w-0` so a long line can wrap rather than
    // widening the card past its grid track.
    <div className={`card min-w-0 p-7 ${className}`}>
      <p className="eyebrow mb-3">Talk to someone</p>
      <p className="max-w-measure text-reading leading-relaxed text-espresso">
        Your GP knows your full history and is the right first call about any result. The Aspire clinical team can
        also talk you through what you’re looking at.
      </p>
      <ClinicContactLines className="mt-7" />
    </div>
  );
}
