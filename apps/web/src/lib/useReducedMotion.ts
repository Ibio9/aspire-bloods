import { useEffect, useState } from 'react';

/**
 * Whether the viewer has asked the system for reduced motion.
 *
 * Most of the product answers this in CSS, through Tailwind's `motion-safe:`
 * and `motion-reduce:` variants, which is the right layer for a transition or
 * a keyframe. This hook is for the cases where the preference has to change
 * BEHAVIOUR rather than styling — an expanding panel that must not wait for a
 * transition end event that will never fire, a chart that must not schedule an
 * animation at all. Reading the query rather than assuming false means the
 * first render is already correct, so nothing animates once before settling.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
