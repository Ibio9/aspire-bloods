import type { ReactNode, SelectHTMLAttributes } from 'react';
import { brand } from '@aspire-bloods/shared';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}

export function Select({ label, optional, error, id, className = '', children, ...props }: SelectProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/60"> (optional)</span>}
      </label>
      <div className="relative">
        <select
          id={fieldId}
          required={!optional}
          aria-invalid={!!error}
          className={`input-base appearance-none pr-9 disabled:cursor-not-allowed disabled:bg-cream/60 disabled:text-espresso/40 ${error ? 'border-status-significantHigh' : ''} ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
          width="12"
          height="8"
          viewBox="0 0 12 8"
          aria-hidden="true"
        >
          <path d="M1 1.5L6 6.5L11 1.5" stroke={brand.bronze} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error && <p className="text-sm text-status-significantHigh">{error}</p>}
    </div>
  );
}
