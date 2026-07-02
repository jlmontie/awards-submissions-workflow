import PDFDocument from 'pdfkit';
import type { SummarySection } from './summary';

const NAVY = '#2C3E48';
const YELLOW = '#F5CF00';
const LABEL_GRAY = '#555555';
const VALUE_DARK = '#111111';

export interface SubmissionPdfOptions {
  surveyName: string;
  firmName: string;
  /** ISO timestamp of the submission. */
  submittedAt: string;
  /** True when this copy reflects an edit rather than the first submission. */
  wasEdit: boolean;
  sections: SummarySection[];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Render a respondent's submission as a branded, multi-page PDF. Layout mirrors
 * the on-screen review summary: a section heading followed by label/value rows.
 * Returns the full PDF as a Buffer (suitable for an email attachment or an HTTP
 * download response).
 */
export function generateSubmissionPdf(opts: SubmissionPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { page } = doc;
      const left = doc.page.margins.left;
      const contentWidth = page.width - doc.page.margins.left - doc.page.margins.right;
      const bottomLimit = page.height - doc.page.margins.bottom;

      // --- Branded header band (full-bleed) ---
      doc.rect(0, 0, page.width, 72).fill(NAVY);
      doc
        .fillColor(YELLOW)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text('Utah Construction + Design', left, 27, { width: contentWidth });

      doc.y = 96;

      // --- Title + meta ---
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(opts.wasEdit ? 'Updated Survey Submission' : 'Survey Submission', left, doc.y, {
          width: contentWidth,
        });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(11).fillColor(VALUE_DARK).text(opts.surveyName, {
        width: contentWidth,
      });
      if (opts.firmName) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(opts.firmName, {
          width: contentWidth,
        });
      }
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(LABEL_GRAY)
        .text(`Submitted ${formatTimestamp(opts.submittedAt)}`, { width: contentWidth });
      doc.moveDown(1);

      // --- Sections ---
      const labelWidth = 200;
      const gutter = 16;
      const valueX = left + labelWidth + gutter;
      const valueWidth = contentWidth - labelWidth - gutter;

      const ensureSpace = (needed: number) => {
        if (doc.y + needed > bottomLimit) doc.addPage();
      };

      for (const section of opts.sections) {
        ensureSpace(40);

        // Section heading with underline.
        doc
          .fillColor(NAVY)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(section.title, left, doc.y, { width: contentWidth });
        doc.moveDown(0.2);
        const lineY = doc.y;
        doc
          .moveTo(left, lineY)
          .lineTo(left + contentWidth, lineY)
          .lineWidth(0.5)
          .strokeColor('#DDDDDD')
          .stroke();
        doc.moveDown(0.5);

        for (const item of section.items) {
          doc.font('Helvetica').fontSize(10);
          const labelHeight = doc.heightOfString(item.label, { width: labelWidth });
          const valueHeight = doc.heightOfString(item.value, { width: valueWidth });
          const rowHeight = Math.max(labelHeight, valueHeight);

          ensureSpace(rowHeight + 6);
          const rowY = doc.y;

          doc
            .fillColor(LABEL_GRAY)
            .font('Helvetica')
            .text(item.label, left, rowY, { width: labelWidth });
          doc
            .fillColor(VALUE_DARK)
            .font('Helvetica')
            .text(item.value, valueX, rowY, { width: valueWidth });

          doc.y = rowY + rowHeight + 6;
        }

        doc.moveDown(0.8);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
