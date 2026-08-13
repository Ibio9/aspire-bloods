import { Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { StillContext } from '../../components/motion/still';

/**
 * ===========================================================================
 *  THE MOMENT STANDS ON THE READER'S OWN OVERVIEW, OUT OF FOCUS.
 * ===========================================================================
 *
 * Behind the arch is the real Overview — the same component `/overview`
 * renders, with this patient's own results in it — blurred past reading and
 * washed back toward the page. Not a screenshot, not a mock, not a decorative
 * arrangement of card-shaped rectangles. The arch is a doorway, and what makes
 * it one is that the thing it opens into is visibly on the other side of it.
 *
 * ── IT IS A PORTAL, AND THAT IS ABOUT THE CORNER GLOW ─────────────────────
 *
 * `z-index: -2`, mounted straight onto `<body>`. The glow is `body::before` at
 * `z-index: -1` inside body's own stacking context (globals.css), so the only
 * place a layer can sit UNDER the light is as another negative-z child of
 * body — and it has to sit under it, or the moment paints an opaque sheet over
 * the one rule the whole dark theme turns on. Rendered in place instead, this
 * layer would be trapped inside whatever stacking context its ancestors
 * happen to make, and one of them makes a temporary one: `PageTransition`
 * animates opacity for 200ms on every navigation, so the glow would blink out
 * for a fifth of a second on arrival and come back. A portal is not
 * decoration-by-preference here; it is the only position in the tree that
 * gets the painting order right in both cases.
 *
 * With that order — page colour, blurred Overview, veil, THEN the glow, then
 * the arch — the light still lands on top of everything and still passes
 * through the arch's glass, which is what the glass is for.
 *
 * ── NOTHING IN HERE IS REACHABLE ──────────────────────────────────────────
 *
 * `aria-hidden` for the accessibility tree, `pointer-events: none` for the
 * mouse, and `inert` for the KEYBOARD, which is the one the other two miss:
 * the Overview is thirty-odd links and a disclosure button, and without
 * `inert` the first Tab on the moment lands on a card nobody can see, read or
 * describe. It never scrolls either, and that needs no lock — the layer is
 * `position: fixed`, so there is nothing behind the moment that scrolling
 * could move.
 *
 * ── AND IT NEVER ANIMATES ─────────────────────────────────────────────────
 *
 * `StillContext` plus the `.moment-backdrop` rules in globals.css: no
 * `stagger-in`, no `Reveal` transition, no counting numbers, no chart mount. A
 * blurred layer costs a full re-rasterisation of the plate every time anything
 * inside it changes, and the Overview's own entrance is ~1s of continuous
 * change landing exactly as the moment arrives. Frozen, the plate is
 * rasterised once and composited from then on — measured at a flat 60fps on a
 * GPU-backed browser, which is the same as the moment with no background at
 * all. See still.ts for why the CSS half cannot do it alone, and
 * MOMENT_BACKDROP in tokens.ts for the table.
 *
 * ── THE CHUNK IS ITS OWN ──────────────────────────────────────────────────
 *
 * `lazy` rather than a static import, so the Overview (and RangeBar, and
 * StatusBadge, and the rest of what it pulls) does not land in the moment's
 * own chunk and delay the one thing on this screen that has to be there
 * immediately, which is the arch. Nothing waits on it: the fallback is null
 * and the ground fades up when it arrives (`.moment-backdrop__page`, delayed
 * so the Overview's own fetch has landed first and the fade is not of a
 * skeleton).
 */
const OverviewBehind = lazy(async () => ({
  default: (await import('./PatientOverview')).PatientOverview,
}));

export function MomentBackdrop() {
  // No SSR here, but this file is one `react-dom/server` import away from
  // being rendered without a document, and a portal with nowhere to go throws.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="moment-backdrop"
      aria-hidden="true"
      // React 18 has no typing for `inert` and passes unknown lowercase
      // attributes straight through, which is exactly what is wanted here —
      // the attribute is the whole point and React 19 will type it.
      {...({ inert: '' } as Record<string, string>)}
    >
      {/* THE PLATE carries the blur, and it carries the page colour with it.
          A blur samples beyond its own edges, so a transparent plate fades to
          nothing in a band around the viewport — the page colour underneath it
          means every sample is a real colour and the field is even to the
          edge. It costs nothing: this layer only ever covers the canvas
          background, which is that same colour. */}
      <div className="moment-backdrop__plate">
        {/* The patient shell's own geometry, so the blurred masses sit where
            this reader's results actually sit rather than centred in a window
            they have never seen. The sidebar's 288px is left as empty room
            rather than drawn: a panel with no navigation in it would be the
            one invented thing on a layer whose whole claim is that it is
            real. */}
        <div className="moment-backdrop__shell">
          <div className="hidden w-[288px] shrink-0 md:block" />
          <div className="min-w-0 flex-1 px-5 py-10 sm:px-8 md:px-14 md:pt-12 lg:px-20">
            <div className="mx-auto max-w-5xl">
              {/* The fade is INSIDE the boundary so it belongs to the arrival
                  of the Overview rather than to the mounting of the layer
                  around it — this node does not exist until the chunk has
                  resolved, and a CSS animation runs when its node is created.
                  Its delay then covers the Overview's own fetch, so what fades
                  up is a page of results and not a page of skeletons. */}
              <Suspense fallback={null}>
                <div className="moment-backdrop__page">
                  <StillContext.Provider value={true}>
                    <OverviewBehind />
                  </StillContext.Provider>
                </div>
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* The veil: the page colour, then the shadow tone. Two layers rather
          than one mixed colour because they answer different questions — how
          far back the Overview goes, and how much darker the ground under the
          arch is. See MOMENT_BACKDROP in tokens.ts. */}
      <div className="moment-backdrop__veil" />
    </div>,
    document.body,
  );
}
