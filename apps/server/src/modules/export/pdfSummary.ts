import { prisma } from '../../db/client.js';
import { renderPdf } from '../../lib/pdfRender.js';
import { decryptField } from '../../lib/crypto.js';
import { decodeResultValue } from '../../lib/resultValue.js';
import {
  formatDate,
  formatReferenceRange,
  formatReportTitle,
  hasResultValue,
  NO_STATUS_LABEL,
  brand,
} from '@aspire-bloods/shared';
import { getClinicContact } from '../content/clinicContact.js';
import { listAllMarkersForPatient } from '../patients/portalService.js';

/**
 * ── FROM THE TOKENS, NOT TYPED OUT (Aug 2026) ──────────────────────────────
 *
 * These were three literal hexes, copied from the brand palette at some point
 * and thereafter unable to hear about a change to it. The retheme found them:
 * every surface on both screens went neutral and cool, and these two PDF
 * builders were the only things left in the product still printing warm brown —
 * silently, in a document a patient keeps and hands to a doctor.
 *
 * The names are kept because they read as roles at the call sites below
 * (`ESPRESSO` is the ink, `TAUPE` is the rule), which is what they always were.
 * What is fixed is where the value comes from.
 */
const BRONZE = brand.bronze;
const ESPRESSO = brand.espresso;
const TAUPE = brand.taupe;

/**
 * THE THREE ROLES THE SCREEN USES, in the three faces a PDF can guarantee.
 *
 * Display / body / numeric, exactly as in tokens.ts: a high-contrast serif for
 * the letterhead and the headings, a neutral sans for prose and UI, and a
 * genuine monospace for every number — results, units, reference ranges and
 * dates rendered as data. A results letter reads with the same structure as
 * the portal it was downloaded from, and the numeric columns line up because
 * the numeric face is fixed-width by construction.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE THE BASE-14 FACES AND NOT FRAUNCES / IBM PLEX. Do not spend
 * an afternoon re-attempting this; it was attempted and reverted, and the
 * failure mode is worse than the cosmetic loss.
 *
 * PDFKit embeds a font by SUBSETTING it with fontkit. fontkit's TTF subsetter
 * throws on all four vendored faces once a document contains enough distinct
 * glyphs — `ERR_BUFFER_OUT_OF_BOUNDS` in `TTFSubset._addGlyph`, and
 * `ERR_OUT_OF_RANGE` writing a `loca` offset past 65535 for IBM Plex Mono in
 * particular. It reproduces with woff and woff2 alike, with the static cuts
 * and with the variable ones, and with fontsource's latin subsets and their
 * full files. A short document embeds cleanly, which is exactly what makes it
 * dangerous: it passes every smoke test and fails on a real 180-marker panel.
 *
 * And it does not fail as a rejected promise. The subset runs inside the
 * stream flush that `doc.end()` schedules, so the throw is an UNCAUGHT
 * EXCEPTION: a try/catch around the generator does not see it and the Node
 * process dies. A patient pressing Download would not get a 500, they would
 * take the API down for everybody. That is not a trade a results portal makes
 * for nicer letterforms.
 *
 * The base-14 faces are in every PDF reader by definition, embed nothing, and
 * cannot fail. If this is ever revisited: the fix is a font whose subset
 * fontkit can encode (verify against a full report, not a sample line), or a
 * renderer that does not subset. Not a different weight of the same files.
 * ────────────────────────────────────────────────────────────────────────
 */
const FONTS = {
  /** Letterhead and headings. The base-14 serif — Fraunces' nearest relative here. */
  display: 'Times-Roman',
  displayBold: 'Times-Bold',
  /** Prose, labels, UI. */
  body: 'Helvetica',
  bodyBold: 'Helvetica-Bold',
  /** Numbers only: results, units, ranges, dates as data. Monospaced, so a column is a column. */
  mono: 'Courier',
  monoBold: 'Courier-Bold',
} as const;

type FontRole = keyof typeof FONTS;

/** Named rather than stringly-typed, so a typo is a compile error not a fallback. */
function use(doc: PDFKit.PDFDocument, role: FontRole, size?: number) {
  doc.font(FONTS[role]);
  if (size !== undefined) doc.fontSize(size);
  return doc;
}

