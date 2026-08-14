import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The portal's one scroll-entrance primitive: a restrained fade with a short
 * upward settle, triggered the first time the element enters the viewport
 * and never again — re-renders, tab switches and scrolling back up all leave
 * revealed content exactly where it is. Lists stagger by passing an
 * index-derived `delay`; the cap in `staggerDelay` keeps a forty-row list
 * from turning its tail into a queue.
 *
 * Reduced motion: content renders visible immediately, with no transform
 * and no transition at all (see .reveal in globals.css — the reduced-motion
 * block neutralises both, so nothing ever slides for someone who asked it
 * not to). The same fallback applies anywhere IntersectionObserver is
 * missing: content is simply visible, because a page that hides itself
 * waiting for an observer that never comes is broken, not elegant.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface RevealProps {
  children: ReactNode;
  /** Transition delay in ms — used for staggered lists/grids. */
  delay?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      // Fires slightly before the element's top clears the fold, so the
      // settle is underway as it arrives rather than starting late.
      { rootMargin: '0px 0px -32px 0px', threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? 'reveal-shown' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
