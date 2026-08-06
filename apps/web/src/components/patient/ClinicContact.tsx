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

/** Sidebar footer variant — quiet, tight, always present. */
export function ClinicContactPanel() {
  const contact = useClinicContact();
  if (!contact) return null;

  return (
    <div className="rounded-card border border-taupe bg-cream-100 p-4">
      <p className="eyebrow mb-2.5">Contact the clinic</p>
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
  );
}

/** In-page variant — larger targets, used on Overview next to anything needing attention. */
export function ClinicContactCard({ className = '' }: { className?: string }) {
  const contact = useClinicContact();
  if (!contact) return null;

  return (
    <div className={`card p-6 sm:p-8 ${className}`}>
      <p className="eyebrow mb-3">Talk to someone</p>
      <p className="text-[15px] leading-relaxed text-espresso">
        Your GP knows your full history and is the right first call about any result. The Aspire clinical team can
        also talk you through what you're looking at.
      </p>
      <ul className="mt-5 flex flex-col gap-3 text-[15px] text-espresso">
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
