import PDFDocument from 'pdfkit';
import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { formatDate, formatReportTitle } from '@aspire-bloods/shared';

const BRONZE = '#8a5e45';
const ESPRESSO = '#423c36';
const TAUPE = '#c9bca9';

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
  const hasFlagged = report.results.some((r) => r.status !== 'IN_RANGE');

  const profile = report.patient.patientProfile;
  const patientName = profile ? `${profile.title ? profile.title + ' ' : ''}${profile.firstName} ${profile.lastName}` : report.patient.email;
  // Optional since self-registration: the recipient block simply omits the
  // address line rather than printing a blank one.
  const address = profile?.addressEncrypted ? decryptField(profile.addressEncrypted) : '';

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Letterhead
  doc.font('Helvetica-Bold').fontSize(20).fillColor(BRONZE).text('ASPIRE', { continued: true });
  doc.font('Helvetica').fillColor(ESPRESSO).text(' CLINIC');
  doc.font('Helvetica').fontSize(9).fillColor(ESPRESSO).text('Aspire Group of Companies — 27 Mortimer Street, London');
  doc.moveDown(1.5);

  // Right-aligned date + recipient block
  const today = formatDate(new Date());
  doc.font('Helvetica').fontSize(10).fillColor(ESPRESSO).text(today, { align: 'right' });
  doc.moveDown(0.5);
  doc.text(patientName, { align: 'right' });
  if (address) doc.text(address, { align: 'right' });
  if (profile?.postcode) doc.text(profile.postcode, { align: 'right' });
  doc.moveDown(1.5);

  // Body. The panel is optional (schema: Report.panelId) — formatReportTitle
  // falls back to "12 markers · 4 August 2026" rather than leaving a
  // dangling "— results summary" with nothing in front of it.
  const reportTitle = formatReportTitle(report.panel?.name, report.results.length, report.sampleDate);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(ESPRESSO).text(`${reportTitle} — results summary`);
  doc.fontSize(10).font('Helvetica').moveDown(0.5);
  doc.text(`Dear ${profile?.firstName ?? 'Patient'},`);
  doc.moveDown(0.5);
  doc.text(
    report.panel?.name
      ? `Please find below a summary of your ${report.panel.name} results, from a sample taken on ${formatDate(report.sampleDate)}.`
      : `Please find below a summary of your results, from a sample taken on ${formatDate(report.sampleDate)}.`,
  );
  doc.moveDown(1);

  const leftMargin = 56;
  const fullWidth = 483;

  // Results table. A 40-marker panel does not fit on one A4 page, and
  // PDFKit's automatic page break does not know about our manually
  // positioned columns — left to itself it writes rows off the bottom edge
  // and drops the header. So pagination is explicit: we measure each row
  // before drawing it, break when it would cross the bottom margin, and
  // re-draw the column header on every new page so no page of results is
  // ever unlabelled.
  const colX = [56, 250, 320, 400, 470];
  const colWidth = [190, 66, 76, 66, 90];
  const ROW_GAP = 6;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

  function drawTableHeader() {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ESPRESSO);
    doc.text('Marker', colX[0], y, { width: colWidth[0] });
    doc.text('Result', colX[1], y, { width: colWidth[1] });
    doc.text('Unit', colX[2], y, { width: colWidth[2] });
    doc.text('Range', colX[3], y, { width: colWidth[3] });
    doc.text('Status', colX[4], y, { width: colWidth[4] });
    const lineY = y + 13;
    doc.moveTo(leftMargin, lineY).lineTo(leftMargin + fullWidth, lineY).strokeColor(TAUPE).stroke();
    doc.y = lineY + 6;
  }

  drawTableHeader();
  doc.font('Helvetica').fontSize(9);

  for (const r of report.results) {
    const cells = [
      r.marker.name,
      String(Number(decryptField(r.valueEncrypted))),
      r.unit,
      `${r.referenceRange.low}–${r.referenceRange.high}`,
      STATUS_LABEL[r.status] ?? r.status,
    ];
    // Tallest cell decides the row height — a long marker name wraps to two
    // lines and the row has to grow with it, or the next row lands on top.
    const rowHeight = Math.max(
      ...cells.map((text, i) => doc.heightOfString(text, { width: colWidth[i] })),
    );

    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      // Landing on page 3 of a 40-marker report should not look like the
      // start of a fresh table.
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ESPRESSO).text('(continued)', leftMargin, doc.y);
      doc.moveDown(0.5);
      drawTableHeader();
      doc.font('Helvetica').fontSize(9);
    }

    const y = doc.y;
    doc.fillColor(ESPRESSO);
    doc.text(cells[0], colX[0], y, { width: colWidth[0] });
    doc.text(cells[1], colX[1], y, { width: colWidth[1] });
    doc.text(cells[2], colX[2], y, { width: colWidth[2] });
    doc.text(cells[3], colX[3], y, { width: colWidth[3] });
    doc.fillColor(r.status === 'IN_RANGE' ? ESPRESSO : BRONZE).text(cells[4], colX[4], y, { width: colWidth[4] });
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
    ensureSpace(doc.heightOfString(outOfRangePrompt.body, { width: fullWidth }) + 30);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ESPRESSO).text('Next steps', leftMargin, doc.y, { width: fullWidth });
    doc.font('Helvetica').fontSize(9).moveDown(0.3);
    doc.text(outOfRangePrompt.body, leftMargin, doc.y, { width: fullWidth });
    doc.moveDown(1);
  }

  if (footerDisclaimer) {
    doc.font('Helvetica').fontSize(8);
    ensureSpace(doc.heightOfString(footerDisclaimer.body, { width: fullWidth }) + 16);
    doc.fillColor(ESPRESSO).text(footerDisclaimer.body, leftMargin, doc.y, { width: fullWidth });
    doc.moveDown(1.5);
  }

  // Signed-off footer — kept whole; a signature split across a page break
  // reads as an unsigned letter.
  ensureSpace(64);
  const staff = report.reviewedBy?.staffProfile;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(ESPRESSO)
    .text(staff ? `${staff.firstName} ${staff.lastName}` : 'Aspire Clinical Team', leftMargin, doc.y, { width: fullWidth });
  if (staff?.postNominals) doc.font('Helvetica').fontSize(9).text(staff.postNominals, leftMargin, doc.y, { width: fullWidth });
  if (staff?.roleTitle) doc.font('Helvetica').fontSize(9).text(staff.roleTitle, leftMargin, doc.y, { width: fullWidth });
  doc.font('Helvetica').fontSize(9).text('Aspire Clinic', leftMargin, doc.y, { width: fullWidth });

  doc.end();
  return done;
}
