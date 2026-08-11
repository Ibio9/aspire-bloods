import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Fires exactly once per completed code — not on every render where the value happens to be full length. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  label: string;
  id?: string;
  autoFocus?: boolean;
}

/**
 * The most-touched interaction in the product (per brief), so it gets the full treatment: typing
 * a digit auto-advances to the next box, Backspace on an empty box steps back and clears the
 * previous one, arrow keys move between boxes without altering their contents, and pasting a full
 * code (from a password manager, SMS, or email client) fills every box in one action rather than
 * requiring six individual keystrokes.
 */
export function OtpInput({ length = 6, value, onChange, onComplete, disabled, error, label, id, autoFocus }: OtpInputProps) {
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const firedFor = useRef<string | null>(null);
  const baseId = id ?? 'otp';

  useEffect(() => {
    if (value.length === length && firedFor.current !== value) {
      firedFor.current = value;
      onComplete?.(value);
    }
  }, [value, length, onComplete]);

  function setDigitAt(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join('').slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }
    // Autofill/IME can hand back more than one character in a single box — take the last one
    // typed and treat the rest as if it had been pasted from that position.
    const chars = cleaned.split('');
    const next = digits.slice();
    let cursor = index;
    for (const ch of chars) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    onChange(next.join('').slice(0, length));
    const focusIndex = Math.min(cursor, length - 1);
    inputRefs.current[focusIndex]?.focus();
    inputRefs.current[focusIndex]?.select();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigitAt(index, '');
        return;
      }
      if (index > 0) {
        e.preventDefault();
        setDigitAt(index - 1, '');
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = digits.slice();
    let cursor = index;
    for (const ch of pasted) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    onChange(next.join('').slice(0, length));
    const focusIndex = Math.min(cursor, length - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  return (
    <div>
      <label htmlFor={`${baseId}-0`} className="mb-1.5 block text-sm font-medium text-espresso">
        {label}
      </label>
      <div role="group" aria-label={label} className="flex gap-2.5">
        {digits.map((digit, index) => (
          <input
            key={index}
            id={`${baseId}-${index}`}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            autoFocus={autoFocus && index === 0}
            disabled={disabled}
            aria-invalid={!!error}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.target.select()}
            className={`h-14 w-11 rounded-card border bg-white text-center text-lg tabular text-espresso transition duration-150 ease-out focus-visible:border-bronze disabled:cursor-not-allowed disabled:bg-cream/60 disabled:text-espresso/40 ${
              error ? 'border-status-significantHigh' : 'border-taupe hover:border-bronze/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
