import { useTheme } from '../../lib/ThemeContext';
import type { ThemePreference } from '../../lib/theme';

/**
 * Three segments, not a switch.
 *
 * A two-state switch cannot express "follow my device", which is both the
 * default and the setting most people actually want — and a switch that
 * silently means "system until you touch it, then pinned for ever" is a
 * control that changes what it does the first time you use it.
 *
 * Each segment carries its own word. The selected one is not distinguished by
 * colour alone: it takes the filled bronze surface, the accompanying icon and
 * `aria-checked`, so the state is legible in greyscale and to a screen reader.
 */

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function OptionIcon({ value }: { value: ThemePreference }) {
  if (value === 'light') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect key={deg} x="7.4" y="0.6" width="1.2" height="2.6" rx="0.6" fill="currentColor" transform={`rotate(${deg} 8 8)`} />
        ))}
      </svg>
    );
  }
  if (value === 'dark') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="13" width="6" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}

export function ThemeToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className={`inline-flex rounded-input border border-taupe bg-white shadow-inset ${compact ? 'w-full p-0.5' : 'p-1'}`}
      >
        {OPTIONS.map((o) => {
          const selected = preference === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(o.value)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-[0.4rem] font-medium transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze ${
                compact ? 'flex-1 px-2 py-1.5 text-xs' : 'min-h-tap px-3 py-1.5 text-sm'
              } ${
                selected
                  ? 'bg-bronze bg-btn-primary text-onaccent shadow-btn'
                  : 'text-espresso/80 hover:bg-cream-200 hover:text-espresso'
              }`}
            >
              <OptionIcon value={o.value} />
              {o.label}
            </button>
          );
        })}
      </div>
      {/* "System" alone doesn't tell you what it currently resolves to, and on
          a device that flips at sunset that is exactly the thing worth saying. */}
      {preference === 'system' && !compact && (
        <p className="mt-2 text-xs text-espresso/80">Following your device, currently {resolved}.</p>
      )}
    </div>
  );
}
