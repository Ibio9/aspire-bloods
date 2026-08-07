import { useEffect, useMemo, useRef, useState } from 'react';
import { brand } from '@aspire-bloods/shared';

export interface ListboxOption {
  value: string;
  label: string;
  disabled?: boolean;
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

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
    setActiveIndex(selectedIndex);
    // Focus the filter field if searchable, otherwise the list itself so arrow keys work immediately.
    (searchable ? searchRef.current : listRef.current)?.focus();

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
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
          className="absolute left-0 top-[calc(100%+6px)] z-40 flex max-h-72 w-full min-w-[14rem] flex-col overflow-hidden rounded-card border border-taupe bg-cream-50 shadow-popover motion-safe:animate-riseIn"
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
            {filteredOptions.map((opt, i) => (
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
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
