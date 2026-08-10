import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { STATUS_FILTERS, type StatusFilter } from '../../lib/markerCopy';
import type { ResultsFilters } from './resultsView';

/**
 * The search box and the two filters, once, above the view switch.
 *
 * Same three controls, same vocabulary and same behaviour as the three screens
 * they replace — they change what is DISPLAYED and never what is fetched, they
 * compose, and they start clean on every visit. The only thing that has
 * actually changed is that there is now one of each instead of three, so
 * switching between the report you are reading, every marker you have had
 * tested, and a comparison of two of them keeps whatever you had typed.
 */
export function ResultsFilterBar({
  filters,
  onChange,
  categories,
  statusCounts,
}: {
  filters: ResultsFilters;
  onChange: (next: Partial<ResultsFilters>) => void;
  /** Only the areas the active view can return something for, plus whatever is currently chosen. */
  categories: { key: string; name: string }[];
  /** Counts beside each status option, from the active view's own marker set. */
  statusCounts?: Record<StatusFilter, number>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Input
        label="Find a marker"
        name="results-search"
        type="search"
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
        // The abbreviation is the only name most people know, and search
        // matches aliases as well as the printed name.
        placeholder="Ferritin, ALT, TSH…"
        // A filter, not a form field — Input marks required by default.
        required={false}
      />
      <Select
        label="Show"
        name="results-status-filter"
        value={filters.statusFilter}
        onChange={(e) => onChange({ statusFilter: e.target.value as StatusFilter })}
      >
        {STATUS_FILTERS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.value === 'ALL' || !statusCounts ? f.label : `${f.label} (${statusCounts[f.value]})`}
          </option>
        ))}
      </Select>
      <Select
        label="Health area"
        name="results-category-filter"
        value={filters.categoryFilter}
        onChange={(e) => onChange({ categoryFilter: e.target.value })}
      >
        <option value="ALL">All health areas</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