/**
 * The mark, in the same two-tone lockup the portal's wordmark uses. Text-based,
 * since no logo asset was supplied — swap for a real mark when one exists.
 *
 * "Aspire Group of Companies" is gone from the line beneath it: the practice is
 * Aspire Clinic to the people it treats, and the registered entity name belongs
 * in the privacy and security documents rather than on a results letter. The
 * address that replaced it comes from getClinicContact(), so this letterhead
 * and the portal's sidebar cannot say different things.
 */
function drawLetterhead(doc: PDFKit.PDFDocument) {
  const contact = getClinicContact();
  use(doc, 'displayBold', 22).fillColor(BRONZE).text('Aspire', { continued: true });
  use(doc, 'display').fillColor(ESPRESSO).text(' Clinic');
  use(doc, 'body', 9)
    .fillColor(ESPRESSO)
    .text(contact.addressLines.join(', '), { characterSpacing: 0.2 });
  doc.moveDown(1.5);
}

/**
 * Space to reserve before starting the contact block, so it is never orphaned
 * from the "Next steps" paragraph it belongs to. A generous fixed figure rather
 * than a measurement: the block is five short lines and measuring each of them
 * to save fifteen points of slack is not worth the arithmetic.
 */
const CONTACT_BLOCK_HEIGHT = 92;

/**
 * The clinic's details, ONE ITEM PER LINE — address, opening hours, emergency
 * line, email, with the phone number above them when one is configured. The
 * same order and the same four facts the shared ClinicContact component renders
 * on screen.
 */
function drawClinicContact(doc: PDFKit.PDFDocument, x: number, width: number) {
  const contact = getClinicContact();
  const line = (label: string, value: string, numeric = false) => {
    use(doc, 'bodyBold', 7.5).fillColor(ESPRESSO).text(label.toUpperCase(), x, doc.y, { width, characterSpacing: 0.9 });
    use(doc, numeric ? 'mono' : 'body', 9).fillColor(ESPRESSO).text(value, x, doc.y, { width });
    doc.moveDown(0.45);
  };

  if (contact.phone) line('Phone', contact.phone, true);
  // ONE ITEM PER LINE, and that includes the address's own lines. Joined with
  // commas the PDF quietly reintroduced the "Aspire Clinic, 27 Mortimer Street,
  // London" run-on that the screen version was rebuilt to get rid of — the two
  // renderings of the same four facts have to agree.
  line('Address', [contact.name, ...contact.addressLines].join('\n'));
  line('Opening hours', contact.hours);
  line('Emergency line', contact.emergencyNote);
  line('Email', contact.email);
}

const STATUS_LABEL: Record<string, string> = {
  IN_RANGE: 'In range',
  HIGH: 'Above range',
  LOW: 'Below range',
  SIGNIFICANT_HIGH: 'Significantly above range',
  SIGNIFICANT_LOW: 'Significantly below range',
};

/**
 * Follows the brand's appointment-summary-letter layout (brief §1): Aspire
 * mark, right-aligned date + recipient address block, body copy, signed-off
 * footer with the releasing clinician's name/post-nominals/role — so a
 * results summary reads like it came from the same practice as everything
 * else the patient receives. Text-based wordmark, since no logo file was
 * supplied (see plan notes) — swap for a real mark asset when available.
 */
