import { Children, isValidElement, useMemo, type ChangeEvent, type ReactNode } from 'react';
import { Listbox, type ListboxOption } from './Listbox';

interface SelectProps {
  label: string;
  name?: string;
  id?: string;
  value: string;
  /** Kept as a native-change-event shape so existing call sites (`onChange={(e) => setX(e.target.value)}`)
   * didn't need to change when this moved off a real <select> onto the custom Listbox. */
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  optional?: boolean;
  error?: string;
  disabled?: boolean;
  /** Adds a filter field in the popover — use for long lists (the marker picker especially). */
  searchable?: boolean;
  /** Keeps the accessible name (still announced to screen readers) but removes the visible label —
   * for compact inline usage (e.g. a table cell or grid row) where a caption above every control
   * would be repetitive. Prefer a visible label whenever there's room for one. */
  hideLabel?: boolean;
  className?: string;
  /** Shown under the field, and the picker is force-disabled, when there are no real (non-placeholder)
   * options — e.g. "No patients to select — invite one first." Falls back to a generic message. */
  emptyMessage?: string;
  /** <option> elements, exactly as with a native select — parsed into Listbox options so every
   * existing call site (`<Select>...<option value="x">Label</option>...</Select>`) keeps working. */
  children: ReactNode;
}

/**
 * Renders an <option>'s children to plain text the way a browser would —
 * recursing into arrays and nested elements and concatenating directly,
 * NOT via String(node). String() on an array joins with a comma
 * (`String(['Ibrahim Malik', ' (', 'ibr@x.com', ')'])` → the label
 * rendering as "Ibrahim Malik, (,ibr@x.com,)"), which is exactly what a
 * JSX option like `<option>{name} ({email})</option>` produces: several
 * child nodes, not one string.
 */
function childrenToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return childrenToText(node.props.children);
  return '';
}

function optionsFromChildren(children: ReactNode): ListboxOption[] {
  const options: ListboxOption[] = [];
  // Children.toArray recursively flattens nested arrays and fragments — plain `Array.isArray(children)`
  // does not, so a call site that mixes a literal <option> with `{list.map(...)}` (very common —
  // every patient/panel/marker picker in this app does exactly that) would silently lose every
  // option from the .map() since it stays nested as children[1] = [opt1, opt2, ...] rather than
  // being spread into the top-level array.
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child)) continue;
    const value = child.props.value != null ? String(child.props.value) : '';
    const label = childrenToText(child.props.children) || value;
    options.push({ value, label, disabled: child.props.disabled });
  }
  return options;
}

export function Select({
  label,
  name,
  id,
  value,
  onChange,
  optional,
  error,
  disabled,
  searchable,
  hideLabel,
  emptyMessage,
  className = '',
  children,
}: SelectProps) {
  const fieldId = id ?? name;
  const options = useMemo(() => optionsFromChildren(children), [children]);
  // A lone placeholder ("" value) isn't a real choice — a picker with nothing selectable behind it
  // is a dead end that looks identical to a loading/broken state, so it's disabled and says so
  // rather than sitting there silently empty.
  const hasRealOptions = options.some((o) => o.value !== '');

  function handleChange(newValue: string) {
    onChange({ target: { value: newValue, name } } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-espresso'}>
        {label}
        {optional && <span className="font-normal text-espresso/80"> (optional)</span>}
      </label>
      <Listbox
        id={fieldId}
        name={name}
        value={value}
        onChange={handleChange}
        options={options}
        disabled={disabled || !hasRealOptions}
        error={!!error}
        required={!optional}
        searchable={searchable}
        className={className}
      />
      {!hasRealOptions && !error && (
        <p className="text-xs text-espresso/60">{emptyMessage ?? 'Nothing to select yet.'}</p>
      )}
      {error && <p className="text-sm text-status-significantHigh">{error}</p>}
    </div>
  );
}
