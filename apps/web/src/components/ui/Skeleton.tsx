export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse rounded-card bg-taupe/40 ${className}`} aria-hidden="true" />;
}
