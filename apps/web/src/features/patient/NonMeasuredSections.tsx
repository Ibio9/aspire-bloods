import { useMemo, useState } from 'react';
import { RESULT_TYPE_RULES, FOOD_SENSITIVITY_GROUPS } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { filterCountLabelFor, matchesMarkerQuery } from '../../lib/markerCopy';
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
  aliases?: string[];
}

function SectionFraming({ title, framing }: { title: string; framing: string }) {
  return (
    <>
      <h2 className="font-display text-xl leading-tight text-espresso sm:text-2xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-reading leading-relaxed text-espresso/90">{framing}</p>
    </>
  );
}

/**
 * Search and a group picker, scoped to one section.
 *
 * Deliberately not the filters at the top of the page. Those work on status
 * and health area, and a genetic indicator has neither — pointing a status
 * filter at a section that can never satisfy it would just make the section
 * look broken. These are the same two controls asking the questions this
 * content can actually answer, and they only ever touch their own section.
 *
 * Not optional at Signature's scale: 197 food items with no way to find one is
 * a list nobody can use.
 */
function SectionFilters({
  idPrefix,
  query,
  onQuery,
  group,
  onGroup,
  groups,
  groupLabel,
  placeholder,
  count,
}: {
  idPrefix: string;
  query: string;
  onQuery: (v: string) => void;
  group: string;
  onGroup: (v: string) => void;
  groups: { key: string; name: string }[];
  groupLabel: string;
  placeholder: string;
  count: string;
}) {
  return (
    <>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <Input
          label="Search"
          name={`${idPrefix}-search`}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          required={false}
        />
        {/* Offered only where there is more than one group to choose between —
            a picker with a single option is a control that can't do anything. */}
        {groups.length > 1 && (
          <Select label={groupLabel} name={`${idPrefix}-group`} value={group} onChange={(e) => onGroup(e.target.value)}>
            <option value="ALL">All</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="mt-4 text-sm text-espresso/80" role="status">
        {count}
      </p>
    </>
  );
}

/** The result itself, in whatever form it came: a risk category, a level, a proportion. */
function PlainResult({ marker }: { marker: NonMeasuredMarker }) {
  const shown = marker.valueText ?? (marker.value !== null ? `${marker.value}${marker.unit ? ` ${marker.unit}` : ''}` : null);
  return (
    // The same `.value-row` grid the previous-results list uses, with the third
    // column absent — a genetic indicator, a food sensitivity and a microbiome
    // proportion have no status, so there is nothing to put in it. Sharing the
    // primitive is the point: this was a wrapping flex row, which did not
    // overlap but did let the values wander left and right down the page
    // instead of forming a column. Grid gives it the same clean right edge.
    <div className="value-row border-b border-taupe py-2.5 last:border-transparent">
      <p className="text-sm text-espresso">{marker.name}</p>
      {/* No tint and no status badge, on purpose — there is no reference range
          behind any of these, so there is nothing for a colour to mean. */}
      <p className="value-row-value tabular text-sm font-medium text-espresso">{shown ?? 'Not reported'}</p>
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
  return (
    <CategorisedSection
      markers={markers}
      categories={categories}
      resultType="GENETIC"
      idPrefix="genetic"
      title="Genetic indicators"
      framing={RESULT_TYPE_RULES.GENETIC.framing}
      otherHeading="Other genetic indicators"
      noun="indicator"
      placeholder="MTHFR, lactose…"
    />
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
  return (
    <CategorisedSection
      markers={markers}
      categories={categories}
      resultType="COMPOSITION"
      idPrefix="composition"
      title="Gut microbiome"
      framing={RESULT_TYPE_RULES.COMPOSITION.framing}
      otherHeading="Other composition measures"
      noun="measure"
      placeholder="Firmicutes, diversity…"
    />
  );
}

// ---------------------------------------------------------------------------
// Qualitative results
// ---------------------------------------------------------------------------

/**
 * The UTI panel, the resting ECG, the body composition analyser and the
 * prostate cancer risk score — results that are a finding rather than an
 * amount. Same shape as the two above and for the same reason: no status, no
 * range, no tint, no trend, because none of the four means anything here.
 *
 * The UTI panel has a health area of its own and groups under it. The other
 * three sit inside health areas full of real analytes (heart health, personal
 * measurements, prostate health), which stay MEASURED — so those three fall
 * into the section's ungrouped bucket, which is exactly what it is for.
 */
export function QualitativeSection({
  markers,
  categories,
}: {
  markers: NonMeasuredMarker[];
  categories: SummaryCategory[];
}) {
  return (
    <CategorisedSection
      markers={markers}
      categories={categories}
      resultType="QUALITATIVE"
      idPrefix="qualitative"
      title="Findings and readings"
      framing={RESULT_TYPE_RULES.QUALITATIVE.framing}
      otherHeading="Other findings and readings"
      noun="result"
      placeholder="E. coli, ECG…"
    />
  );
}

/**
 * Genetic indicators, microbiome composition and qualitative findings, which
 * are the same shape: a list of named results grouped by health area, with no
 * status, no reference range, no tint and no trend — because none of the four
 * means anything for any of them.
 *
 * One component rather than three near-identical ones, since the only real
 * differences are the words.
 */
function CategorisedSection({
  markers,
  categories,
  resultType,
  idPrefix,
  title,
  framing,
  otherHeading,
  noun,
  placeholder,
}: {
  markers: NonMeasuredMarker[];
  categories: SummaryCategory[];
  resultType: string;
  idPrefix: string;
  title: string;
  framing: string;
  otherHeading: string;
  noun: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('ALL');

  const areas = useMemo(
    () => categories.filter((c) => c.resultType === resultType && markers.some((m) => m.categoryKeys?.includes(c.key))),
    [categories, markers, resultType],
  );

  const visible = useMemo(
    () =>
      markers.filter(
        (m) => matchesMarkerQuery(m, query) && (group === 'ALL' || (m.categoryKeys ?? []).includes(group)),
      ),
    [markers, query, group],
  );

  if (markers.length === 0) return null;

  const shownAreas = areas
    .map((c) => ({ c, members: visible.filter((m) => m.categoryKeys?.includes(c.key)) }))
    .filter((a) => a.members.length > 0);
  // Anything whose category didn't come through still has to render — a result
  // that exists but has nowhere to go is the one outcome worse than clutter.
  const grouped = new Set(shownAreas.flatMap((a) => a.members.map((m) => m.markerId)));
  const ungrouped = visible.filter((m) => !grouped.has(m.markerId));

  return (
    <section className="mt-16" aria-labelledby={`${idPrefix}-heading`}>
      <div id={`${idPrefix}-heading`}>
        <SectionFraming title={title} framing={framing} />
      </div>
      <SectionFilters
        idPrefix={idPrefix}
        query={query}
        onQuery={setQuery}
        group={group}
        onGroup={setGroup}
        groups={areas.map((c) => ({ key: c.key, name: c.name }))}
        groupLabel="Area"
        placeholder={placeholder}
        count={filterCountLabelFor(visible.length, markers.length, noun)}
      />
      {visible.length === 0 ? (
        <div className="mt-4 max-w-2xl">
          <EmptyState title="Nothing matches that search" />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {shownAreas.map(({ c, members }) => (
            <Card key={c.key} padding="tight">
              <p className="eyebrow mb-3">{c.name}</p>
              {members.map((m) => (
                <PlainResult key={m.markerId} marker={m} />
              ))}
            </Card>
          ))}
          {ungrouped.length > 0 && (
            <Card padding="tight">
              <p className="eyebrow mb-3">{otherHeading}</p>
              {ungrouped.map((m) => (
                <PlainResult key={m.markerId} marker={m} />
              ))}
            </Card>
          )}
        </div>
      )}
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
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('ALL');

  // The catalogue suffixes each food "(IgG)" so it can never collide with a
  // blood analyte of the same name; the patient sees the food.
  const allGroups = useMemo(() => {
    const byName = new Map(markers.map((m) => [m.name, m]));
    const groups = FOOD_SENSITIVITY_GROUPS.map((g) => ({
      key: g.key,
      name: g.name,
      items: g.items
        .map((food) => ({ food, marker: byName.get(`${food} (IgG)`) }))
        .filter((i): i is { food: string; marker: NonMeasuredMarker } => !!i.marker),
    })).filter((g) => g.items.length > 0);

    // Anything the lab reported that isn't in our nine groups still has to
    // appear. The shared group list is our own editorial arrangement of the
    // panel, not a contract with the laboratory — a food added to their assay,
    // or a spelling we haven't caught up with, would otherwise be paid for,
    // reported, and rendered nowhere at all. Same rule as CategorisedSection's
    // "Other" card above, and the same reason.
    const placed = new Set(groups.flatMap((g) => g.items.map((i) => i.marker.markerId)));
    const leftover = markers
      .filter((m) => !placed.has(m.markerId))
      .map((m) => ({ food: m.name.replace(/\s*\(IgG\)$/, ''), marker: m }))
      .sort((a, b) => a.food.localeCompare(b.food));
    if (leftover.length > 0) groups.push({ key: '__other', name: 'Other foods', items: leftover });

    return groups;
  }, [markers]);

  const total = allGroups.reduce((n, g) => n + g.items.length, 0);

  // Search matches the FOOD, which is the name the patient reads — matching
  // the catalogue's "Cow's Milk (IgG)" spelling would make "milk" find
  // nothing an ordinary reader can see.
  const groups = useMemo(
    () =>
      allGroups
        .filter((g) => group === 'ALL' || g.key === group)
        .map((g) => ({ ...g, items: g.items.filter((i) => matchesMarkerQuery({ name: i.food }, query)) }))
        .filter((g) => g.items.length > 0),
    [allGroups, group, query],
  );
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const filtering = query.trim() !== '' || group !== 'ALL';

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (markers.length === 0 || allGroups.length === 0) return null;

  return (
    <section className="mt-16" aria-labelledby="sensitivity-heading">
      <div id="sensitivity-heading">
        <SectionFraming title="Food sensitivity" framing={RESULT_TYPE_RULES.SENSITIVITY.framing} />
      </div>
      <p className="mt-3 text-sm text-espresso/80">
        {total} food{total === 1 ? '' : 's'} across {allGroups.length} group{allGroups.length === 1 ? '' : 's'}.
      </p>
      <SectionFilters
        idPrefix="sensitivity"
        query={query}
        onQuery={setQuery}
        group={group}
        onGroup={setGroup}
        groups={allGroups.map((g) => ({ key: g.key, name: g.name }))}
        groupLabel="Food group"
        placeholder="Wheat, almond, cow’s milk…"
        count={filterCountLabelFor(shown, total, 'food', 'foods')}
      />

      {groups.length === 0 && (
        <div className="mt-4 max-w-2xl">
          <EmptyState title="No foods match that search" />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {groups.map((g) => {
          // A search is a request to see the matches, so the groups holding
          // them open themselves. Collapsed-by-default is the right default
          // for 197 items and the wrong one for the four you just looked for.
          const isOpen = open.has(g.key) || filtering;
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
                <span className="font-display opsz-small text-lg leading-tight text-espresso">{g.name}</span>
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
                    <PlainResult key={marker.markerId} marker={{ ...marker, name: food }} />
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
