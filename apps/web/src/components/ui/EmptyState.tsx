import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/**
 * Warm and reassuring, not blank (brief §3.7) — used for "no results yet" /
 * "results pending" states.
 *
 * Padding is square and sized to what's in it. It used to be p-10/sm:p-14,
 * which around three lines of text made a card that was mostly air, and far
 * taller than it was padded at the sides — the space read as something missing
 * rather than as room deliberately left, which is the opposite of what an
 * empty state is for. Still generous, since this is usually the only card on
 * the page; just no longer cavernous.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="motion-safe:animate-riseIn rounded-card border border-taupe bg-cream-50 p-8 text-center shadow-card sm:p-10">
      <p className="font-display text-3xl leading-tight text-espresso">{title}</p>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-espresso/80">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
