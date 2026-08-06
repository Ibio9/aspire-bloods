import { PinIcon } from '../../../components/nav/patientIcons';
import { SHARED_LOCATION_TRUTH } from '../../../lib/booking/catalogue';
import { addOnsRedirectedAt } from '../../../lib/booking/prep';
import type { AddOn, BookingLocation } from '../../../lib/booking/types';
import { AlertIcon, ClinicIcon, HomeKitIcon, TickIcon, VialIcon } from '../bookingIcons';

/**
 * Step two — where the sample is taken.
 *
 * The difference between the two options is entirely practical, so it is laid
 * out as facts in the same order for both rather than as two paragraphs of
 * persuasion: who takes the sample, how long it takes, when you can come, how
 * the sample gets to the lab, and which add-ons the site can handle. Someone
 * can read down either column and compare like for like.
 *
 * The one thing that does *not* differ is stated once, above the choice —
 * whichever clinic draws the blood, an Aspire clinician reviews the result
 * before it is published. Without that, choosing the convenient option can
 * read as choosing a lesser standard of care.
 */

interface ChooseLocationProps {
  locations: BookingLocation[];
  selectedAddOns: AddOn[];
  locationId: string | null;
  onChange: (id: string) => void;
}

export function ChooseLocation({ locations, selectedAddOns, locationId, onChange }: ChooseLocationProps) {
  const aspire = locations.filter((l) => l.kind === 'ASPIRE_CLINIC');
  const randox = locations.filter((l) => l.kind === 'RANDOX_CLINIC');
  const selected = locations.find((l) => l.id === locationId) ?? null;
  const redirected = addOnsRedirectedAt(selected, selectedAddOns);

  return (
    <div className="flex flex-col gap-12 md:gap-14">
      <p className="max-w-2xl rounded-card border border-taupe bg-cream-100 p-5 text-[15px] leading-relaxed text-espresso sm:p-6">
        {SHARED_LOCATION_TRUTH}
      </p>

      {/* ── the comparison ──────────────────────────────────────────────── */}
      <section aria-labelledby="difference-heading">
        <h2 id="difference-heading" className="font-display text-2xl leading-tight text-espresso sm:text-3xl">
          What actually differs
        </h2>
        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
          {aspire[0] && <FactColumn location={aspire[0]} heading="Aspire, Mortimer Street" icon={<VialIcon className="text-bronze-700" />} />}
          {randox[0] && <FactColumn location={randox[0]} heading="A Randox clinic" icon={<ClinicIcon className="text-bronze-700" />} />}
        </div>
      </section>

      {/* ── the choice ──────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="font-display text-2xl leading-tight text-espresso sm:text-3xl">Pick a clinic</legend>

        <p className="eyebrow mt-8 mb-3">Aspire Clinic</p>
        <div className="grid grid-cols-1 gap-4">
          {aspire.map((l) => (
            <LocationOption key={l.id} location={l} checked={l.id === locationId} onSelect={() => onChange(l.id)} />
          ))}
        </div>

        <p className="eyebrow mb-3 mt-9">Randox Health clinics</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {randox.map((l) => (
            <LocationOption key={l.id} location={l} checked={l.id === locationId} onSelect={() => onChange(l.id)} />
          ))}
        </div>
      </fieldset>

      {/* An add-on the chosen site can't draw is never silently dropped — it
          is still ordered, and the consequence is stated where the choice was
          made rather than discovered on the confirmation. */}
      {redirected.length > 0 && (
        <div role="status" className="rounded-card border border-bronze/50 bg-bronze-50 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-medium text-espresso">
            <HomeKitIcon className="shrink-0 text-bronze-700" />
            {redirected.map((a) => a.name).join(' and ')} will come to you by post
          </p>
          <p className="mt-2 text-sm leading-relaxed text-espresso/90">
            {selected?.name} can't take that sample on site, so we'll post you a kit within two working days of
            booking. Your blood draw goes ahead exactly as planned, and nothing has been removed from your order.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── comparison column ──────────────────────────────────────────────────── */

function FactColumn({ location, heading, icon }: { location: BookingLocation; heading: string; icon: React.ReactNode }) {
  return (
    <div className="card p-6 sm:p-7">
      <p className="flex items-center gap-2.5 font-display text-xl leading-tight text-espresso">
        {icon}
        {heading}
      </p>
      <dl className="mt-5 flex flex-col divide-y divide-taupe">
        {location.facts.map((fact) => (
          <div key={fact.label} className="py-3 first:pt-0 last:pb-0">
            <dt className="eyebrow mb-1">{fact.label}</dt>
            <dd className="text-[15px] leading-relaxed text-espresso">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── location option ────────────────────────────────────────────────────── */

function LocationOption({ location, checked, onSelect }: { location: BookingLocation; checked: boolean; onSelect: () => void }) {
  const id = `location-${location.id}`;
  return (
    <label htmlFor={id} className="relative flex cursor-pointer flex-col rounded-card p-5 sm:p-6">
      <input
        id={id}
        type="radio"
        name="booking-location"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        onChange={onSelect}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-card border border-taupe bg-cream-50 shadow-card transition duration-150 ease-out peer-hover:border-bronze/60 peer-hover:shadow-card-hover peer-checked:border-2 peer-checked:border-bronze peer-checked:bg-bronze-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-4 flex h-6 w-6 scale-75 items-center justify-center rounded-full bg-bronze text-white opacity-0 transition duration-150 ease-out peer-checked:scale-100 peer-checked:opacity-100"
      >
        <TickIcon className="h-3.5 w-3.5" />
      </span>

      <span className="relative flex flex-col pr-8">
        <span className="font-display text-xl leading-tight text-espresso">{location.name}</span>
        <span className="mt-2 flex items-start gap-2 text-sm text-espresso/85">
          <PinIcon className="mt-0.5 shrink-0 text-bronze-700" />
          <span className="not-italic">{location.addressLines.join(', ')}</span>
        </span>
        <span className="mt-3 text-sm leading-relaxed text-espresso/85">{location.travelNote}</span>
        <span className="mt-3 text-sm font-medium text-espresso">{location.openingSummary}</span>
        {location.unavailableAddOnIds.length > 0 && (
          <span className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-espresso/80">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bronze-700" />
            Calprotectin is posted to you rather than taken here.
          </span>
        )}
      </span>
    </label>
  );
}
