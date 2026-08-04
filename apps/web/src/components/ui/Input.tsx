import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Only optional fields get a label suffix — required is the unmarked default, so we never need a red/status-colour asterisk. */
  optional?: boolean;
  error?: string;
  hint?: string;
}

/**
 * The brand's asterisk-required convention inverted deliberately: an
 * asterisk needs a colour, and every colour available either fails
 * contrast at this size (taupe) or is already a status colour with its
 * own meaning (terracotta = significantly out of range) that a required-
 * field marker must never visually echo. Marking the exception (optional
 * fields) instead of the default (required) sidesteps the problem
 * entirely and reads calmer.
 */
export function Input({ label, optional, error, hint, id, className = '', ...props }: InputProps) {
  const fieldId = id ?? props.name;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/60"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-espresso/70 -mt-1">
          {hint}
        </p>
      )}
      <input
        id={fieldId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={!!error}
        className={`input-base ${error ? 'border-status-significantHigh' : ''} ${className}`}
        required={!optional}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </div>
  );
}
