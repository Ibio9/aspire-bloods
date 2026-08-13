import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Wordmark } from '../../components/Wordmark';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';

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
 * ── THE ARCH ──────────────────────────────────────────────────────────────
 *
 * One of exactly three places the product's repeating shape appears, and the
 * ONLY place it appears large. A doorway, with the content inside it — a
 * translucent warm sheet over the corner glow rather than a fill, so the light
 * still comes through it, which is the whole reason the glass material exists.
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

  if (report === 'loading' || report === null) {
    // Deliberately blank rather than a skeleton. This screen is one sentence
    // and a button; a shaped placeholder of it would be a louder thing than
    // the screen it is standing in for, and it is on screen for one fetch.
    return <div className="min-h-screen" aria-busy="true" aria-label="Loading" />;
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {/* THE ARCH. A doorway, full size, once. The glass material rather than a
          fill — the corner glow passes through it, which is the rule the whole
          dark theme turns on. `pb` far exceeds `pt` because the content sits in
          the straight part of the shape and the curve needs room above it. */}
      <div className="glass arch relative w-full max-w-md border border-taupe/70 px-8 pb-16 pt-28 text-center shadow-card sm:px-12 sm:pb-20 sm:pt-36">
        {/* THE BREATH. One element, and it is the wordmark's own dot rather than
            a new object invented to move: the thing that drifts should be
            something already on the page. */}
        <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center">
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
      </div>

      {/* The way past it, quiet and outside the arch: a moment with no exit but
          its own button is a modal, and this is a page. */}
      <button
        type="button"
        onClick={() => spend('/overview')}
        disabled={leaving}
        className="mt-8 rounded-input text-sm text-espresso/80 underline-offset-4 hover:text-espresso hover:underline disabled:opacity-50"
      >
        Not just now
      </button>

      {/* `variant="light"` means "on a light-coloured surface", and it is the
          theme-aware one — `text-espresso`, which is espresso in light and warm
          cream in dark. The default `dark` variant is frozen light text for the
          always-dark night panels, and on this page's cream background that is
          cream on cream: the mark was invisible in light mode. */}
      <div className="mt-14 opacity-60">
        <Wordmark variant="light" />
      </div>
    </main>
  );
}
