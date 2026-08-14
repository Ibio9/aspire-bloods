import { prisma } from '../../db/client.js';
import { renderPdf } from '../../lib/pdfRender.js';
import { decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import { formatDate, formatReferenceRange, formatReportTitle, hasResultValue } from '@aspire-bloods/shared';
import { getClinicContact } from '../content/clinicContact.js';

/**
 * ============================================================================
 *  THE GP HANDOVER SUMMARY — ONE PAGE, FOR A DOCTOR, NOT FOR THE PATIENT.
 * ============================================================================
 *
 * The out-of-range card tells a patient to contact their GP. They arrive with
 * nothing, or with a twenty-page Randox report, and a ten-minute appointment
 * starts with the doctor reading a document that was written for somebody else.
 *
 * This is the document that should have been in their hand: every marker
 * outside its reference range, with the value, the unit, the range it was
 * measured against and the status, plus who ran it and how to ring the clinic.
 *
 * ── WHAT IS DELIBERATELY NOT IN IT ────────────────────────────────────────
 *
 * NOTHING INTERPRETIVE. No marker explanations, no "what this might mean", no
 * lifestyle context, no suggested actions, no optimal ranges. Three reasons and
 * each of them is sufficient on its own:
 *
 *  1. A GP does not need our patient-facing copy. They know what a raised ALT
 *     is; handing them a paragraph explaining it is at best noise and at worst
 *     reads as a private clinic telling them their job.
 *  2. That copy was written for a patient looking at their own result, and
 *     ~350 of the explanations in this product have never been read by a
 *     clinician (CLAUDE.md). Putting unreviewed prose in front of a doctor
 *     under a clinic's letterhead is the one place it could do real harm.
 *  3. A handover document that interprets is a referral letter, and a referral
 *     letter is signed by a named clinician who has read it. This is a data
 *     extract.
 *
 * NO OPTIMAL RANGES either, for the same reason in a sharper form: an optimal
 * band is advisory guidance from a named source and is not the range the
 * laboratory classified against. On a clinician's page, beside the lab's own
 * interval, it would read as a second reference range that disagrees.
 *
 * ── WHY IT IS TYPESET LIKE THIS ───────────────────────────────────────────
 *
 * Plain clinical typesetting. Dense, printable, legible photocopied in black
 * and white. It is NOT the patient letter with the prose removed: no
 * letterhead lockup in bronze, no "Dear —", no marketing. A rule, a title
 * block, a table, and the contact details.
 *
 * ONE HUE, USED ONCE. The status column is set in the body face and says the
 * words; nothing on the page depends on colour, because this document's whole
 * purpose is to be printed and faxed and photocopied. Severity is carried by
 * the word and by a leading chevron, exactly as on screen.
 *
 * ── THE SAME CONSTRAINTS AS EVERY OTHER PDF HERE ──────────────────────────
 *
 * Base-14 faces only, for the reason recorded at length in pdfSummary.ts:
 * PDFKit subsets through fontkit, and fontkit's TTF subsetter throws inside the
 * stream flush on every face this product vendors — which is an UNCAUGHT
 * exception that kills the process rather than failing one request. And it goes
 * through `renderPdf`, so a builder that throws, a document that emits 'error'
 * and a document that never ends all come back as a rejected promise and
 * therefore as a 500.
 */

const ESPRESSO = '#423c36';
const TAUPE = '#c9bca9';

const FONTS = {
  display: 'Times-Roman',
  displayBold: 'Times-Bold',
  body: 'Helvetica',
  bodyBold: 'Helvetica-Bold',
  mono: 'Courier',
  monoBold: 'Courier-Bold',
} as const;

type FontRole = keyof typeof FONTS;

function use(doc: PDFKit.PDFDocument, role: FontRole, size?: number) {
  doc.font(FONTS[role]);
  if (size !== undefined) doc.fontSize(size);
  return doc;
}

/**
 * The status, as a word with a direction mark in front of it.
 *
 * The caret is ASCII and prints on any device: this page will be photocopied,
 * and a glyph that depends on a font's coverage is a glyph that becomes a box.
 * Two carets for significantly out, which is the same doubling the screen and
 * the patient letter use.
 */
const STATUS_TEXT: Record<string, string> = {
  HIGH: '^ Above range',
  LOW: 'v Below range',
  SIGNIFICANT_HIGH: '^^ Significantly above range',
  SIGNIFICANT_LOW: 'vv Significantly below range',
};

/** Most severe first, so the top of the table is the reason the page exists. */
const STATUS_ORDER: Record<string, number> = {
  SIGNIFICANT_HIGH: 0,
  SIGNIFICANT_LOW: 1,
  HIGH: 2,
  LOW: 3,
};

export async function generateGpHandoverPdf(reportId: string): Promise<Buffer> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      panel: true,
      patient: { include: { patientProfile: true } },
      source: true,
      results: { include: { marker: true, referenceRange: true } },
    },
  });

  const contact = getClinicContact();
  const profile = report.patient.patientProfile;
  const patientName = profile
    ? `${profile.title ? profile.title + ' ' : ''}${profile.firstName} ${profile.lastName}`
    : report.patient.email;
  // Encrypted at rest like every other identifier on the profile — decrypted
  // here and nowhere else in this file. A GP checking they have the right
  // patient checks the name AND the date of birth, which is exactly why it has
  // to be on the page and exactly why it is stored the way it is.
  const dateOfBirth = profile?.dobEncrypted ? formatDate(decryptField(profile.dobEncrypted)) : null;

  /**
   * OUT OF RANGE ONLY, and "out of range" means the status the laboratory's
   * range produced — never a threshold of our own.
   *
   * A result with no status was never placed against a range (nine markers
   * carry no numeric range on purpose, and a textual result has no position on
   * one), so it is not out of range and is not in range either. It is left off
   * rather than guessed at: a urinalysis pad reading "Trace" on a GP's summary
   * of abnormal findings is a finding the laboratory did not report.
   */
  const rows = report.results
    .map((r) => ({ r, decoded: decodeResultValue(decryptField(r.valueEncrypted)) }))
    .filter(({ decoded }) => hasResultValue(decoded))
    .filter(({ r }) => r.status !== null && r.status !== 'IN_RANGE')
    .sort((a, b) => {
      const bySeverity = (STATUS_ORDER[a.r.status!] ?? 9) - (STATUS_ORDER[b.r.status!] ?? 9);
      return bySeverity !== 0 ? bySeverity : a.r.marker.name.localeCompare(b.r.marker.name);
    });

  const measuredCount = report.results.filter(({ valueEncrypted }) =>
    hasResultValue(decodeResultValue(decryptField(valueEncrypted))),
  ).length;

  const reportTitle = formatReportTitle(report.panel?.name, report.results.length, report.sampleDate);

  return renderPdf((doc) => {
    const left = 56;
    const width = 483;

    // ── Title block ────────────────────────────────────────────────────────
    // No wordmark lockup. The practice's name set once, plainly, as the source
    // of the document rather than as branding on it.
    use(doc, 'displayBold', 15).fillColor(ESPRESSO).text('Aspire Clinic: private laboratory results', left, doc.y, {
      width,
    });
    use(doc, 'body', 9).fillColor(ESPRESSO).text('Summary for the patient’s general practitioner', { width });
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(ESPRESSO).lineWidth(1).stroke();
    doc.moveDown(0.8);

    /**
     * Identity and provenance, as a label/value grid rather than prose.
     *
     * Two columns so it fits in five lines: a GP checks these in a fixed order
     * — is this the right patient, when was the sample taken, who ran it — and
     * a paragraph makes each of those a sentence to read rather than a field to
     * find.
     */
    const pairs: [string, string, boolean][] = [
      ['Patient', patientName, false],
      ['Date of birth', dateOfBirth ?? 'Not on record', dateOfBirth !== null],
      ['Sample taken', formatDate(report.sampleDate), true],
      ['Report', reportTitle, false],
      /**
       * ── THE LABORATORY ROW IS BACK, AND ONLY HERE (restored Aug 2026) ───
       *
       * It was removed with "Analysed by Randox Health" everywhere else, and
       * the removal was flagged at the time as the one place it cost
       * something. It did, so it is back.
       *
       * THE ARGUMENT IS THE SAME ONE IN BOTH DIRECTIONS. On a patient's result
       * card, the name of the laboratory says something about the practice's
       * commercial arrangements and nothing about the number beside it. On a
       * doctor's page it is the reason two numbers might not be comparable: a
       * REFERENCE INTERVAL IS ASSAY-SPECIFIC, so a GP holding this against
       * their own laboratory's range needs to know whose analyser produced it.
       * The sentence below has always said the ranges are assay-specific; this
       * row is what makes that sentence actionable rather than a caveat.
       *
       * ⚠ IT STAYS OFF THE PATIENT PDF, which is the other half of the
       * decision. This is not "we changed our mind about the removal" — it is
       * the one document in the product whose reader can use it.
       *
       * `sourceLabel` is deliberately not used: it returns the empty string for
       * an in-house result, which is right on a screen that guards it and wrong
       * in a two-column grid that would print a label over a blank cell. The
       * source's own NAME is what a GP wants anyway.
       */
      ['Laboratory', report.source.name, false],
      ['Summary prepared', formatDate(new Date()), true],
    ];
    const colGap = 12;
    const colW = (width - colGap) / 2;
    let rowTop = doc.y;
    pairs.forEach(([label, value, numeric], i) => {
      const x = left + (i % 2) * (colW + colGap);
      if (i % 2 === 0 && i > 0) rowTop = doc.y;
      use(doc, 'bodyBold', 7.5)
        .fillColor(ESPRESSO)
        .text(label.toUpperCase(), x, rowTop, { width: colW, characterSpacing: 0.9 });
      use(doc, numeric ? 'mono' : 'body', 10)
        .fillColor(ESPRESSO)
        .text(value, x, rowTop + 10, { width: colW });
      // The second column must not advance the cursor past the first's — both
      // are drawn from the same rowTop, and whichever wrapped further wins.
      if (i % 2 === 1 || i === pairs.length - 1) doc.y = Math.max(doc.y, rowTop + 26);
    });
    doc.moveDown(0.8);

    // ── The one non-clinical sentence on the page ──────────────────────────
    // What this is and what it is not. Positional, not interpretive: it names
    // the laboratory and states that a private result is not a diagnosis, and
    // stops there.
    use(doc, 'body', 9).fillColor(ESPRESSO).text(
      // The laboratory is NAMED in the grid above rather than in this sentence.
      // A row is a field a GP can find; a clause inside a paragraph is a thing
      // they have to read the paragraph to reach.
      `These are private laboratory results requested by the patient. ` +
        `They are a measurement, not a diagnosis, and were not taken in the context of a clinical assessment. ` +
        `Reference ranges are the laboratory’s own and are assay-specific.`,
      left,
      doc.y,
      { width, lineGap: 1.5 },
    );
    doc.moveDown(1);

    // ── The table ──────────────────────────────────────────────────────────
    use(doc, 'bodyBold', 10).fillColor(ESPRESSO).text(
      rows.length === 0
        ? 'No result outside its reference range'
        : `${rows.length} result${rows.length === 1 ? '' : 's'} outside the reference range` +
          ` (of ${measuredCount} measured)`,
      left,
      doc.y,
      { width },
    );
    doc.moveDown(0.5);

    if (rows.length === 0) {
      use(doc, 'body', 9.5)
        .fillColor(ESPRESSO)
        .text(
          `Every measured marker on this report sat inside the range the laboratory applied to it. ` +
            `The full result set is available to the patient in their portal.`,
          left,
          doc.y,
          { width, lineGap: 1.5 },
        );
    } else {
      /**
       * ── RANGE, THEN RESULT, THEN STATUS (Aug 2026) ────────────────────────
       *
       * It was MARKER · RESULT · UNIT · RANGE · STATUS. The order is now the
       * one both documents use: the range a result was measured against, then
       * the result, then what that combination came to. It reads as the
       * comparison it is — "133–146, and this one is 128, so: below range" —
       * rather than as a number followed some columns later by the thing it
       * would have to be compared with.
       *
       * THE UNIT STAYS BESIDE THE RESULT rather than leading the three, because
       * it is a property of the number and not a column anybody scans. The
       * three columns the instruction names are in the order it names them.
       *
       * The x positions are recomputed rather than permuted: the widths differ
       * per column (a range needs more room than a unit) and shuffling the
       * labels over the old offsets would print each header over its
       * neighbour's cells. Right edge unchanged at 539.
       */
      const colX = [56, 218, 292, 358, 424];
      const colW2 = [158, 74, 66, 64, 115];
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 96;

      function header() {
        const y = doc.y;
        use(doc, 'bodyBold', 7.5).fillColor(ESPRESSO);
        for (const [i, label] of ['MARKER', 'RANGE', 'RESULT', 'UNIT', 'STATUS'].entries()) {
          doc.text(label, colX[i], y, { width: colW2[i], characterSpacing: 0.8 });
        }
        const lineY = y + 12;
        doc.moveTo(left, lineY).lineTo(left + width, lineY).strokeColor(TAUPE).lineWidth(1).stroke();
        doc.y = lineY + 5;
      }

      header();

      // The three numeric columns take the mono face for the same reason they
      // do on screen and in the patient letter: read as a column, they have to
      // line up. `monoBold` follows the RESULT to its new position — it is the
      // number a clinician is looking for and it stays the heaviest cell in the
      // row wherever the row puts it.
      const cellFont: FontRole[] = ['body', 'mono', 'monoBold', 'mono', 'body'];

      for (const { r, decoded } of rows) {
        const range =
          r.referenceRange && r.referenceRange.low !== null && r.referenceRange.high !== null
            ? formatReferenceRange(r.referenceRange.low, r.referenceRange.high)
            : '—';
        const cells = [
          r.marker.name,
          range,
          decoded.valueText ?? (decoded.value !== null ? String(decoded.value) : '—'),
          r.unit || '—',
          STATUS_TEXT[r.status!] ?? r.status!,
        ];

        // Measure before drawing. PDFKit's automatic page break knows nothing
        // about manually positioned columns — left to itself it writes rows off
        // the bottom edge and drops the header. Same explicit pagination as the
        // patient letter, and the same reason.
        const rowHeight = Math.max(
          ...cells.map((text, i) => {
            use(doc, cellFont[i], 9);
            return doc.heightOfString(text, { width: colW2[i] });
          }),
        );
        if (doc.y + rowHeight + 5 > bottomLimit) {
          doc.addPage();
          header();
        }

        const y = doc.y;
        cells.forEach((text, i) => {
          use(doc, cellFont[i], 9).fillColor(ESPRESSO).text(text, colX[i], y, { width: colW2[i] });
        });
        doc.y = y + rowHeight + 5;
        doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).strokeColor(TAUPE).lineWidth(0.5).stroke();
      }
    }

    // ── Contact ────────────────────────────────────────────────────────────
    // For a doctor who wants to discuss it, which is the point of handing this
    // over. CLINIC_CONTACT_EMAIL, never the escalation address — see the note
    // in CLAUDE.md about the two being one variable and publishing a named
    // clinician's personal address into every PDF ever downloaded.
    doc.moveDown(1.2);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(ESPRESSO).lineWidth(0.5).stroke();
    doc.moveDown(0.6);
    use(doc, 'bodyBold', 8).fillColor(ESPRESSO).text('TO DISCUSS THESE RESULTS', left, doc.y, {
      width,
      characterSpacing: 0.9,
    });
    doc.moveDown(0.3);
    const lines = [
      contact.name,
      ...contact.addressLines,
      ...(contact.phone ? [contact.phone] : []),
      contact.hours,
      contact.emergencyNote,
      contact.email,
    ];
    use(doc, 'body', 9).fillColor(ESPRESSO).text(lines.join('\n'), left, doc.y, { width, lineGap: 1 });
  });
}
