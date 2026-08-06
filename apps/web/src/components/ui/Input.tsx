import { useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Only optional fields get a label suffix — required is the unmarked default, so we never need a red/status-colour asterisk. */
  optional?: boolean;
  error?: string;
  hint?: string;
  /** Runs on blur, not on every keystroke — a caught error re-validates on each change after that
   * so it clears the moment it's fixed, without nagging before the field has even been left. */
  validate?: (value: string) => string | undefined;
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
export function Input({ label, optional, error, hint, id, className = '', validate, onBlur, onChange, ...props }: InputProps) {
  const fieldId = id ?? props.name;
  const [blurError, setBlurError] = useState<string | undefined>(undefined);

  // A parent-supplied error (a server rejection, a cross-field rule) has no
  // validator here to re-run, so on its own it would sit there unchanged
  // while the user corrects the very thing it's complaining about. Editing
  // the field dismisses it: the message described the old value, and the
  // value is no longer that. Reset whenever a *new* parent error arrives, so
  // a second failed submit shows again rather than being suppressed by the
  // dismissal of the first.
  const [dismissedError, setDismissedError] = useState<string | undefined>(undefined);
  const parentError = error && error !== dismissedError ? error : undefined;

  const shownError = parentError ?? blurError;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = shownError ? `${fieldId}-error` : undefined;

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    if (validate) setBlurError(validate(e.target.value));
    onBlur?.(e);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    // Re-validate on change only once an error is already showing — that's
    // what makes a fixed field clear immediately, without validating on
    // every keystroke before the user has finished typing.
    if (validate && blurError) setBlurError(validate(e.target.value));
    if (error) setDismissedError(error);
    onChange?.(e);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-espresso">
        {label}
        {optional && <span className="font-normal text-espresso/80"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-espresso/80 -mt-1">
          {hint}
        </p>
      )}
      <input
        id={fieldId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={!!shownError}
        className={`input-base ${shownError ? 'border-status-significantHigh' : ''} ${className}`}
        required={!optional}
        onBlur={validate ? handleBlur : onBlur}
        // handleChange is wired whenever there's a validator OR a parent
        // error to dismiss — previously it was skipped entirely without a
        // validator, which is exactly the case where a parent error stuck.
        onChange={validate || error ? handleChange : onChange}
        {...props}
      />
      {shownError && (
        <p id={errorId} role="alert" className="text-sm text-status-significantHigh">
          {shownError}
        </p>
      )}
    </div>
  );
}
