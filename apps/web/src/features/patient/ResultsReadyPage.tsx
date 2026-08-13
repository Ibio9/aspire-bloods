import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { MomentBackdrop } from './MomentBackdrop';

/**
 * ===========================================================================
 *  YOUR RESULTS ARE READY.
 * ===========================================================================
 *
 * A patient signs in, a report they have never opened has been released, and
 * before the Overview they get one screen: their name, the sentence, and a
 * button. Nothing else on it. It is the only moment in this product that is
 * allowed to be about a feeling rather than about a number — and the whole of
 * its value is that it happens once.
 *
 * ── ONCE PER REPORT, AND THE FLAG IS ON THE REPORT ─────────────────────────
 *
 * `Report.resultsReadySeenAt`. Not the session, not localStorage, not "have
 * they signed in before". The failure this was specified against is a moment
 * that fires on EVERY sign-in, which is a splash screen — and the cause of that
 * failure is always the same shape: the condition is keyed on something that
 * resets. A session resets on every sign-in. localStorage resets on their
 * phone, in a private window, and after any cookie clear-out. A column on the
 * report resets never, which is the correct answer to "has this person seen
 * that THIS report is ready".
 *
 * Both exits spend it, because "dismissing it, or viewing the results, means it
 * never appears for that report again" is one rule with two doors. Opening the
 * report by any other route spends it too (see the GET in patients/router.ts):
 * somebody who reached their results from an emailed link has, by any honest
 * reading, seen that they are ready.
 *
 * ── THE ARCH, AND IT STANDS ON THE FLOOR ──────────────────────────────────
 *
 * One of exactly three places the product's repeating shape appears, and the
 * ONLY place it appears large. A doorway, with the content inside it — a
 * translucent warm sheet over the light behind it rather than a fill, which is
 * the whole reason the glass material exists.
 *
 * It reaches the bottom edge of the window: the crown in view, the sides
 * running down and off the bottom, no bottom border and no gap under it. It
 * floated in the middle of the page until Aug 2026, which made it a large
 * rounded card — a doorway you can see the bottom of is a window, and one
 * hanging in mid-air is a shape. Everything that used to sit BELOW it has
 * moved inside it, because there is no longer a below: "Not just now" is under
 * the button now, and the wordmark is gone from this screen rather than
 * squeezed in beside an eyebrow that already says Aspire Clinic.
 *
 * The geometry is in `.moment-arch` (globals.css), including the one number
 * worth knowing here — the content sits below the spring line at every width
 * because a percentage padding resolves against the element's own WIDTH and
 * the crown is exactly half the width tall.
 *
 * ── AND IT STANDS ON THE READER'S OWN RESULTS ─────────────────────────────
 *
 * Behind it, the real Overview, live and blurred past reading: the patient
 * sees their own results out of focus through the doorway and then walks into
 * them. See MomentBackdrop.tsx — it is portalled under the corner glow,
 * inert, and frozen so that a viewport-sized blur is rasterised once rather
 * than every frame of the Overview's own entrance.
 *
 * ── THE BREATH ────────────────────────────────────────────────────────────
 *
 * One element, drifting. `animate-breathe` is nine seconds a cycle, which is
 * roughly half the rate of resting breathing and far slower than anything in
 * this product moves — the point is that it reads as REST rather than as
 * loading. Nothing spins, nothing fills, nothing counts down: every one of
 * those says "wait", and there is nothing to wait for.
 *
 * `motion-safe:` on the animation and nothing else, so under
 * prefers-reduced-motion the same screen simply holds still. The static version
 * is not a degraded one — it is the same composition with the drift removed.
 */

interface ResultsReadyReport {
  reportId: string;
  panelName: string | null;
  sampleDate: string;
  releasedAt: string | null;
}