export async function generateAspireSummaryPdf(reportId: string): Promise<Buffer> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      panel: true,
      patient: { include: { patientProfile: true } },
      reviewedBy: { include: { staffProfile: true } },
      results: { include: { marker: true, referenceRange: true } },
    },
  });

  const footerDisclaimer = await prisma.copyBlock.findUnique({ where: { slug: 'footer_disclaimer' } });
  const outOfRangePrompt = await prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } });

  // The same two rules the portal follows, because this letter is the portal
  // on paper and the two must not say different things about one report.
  // A result with nothing in it is not printed at all; a result with no
  // position on its range is printed with its value and no status.
  const rows = report.results
    .map((r) => ({ r, decoded: decodeResultValue(decryptField(r.valueEncrypted)) }))
    .filter(({ decoded }) => hasResultValue(decoded));
  // `!== 'IN_RANGE'` alone would count a statusless result as flagged and put
  // the "speak to your GP" block on a letter that has nothing flagged in it.
  const hasFlagged = rows.some(({ r }) => r.status !== null && r.status !== 'IN_RANGE');

  const profile = report.patient.patientProfile;
  const patientName = profile ? `${profile.title ? profile.title + ' ' : ''}${profile.firstName} ${profile.lastName}` : report.patient.email;
  // Optional since self-registration: the recipient block simply omits the
  // address line rather than printing a blank one.
  const address = profile?.addressEncrypted ? decryptField(profile.addressEncrypted) : '';

  // Every failure mode of the draw below — a synchronous throw, an 'error'
  // on the stream, a document that never ends — comes back as a rejected
  // promise rather than as a dead process. See lib/pdfRender.ts.
  return renderPdf((doc) => {
    const leftMargin = 56;
    const fullWidth = 483;

    drawLetterhead(doc);

    // Right-aligned date + recipient block. The date is data, so it is set in
    // the mono face like every other date rendered as data; the name and the
    // address are not.
    use(doc, 'mono', 9).fillColor(ESPRESSO).text(formatDate(new Date()), { align: 'right' });
    doc.moveDown(0.5);
    use(doc, 'body', 10).text(patientName, { align: 'right' });
    if (address) doc.text(address, { align: 'right' });
    if (profile?.postcode) doc.text(profile.postcode, { align: 'right' });
    doc.moveDown(1.5);

    // Body. The panel is optional (schema: Report.panelId) — formatReportTitle
    // falls back to "12 markers · 4 August 2026" rather than leaving a dangling
    // "results summary" with nothing in front of it.
    const reportTitle = formatReportTitle(report.panel?.name, report.results.length, report.sampleDate);
    use(doc, 'display', 16).fillColor(ESPRESSO).text(`${reportTitle}: results summary`);
    use(doc, 'body', 10).moveDown(0.6);
    doc.text(`Dear ${profile?.firstName ?? 'Patient'},`);
    doc.moveDown(0.5);
    doc.text(
      report.panel?.name
        ? `Please find below a summary of your ${report.panel.name} results, from a sample taken on ${formatDate(report.sampleDate)}.`
        : `Please find below a summary of your results, from a sample taken on ${formatDate(report.sampleDate)}.`,
    );
    doc.moveDown(1);

    // Results table. A 40-marker panel does not fit on one A4 page, and
    // PDFKit's automatic page break does not know about our manually
    // positioned columns — left to itself it writes rows off the bottom edge
    // and drops the header. So pagination is explicit: we measure each row
    // before drawing it, break when it would cross the bottom margin, and
    // re-draw the column header on every new page so no page of results is
    // ever unlabelled.
    /**
     * ── RANGE, THEN RESULT, THEN STATUS (Aug 2026) ───────────────────────────
     *
     * It was MARKER · RESULT · UNIT · RANGE · STATUS in both documents. The
     * order is now the comparison a reader is actually making: the range this
     * was measured against, then the result, then what the two came to. The
     * unit stays beside the result, because it is a property of that number
     * rather than a column anybody scans.
     *
     * The x offsets are recomputed rather than permuted — the widths differ per
     * column and moving the labels over the old offsets would print each header
     * over its neighbour's cells. Right edge unchanged at 560.
     */
    const colX = [56, 250, 330, 400, 470];
    const colWidth = [190, 76, 66, 66, 90];
    const ROW_GAP = 6;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

    function drawTableHeader() {
      const y = doc.y;
      use(doc, 'bodyBold', 8).fillColor(ESPRESSO);
      for (const [i, label] of ['MARKER', 'RANGE', 'RESULT', 'UNIT', 'STATUS'].entries()) {
        doc.text(label, colX[i], y, { width: colWidth[i], characterSpacing: 0.8 });
      }
      const lineY = y + 13;
      doc.moveTo(leftMargin, lineY).lineTo(leftMargin + fullWidth, lineY).strokeColor(TAUPE).stroke();
      doc.y = lineY + 6;
    }

    drawTableHeader();

    /**
     * Which face each column is set in. The three middle ones — value, unit and
     * range — are the numeric data on this page and take the mono face, for
     * exactly the reason they do on screen: read as a column, they have to line
     * up.
     */
    const cellFont: FontRole[] = ['body', 'mono', 'mono', 'mono', 'body'];

    for (const { r, decoded } of rows) {
      const cells = [
        r.marker.name,
        // THROUGH `formatReferenceRange`, NOT INTERPOLATED (fixed Aug 2026).
        // This was `${low}–${high}`, which is the one thing CLAUDE.md says every
        // reference range that reaches a screen or a PDF must not be: an eGFR
        // whose catalogue ceiling is the OPEN_UPPER_BOUND sentinel printed as
        // "60–999" in a document a patient keeps, and a converted range printed
        // as "3.884960761896305–5.494444506110488". The formatter sets an
        // open-topped range in words and rounds a converted one.
        formatReferenceRange(r.referenceRange.low, r.referenceRange.high),
        // Numeric or textual ("< 0.6") — decodeResultValue has already separated
        // the two and rejected the placeholders that are neither.
        decoded.valueText ?? String(decoded.value),
        r.unit,
        r.status === null ? NO_STATUS_LABEL : (STATUS_LABEL[r.status] ?? r.status),
      ];
      // Tallest cell decides the row height — a long marker name wraps to two
      // lines and the row has to grow with it, or the next row lands on top.
      // Measured in each cell's OWN face: mono runs wider than the sans at the
      // same size, so measuring everything in one face under-counts the wraps.
      // Measured in each cell's OWN face: Courier runs wider than Helvetica at
      // the same size, so measuring everything in one face under-counts the wraps.
      const rowHeight = Math.max(
        ...cells.map((text, i) => {
          use(doc, cellFont[i], 9);
          return doc.heightOfString(text, { width: colWidth[i] });
        }),
      );

      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage();
        // Landing on page 3 of a 40-marker report should not look like the
        // start of a fresh table.
        use(doc, 'bodyBold', 9).fillColor(ESPRESSO).text('(continued)', leftMargin, doc.y);
        doc.moveDown(0.5);
        drawTableHeader();
      }

      const y = doc.y;
      // Bronze marks a result worth reading twice. A result with no status is
      // not one of those — it is ordinary espresso, like an in-range row.
      const flagged = r.status !== null && r.status !== 'IN_RANGE';
      cells.forEach((text, i) => {
        use(doc, cellFont[i], 9).fillColor(i === 4 && flagged ? BRONZE : ESPRESSO);
        doc.text(text, colX[i], y, { width: colWidth[i] });
      });
      doc.y = y + rowHeight + ROW_GAP;
    }

    doc.x = leftMargin;
    doc.moveDown(1);

    // Same reasoning as the table: reserve space for a block before writing
    // it, so the closing sections never split awkwardly across a page break
    // or run off the bottom of a long report.
    function ensureSpace(needed: number) {
      if (doc.y + needed > bottomLimit) {
        doc.addPage();
        doc.x = leftMargin;
      }
    }

    if (hasFlagged && outOfRangePrompt) {
      use(doc, 'body', 9);
      ensureSpace(doc.heightOfString(outOfRangePrompt.body, { width: fullWidth }) + CONTACT_BLOCK_HEIGHT + 30);
      use(doc, 'display', 12).fillColor(ESPRESSO).text('Next steps', leftMargin, doc.y, { width: fullWidth });
      use(doc, 'body', 9).moveDown(0.4);
      doc.text(outOfRangePrompt.body, leftMargin, doc.y, { width: fullWidth });
      doc.moveDown(0.9);
      // The clinic's details, one item per line, from the same getClinicContact()
      // the portal renders. They used to be pasted onto the end of the copy block
      // above as one comma-joined line, which is both unreadable and a second
      // place for them to go stale.
      drawClinicContact(doc, leftMargin, fullWidth);
      doc.moveDown(1);
    }

    if (footerDisclaimer) {
      use(doc, 'body', 8);
      ensureSpace(doc.heightOfString(footerDisclaimer.body, { width: fullWidth }) + 16);
      doc.fillColor(ESPRESSO).text(footerDisclaimer.body, leftMargin, doc.y, { width: fullWidth });
      doc.moveDown(1.5);
    }

    // Signed-off footer — kept whole; a signature split across a page break
    // reads as an unsigned letter.
    ensureSpace(64);
    const staff = report.reviewedBy?.staffProfile;
    use(doc, 'bodyBold', 9)
      .fillColor(ESPRESSO)
      .text(staff ? `${staff.firstName} ${staff.lastName}` : 'Aspire Clinical Team', leftMargin, doc.y, { width: fullWidth });
    if (staff?.postNominals) use(doc, 'body', 9).text(staff.postNominals, leftMargin, doc.y, { width: fullWidth });
    if (staff?.roleTitle) use(doc, 'body', 9).text(staff.roleTitle, leftMargin, doc.y, { width: fullWidth });
    use(doc, 'body', 9).text('Aspire Clinic', leftMargin, doc.y, { width: fullWidth });
  });
}

