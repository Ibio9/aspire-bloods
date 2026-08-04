import type { InputHTMLAttributes, ReactNode } from 'react';

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Radio({ label, id, className = '', ...props }: RadioProps) {
  const fieldId = id ?? `${props.name}-${props.value}`;
  return (
    <label htmlFor={fieldId} className="flex items-center gap-3 py-2.5 text-sm text-espresso cursor-pointer">
      <input
        id={fieldId}
        type="radio"
        className={`h-[18px] w-[18px] shrink-0 accent-bronze disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
