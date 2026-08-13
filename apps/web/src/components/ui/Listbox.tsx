import { useEffect, useMemo, useRef, useState } from 'react';
import { brand } from '@aspire-bloods/shared';

export interface ListboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * The heading this option sits under, where a picker holds two vocabularies.
   *
   * Optional, and absent on almost every picker in the product — a list of one
   * kind of thing does not need to be told it is one kind of thing. It exists
   * for the results page's Category filter, which offers result types and
   * health areas in one control: "Food sensitivity" and "Kidney health" are
   * both answers to "narrow this page", and they are not the same KIND of
   * answer. Ungrouped options come first, in the order they were given.
   */
  group?: string;
}

interface ListboxProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  /** Adds a filter field at the top of the popover — for long lists (the marker picker especially). */
  searchable?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  required?: boolean;
}

/**
 * A fully custom single-select listbox — native <select> can't be styled
 * (brief §3.3: "looks like Windows 98 when open"), so this replaces it
 * everywhere rather than trying to reskin it. Follows the WAI-ARIA
 * listbox-button pattern: trigger button + popover listbox, full arrow-key
 * navigation, type-ahead when not searchable, an in-panel filter field when
 * it is, Home/End, Escape-to-close-and-return-focus.
 */
export function Listbox({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  error,
  searchable,
  className = '',
  required,
  ...aria
}: ListboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef({ buffer: '', lastKeyAt: 0 });

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const selected = options.find((o) => o.value === value);

  /**
   * The visible options in runs, so a heading can be drawn where the run
   * changes — while every option keeps its FLAT index.
   *
   * That split is the whole of it: the flat index is what arrow keys, type-
   * ahead, `aria-activedescendant` and `commit()` all address an option by, and
   * a grouped render that renumbered them would break every one of those at
   * once. Nothing below reads a group for anything except a heading.
   */
  const runs = useMemo(() => {
    const out: { group: string | null; items: { option: ListboxOption; index: number }[] }[] = [];
    filteredOptions.forEach((option, index) => {
      const group = option.group ?? null;
      const last = out[out.length - 1];
      if (!last || last.group !== group) out.push({ group, items: [] });
      out[out.length - 1].items.push({ option, index });
    });
    return out;
  }, [filteredOptions]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
    setActiveIndex(selectedIndex);
    // Focus the filter field if searchable, otherwise the list itself so arrow keys work immediately.
    //
    // preventScroll, because focus() scrolls its target into view by default
    // and the target here is a popover that opens BELOW the trigger — so on
    // any picker in the lower half of a window, merely opening it scrolled the
    // page by several hundred pixels. The trigger the reader just pressed is
    // already where they are looking; nothing about opening a menu should move
    // the page underneath it.
    (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true });

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // NOT `[query, open]`, and that is the whole of a real bug.
  //
  // Filtering has to put the cursor back on the first match, which is what
  // this is for. With `open` in the deps it ALSO ran on every open, one tick
  // after the effect above had carefully set the cursor to the SELECTED
  // option — so every listbox in the product opened on its first option
  // instead. Invisible on a five-item picker and not at all invisible on the
  // date field's year list, which opens 120 deep: the menu appeared at 2026
  // with the year actually selected nowhere on screen.
  //
  // Keyed on the query alone. The open effect sets it to '' before this can
  // see anything, so the two no longer race.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    // Only where the list is actually scrollable. `block: 'nearest'` walks up
    // to the nearest scrollport, and on a short list that is the PAGE — so
    // keeping the active option in view scrolled the document instead of the
    // menu, which is never what was being asked for.
    if (!list || list.scrollHeight <= list.clientHeight) return;
    list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function commit(index: number) {
    const opt = filteredOptions[index];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(delta: number) {
    setActiveIndex((i) => {
      const count = filteredOptions.length;
      if (count === 0) return 0;
      let next = i;
      for (let step = 0; step < count; step++) {
        next = (next + delta + count) % count;
        if (!filteredOptions[next].disabled) return next;
      }
      return i;
    });
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(filteredOptions.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
          // Native-select-style type-ahead: accumulate recent keystrokes, jump to the first match.
          const now = Date.now();
          const buf = now - typeaheadRef.current.lastKeyAt > 700 ? e.key : typeaheadRef.current.buffer + e.key;
          typeaheadRef.current = { buffer: buf, lastKeyAt: now };
          const match = filteredOptions.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(buf.toLowerCase()));
          if (match >= 0) setActiveIndex(match);
        }
    }
  }

  /** One option, addressed by its FLAT index whatever run it is drawn in. */
  function renderOption(opt: ListboxOption, i: number) {
    return (
      <li
        key={opt.value}
        id={`${id ?? 'listbox'}-opt-${i}`}
        data-index={i}
        role="option"
        aria-selected={opt.value === value}
        onMouseEnter={() => setActiveIndex(i)}
        onClick={() => commit(i)}
        className={`mx-1 flex cursor-pointer items-center justify-between rounded-input px-3 py-2.5 text-sm transition-colors duration-100 ${
          opt.disabled
            ? 'cursor-not-allowed text-espresso/40'
            : i === activeIndex
              ? 'bg-bronze text-onaccent'
              : opt.value === value
                ? 'text-bronze-700 font-medium'
                : 'text-espresso'
        }`}
      >
        <span className="truncate">{opt.label}</span>
        {opt.value === value && (
          <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true" className="shrink-0">
            <path
              d="M1 5L4.5 8.5L11 1"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </li>
    );
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-invalid={!!error}
        {...aria}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={`input-base flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-cream-300 disabled:text-espresso/40 ${error ? 'border-status-significantHigh' : ''} ${className}`}
      >
        <span className={`truncate ${selected ? 'text-espresso' : 'text-espresso/40'}`}>{selected ? selected.label : placeholder}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" className={`shrink-0 transition duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1.5L6 6.5L11 1.5" stroke={brand.bronze} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={value} />}

      {open && (
        <div
          className="chrome absolute left-0 top-[calc(100%+6px)] z-40 flex max-h-72 w-full min-w-[14rem] flex-col overflow-hidden rounded-card border border-taupe bg-cream-50 shadow-popover motion-safe:animate-riseIn"
          onKeyDown={handleListKeyDown}
        >
          {searchable && (
            <div className="border-b border-taupe p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Filter options"
                className="w-full rounded-input border border-taupe bg-white px-3 py-1.5 text-sm text-espresso outline-none focus:border-bronze"
              />
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={filteredOptions[activeIndex] ? `${id ?? 'listbox'}-opt-${activeIndex}` : undefined}
            className="scroll-thin flex-1 overflow-y-auto py-1"
          >
            {filteredOptions.length === 0 && <li className="px-3.5 py-2.5 text-sm text-espresso/80">No matches</li>}
            {runs.map((run, r) =>
              run.group === null ? (
                run.items.map(({ option, index }) => renderOption(option, index))
              ) : (
                // A real `role="group"` with its own name rather than a bare
                // heading row: a heading that is only text is a heading only a
                // sighted reader gets, and the whole reason this control holds
                // two vocabularies is that they are different KINDS of answer.
                <li key={`group-${r}`} role="presentation">
                  <ul role="group" aria-label={run.group}>
                    <li
                      role="presentation"
                      className="eyebrow px-3.5 pb-1 pt-2.5 text-espresso/80"
                      // Named on the group above; drawn here. Announcing it
                      // twice is how a list of five options reads as ten.
                      aria-hidden="true"
                    >
                      {run.group}
                    </li>
                    {run.items.map(({ option, index }) => renderOption(option, index))}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