/**
 * EVERY MARKER THE PATIENT HAS, on paper — the "Download markers (PDF)"
 * button beside the By marker view's at-a-glance strip.
 *
 * A deliberately different document from the report summary above, because it
 * answers a different question. The summary is one panel, addressed as a
 * letter and signed by the clinician who released it. This is a reference
 * sheet: the latest value for every marker ever tested, across every report,
 * with the date each one was taken. There is no signature on it, because no
 * single clinician released "all of it".
 *
 * It shares everything else — the same three faces, the same letterhead, the
 * same status vocabulary, the same non-diagnostic footer, and the same rule
 * about results with no position on their range (printed, with the value, and
 * no status invented for them).
 *
 * MEASURED only, exactly as on screen. A genetic indicator, a food sensitivity
 * level and a microbiome proportion have no reference range and so no status,
 * and a table with Range and Status columns has nothing true to put in either.
 */
export async function generateAllMarkersPdf(patientId: string): Promise<Buffer> {
  const [markers, profile, footerDisclaimer, outOfRangePrompt] = await Promise.all([
    listAllMarkersForPatient(patientId),
    prisma.patientProfile.findUnique({ where: { userId: patientId } }),
    prisma.copyBlock.findUnique({ where: { slug: 'footer_disclaimer' } }),
    prisma.copyBlock.findUnique({ where: { slug: 'out_of_range_prompt' } }),
  ]);

  const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED');
  const hasFlagged = measured.some((m) => m.status !== null && m.status !== 'IN_RANGE');

  return renderPdf((doc) => {
    const leftMargin = 56;
    const fullWidth = 483;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

    drawLetterhead(doc);

    use(doc, 'mono', 9).fillColor(ESPRESSO).text(formatDate(new Date()), { align: 'right' });
    doc.moveDown(0.5);
    use(doc, 'body', 10).text(
      profile ? `${profile.title ? profile.title + ' ' : ''}${profile.firstName} ${profile.lastName}` : 'Patient',
      { align: 'right' },
    );
    doc.moveDown(1.5);

    use(doc, 'display', 16).fillColor(ESPRESSO).text('Every marker you have had tested', leftMargin, doc.y, { width: fullWidth });
    use(doc, 'body', 10).moveDown(0.6);
    doc.text(
      measured.length === 1
        ? 'The latest result for the one marker on your record, with the date the sample was taken.'
        : `The latest result for each of the ${measured.length} markers on your record, with the date each sample was taken. Where a marker has been tested more than once, only the most recent value is shown here.`,
      leftMargin,
      doc.y,
      { width: fullWidth },
    );
    doc.moveDown(1);

    // The at-a-glance counts, in words rather than as tiles — a PDF has no
    // filter to press, so the tiles would be three numbers pretending to be
    // buttons. Statusless results are in none of the three, same as on screen.
    const counts = {
      inRange: measured.filter((m) => m.status === 'IN_RANGE').length,
      outOfRange: measured.filter((m) => m.status === 'HIGH' || m.status === 'LOW').length,
      significant: measured.filter((m) => m.status === 'SIGNIFICANT_HIGH' || m.status === 'SIGNIFICANT_LOW').length,
    };
    use(doc, 'bodyBold', 8).fillColor(ESPRESSO).text('AT A GLANCE', leftMargin, doc.y, { width: fullWidth, characterSpacing: 0.9 });
    use(doc, 'body', 9).text(
      `${counts.inRange} in range. ${counts.outOfRange} outside the usual range. ${counts.significant} significantly outside it.`,
      leftMargin,
      doc.y,
      { width: fullWidth },
    );
    doc.moveDown(1);

    // Range, then result, then status — the same order as the table above and
    // as the GP handover. See the note there.
    const colX = [56, 236, 302, 366, 432];
    const colWidth = [176, 62, 60, 62, 107];
    // Marker, then three numeric columns, then the status word.
    const cellFont: FontRole[] = ['body', 'mono', 'mono', 'mono', 'body'];
    const ROW_GAP = 6;

    function drawTableHeader() {
      const y = doc.y;
      use(doc, 'bodyBold', 8).fillColor(ESPRESSO);
      for (const [i, label] of ['MARKER', 'RANGE', 'RESULT', 'SAMPLED', 'STATUS'].entries()) {
        doc.text(label, colX[i], y, { width: colWidth[i], characterSpacing: 0.8 });
      }
      const lineY = y + 13;
      doc.moveTo(leftMargin, lineY).lineTo(leftMargin + fullWidth, lineY).strokeColor(TAUPE).stroke();
      doc.y = lineY + 6;
    }

    drawTableHeader();

    for (const m of measured) {
      // A qualitative result has no numeric range behind it, and printing "0–0"
      // for one would be a half-populated row stating something false — the same
      // rule the card and the row follow on screen.
      const hasRange = m.status !== null && m.referenceHigh > m.referenceLow;
      const cells = [
        m.name,
        // Formatted, never interpolated — see the same fix in the table above.
        hasRange ? formatReferenceRange(m.referenceLow, m.referenceHigh) : '',
        `${m.valueText ?? m.value ?? ''}${m.unit ? ` ${m.unit}` : ''}`.trim(),
        formatDate(m.sampleDate),
        m.status === null ? NO_STATUS_LABEL : (STATUS_LABEL[m.status] ?? m.status),
      ];
      const rowHeight = Math.max(
        ...cells.map((text, i) => {
          use(doc, cellFont[i], 9);
          return doc.heightOfString(text || ' ', { width: colWidth[i] });
        }),
      );

      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage();
        use(doc, 'bodyBold', 9).fillColor(ESPRESSO).text('(continued)', leftMargin, doc.y);
        doc.moveDown(0.5);
        drawTableHeader();
      }

      const y = doc.y;
      const flagged = m.status !== null && m.status !== 'IN_RANGE';
      cells.forEach((text, i) => {
        use(doc, cellFont[i], 9).fillColor(i === 4 && flagged ? BRONZE : ESPRESSO);
        doc.text(text, colX[i], y, { width: colWidth[i] });
      });
      doc.y = y + rowHeight + ROW_GAP;
    }

    doc.x = leftMargin;
    doc.moveDown(1);

    function ensureSpace(needed: number) {
      if (doc.y + needed > bottomLimit) {
        doc.addPage();
        doc.x = leftMargin;
      }
    }

    if (hasFlagged && outOfRangePrompt) {
      use(doc, 'body', 9);
      ensureSpace(doc.heightOfString(outOfRangePrompt.body, { width: fullWidth }) + CONTACT_BLOCK_HEIGHT + 30);
      use(doc, 'display', 12).fillColor(ESPRESSO).text('Next steps', leftMargin, doc.y, { width: fullWidth });
      use(doc, 'body', 9).moveDown(0.4);
      doc.text(outOfRangePrompt.body, leftMargin, doc.y, { width: fullWidth });
      doc.moveDown(0.9);
      drawClinicContact(doc, leftMargin, fullWidth);
      doc.moveDown(1);
    }

    if (footerDisclaimer) {
      use(doc, 'body', 8);
      ensureSpace(doc.heightOfString(footerDisclaimer.body, { width: fullWidth }) + 16);
      doc.fillColor(ESPRESSO).text(footerDisclaimer.body, leftMargin, doc.y, { width: fullWidth });
    }
  });
}
