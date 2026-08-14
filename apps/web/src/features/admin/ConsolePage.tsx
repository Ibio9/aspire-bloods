import type { ReactNode } from 'react';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';

/**
 * ===========================================================================
 *  EVERY CONSOLE SCREEN SAYS WHAT IT IS FOR, IN ONE LINE, AT THE TOP.
 * ===========================================================================
 *
 * The brief: "would a clinician who has never seen this know what it does
 * before clicking it?" Applied to whole screens, the answer was no on most of
 * them — nine pages carried a `TwoTierHeading` and a noun ("Ingestion log",
 * "Result linking", "Panels") and then went straight into a table. Two of the
 * nine had a sentence under the title; the other seven had nothing, so a
 * clinician's only way to find out what a screen was for was to read the table
 * and infer it.
 *
 * ONE COMPONENT rather than a sentence typed into nine files, because that is
 * the difference between a convention and a thing seven of nine screens forgot.
 * The `purpose` prop is REQUIRED: a console page without one is a type error.
 *
 * ── WHAT A GOOD PURPOSE LINE IS ────────────────────────────────────────────
 *
 * A sentence naming the DECISION the screen exists to support, not a
 * description of its contents. "Every action and every view of patient data,
 * with who did it" — not "a table of audit entries". A clinician arriving here
 * has a question; this says whether they are in the right place.
 *
 * It is 18px (the reading step) and full tone, not a muted caption: a line
 * nobody reads is a line that is not doing this job.
 */
export function ConsolePage({
  title,
  purpose,
  actions,
  children,
}: {
  title: string;
  /** One sentence: what a clinician comes here to decide or find out. */
  purpose: string;
  /** Page-level controls that belong beside the title rather than inside the content. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <TwoTierHeading eyebrow="Aspire Clinic · Clinician console" title={title} />
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3 pb-2">{actions}</div>}
      </div>
      <p className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">{purpose}</p>
      {children}
    </>
  );
}
