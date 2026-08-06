import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** Warm and reassuring, not blank (brief §3.7) — used for "no results yet" / "results pending" states. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="motion-safe:animate-riseIn rounded-card border border-taupe bg-cream-50 p-10 text-center shadow-card sm:p-14">
      <p className="font-display text-3xl leading-tight text-espresso">{title}</p>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-espresso/80">{description}</p>
      {action && <div className="mt-8 flex justify-center">{action}</div>}
    </div>
  );
}
