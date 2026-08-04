import type { InputHTMLAttributes, ReactNode } from 'react';

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

/** Same hidden-input-plus-peer approach as Checkbox — see its comment for why. */
export function Radio({ label, id, className = '', ...props }: RadioProps) {
  const fieldId = id ?? `${props.name}-${props.value}`;
  return (
    <label htmlFor={fieldId} className="flex items-center gap-3 py-2.5 text-sm text-espresso cursor-pointer select-none">
      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          id={fieldId}
          type="radio"
          className={`peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-[1.5px] border-taupe bg-white transition duration-150 ease-out peer-hover:border-bronze/70 peer-checked:border-bronze peer-active:scale-90 peer-active:duration-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bronze peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-2 w-2 scale-0 rounded-full bg-bronze transition duration-150 ease-out peer-checked:scale-100 peer-disabled:bg-taupe"
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
