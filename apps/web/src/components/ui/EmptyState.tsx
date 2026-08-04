import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** Warm and reassuring, not blank (brief §3.7) — used for "no results yet" / "results pending" states. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="motion-safe:animate-riseIn rounded-card border border-taupe bg-white p-10 text-center">
      <p className="font-display text-2xl text-espresso">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-espresso/80">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
