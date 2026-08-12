import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Listbox } from './Listbox';
import {
  formatDisplayDate,
  formatTypedDate,
  initialViewDate,
  parseISODate,
  parseTypedDate,
  resolveBounds,
  toISODate,
  type DatePreset,
} from '../../lib/dateInput';

interface DateFieldProps {
  label: string;
  name?: string;
  /** ISO date string, YYYY-MM-DD, or '' for no selection. */
  value: string;
  onChange: (value: string) => void;
  /**
   * What this field is for. Decides the allowed range and where the calendar
   * opens when nothing is selected — a date of birth and a sample date want
   * opposite ends of the calendar. Explicit min/max still override it.
   */
  preset?: DatePreset;
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

/** Monday-first grid of Date objects covering the full weeks of the given month. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

/**
 * Replaces the native <input type="date"> (brief §3.5) — its calendar icon
 * and dd/mm/yyyy placeholder read as unfinished.
 *
 * Two ways in, because a calendar alone is the wrong tool for half the dates
 * this app asks for:
 *
 *  1. Type it. 14/03/1985 (or 14-03-1985, or 14031985, or ISO) parses straight
 *     into the field without the calendar ever opening. For a date of birth
 *     this is the fast path and always will be — nobody wants to *browse* to
 *     their own birthday.
 *  2. Pick it. THE MONTH AND THE YEAR ARE DROPDOWNS in the header, so any
 *     date is two choices and a tap.
 *
 * ── WHY THE DRILL-DOWN WENT (Aug 2026) ────────────────────────────────────
 *
 * The header used to be a BUTTON that zoomed out a level — day grid to a
 * 12-month grid to a 12-year grid — which is three taps to any date and was a
 * genuine improvement on the ±1-month arrows it replaced (someone born in 1985
 * was about five hundred clicks from their birthday). It is still three taps,
 * and it is three taps nobody finds: a header that reads "March 1985" looks
 * like a caption, and the affordance saying otherwise is a hover state. Two
 * dropdowns say what they do while sitting still. They are the product's own
 * Listbox, so there is no native select here either.
 *
 * ── AND IT OPENS IN FLOW, NOT OVER THE FORM ───────────────────────────────
 *
 * It was an absolutely-positioned popover, so opening it covered whatever was
 * underneath — on the registration form, the two fields after it. A calendar
 * that hides the form it is part of makes a person close it to check what they
 * were doing. In flow it pushes the rest of the form down instead, which is
 * only affordable because the auth page is now allowed to scroll (see
 * AuthSplitLayout). Every other DateField in the product is in a form column
 * too; none is in a table row.
 *
 * Bounds and the opening view come from `preset` (see lib/dateInput.ts), so a
 * sample date offers recent dates and a date of birth opens on a plausible
 * birth year, and neither offers the future.
 *
 * Keyboard throughout: arrows move a day, PageUp/PageDown step a month (a year
 * with Shift), Home/End jump to the ends of the week, Enter selects, Escape
 * closes.
 */
export function DateField({
  label,
  name,
  value,
  onChange,
  preset = 'any',
  optional,
  error,
  hint,
  min,
  max,
  disabled,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  /** Non-null once the field has been typed in; null means "derive it from the value". */
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [typeError, setTypeError] = useState<string | undefined>(undefined);

  const bounds = useMemo(() => resolveBounds(preset, min, max), [preset, min, max]);
  const openingDate = useMemo(() => initialViewDate(preset, bounds), [preset, bounds]);

  const selected = parseISODate(value);
  const [viewDate, setViewDate] = useState(() => selected ?? openingDate);
  const [focusedDate, setFocusedDate] = useState(() => selected ?? openingDate);

  const fieldId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const minDate = bounds.min ? parseISODate(bounds.min) : null;
  const maxDate = bounds.max ? parseISODate(bounds.max) : null;

  function isDisabled(d: Date): boolean {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  /** Keeps the keyboard cursor inside the allowed range, so it can never land
   *  on a disabled cell — a disabled button can't hold focus, and arrow keys
   *  would silently stop working from there. */
  function clamp(d: Date): Date {
    if (minDate && d < minDate) return minDate;
    if (maxDate && d > maxDate) return maxDate;
    return d;
  }

  useEffect(() => {
    if (!open) return;
    const base = selected ?? openingDate;
    setViewDate(base);
    setFocusedDate(base);

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * The keyboard cursor and the DOM's focus are two things, and this is what
   * keeps them together: arrowing around the grid moves `focusedDate`, and the
   * cell holding it is the only one with `tabIndex=0`, so it has to actually
   * receive focus or the next arrow key goes nowhere.
   *
   * SUPPRESSED WHEN THE HEADER MOVED THE MONTH. Choosing a year from the
   * dropdown also moves the cursor (it must — otherwise no cell in the month
   * now on screen is reachable), and without this the focus would be yanked out
   * of the header into the grid on the way to choosing a month. The ref is
   * cleared by this effect rather than by the handler, so it can only ever skip
   * the one update it was set for.
   */
  const skipFocusRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    panelRef.current?.querySelector<HTMLElement>('[data-focused="true"]')?.focus();
  }, [open, focusedDate, viewDate]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }

  function commit(d: Date) {
    if (isDisabled(d)) return;
    onChange(toISODate(d));
    setDraft(null);
    setTypeError(undefined);
    close();
  }

  function moveFocus(next: Date) {
    const target = clamp(next);
    setFocusedDate(target);
    setViewDate(target);
  }

  function shiftDays(days: number) {
    moveFocus(new Date(focusedDate.getFullYear(), focusedDate.getMonth(), focusedDate.getDate() + days));
  }

  function shiftMonths(months: number) {
    moveFocus(new Date(focusedDate.getFullYear(), focusedDate.getMonth() + months, focusedDate.getDate()));
  }

  // --- Typing ------------------------------------------------------------

  function handleTyped(raw: string) {
    setDraft(raw);
    setTypeError(undefined);
    if (!raw.trim()) {
      onChange('');
      return;
    }
    const parsed = parseTypedDate(raw);
    // Only echo a *complete and allowed* date into the form. Half-typed text
    // stays local, so the calendar doesn't jump around mid-keystroke.
    if (parsed && !isDisabled(parseISODate(parsed)!)) {
      onChange(parsed);
      const d = parseISODate(parsed)!;
      setViewDate(d);
      setFocusedDate(d);
    }
  }

  /** Turn whatever was typed into either a committed date or a plain-language
   *  complaint. Silently discarding an unparseable date would be worse than
   *  saying so — the person typed something, and it meant something to them. */
  function commitTyped() {
    if (draft === null) return;
    const text = draft.trim();
    if (!text) {
      onChange('');
      setDraft(null);
      setTypeError(undefined);
      return;
    }
    const parsed = parseTypedDate(text);
    if (!parsed) {
      setTypeError('Enter the date as DD/MM/YYYY.');
      return;
    }
    const asDate = parseISODate(parsed)!;
    if (isDisabled(asDate)) {
      setTypeError(
        preset === 'birthdate'
          ? 'Enter a date of birth in the past, within the last 120 years.'
          : maxDate && asDate > maxDate
            ? 'That date is in the future.'
            : 'That date is outside the range this field allows.',
      );
      return;
    }
    onChange(parsed);
    setDraft(null);
    setTypeError(undefined);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Never let a half-typed date submit the surrounding form by accident.
      e.preventDefault();
      commitTyped();
      return;
    }
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (draft !== null) {
        e.preventDefault();
        setDraft(null);
        setTypeError(undefined);
      }
    }
  }

  // --- Popover keyboard ---------------------------------------------------

  function handleDayKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); shiftDays(1); break;
      case 'ArrowLeft': e.preventDefault(); shiftDays(-1); break;
      case 'ArrowDown': e.preventDefault(); shiftDays(7); break;
      case 'ArrowUp': e.preventDefault(); shiftDays(-7); break;
      case 'PageUp': e.preventDefault(); shiftMonths(e.shiftKey ? -12 : -1); break;
      case 'PageDown': e.preventDefault(); shiftMonths(e.shiftKey ? 12 : 1); break;
      case 'Home': e.preventDefault(); shiftDays(-((focusedDate.getDay() + 6) % 7)); break;
      case 'End': e.preventDefault(); shiftDays(6 - ((focusedDate.getDay() + 6) % 7)); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(focusedDate);
        break;
      case 'Escape': e.preventDefault(); close(); break;
    }
  }

  // --- Render -------------------------------------------------------------

  const grid = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const today = new Date();
  const todayISO = toISODate(today);
  const shownError = error ?? typeError;
  const errorId = shownError ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  // Derived rather than stashed on focus: picking from the calendar returns
  // focus to the field, and a focus handler reading `value` would still be
  // holding the date that was selected a moment ago.
  const inputText = draft ?? (editing ? formatTypedDate(value) : value ? formatDisplayDate(value) : '');

  /** Steps the calendar a month. Still worth keeping beside the dropdowns:
   *  "the month before the one I'm looking at" is one tap and two choices
   *  otherwise, and it is how a keyboard user pages as well. */
  function page(direction: -1 | 1) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + direction, 1));
  }

  /**
   * THE YEARS OFFERED, and it is the field's own range rather than a fixed
   * span. `preset="birthdate"` bounds it to the last 120 years, a sample date
   * to the recent past — so the list can never contain a year every day of
   * which this field would refuse.
   *
   * Newest first for a birthdate as well as for a sample date: a list of 120
   * years opens at the top, and the top of an ascending list is 1906.
   */
  const years = useMemo(() => {
    const first = minDate ? minDate.getFullYear() : new Date().getFullYear() - 120;
    const last = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + 5;
    const all: number[] = [];
    for (let y = last; y >= first; y -= 1) all.push(y);
    return all;
  }, [minDate, maxDate]);

  /** Moves the calendar without moving the selection — nothing is committed until a day is picked. */
  function showMonth(year: number, month: number) {
    const target = new Date(year, month, Math.min(focusedDate.getDate(), 28));
    skipFocusRef.current = true;
    setViewDate(target);
    setFocusedDate(clamp(target));
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/80"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="-mt-1 text-xs text-espresso/80">
          {hint}
        </p>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="DD/MM/YYYY"
          disabled={disabled}
          aria-required={!optional}
          aria-invalid={!!shownError}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          value={inputText}
          // Editing swaps "14 Mar 1985" for the digits behind it, so what you
          // see is what you can retype — the field never reads back a format
          // it wouldn't accept.
          onFocus={() => setEditing(true)}
          onChange={(e) => handleTyped(e.target.value)}
          onBlur={() => {
            commitTyped();
            setEditing(false);
          }}
          onKeyDown={handleInputKeyDown}
          // focus-visible:pr matches input-base's own focused padding (which
          // grows the border by 1px) so the text doesn't step sideways, and
          // beats it on the right-hand side so it never runs under the icon.
          className={`input-base tabular pr-11 focus-visible:pr-[43px] ${shownError ? 'border-status-significantHigh' : ''}`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          onClick={() => !disabled && setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-input text-bronze transition duration-150 ease-out hover:text-bronze-700 disabled:cursor-not-allowed disabled:text-espresso/40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {name && <input type="hidden" name={name} value={value} />}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          // IN FLOW, not absolute — see the note at the top. `mt-2` rather than
          // a `top-` offset, and no z-index, because there is nothing to sit on
          // top of: it takes its own room and pushes the form down.
          className="mt-2 w-full max-w-[20rem] rounded-card border border-taupe bg-cream-50 p-3 shadow-popover motion-safe:animate-riseIn"
        >
          <div className="mb-2.5 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => page(-1)}
              className="shrink-0 rounded-full p-1.5 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M7 1L2 5l5 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* THE HEADER IS TWO DROPDOWNS. Directly selectable, and the year
                one is searchable because 120 of them is a scroll otherwise —
                typing "1985" is faster than any calendar. */}
            <Listbox
              aria-label="Month"
              value={String(viewDate.getMonth())}
              onChange={(v) => showMonth(viewDate.getFullYear(), Number(v))}
              options={MONTH_LABELS.map((m, i) => ({ value: String(i), label: m }))}
              className="min-w-0 flex-1"
            />
            <Listbox
              aria-label="Year"
              searchable
              value={String(viewDate.getFullYear())}
              onChange={(v) => showMonth(Number(v), viewDate.getMonth())}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
              className="w-[5.75rem] shrink-0"
            />
            <button
              type="button"
              aria-label="Next month"
              onClick={() => page(1)}
              className="shrink-0 rounded-full p-1.5 text-espresso transition duration-150 ease-out hover:bg-cream-200"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M3 1l5 4-5 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d} className="text-xs font-medium text-espresso/80">
                {d}
              </span>
            ))}
          </div>
              <div role="grid" onKeyDown={handleDayKeyDown} className="grid grid-cols-7 gap-y-1 text-center">
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
                            ? 'bg-bronze text-onaccent'
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
                  setDraft(null);
                  setTypeError(undefined);
                  close();
                }}
                className="text-xs font-medium text-espresso/80 transition duration-150 ease-out hover:text-espresso"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {shownError && (
        <p id={errorId} role="alert" className="text-sm text-status-significantHigh">
          {shownError}
        </p>
      )}
    </div>
  );
}
