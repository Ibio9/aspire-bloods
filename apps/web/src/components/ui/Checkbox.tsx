import type { InputHTMLAttributes, ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export function Checkbox({ label, error, id, className = '', ...props }: CheckboxProps) {
  const fieldId = id ?? props.name;
  return (
    <div>
      {/* py-3 pads the clickable label to the 44px touch-target minimum even for short single-line text */}
      <label htmlFor={fieldId} className="flex items-start gap-3 py-3 text-sm text-espresso cursor-pointer">
        <input
          id={fieldId}
          type="checkbox"
          className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded accent-bronze disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-sm text-status-significantHigh">{error}</p>}
    </div>
  );
}