export function ResultsReadyPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<ResultsReadyReport | null | 'loading'>('loading');
  const [leaving, setLeaving] = useState(false);
  const firstName = user?.displayName?.split(' ')[0] ?? '';

  useEffect(() => {
    let current = true;
    apiFetch<{ report: ResultsReadyReport | null }>('/patient/results-ready')
      .then((d) => current && setReport(d.report))
      .catch(() => current && setReport(null));
    return () => {
      current = false;
    };
  }, []);

  /**
   * NOTHING WAITING MEANS THIS SCREEN HAS NO SUBJECT.
   *
   * Reachable by typing the URL, by a stale `/auth/me`, and by opening the
   * report in another tab first. A moment about a report that is not there is
   * worse than no moment, so it stands aside rather than inventing one.
   */
  useEffect(() => {
    if (report === null) navigate('/overview', { replace: true });
  }, [report, navigate]);

  async function spend(destination: string) {
    setLeaving(true);
    try {
      await apiFetch('/patient/results-ready/seen', { method: 'POST' });
      // Re-read /auth/me so `resultsReadyPending` is false in this session too.
      // Without it, HomeRouter sends them straight back here the next time they
      // touch "/", which is the screen refusing to be dismissed.
      await refresh();
    } catch {
      // A failed write is not a reason to trap somebody on a page whose entire
      // content is a button. They go where they were going; the worst case is
      // that they see this once more.
    } finally {
      navigate(destination, { replace: true });
    }
  }

  return (
    /* THE GROUND IS MOUNTED BEFORE THE MOMENT IS, and outside the branch below
       on purpose. It is a portal, so where it sits in this tree decides only
       WHEN it mounts, and mounting it here means the Overview's chunk and its
       fetch are already in flight while `/patient/results-ready` is still
       answering — the two requests overlap instead of queueing. It is invisible
       for its first third of a second either way (see the fade's delay), so
       nothing shows during a redirect that never became a moment. */
    <>
      <MomentBackdrop />
      {report === 'loading' || report === null ? (
        // Deliberately blank rather than a skeleton. This screen is one
        // sentence and a button; a shaped placeholder of it would be a louder
        // thing than the screen it is standing in for, and it is on screen for
        // one fetch.
        <div className="min-h-viewport" aria-busy="true" aria-label="Loading" />
      ) : (
        <main className="relative flex min-h-viewport flex-col items-center justify-end px-6 pt-10">
          {/* THE WRAPPER IS THE ARCH'S WIDTH, AND IT HAS TO BE.
              `.moment-arch` puts its content on the spring line with
              `padding-top: 50%`, and a percentage padding resolves against the
              CONTAINING BLOCK'S width — not, as it reads, against the element's
              own. With `max-w-md` on the arch itself its containing block was
              `main`, so 50% was half of 1392px rather than half of 448, and the
              button ended up 700px below the bottom of the window. Capping the
              width one level up makes the two the same number and the rule
              exact. */}
          <div className="relative w-full max-w-md">
            {/* THE ARCH'S SURFACE, and it is an element of its own with nothing
                inside it. Its edge fades into the ground rather than ending on
                a line (see `.moment-arch-surface`), and a mask applies to an
                element's whole subtree — so the fade and the content cannot
                live on the same box. Same shape, same radius, absolutely
                positioned behind the words. `aria-hidden` because it is the
                doorway, not the message. */}
            <div className="moment-arch-surface arch" aria-hidden="true" />
            {/* THE ARCH. A doorway, full size, once, standing on the floor of
                the window — `justify-end` above and no padding under it, so its
                bottom edge is the bottom edge of the screen. `border-b-0` on
                the surface because the one thing a doorway must not have is a
                bottom: at a hairline across the foot of the viewport the whole
                shape reads as a card that happens to be tall. The glass
                material rather than a fill — the corner glow, and the reader's
                own blurred results, pass through it. `relative` so the content
                paints over the surface behind it: an absolutely-positioned
                sibling would otherwise cover in-flow text. Its height, the
                crown and where the content sits are all in `.moment-arch`. */}
            <div className="moment-arch relative flex w-full flex-col justify-center px-8 text-center sm:px-12">
              {/* THE BREATH. One element, and it is the wordmark's own dot
                  rather than a new object invented to move: the thing that
                  drifts should be something already on the page. In the crown
                  of the arch, where the shape is still comfortably wider than
                  the dot is — see the note on the radius in globals.css. */}
              <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
                <span
                  aria-hidden="true"
                  className="motion-safe:animate-breathe block h-3 w-3 rounded-full bg-bronze/70"
                />
              </div>

              <p className="eyebrow mb-6">Aspire Clinic</p>
              <h1 className="font-display opsz-hero text-2xl font-normal leading-tight text-espresso">
                {firstName ? `${firstName},` : 'Your results'}
                <span className="mt-1 block">your results are ready</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xs text-sm leading-relaxed text-espresso/80">
                {report.panelName ? `${report.panelName}, reviewed and released.` : 'Reviewed and released.'}
              </p>

              <Button className="mt-10 w-full" onClick={() => spend(`/reports/${report.reportId}`)} disabled={leaving}>
                View my results
              </Button>

              {/* The way past it — inside the arch now, because there is no
                  longer an outside for it to be quiet in. Still a link-shaped
                  control and still deliberately not a second button competing
                  with the first: a moment with no exit but its own primary
                  action is a modal, and this is a page. */}
              <button
                type="button"
                onClick={() => spend('/overview')}
                disabled={leaving}
                className="mx-auto mt-6 rounded-input text-sm text-espresso/80 underline-offset-4 hover:text-espresso hover:underline disabled:opacity-50"
              >
                Not just now
              </button>
            </div>
          </div>
        </main>
      )}
    </>
  );
}
