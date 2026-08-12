import { Suspense, lazy, type ComponentType, type ReactElement } from 'react';

/**
 * ---------------------------------------------------------------------------
 * ROUTE-LEVEL CODE SPLITTING, AND WHAT IT IS FOR.
 * ---------------------------------------------------------------------------
 *
 * Every screen in this product used to arrive in one 992 kB script, which is
 * the whole of the reason the build warned on every run. A patient opening
 * their overview downloaded the clinician console, the audit log, the panel
 * editor, the booking flow that is switched off, and the entire charting
 * library — none of which they will ever see.
 *
 * `lazyPage` is the one way a route is declared here now: it takes the module
 * loader and the export name and hands back a component that Rollup can put in
 * a chunk of its own. Nothing else changes at the call site.
 *
 * WHY A HELPER RATHER THAN `lazy()` AT EACH SITE. `React.lazy` wants a module
 * whose DEFAULT export is the component, and every page in this codebase is a
 * named export — so each call site would otherwise carry the same
 * `.then((m) => ({ default: m.Thing }))` incantation, thirty times, with the
 * export name written twice and no type checking that the two agree. Here the
 * name is a key of the module's own type, so a renamed export is a compile
 * error rather than a blank screen on one route.
 */
export function lazyPage<K extends string, P>(
  load: () => Promise<Record<K, ComponentType<P>>>,
  name: K,
): ComponentType<P> {
  // The cast is React's typings, not a hole in ours. `lazy` returns a
  // LazyExoticComponent, whose props go through CustomComponentPropsWithRef —
  // which does not reduce to P for a generic P, so the two are not structurally
  // assignable even though they are the same component. P itself is still
  // inferred from the module, so a wrong prop at a call site is still an error.
  return lazy(async () => ({ default: (await load())[name] })) as unknown as ComponentType<P>;
}

/**
 * What sits in the page's place while its chunk arrives, and why it is almost
 * nothing.
 *
 * A route chunk is 5–100 kB from the same origin and is usually there within a
 * frame or two; a spinner that appears and vanishes that fast is a flash of
 * anxiety rather than feedback. What it must do is hold the vertical space so
 * the shell does not collapse and rebound, and say something to a screen
 * reader, which a bare empty div does not.
 *
 * Written inline rather than as an exported component on purpose: this module's
 * exports are factories and helpers, and one exported component among them is
 * what breaks fast refresh for the whole file.
 */
const FALLBACK = (
  <div className="min-h-[60vh]" role="status" aria-live="polite">
    <span className="sr-only">Loading this page…</span>
  </div>
);

/**
 * Wraps a route element in its own Suspense boundary.
 *
 * PER ROUTE, never once around `<Routes>`: a single boundary at the top would
 * suspend the shell itself on every navigation, so the sidebar and the header
 * would unmount and remount each time somebody moved between two pages inside
 * them. The boundary belongs where the thing that suspends is.
 */
export function page(element: ReactElement): ReactElement {
  return <Suspense fallback={FALLBACK}>{element}</Suspense>;
}
