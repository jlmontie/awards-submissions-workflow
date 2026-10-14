import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  buildCategoryExport,
  buildCategoryWorkbook,
  splitCategories,
} from './category-export';

const HEADERS = [
  'Submission Timestamp',
  'Awards ID',
  'PDF Link',
  'Official Name',
  'Project Category or Categories for Consideration',
];

function sheet(...rows: string[][]) {
  return [HEADERS, ...rows];
}

describe('splitCategories', () => {
  it('splits the processor\'s "; " join', () => {
    expect(splitCategories('K-12; Green/Sustainable; Other: Parks & Recreation')).toEqual([
      'K-12',
      'Green/Sustainable',
      'Other: Parks & Recreation',
    ]);
  });

  it('drops blanks and case-insensitive repeats', () => {
    expect(splitCategories(' K-12 ;; k-12; ')).toEqual(['K-12']);
    expect(splitCategories('')).toEqual([]);
  });
});

describe('buildCategoryExport', () => {
  it('repeats an entry once per category, with the category first', () => {
    const { headers, rows } = buildCategoryExport(
      sheet(['t', 'AW-2026-001', 'https://x', 'Lehi Civic Center', 'Public; Renovation'])
    );
    expect(headers).toEqual(['Category', ...HEADERS]);
    expect(rows).toEqual([
      ['Public', 't', 'AW-2026-001', 'https://x', 'Lehi Civic Center', 'Public; Renovation'],
      ['Renovation', 't', 'AW-2026-001', 'https://x', 'Lehi Civic Center', 'Public; Renovation'],
    ]);
  });

  it('sorts by category, then Awards ID, with uncategorised rows last', () => {
    const { rows } = buildCategoryExport(
      sheet(
        ['', 'AW-2026-010', '', 'B', 'K-12; Public'],
        ['', 'AW-2026-002', '', 'A', 'public'],
        ['', 'AW-2026-003', '', 'C', ''],
        ['', 'AW-2026-009', '', 'D', 'Healthcare'],
      )
    );
    expect(rows.map((r) => [r[0], r[2]])).toEqual([
      ['Healthcare', 'AW-2026-009'],
      ['K-12', 'AW-2026-010'],
      ['public', 'AW-2026-002'],
      ['Public', 'AW-2026-010'],
      ['', 'AW-2026-003'],
    ]);
  });

  it('pads short rows, trims long ones and skips empty ones', () => {
    const { rows } = buildCategoryExport(
      sheet(['', 'AW-2026-001'], ['', '', '', '', '', 'beyond the headers'], [])
    );
    expect(rows).toEqual([['', '', 'AW-2026-001', '', '', '']]);
  });

  it('makes column names unique, which an Excel table requires', () => {
    const { headers } = buildCategoryExport([['Category', '', 'Owner', 'owner']]);
    expect(headers).toEqual(['Category', 'Category (2)', 'Column 3', 'Owner', 'owner (2)']);
  });
});

describe('buildCategoryWorkbook', () => {
  it('writes an Excel table with filter buttons on every column', async () => {
    const data = buildCategoryExport(
      sheet(['t', 'AW-2026-001', 'https://drive.google.com/file/1', 'Lehi', 'Public; K-12'])
    );
    const buffer = await buildCategoryWorkbook(data);

    // The table part is what gives Excel its sort/filter header controls.
    const zip = await JSZip.loadAsync(buffer);
    const tableXml = await zip.file('xl/tables/table1.xml')!.async('string');
    expect(tableXml).toContain('ref="A1:F3"');
    expect(tableXml).toContain('<autoFilter ref="A1:F3"');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as any);
    const ws = workbook.getWorksheet('By Category')!;
    expect(ws.getRow(1).values).toEqual([undefined, 'Category', ...HEADERS]);
    expect(ws.getCell('A2').value).toBe('K-12');
    expect(ws.getCell('A3').value).toBe('Public');
    expect(ws.getCell('D2').value).toEqual({
      text: 'https://drive.google.com/file/1',
      hyperlink: 'https://drive.google.com/file/1',
    });
  });

  it('still writes a valid table when the sheet has no submissions', async () => {
    const buffer = await buildCategoryWorkbook(buildCategoryExport([HEADERS]));
    const zip = await JSZip.loadAsync(buffer);
    expect(await zip.file('xl/tables/table1.xml')!.async('string')).toContain('ref="A1:F2"');
  });
});
