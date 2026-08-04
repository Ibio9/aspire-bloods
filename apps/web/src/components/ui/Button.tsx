import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  loading?: boolean;
}

const VARIANTS = {
  primary: 'bg-bronze text-white hover:bg-bronze-600 active:bg-bronze-700',
  secondary: 'bg-transparent text-espresso border border-taupe hover:border-bronze hover:bg-white active:bg-cream-200',
  ghost: 'bg-transparent text-espresso hover:bg-cream-200 active:bg-cream-300',
  destructive: 'bg-white text-status-significantHigh border border-status-significantHigh hover:bg-status-significantHigh hover:text-white',
};

function Spinner() {
  return (
    <svg className="motion-safe:animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Pill-shaped, matching the brand benchmark's soft geometry — the rounding is deliberate, not a default. */
export function Button({ variant = 'primary', loading, disabled, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
