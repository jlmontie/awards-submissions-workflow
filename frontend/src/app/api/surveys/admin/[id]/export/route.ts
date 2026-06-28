import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getSheetsClient } from '@/lib/google-sheets';
import { generateExport, type ExportSection } from '@/lib/surveys/export';
import { responseTabFor, SURVEYS_TAB } from '@/lib/surveys/sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/surveys/admin/[id]/export
 *
 * Query params:
 *   ?format=json   → JSON payload with all sections (used by the results UI;
 *                    plain-text rendering for the preview pane only — RTF
 *                    is what the designer actually downloads)
 *   ?format=zip    → all sections bundled into a single .zip download, .rtf
 *                    file per section
 *   ?section=KEY   → just that section as a downloadable .rtf
 *   (default)      → first section as a downloadable .rtf
 *
 * Sections returned depend on the survey's template: architects yield up to
 * Utah + Out-of-State; contractors yield up to GC Overall + Out-of-State +
 * General Builders + Heavy/Highway & Muni/Utility.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const spreadsheetId = process.env.SURVEY_SHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient(true);

    // Look up survey row to get year + templateId
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SURVEYS_TAB}!A:Z`,
    });
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sYearCol = sHeaders.indexOf('year');
    const sTemplateCol = sHeaders.indexOf('template_id');

    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const surveyYear = parseInt(surveyRow[sYearCol] || '0', 10);
    const templateId =
      (sTemplateCol !== -1 ? surveyRow[sTemplateCol] : '') || 'architects';

    let responseTab: string;
    try {
      responseTab = responseTabFor(templateId);
    } catch {
      return NextResponse.json(
        { error: `Unsupported survey template: ${templateId}` },
        { status: 400 },
      );
    }

    // Fetch rows from the template-specific response tab, then filter to this survey.
    const responsesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${responseTab}!A:BZ`,
    });
    const responseRows = responsesRes.data.values || [];
    if (!responseRows.length) {
      return new NextResponse('No responses found for this survey.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const firstRowIsHeader =
      responseRows[0][0]?.trim().toLowerCase() === 'response_id';
    const headerRow = firstRowIsHeader ? responseRows[0] : null;
    const surveyIdIdx = firstRowIsHeader
      ? responseRows[0].findIndex((h) => h?.trim().toLowerCase() === 'survey_id')
      : 1; // positional fallback

    const dataRows = (firstRowIsHeader ? responseRows.slice(1) : responseRows).filter(
      (row) => row[surveyIdIdx] === surveyId,
    );

    if (!dataRows.length) {
      return new NextResponse('No responses found for this survey.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const rowsForExport = headerRow ? [headerRow, ...dataRows] : dataRows;
    const { sections } = generateExport(templateId, rowsForExport, surveyYear);

    if (!sections.length) {
      return new NextResponse('No responses found for this survey.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const format = request.nextUrl.searchParams.get('format');
    const sectionParam = request.nextUrl.searchParams.get('section');

    if (format === 'json') {
      // `text` is a plain-text rendering used purely for the preview pane in
      // the admin UI. The downloaded artifact is always RTF — InDesign's
      // Place File workflow needs the embedded Courier + tab stops.
      return NextResponse.json({
        templateId,
        sections: sections.map((s) => ({
          key: s.key,
          label: s.label,
          filename: `${s.baseName}.rtf`,
          text: s.text,
          count: s.count,
        })),
      });
    }

    if (format === 'zip') {
      const zip = new JSZip();
      for (const s of sections) {
        zip.file(`${s.baseName}.rtf`, s.rtf);
      }
      const buf = await zip.generateAsync({ type: 'arraybuffer' });
      const zipName = `${surveyId}_export.zip`;
      return new NextResponse(buf as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${zipName}"`,
        },
      });
    }

    // Default / explicit single-section .rtf download
    const section = sectionParam
      ? sections.find((s) => s.key === sectionParam)
      : sections[0];
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    return downloadSectionRtf(section);
  } catch (error: any) {
    console.error('Error exporting survey:', error);
    return NextResponse.json(
      { error: 'Failed to export survey' },
      { status: 500 },
    );
  }
}

function downloadSectionRtf(section: ExportSection): NextResponse {
  return new NextResponse(section.rtf, {
    status: 200,
    headers: {
      'Content-Type': 'application/rtf; charset=utf-8',
      'Content-Disposition': `attachment; filename="${section.baseName}.rtf"`,
    },
  });
}
