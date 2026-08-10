import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadMarkerIndex, type MarkerRow } from '../../lib/patientPortal';
import { NO_STATUS_LABEL } from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';
import { SearchIcon } from './icons';

/**
 * Type "ferritin", press enter, land on ferritin. The brief's actual
 * complaint about the old portal — that nothing is reachable without first
 * remembering which report it was in — is only half solved by an All markers
 * screen; this closes the other half from anywhere in the app.
 *
 * Deliberately not a ⌘K modal like the admin command palette: this is a
 * patient's own handful of markers, and an always-visible field in the
 * sidebar is one interaction rather than two. Combobox semantics
 * (WAI-ARIA 1.2 list pattern) so it's fully operable from the keyboard.
 */
export function MarkerSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState('');
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  useEffect(() => {
    loadMarkerIndex().then(setMarkers).catch(() => setMarkers([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !markers) return [];
    // Prefix matches first — someone typing "fer" means ferritin, not
    // "transferrin saturation", even though both contain the letters.
    const scored = markers
      .filter((m) => m.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      });
    return scored.slice(0, 6);
  }, [query, markers]);

  function go(marker: MarkerRow) {
    setQuery('');
    setOpen(false);
    onNavigate?.();
    navigate(`/markers/${marker.markerId}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && matches[activeIndex]) {
      e.preventDefault();
      go(matches[activeIndex]);
    }
  }

  const hasNoMarkers = markers !== null && markers.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-espresso/50" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search your markers"
          value={query}
          // The listbox is never in the tab order (see the options below) — the
          // input keeps focus throughout, so the highlighted option has to be
          // named here or a screen reader hears nothing as you arrow down.
          aria-activedescendant={open && matches[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
          disabled={hasNoMarkers}
          placeholder={hasNoMarkers ? 'No markers yet' : 'Search your markers…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="input-base py-2 pl-9 pr-3 text-sm disabled:bg-cream-200"
        />
      </div>

      {open && query.trim() !== '' && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Marker results"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-card border border-taupe bg-cream-50 py-1 shadow-card motion-safe:animate-riseIn"
        >
          {matches.length === 0 ? (
            <li className="px-3.5 py-2.5 text-sm text-espresso/80">No marker of yours matches “{query.trim()}”.</li>
          ) : (
            // The option is the clickable element itself rather than a button
            // inside one: an option must not contain interactive descendants,
            // and a tabbable control per row would put six extra stops between
            // the search box and the first nav link.
            matches.map((m, i) => (
              <li
                key={m.markerId}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => go(m)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex cursor-pointer flex-col items-start px-3.5 py-2.5 text-left transition-colors duration-100 ${
                  i === activeIndex ? 'bg-bronze text-onaccent' : 'text-espresso'
                }`}
              >
                <span className="text-sm font-medium">{m.name}</span>
                <span className={`tabular text-xs ${i === activeIndex ? 'text-onaccent/85' : 'text-espresso/80'}`}>
                  {m.valueText ?? m.value} {m.unit} · {m.status === null ? NO_STATUS_LABEL : statusLabel(m.status)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
