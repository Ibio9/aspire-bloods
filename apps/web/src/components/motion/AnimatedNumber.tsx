import { useEffect, useRef, useState } from 'react';

/**
 * A count that settles into place once, the first time it scrolls into view —
 * an unhurried ease-out over ~600ms, then it is just text forever:
 * re-renders never replay it, and scrolling away and back does nothing.
 *
 * Deliberately reserved for counts and totals ("4 reports", "52 markers
 * tracked") — never for a clinical value. A counting number displays values
 * that are momentarily false, which is harmless for a report count and
 * unacceptable for a blood result; results enter with the same fade-settle
 * as the content around them instead (see Reveal).
 *
 * Layout is stable throughout because numeric surfaces use tabular figures.
 * Under prefers-reduced-motion (or without IntersectionObserver) the real
 * value renders immediately.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({ value, durationMs = 600 }: { value: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const [display, setDisplay] = useState<number>(() =>
    prefersReducedMotion() || typeof IntersectionObserver === 'undefined' ? value : 0,
  );

  useEffect(() => {
    if (played.current || display === value) {
      setDisplay(value);
      return;
    }
    const el = ref.current;
    if (!el) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return;
        played.current = true;
        observer.disconnect();
        const start = performance.now();
        const frame = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          setDisplay(Math.round(value * easeOut(t)));
          if (t < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className="tabular">
      {display}
    </span>
  );
}
