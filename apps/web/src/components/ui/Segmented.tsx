import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Spoken name where the visible label is short enough to be ambiguous out of context. */
  spoken?: string;
}

/**
 * The three ways of reading the same results.
 *
 * A tab strip rather than a set of links, because the three views answer the
 * same question about the same data and share the search and filters above
 * them — moving between them is not a navigation, it is a change of
 * arrangement. Selection lives in the URL all the same, so a view someone
 * finds useful is still a link they can send or bookmark.
 *
 * Built on the WAI-ARIA tabs pattern with a roving tabindex: one stop in the
 * tab order for the whole strip, arrow keys between the options, and selection
 * following focus because each view renders immediately rather than needing a
 * separate activation. The panel itself is rendered by the caller, which is why
 * this takes `panelId` rather than owning the content — the three views are
 * large enough that mounting all of them to satisfy a component's shape would
 * be three fetches to show one.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  panelId,
  tone = 'accent',
  className = '',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the strip for a screen reader: "Results view", not an unlabelled group of three. */
  label: string;
  panelId: string;
  /**
   * `quiet` is the same control with its volume down: a warm bronze wash and
   * the weight carrying selection, instead of a filled bronze block with
   * light text on it.
   *
   * It exists because this sits on a page whose loudest thing should be the
   * results. A solid accent tile is the right emphasis for a control that IS
   * the page's main choice and the wrong one for a control that arranges
   * something else — and the same reasoning already governs the sidebar's
   * active row, which is a bronze rule and a whisper of fill for exactly this
   * reason. Fill AND weight both still move, so selection is never carried by
   * colour alone.
   */
  tone?: 'accent' | 'quiet';
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(e: KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex((o) => o.value === value);
    if (index === -1) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = options[next].value;
    onChange(target);
    refs.current[target]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      // A pill track rather than an underline: this sits above the content it
      // switches, where an underline would read as the bottom of a section.
      // Scrolls rather than widening the page — three labels exceed 375px.
      // The quiet track keeps the hairline that makes it one object and drops
      // the fill, so nothing is painted over the corner glow behind it.
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-input border border-taupe p-1 ${
        tone === 'quiet' ? '' : 'bg-cream-50'
      } ${className}`}
    >
      {options.map((o) => {
        const isActive = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[o.value] = el;
            }}
            id={`segment-${o.value}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`min-h-tap shrink-0 whitespace-nowrap rounded-input px-4 py-2 text-sm font-medium transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze ${
              // Selected is carried by the fill AND the weight, never by colour
              // alone — same rule as the sidebar's active row.
              isActive
                ? tone === 'quiet'
                  ? 'bg-bronze/[0.14] font-semibold text-espresso'
                  : 'bg-bronze font-semibold text-onaccent shadow-btn'
                : 'text-espresso/85 hover:bg-cream-200 hover:text-espresso'
            }`}
          >
            {o.spoken ? <span className="sr-only">{o.spoken}</span> : null}
            <span aria-hidden={o.spoken ? true : undefined}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
