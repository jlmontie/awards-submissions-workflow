import type { ExportResult, Firm } from './shared';
import { generateArchitectExport, rowsToArchitectFirms } from './architects';
import { generateContractorExport, rowsToContractorFirms } from './contractors';

export type { ExportResult, ExportSection, Firm } from './shared';

/**
 * Dispatch survey response rows to the appropriate per-template export.
 * Falls back to the architect export when `templateId` is unrecognized.
 */
export function generateExport(
  templateId: string,
  rows: string[][],
  surveyYear: number,
): ExportResult {
  const firms = parseRows(templateId, rows);
  const responses = firms.filter((f) => f); // sanity guard
  switch (templateId) {
    case 'contractors':
      return generateContractorExport(responses, surveyYear);
    case 'architects':
    default:
      return generateArchitectExport(responses, surveyYear);
  }
}

function parseRows(templateId: string, rows: string[][]): Firm[] {
  switch (templateId) {
    case 'contractors':
      return rowsToContractorFirms(rows);
    case 'architects':
    default:
      return rowsToArchitectFirms(rows);
  }
}
