import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Almost-imperceptible lift on hover (brief §3.8) — for cards that are themselves a click target (e.g. wrapped in a Link). */
  interactive?: boolean;
}

export function Card({ interactive, className = '', ...props }: CardProps) {
  return (
    <div
      className={`card p-6 sm:p-8 ${interactive ? 'transition duration-150 ease-out hover:border-bronze/60 hover:shadow-md motion-safe:hover:-translate-y-0.5' : ''} ${className}`}
      {...props}
    />
  );
}
