import type { InputHTMLAttributes, ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
  /**
   * Hides the label visually while keeping it as the accessible name — for
   * row-selection checkboxes in a list, where the visible context ("Ferritin")
   * is right there but a screen reader still needs "Select Ferritin" rather
   * than a stack of unnamed checkboxes.
   */
  labelHidden?: boolean;
}

/**
 * The native input stays in the DOM (opacity-0, full hit area) so keyboard behaviour, form
 * submission and screen readers all work exactly like a real checkbox — only its paint is
 * suppressed. The box and check mark are `peer-*` siblings driven entirely off that hidden
 * input's state, which gives full control over hover/focus-visible/active/checked/disabled
 * without reimplementing any interaction logic in JS.
 */
export function Checkbox({ label, error, id, labelHidden, className = '', ...props }: CheckboxProps) {
  const fieldId = id ?? props.name;
  return (
    <div>
      {/* py-3 pads the clickable label to the 44px touch-target minimum even for short single-line text */}
      <label htmlFor={fieldId} className="flex items-start gap-3 py-3 text-sm text-espresso cursor-pointer select-none">
        <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <input
            id={fieldId}
            type="checkbox"
            className={`peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[4px] border-[1.5px] border-taupe bg-white transition duration-150 ease-out peer-hover:border-bronze/70 peer-checked:border-bronze peer-checked:bg-bronze peer-active:scale-90 peer-active:duration-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-disabled:peer-checked:bg-taupe peer-disabled:peer-checked:border-taupe"
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute h-2.5 w-2.5 scale-75 text-white opacity-0 transition duration-150 ease-out peer-checked:scale-100 peer-checked:opacity-100"
            viewBox="0 0 12 10"
            fill="none"
          >
            <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {/* sr-only, not display:none — a hidden label would take the accessible name with it. */}
        <span className={labelHidden ? 'sr-only' : undefined}>{label}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </div>
  );
}
