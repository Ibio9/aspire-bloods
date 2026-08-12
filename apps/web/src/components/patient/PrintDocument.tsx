import { formatDate } from '@aspire-bloods/shared';
import { useAuth } from '../../lib/AuthContext';
import { useClinicContact } from '../../lib/patientPortal';
import { ClinicContactLines } from './ClinicContact';

/**
 * ===========================================================================
 *  WHAT A PRINTED PAGE FROM THIS PORTAL LOOKS LIKE.
 * ===========================================================================
 *
 * A printed results page has one requirement the screen does not: it has to
 * make sense on its own, out of the browser, possibly a single loose sheet, in
 * front of a clinician who has never seen this product. That means it has to
 * say who it is about, what it is, when the sample was taken, and who to ring —
 * none of which the screen needs to state, because the person reading it is
 * signed in and the sidebar is beside them.
 *
 * TWO PIECES, PRINTED DIFFERENTLY:
 *
 *  · THE HEADER prints ONCE, at the top of the document, in the ordinary flow.
 *    A masthead repeated on every sheet is a letterhead, and this is a record.
 *  · THE FOOTER is `position: fixed` in the print stylesheet, which is what
 *    makes a browser repeat it at the foot of every sheet. That is the whole
 *    reason it is a separate component: a loose page three of five still has
 *    the practice's number on it.
 *
 * Both are `hidden` on screen and revealed by `.print-only` under `@media
 * print`. They are ordinary DOM rather than a separate print route, so what is
 * printed is provably the same data as what is on screen — a second rendering
 * path is a second thing to be wrong, and it would be wrong silently.
 *
 * NOT A SUBSTITUTE FOR THE GP HANDOVER PDF. That is a one-page clinician-facing
 * summary, typeset for the purpose, listing only what is out of range and
 * saying nothing interpretive (modules/export/gpHandover.ts). This is a
 * patient's own screen on paper, with everything on it. Both should exist and
 * they answer different questions.
 */

export function PrintHeader({
  sampleDate,
  note,
}: {
  /** ISO date of the sample, where the document is about one. */
  sampleDate?: string | null;
  /** One line of context where the page's own heading is not enough. */
  note?: string;
}) {
  const { user } = useAuth();
  return (
    <header className="print-only mb-8 hidden border-b border-taupe pb-5">
      {/* The practice, in the product's own display face. "Aspire Clinic" is
          what a patient reads everywhere and is what a GP should see too. */}
      <p className="font-display opsz-small text-lg leading-none text-espresso">Aspire Clinic</p>
      {/* NO TITLE HERE, and that is a correction from the first draft. This
          header sits immediately above the page's own heading, which prints —
          so a title here printed "Ferritin" twice, once as a masthead and once
          as the page title an inch below it. The title is instead carried into
          the FOOTER, where it identifies a loose page 3 of 5, which is the
          place a document actually needs its own name repeated. */}
      {/* Patient and sample date, as DATA — mono, tabular, one per line, in the
          order somebody checks them: whose is this, and when was it taken. */}
      <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-1 text-sm">
        {user?.displayName && (
          <div className="flex gap-2">
            <dt className="text-espresso/80">Patient</dt>
            <dd className="font-medium text-espresso">{user.displayName}</dd>
          </div>
        )}
        {sampleDate && (
          <div className="flex gap-2">
            <dt className="text-espresso/80">Sample taken</dt>
            <dd className="numeric font-medium text-espresso">{formatDate(sampleDate)}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-espresso/80">Printed</dt>
          {/* The date it was printed, because a results page changes: a sheet
              printed before an amendment and one printed after look identical
              without it. Computed at render, which for a print is the moment
              the dialog opened. Repeated in the footer, which is the copy a
              loose page carries. */}
          <dd className="numeric font-medium text-espresso">{formatDate(new Date().toISOString().slice(0, 10))}</dd>
        </div>
      </dl>
      {note && <p className="mt-3 max-w-measure text-sm leading-relaxed text-espresso/85">{note}</p>}
    </header>
  );
}

/**
 * ===========================================================================
 *  THE FOOT OF A PRINTED DOCUMENT: TWO PIECES, PRINTED DIFFERENTLY.
 * ===========================================================================
 *
 * THE RUNNING FOOTER repeats on every sheet, because it is `position: fixed`
 * in the print stylesheet. What repeats has to be SMALL: a fixed element sits
 * over the content unless the flow is padded out of its way, and every pixel of
 * footer is a pixel off every page. Measured, the first version was 290px of a
 * 1017px page — the clinic's full address, four lines with icons, repeated on
 * all 56 pages of the marker library, taking 28% of the paper with it. It is
 * two lines now: whose this is, when it was printed, and one route to a human.
 *
 * THE CONTACT BLOCK prints ONCE, at the end, in the ordinary flow. The full
 * four lines, one item per line as they are everywhere else in the product
 * (CLAUDE.md — never comma-joined), where they cost one page's worth of space
 * rather than fifty-six.
 *
 * Both are rendered by the shell, so every printed patient screen gets them
 * without each page remembering to.
 */
export function PrintFooter() {
  const { user } = useAuth();
  const contact = useClinicContact();
  return (
    <>
      {/* ONCE, at the end of the document. */}
      <div className="print-only hidden border-t border-taupe pt-4">
        <p className="text-xs font-medium text-espresso">Contact Aspire Clinic</p>
        <ClinicContactLines className="mt-2" size="compact" />
      </div>

      {/* On every sheet. Two lines, and no more. */}
      <footer className="print-footer print-only hidden border-t border-taupe pt-2">
        {user?.displayName && (
          <p className="text-xs font-medium text-espresso">
            {user.displayName}
            <span className="numeric font-normal text-espresso/80">
              {' · printed '}
              {formatDate(new Date().toISOString().slice(0, 10))}
            </span>
          </p>
        )}
        <p className="text-xs leading-snug text-espresso/85">
          Released by Aspire Clinic. Not a diagnosis.
          {contact?.email ? ` Questions: ${contact.email}` : ''}
        </p>
      </footer>
    </>
  );
}
