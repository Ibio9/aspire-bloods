import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';

/**
 * A panel that opens and closes in place, smoothly, without lying to a screen
 * reader while it does it.
 *
 * The height is animated with the `grid-template-rows: 0fr → 1fr` technique
 * rather than a max-height guess. max-height has to be a number somebody
 * invents, and it is wrong in both directions: too small and a health area
 * with twenty-one markers is cut off, too large and the close takes a visible
 * pause before anything appears to happen. A grid row measures its own
 * content, so one component is right for a panel with three cards in it and
 * for one with thirty.
 *
 * The part that is easy to get wrong is what happens to the content while it
 * is collapsed. `overflow: hidden` at zero height hides it visually and does
 * nothing else — the links inside stay in the tab order and stay in the
 * accessibility tree, so a keyboard user tabs into a panel they closed and a
 * screen reader reads out markers nobody asked for. So the panel is `hidden`
 * outright once the closing transition has finished, and only unhidden a frame
 * BEFORE the opening one starts, which is what gives the browser a pair of
 * distinct values to animate between.
 *
 * Under prefers-reduced-motion none of that machinery runs: the panel is
 * simply present or absent, with no transition to wait on and therefore no
 * transitionend event that would never arrive.
 */
export function Collapsible({
  open,
  id,
  labelledBy,
  children,
  className = '',
}: {
  open: boolean;
  /** Matches the aria-controls on the button that toggles this panel. */
  id: string;
  /** The id of that button, so the region is named by the thing that opens it. */
  labelledBy: string;
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  // Whether the panel occupies space at all. Lags `open` on the way out, so
  // the closing transition has something to run on.
  const [present, setPresent] = useState(open);
  // Whether the grid row is at its full height. Lags `open` by one frame on
  // the way in, for the same reason.
  const [expanded, setExpanded] = useState(open);
  const frame = useRef<number>();

  useEffect(() => {
    if (reducedMotion) {
      setPresent(open);
      setExpanded(open);
      return;
    }
    if (open) {
      setPresent(true);
      // Next frame, not this one: unhiding and growing in the same commit is a
      // single style recalculation, and a transition between one computed
      // value and itself does not run.
      frame.current = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(frame.current!);
    }
    setExpanded(false);
  }, [open, reducedMotion]);

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      hidden={!present}
      className={`grid ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} ${
        reducedMotion ? '' : 'transition-[grid-template-rows] duration-300 ease-out'
      } ${className}`}
      onTransitionEnd={(e) => {
        // Only the row track, and only on the way out. Any transition on a
        // child bubbles to here, and acting on one of those would rip a panel
        // out from under someone mid-open.
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && !open) setPresent(false);
      }}
    >
      <div className="overflow-hidden">{present ? children : null}</div>
    </div>
  );
}
