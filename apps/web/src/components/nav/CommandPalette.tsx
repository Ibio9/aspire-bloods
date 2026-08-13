import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { recordPatientView } from '../../lib/recentPatients';
import { useDialogFocus } from '../../lib/useDialogFocus';

interface PatientOption {
  id: string;
  email: string;
  displayName: string;
}

interface StaticDestination {
  label: string;
  to: string;
  hint: string;
}

const DESTINATIONS: StaticDestination[] = [
  { label: 'Reports & entry', to: '/admin', hint: 'Upload PDFs, enter results, verify and release' },
  { label: 'Patients', to: '/admin/patients', hint: 'Search and manage patient accounts' },
  { label: 'Result linking', to: '/admin/linking', hint: 'Match an unlinked result to a patient' },
  { label: 'Panels', to: '/admin/panels', hint: 'The test levels and what each contains' },
  { label: 'Marker library', to: '/admin/markers', hint: 'Analytes, explanations, patient-facing wording' },
  { label: 'Audit log', to: '/admin/audit-log', hint: 'Full system-wide activity' },
  { label: 'Ingestion log', to: '/admin/ingestion-log', hint: 'Results arriving from Randox' },
];

/**
 * Cmd/Ctrl+K anywhere in the admin console (also openable from the top-bar
 * search button — AdminShell owns the open state so both triggers agree).
 * Two result groups: static section jumps (always shown, filtered by
 * label) and patients (fetched once, filtered client-side by name/email) —
 * the single fastest way to get from anywhere to any patient without
 * walking the sidebar.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<PatientOption[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  // Escape, the Tab trap, background scroll lock and focus restore. The input
  // grabs focus itself just below, so the container never holds it for long.
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
      if (!patients) void apiFetch<PatientOption[]>('/admin/patients').then(setPatients);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matchedDestinations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DESTINATIONS;
    return DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q));
  }, [query]);

  const PATIENT_LIMIT = 8;
  const patientMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !patients) return [];
    return patients.filter((p) => p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [query, patients]);
  const matchedPatients = useMemo(() => patientMatches.slice(0, PATIENT_LIMIT), [patientMatches]);

  type Result = { kind: 'destination'; item: StaticDestination } | { kind: 'patient'; item: PatientOption };
  const results: Result[] = [
    ...matchedDestinations.map((item) => ({ kind: 'destination' as const, item })),
    ...matchedPatients.map((item) => ({ kind: 'patient' as const, item })),
  ];

  function go(result: Result) {
    if (result.kind === 'destination') {
      navigate(result.item.to);
    } else {
      recordPatientView(result.item.id, result.item.displayName);
      navigate(`/admin/patients/${result.item.id}`);
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) go(results[activeIndex]);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-night/60 motion-safe:animate-fadeIn" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="chrome relative flex max-h-[60vh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-taupe bg-cream-50 shadow-popover outline-none motion-safe:animate-riseIn"
      >
        <div className="border-b border-taupe px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a patient or section…"
            aria-label="Search"
            className="w-full bg-transparent text-base text-espresso placeholder:text-espresso/40 outline-none"
          />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-4 text-sm text-espresso/80">No matches.</p>}
          {/* Two groups, each with its heading ABOVE its rows. The single flat
              results array drives keyboard nav, so a patient row's index is its
              position after the destinations. */}
          {results.map((r, i) => {
            const heading =
              i === 0 && r.kind === 'destination'
                ? 'Go to'
                : r.kind === 'patient' && (i === 0 || results[i - 1].kind === 'destination')
                  ? 'Patients'
                  : null;
            return (
              <div key={r.kind === 'destination' ? r.item.to : r.item.id}>
                {heading && (
                  <p className="eyebrow px-3 pb-1 pt-2">{heading}</p>
                )}
                <button
                  type="button"
                  onClick={() => go(r)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full flex-col items-start rounded-input px-3 py-2.5 text-left transition-colors duration-100 ${
                    i === activeIndex ? 'bg-bronze text-onaccent' : 'text-espresso'
                  }`}
                >
                  <span className="text-sm font-medium">{r.kind === 'destination' ? r.item.label : r.item.displayName}</span>
                  <span className={`text-xs ${i === activeIndex ? 'text-onaccent/80' : 'text-espresso/80'}`}>
                    {r.kind === 'destination' ? r.item.hint : r.item.email}
                  </span>
                </button>
              </div>
            );
          })}
          {/* Truncation is otherwise invisible: a hidden target reads as "not a
              patient here" when it's really "keep typing". */}
          {patientMatches.length > matchedPatients.length && (
            <p className="px-3 pb-2 pt-2 text-xs text-espresso/80">
              Showing the first {matchedPatients.length} of {patientMatches.length} matches. Keep typing to narrow.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-taupe px-4 py-2 text-xs text-espresso/80">
          <span>↑↓ to navigate, ↵ to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
