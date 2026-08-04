import { useEffect, useState } from 'react';

interface CopyButtonProps {
  value: string;
  /** Screen-reader label for what's being copied, e.g. "Copy email address" — the icon alone says nothing. */
  label: string;
  className?: string;
}

/** Icon-only copy affordance with its own confirmation — used anywhere an ID or value is shown that a
 * patient or clinician might reasonably want to paste elsewhere. */
export function CopyButton({ value, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard permission denied or unavailable — no destructive fallback needed, the value stays visible to copy manually.
    }
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? `${label} — copied` : label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-espresso/50 transition duration-150 ease-out hover:bg-cream-200 hover:text-espresso active:scale-90 active:duration-0"
      >
        {copied ? (
          <svg className="h-4 w-4 text-status-inRange" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 8.5L6 12.5L14 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3.5 10.5V3.5C3.5 2.94772 3.94772 2.5 4.5 2.5H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} — copied to clipboard` : ''}
      </span>
    </span>
  );
}
