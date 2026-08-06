import { useEffect, useId, useRef, useState } from 'react';

interface DateFieldProps {
  label: string;
  name?: string;
  /** ISO date string, YYYY-MM-DD, or '' for no selection. */
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  error?: string;
  hint?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplay(value: string): string {
  const date = parseISODate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Monday-first grid of Date objects covering the full weeks of the given month. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

/**
 * Replaces the native <input type="date"> (brief §3.5) — its calendar icon
 * and dd/mm/yyyy placeholder read as unfinished. This is a trigger button
 * (shows the formatted date, or a placeholder) that opens an on-brand
 * month-grid popover: arrow keys move a day at a time, PageUp/PageDown
 * change month, Home/End jump to the start/end of the week, Enter selects.
 */
export function DateField({ label, name, value, onChange, optional, error, hint, min, max, disabled }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const [focusedDate, setFocusedDate] = useState(() => selected ?? new Date());
  const fieldId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const minDate = min ? parseISODate(min) : null;
  const maxDate = max ? parseISODate(max) : null;

  function isDisabled(d: Date): boolean {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setViewDate(base);
    setFocusedDate(base);

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>('[data-focused="true"]')?.focus();
  }, [open, focusedDate]);

  function commit(d: Date) {
    if (isDisabled(d)) return;
    onChange(toISODate(d));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(days: number) {
    setFocusedDate((d) => {
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
      setViewDate(next);
      return next;
    });
  }

  function handleGridKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); moveFocus(1); break;
      case 'ArrowLeft': e.preventDefault(); moveFocus(-1); break;
      case 'ArrowDown': e.preventDefault(); moveFocus(7); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(-7); break;
      case 'PageUp':
        e.preventDefault();
        setFocusedDate((d) => {
          const next = new Date(d.getFullYear(), d.getMonth() + (e.shiftKey ? -12 : -1), d.getDate());
          setViewDate(next);
          return next;
        });
        break;
      case 'PageDown':
        e.preventDefault();
        setFocusedDate((d) => {
          const next = new Date(d.getFullYear(), d.getMonth() + (e.shiftKey ? 12 : 1), d.getDate());
          setViewDate(next);
          return next;
        });
        break;
      case 'Home': e.preventDefault(); moveFocus(-((focusedDate.getDay() + 6) % 7)); break;
      case 'End': e.preventDefault(); moveFocus(6 - ((focusedDate.getDay() + 6) % 7)); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(focusedDate);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const today = new Date();
  const todayISO = toISODate(today);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/80"> (optional)</span>}
      </label>
      {hint && <p className="-mt-1 text-xs text-espresso/80">{hint}</p>}

      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={!optional}
        aria-invalid={!!error}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`input-base flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-cream-300 disabled:text-espresso/40 ${error ? 'border-status-significantHigh' : ''}`}
      >
        <span className={value ? 'tabular text-espresso' : 'text-espresso/40'}>{value ? formatDisplay(value) : 'Select date…'}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-bronze">
          <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={value} />}

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-72 rounded-card border border-taupe bg-cream-50 p-3 shadow-popover motion-safe:animate-riseIn"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="rounded-full p-1.5 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M7 1L2 5l5 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <p className="text-sm font-medium text-espresso">
              {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="rounded-full p-1.5 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M3 1l5 4-5 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d} className="text-xs font-medium text-espresso/60">
                {d}
              </span>
            ))}
          </div>
          <div ref={gridRef} role="grid" onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-y-1 text-center">
            {grid.map((d) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === viewDate.getMonth();
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              const isFocused = iso === toISODate(focusedDate);
              const disabledDay = isDisabled(d);
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  data-focused={isFocused}
                  tabIndex={isFocused ? 0 : -1}
                  aria-selected={isSelected}
                  aria-disabled={disabledDay}
                  disabled={disabledDay}
                  onClick={() => commit(d)}
                  onFocus={() => setFocusedDate(d)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular transition-colors duration-100 ${
                    disabledDay
                      ? 'cursor-not-allowed text-espresso/25'
                      : isSelected
                        ? 'bg-bronze text-white'
                        : isFocused
                          ? 'bg-cream-300 text-espresso'
                          : inMonth
                            ? 'text-espresso hover:bg-cream-200'
                            : 'text-espresso/35 hover:bg-cream-200'
                  } ${isToday && !isSelected ? 'font-semibold underline decoration-bronze underline-offset-4' : ''}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-taupe pt-2">
            <button
              type="button"
              onClick={() => commit(today)}
              disabled={isDisabled(today)}
              className="text-xs font-medium text-bronze-700 transition duration-150 ease-out hover:text-bronze-600 disabled:cursor-not-allowed disabled:text-espresso/40"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs font-medium text-espresso/70 transition duration-150 ease-out hover:text-espresso"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </div>
  );
}
