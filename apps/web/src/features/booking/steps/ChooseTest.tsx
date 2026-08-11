import type { AddOn, Panel } from '../../../lib/booking/types';
import { FoodOkIcon, HomeKitIcon, NoFoodIcon, TickIcon } from '../bookingIcons';

/**
 * Step one — which panel, and what to add alongside it.
 *
 * Each panel states three things a patient actually decides on: what it
 * covers, how many markers that comes to, and how long the results take. The
 * fasting requirement is on the card too, because it is a genuine constraint
 * on *when* someone can book, and finding out about it two steps later means
 * going back and starting the diary again.
 */

interface ChooseTestProps {
  panels: Panel[];
  addOns: AddOn[];
  panelId: string | null;
  onPanelChange: (id: string) => void;
  addOnIds: string[];
  onAddOnsChange: (ids: string[]) => void;
}

export function ChooseTest({ panels, addOns, panelId, onPanelChange, addOnIds, onAddOnsChange }: ChooseTestProps) {
  function toggleAddOn(id: string) {
    onAddOnsChange(addOnIds.includes(id) ? addOnIds.filter((a) => a !== id) : [...addOnIds, id]);
  }

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <fieldset>
        <legend className="sr-only">Choose a panel</legend>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {panels.map((panel) => (
            <PanelOption key={panel.id} panel={panel} checked={panel.id === panelId} onSelect={() => onPanelChange(panel.id)} />
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="add-ons-heading">
        {/* h2, not h3 — the page's h1 is the step title and there is no
            intervening level, so an h3 here would skip one. */}
        <h2 id="add-ons-heading" className="font-display text-xl leading-tight text-espresso sm:text-2xl">
          Add anything alongside it
        </h2>
        {/* Which of them share the draw and which arrives by post is on each
            card already, in its own row — it doesn't need saying twice. */}
        <p className="mt-3 max-w-2xl text-reading leading-relaxed text-espresso/90">
          These sit outside the standard panels and can be added to any of them.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {addOns.map((addOn) => (
            <AddOnOption
              key={addOn.id}
              addOn={addOn}
              checked={addOnIds.includes(addOn.id)}
              onToggle={() => toggleAddOn(addOn.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── panel ──────────────────────────────────────────────────────────────── */

function PanelOption({ panel, checked, onSelect }: { panel: Panel; checked: boolean; onSelect: () => void }) {
  const id = `panel-${panel.id}`;
  return (
    <label htmlFor={id} className="relative flex cursor-pointer flex-col rounded-card p-6 sm:p-8">
      <input
        id={id}
        type="radio"
        name="booking-panel"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        onChange={onSelect}
      />
      {/* Selection reads three ways at once: the bronze border thickens, the
          surface tints, and a filled tick appears in the corner. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-card border border-taupe bg-cream-50 shadow-card transition duration-150 ease-out peer-hover:border-bronze/60 peer-hover:shadow-card-hover peer-checked:border-2 peer-checked:border-bronze peer-checked:bg-bronze-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 flex h-6 w-6 scale-75 items-center justify-center rounded-full bg-bronze text-onaccent opacity-0 transition duration-150 ease-out peer-checked:scale-100 peer-checked:opacity-100"
      >
        <TickIcon className="h-3.5 w-3.5" />
      </span>

      <span className="relative flex flex-col">
        <span className="font-display text-xl leading-tight text-espresso sm:text-2xl">{panel.name}</span>
        <span className="mt-3 text-reading leading-relaxed text-espresso/90">{panel.strapline}</span>

        <span className="mt-6 block">
          <span className="eyebrow">What it covers</span>
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            {panel.covers.map((c) => (
              <span key={c} className="rounded-full border border-taupe bg-white px-2.5 py-1 text-xs text-espresso">
                {c}
              </span>
            ))}
          </span>
        </span>

        <span className="mt-6 grid grid-cols-2 gap-4 border-t border-taupe pt-5">
          <span className="block">
            <span className="eyebrow">Markers</span>
            <span className="tabular mt-1 block text-xl text-espresso">{panel.markerCount}</span>
          </span>
          <span className="block">
            <span className="eyebrow">Results in</span>
            <span className="mt-1 block text-reading font-medium text-espresso">{panel.turnaround}</span>
          </span>
        </span>
        {panel.markerCountNote && <span className="mt-2 block text-xs text-espresso/80">{panel.markerCountNote}</span>}

        <FastingBadge panel={panel} className="mt-5" />
      </span>
    </label>
  );
}

/**
 * The fasting flag, on the card, at the moment of choosing. It is a real
 * constraint on which appointments are workable, so burying it until the
 * preparation step would mean discovering it after picking a 3pm slot.
 */
function FastingBadge({ panel, className = '' }: { panel: Panel; className?: string }) {
  if (!panel.fasting.required) {
    return (
      <span className={`flex items-center gap-2 text-sm text-espresso/85 ${className}`}>
        <FoodOkIcon className="h-4 w-4 shrink-0 text-bronze-700" />
        No fasting needed
      </span>
    );
  }
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full bg-night px-3 py-1.5 text-xs font-medium text-oncolor ${className}`}>
      <NoFoodIcon className="h-3.5 w-3.5 shrink-0" />
      Fasting required: {panel.fasting.minHours}–{panel.fasting.maxHours} hours
    </span>
  );
}

/* ── add-on ─────────────────────────────────────────────────────────────── */

function AddOnOption({ addOn, checked, onToggle }: { addOn: AddOn; checked: boolean; onToggle: () => void }) {
  const id = `addon-${addOn.id}`;
  return (
    <label htmlFor={id} className="relative flex cursor-pointer flex-col rounded-card p-6 sm:p-7">
      <input
        id={id}
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        onChange={onToggle}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-card border border-taupe bg-cream-50 shadow-card transition duration-150 ease-out peer-hover:border-bronze/60 peer-checked:border-2 peer-checked:border-bronze peer-checked:bg-bronze-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze"
      />

      <span className="relative flex items-start gap-3.5">
        {/* The same box as ui/Checkbox, because this is one — a card-sized hit
            area does not make it a different control. Driven off the React
            `checked` prop rather than `peer-checked:`, which only reaches
            direct siblings of the input and would silently not apply here. */}
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-input border-[1.5px] transition duration-150 ease-out ${
            checked ? 'border-bronze bg-bronze' : 'border-taupe bg-white'
          }`}
        >
          <TickIcon
            className={`h-2.5 w-2.5 text-onaccent transition duration-150 ease-out ${checked ? 'opacity-100' : 'opacity-0'}`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg leading-tight text-espresso">{addOn.name}</span>
          <span className="mt-1.5 block text-sm font-medium text-espresso/90">{addOn.strapline}</span>
          <span className="mt-3 block text-sm leading-relaxed text-espresso/85">{addOn.detail}</span>
          <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-espresso/80">
            <span className="flex items-center gap-1.5">
              {addOn.sampleType === 'HOME_KIT' ? (
                <>
                  <HomeKitIcon className="h-3.5 w-3.5 shrink-0 text-bronze-700" />
                  Home kit, posted to you
                </>
              ) : (
                <>
                  <TickIcon className="h-3.5 w-3.5 shrink-0 text-bronze-700" />
                  Same draw, no extra appointment
                </>
              )}
            </span>
            <span className="tabular">
              Adds {addOn.addsTurnaroundDays} {addOn.addsTurnaroundDays === 1 ? 'day' : 'days'} to your results
            </span>
          </span>
          {addOn.timingNotes
            .filter((n) => n.critical)
            .map((n) => (
              <span key={n.label} className="mt-3 block rounded-input bg-cream-200 px-3 py-2 text-xs leading-relaxed text-espresso">
                <span className="font-medium">{n.label}.</span> {n.detail}
              </span>
            ))}
        </span>
      </span>
    </label>
  );
}
