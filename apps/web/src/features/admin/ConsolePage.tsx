import { createContext, useContext, type ReactNode } from 'react';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A CONSOLE SCREEN CAN BE A SECTION OF ANOTHER ONE (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nine screens became five, and two of the five are made of screens that used
 * to have routes of their own: Reports absorbed result linking, and Settings
 * holds packages, the marker library, the ingestion log and the audit log as
 * disclosures on one page. None of those components was rewritten to do it —
 * they are mounted as they are, inside this context, and `ConsolePage` then
 * renders its children WITHOUT the page heading and the purpose line.
 *
 * WHY A CONTEXT RATHER THAN A PROP. The wrapper is several components deep in
 * most of these files (a loading branch, an error branch and the real one, each
 * with its own `<ConsolePage>`), so a prop would have to be threaded through
 * every one of them and would be forgotten in exactly the branch nobody looks
 * at. The host decides once, at the mount point, and every ConsolePage below it
 * — including ones added later — is embedded by construction.
 *
 * WHAT THE EMBEDDED FORM DROPS is the H1 and the purpose sentence, because the
 * disclosure that opened it has already said the name and the host page has
 * already said what it is for. Two page titles on one page is the thing this
 * restructure exists to remove.
 */
const EmbeddedConsoleSection = createContext(false);

export function ConsoleSection({ children }: { children: ReactNode }) {
  return <EmbeddedConsoleSection.Provider value>{children}</EmbeddedConsoleSection.Provider>;
}

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
 * ONE SHORT SENTENCE, OR NOTHING (Aug 2026). It used to be one to three, and
 * three was normal: Reports carried "Every report the practice holds, newest
 * first: open one to review it, release it to the patient, or correct a value.
 * Adding a report by hand is at the foot of the page. Results from Randox
 * arrive on their own." — 46 words explaining a list of reports, above a list
 * of reports, to somebody who opens it every day.
 *
 * A purpose line is for the first day. After that it is a paragraph standing
 * between a clinician and the table they came for, every time. So `purpose` is
 * OPTIONAL now and where it is present it is one clause naming the DECISION the
 * screen supports — never a description of its contents, never a second
 * sentence about where a control is, and never a repeat of what the sidebar or
 * the section headings already say.
 *
 * THE TARGET, and it is a limit rather than a style note: NO CONSOLE SCREEN
 * CARRIES MORE THAN ONE SENTENCE OF PROSE ABOVE THE DATA. Everything else is
 * the data.
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
  /**
   * One short sentence: what a clinician comes here to decide or find out.
   * Omit it where the title already answers that — which, now the console is
   * five screens with plain names, is most of them.
   */
  purpose?: string;
  /** Page-level controls that belong beside the title rather than inside the content. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const embedded = useContext(EmbeddedConsoleSection);
  // Mounted as a section of another console screen: the disclosure above has
  // already named it and the host page has already said what it is for. The
  // ACTIONS are kept — dropping them would silently delete a control, which is
  // a different thing entirely from dropping a sentence.
  if (embedded) {
    return (
      <>
        {actions && <div className="mb-5 flex flex-wrap items-center gap-3">{actions}</div>}
        {children}
      </>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <TwoTierHeading eyebrow="Aspire Clinic · Clinician console" title={title} />
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3 pb-2">{actions}</div>}
      </div>
      {purpose && <p className="mt-3 max-w-measure text-reading leading-relaxed text-espresso/90">{purpose}</p>}
      {children}
    </>
  );
}
