import PDFDocument from 'pdfkit';
import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { reportTitle } from '@aspire-bloods/shared';

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
  const title = reportTitle(report.panel?.name, report.sampleDate.toISOString(), report.results.length);

  const profile = report.patient.patientProfile;
  const patientName = profile ? `${profile.title ? profile.title + ' ' : ''}${profile.firstName} ${profile.lastName}` : report.patient.email;
  const address = profile ? decryptField(profile.addressEncrypted) : '';

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
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(10).fillColor(ESPRESSO).text(today, { align: 'right' });
  doc.moveDown(0.5);
  doc.text(patientName, { align: 'right' });
  if (address) doc.text(address, { align: 'right' });
  if (profile?.postcode) doc.text(profile.postcode, { align: 'right' });
  doc.moveDown(1.5);

  // Body
  doc.fontSize(13).font('Helvetica-Bold').fillColor(ESPRESSO).text(`${title} — results summary`);
  doc.fontSize(10).font('Helvetica').moveDown(0.5);
  doc.text(`Dear ${profile?.firstName ?? 'Patient'},`);
  doc.moveDown(0.5);
  doc.text(
    `Please find below a summary of your ${title} results, from a sample taken on ${report.sampleDate.toLocaleDateString('en-GB')}.`,
  );
  doc.moveDown(1);

  // Results table
  const colX = [56, 250, 320, 400, 470];
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ESPRESSO);
  doc.text('Marker', colX[0], doc.y, { continued: false });
  doc.text('Result', colX[1], doc.y - 11);
  doc.text('Unit', colX[2], doc.y - 11);
  doc.text('Range', colX[3], doc.y - 11);
  doc.text('Status', colX[4], doc.y - 11);
  doc.moveTo(56, doc.y + 4).lineTo(539, doc.y + 4).strokeColor(TAUPE).stroke();
  doc.moveDown(0.7);

  doc.font('Helvetica').fontSize(9);
  for (const r of report.results) {
    const y = doc.y;
    doc.fillColor(ESPRESSO).text(r.marker.name, colX[0], y, { width: 190 });
    doc.text(String(Number(decryptField(r.valueEncrypted))), colX[1], y);
    doc.text(r.unit, colX[2], y);
    doc.text(`${r.referenceRange.low}–${r.referenceRange.high}`, colX[3], y);
    doc.fillColor(r.status === 'IN_RANGE' ? ESPRESSO : BRONZE).text(STATUS_LABEL[r.status] ?? r.status, colX[4], y, { width: 90 });
    doc.moveDown(0.9);
  }

  const leftMargin = 56;
  const fullWidth = 483;
  doc.moveDown(1);
  if (hasFlagged && outOfRangePrompt) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ESPRESSO).text('Next steps', leftMargin, doc.y, { width: fullWidth });
    doc.font('Helvetica').fontSize(9).moveDown(0.3);
    doc.text(outOfRangePrompt.body, leftMargin, doc.y, { width: fullWidth });
    doc.moveDown(1);
  }

  if (footerDisclaimer) {
    doc.font('Helvetica').fontSize(8).fillColor(ESPRESSO).text(footerDisclaimer.body, leftMargin, doc.y, { width: fullWidth });
    doc.moveDown(1.5);
  }

  // Signed-off footer
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
