import { useState } from 'react';
import { RESULT_TYPE_RULES, FOOD_SENSITIVITY_GROUPS } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import type { SummaryCategory } from './ResultsSummary';

/**
 * Everything on a report that is not a blood measurement.
 *
 * Signature carries 207 food-sensitivity items and around 32 genetic
 * indicators. Dropped into the same grid as the ~120 real blood markers they
 * would outnumber them two to one, and every single one would look exactly as
 * clinical as a potassium — which is the actual harm here, not the clutter.
 * A patient scanning a page cannot be expected to work out that "Casein" and
 * "Creatinine" are answers to completely different kinds of question.
 *
 * So each type gets its own section, below the results, with framing that says
 * plainly what it is and is not. None of them carries a status, a tint, a
 * reference range, a trend or a place in the counts.
 */

export interface NonMeasuredMarker {
  markerId: string;
  name: string;
  value: number | null;
  valueText?: string | null;
  unit: string;
  resultType?: string;
  categoryKeys?: string[];
}

function SectionFraming({ title, framing }: { title: string; framing: string }) {
  return (
    <>
      <h2 className="font-display text-2xl leading-tight text-espresso sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-reading leading-relaxed text-espresso/90">{framing}</p>
    </>
  );
}

/** The result itself, in whatever form it came: a risk category, a level, a proportion. */
function PlainResult({ marker }: { marker: NonMeasuredMarker }) {
  const shown = marker.valueText ?? (marker.value !== null ? `${marker.value}${marker.unit ? ` ${marker.unit}` : ''}` : null);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-taupe py-2.5 last:border-b-0">
      <p className="text-sm text-espresso">{marker.name}</p>
      {/* No tint and no status badge, on purpose — there is no reference range
          behind any of these, so there is nothing for a colour to mean. */}
      <p className="tabular shrink-0 text-sm font-medium text-espresso">{shown ?? 'Not reported'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Genetic indicators
// ---------------------------------------------------------------------------

export function GeneticSection({
  markers,
  categories,
}: {
  markers: NonMeasuredMarker[];
  categories: SummaryCategory[];
}) {
  if (markers.length === 0) return null;
  const areas = categories
    .filter((c) => c.resultType === 'GENETIC')
    .map((c) => ({ c, members: markers.filter((m) => m.categoryKeys?.includes(c.key)) }))
    .filter((a) => a.members.length > 0);
  // Anything whose category didn't come through still has to render — a result
  // that exists but has nowhere to go is the one outcome worse than clutter.
  const grouped = new Set(areas.flatMap((a) => a.members.map((m) => m.markerId)));
  const ungrouped = markers.filter((m) => !grouped.has(m.markerId));

  return (
    <section className="mt-16" aria-labelledby="genetic-heading">
      <div id="genetic-heading">
        <SectionFraming title="Genetic indicators" framing={RESULT_TYPE_RULES.GENETIC.framing} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {areas.map(({ c, members }) => (
          <Card key={c.key} padding="tight">
            <p className="eyebrow mb-3">{c.name}</p>
            {members.map((m) => (
              <PlainResult key={m.markerId} marker={m} />
            ))}
          </Card>
        ))}
        {ungrouped.length > 0 && (
          <Card padding="tight">
            <p className="eyebrow mb-3">Other genetic indicators</p>
            {ungrouped.map((m) => (
              <PlainResult key={m.markerId} marker={m} />
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Microbiome composition
// ---------------------------------------------------------------------------

export function CompositionSection({
  markers,
  categories,
}: {
  markers: NonMeasuredMarker[];
  categories: SummaryCategory[];
}) {
  if (markers.length === 0) return null;
  const areas = categories
    .filter((c) => c.resultType === 'COMPOSITION')
    .map((c) => ({ c, members: markers.filter((m) => m.categoryKeys?.includes(c.key)) }))
    .filter((a) => a.members.length > 0);
  const grouped = new Set(areas.flatMap((a) => a.members.map((m) => m.markerId)));
  const ungrouped = markers.filter((m) => !grouped.has(m.markerId));

  return (
    <section className="mt-16" aria-labelledby="composition-heading">
      <div id="composition-heading">
        <SectionFraming title="Gut microbiome" framing={RESULT_TYPE_RULES.COMPOSITION.framing} />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {areas.map(({ c, members }) => (
          <Card key={c.key} padding="tight">
            <p className="eyebrow mb-3">{c.name}</p>
            {members.map((m) => (
              <PlainResult key={m.markerId} marker={m} />
            ))}
          </Card>
        ))}
        {ungrouped.length > 0 && (
          <Card padding="tight">
            <p className="eyebrow mb-3">Other composition measures</p>
            {ungrouped.map((m) => (
              <PlainResult key={m.markerId} marker={m} />
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Food sensitivity
// ---------------------------------------------------------------------------

/**
 * 207 items across nine food groups, collapsed by default.
 *
 * Collapsed because of the size and because of what it is: expanded, it is by
 * some distance the longest thing on the page, and it is the part of the
 * report with the least established clinical meaning. Opening every group by
 * default would make the least interpretable section the most prominent one.
 */
export function SensitivitySection({ markers }: { markers: NonMeasuredMarker[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (markers.length === 0) return null;

  const byName = new Map(markers.map((m) => [m.name, m]));
  const groups = FOOD_SENSITIVITY_GROUPS.map((g) => ({
    ...g,
    // The catalogue suffixes each food "(IgG)" so it can never collide with a
    // blood analyte of the same name; the patient sees the food.
    items: g.items.map((food) => ({ food, marker: byName.get(`${food} (IgG)`) })).filter((i) => i.marker),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="mt-16" aria-labelledby="sensitivity-heading">
      <div id="sensitivity-heading">
        <SectionFraming title="Food sensitivity" framing={RESULT_TYPE_RULES.SENSITIVITY.framing} />
      </div>
      <p className="mt-3 text-sm text-espresso/80">
        {total} food{total === 1 ? '' : 's'} across {groups.length} group{groups.length === 1 ? '' : 's'}.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {groups.map((g) => {
          const isOpen = open.has(g.key);
          const panelId = `sensitivity-${g.key}`;
          return (
            <div key={g.key} className="rounded-card border border-taupe bg-cream-50">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex min-h-tap w-full items-center justify-between gap-4 px-5 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
              >
                <span className="font-display text-lg leading-tight text-espresso">{g.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular text-xs text-espresso/80">{g.items.length}</span>
                  <svg
                    width="12"
                    height="8"
                    viewBox="0 0 12 8"
                    aria-hidden="true"
                    className={`transition duration-150 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-espresso/80" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <div id={panelId} className="grid grid-cols-1 gap-x-8 border-t border-taupe px-5 py-2 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map(({ food, marker }) => (
                    <PlainResult key={marker!.markerId} marker={{ ...marker!, name: food }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
