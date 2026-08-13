import { createContext, useContext } from 'react';

/**
 * ===========================================================================
 *  A SUBTREE THAT IS RENDERED BUT NEVER ANIMATES.
 * ===========================================================================
 *
 * There is exactly one of these in the product and there had better stay that
 * way: the results-ready moment renders the patient's real Overview behind the
 * arch and blurs it past reading (see MomentBackdrop.tsx). That subtree is
 * DECORATION. Nobody can read it, nobody can reach it, and nothing in it is
 * about to change — so every frame it spends animating is a frame spent
 * re-rasterising a viewport-sized 24px Gaussian for no one.
 *
 * ── WHY THIS IS A CONTEXT AND NOT A CLASS ─────────────────────────────────
 *
 * The CSS half of the freeze IS a class (`.moment-backdrop` in globals.css
 * turns off every animation and transition inside it, and pins `.reveal` and
 * `.stagger-in` at their finished state). A class cannot reach the two pieces
 * of motion this product drives from JavaScript:
 *
 *   · `Reveal` flips a class from an IntersectionObserver.
 *   · `AnimatedNumber` re-renders a span every frame for 600ms.
 *
 * The second is the expensive one. Three counts on the Overview × ~36 frames
 * each is ~36 React commits inside the blurred layer, every one of which
 * invalidates the filter and forces the whole plate to be blurred again —
 * concentrated in the first second, which is exactly when the moment is
 * arriving. Killing the CSS and leaving that in place would have measured fine
 * at rest and badly at the only time anybody is looking.
 *
 * ── IT ASKS FOR THE FINISHED STATE, NOT FOR "NO MOTION" ───────────────────
 *
 * Both components already know how to render their end state immediately — it
 * is what they do under `prefers-reduced-motion` — so `useStill()` joins that
 * condition rather than introducing a second path. A still subtree and a
 * reduced-motion one render identically, which means this cannot become a way
 * for content to be missing: the failure mode of "turn the animation off" is a
 * page left at `opacity: 0` waiting for something that will never run, and
 * that failure is not reachable from here.
 *
 * NOT a general "disable animations" switch and not a user preference. A reader
 * who wants less movement has `prefers-reduced-motion`, which is honoured
 * everywhere and is not this.
 *
 * A `.ts` file with no component in it, and deliberately: a module that exports
 * both a component and a hook breaks fast refresh for everything in it — the
 * same reason `lazyPage.tsx` keeps its fallback inline. Call sites use
 * `<StillContext.Provider value={true}>` directly; there is one.
 */
export const StillContext = createContext(false);

/** True inside a `StillContext` provider: render the finished state, animate nothing. */
export function useStill(): boolean {
  return useContext(StillContext);
}
