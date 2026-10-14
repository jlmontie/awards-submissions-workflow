import ExcelJS from 'exceljs';

/**
 * The awards sheet, re-shaped for judging: one row per category a project is
 * entered in, so each category's entries can be read together.
 *
 * The PDF processor writes every selected category into one cell, joined with
 * "; " (backend/pdf-processor/main.py: extract_project_categories). Entries
 * from the older free-text form have whatever the submitter typed; those come
 * through as a single row unless they happened to use semicolons.
 */

export const CATEGORY_HEADER = 'Category';

// The sheet's own header for the combined cell, as the admin routes read it.
const CATEGORY_SOURCE_HEADERS = [
  'Project Category or Categories for Consideration',
  'Project Category',
];

const LINK_HEADERS = new Set(['PDF Link', 'Project Folder']);

export interface CategoryExport {
  headers: string[];
  rows: string[][];
}

export function splitCategories(value: string): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const part of value.split(';')) {
    const category = part.trim();
    const key = category.toLowerCase();
    if (category && !seen.has(key)) {
      seen.add(key);
      categories.push(category);
    }
  }
  return categories;
}

/**
 * Excel rejects a table whose column names are blank or repeated, and opens
 * the file as "repaired" with the table stripped, so names are made unique.
 */
function uniqueHeaders(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((raw, i) => {
    const base = raw.trim() || `Column ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * Expand sheet rows (header row first, as Sheets returns them) into one row
 * per category, with the single category in a new first column. The original
 * columns follow unchanged, including the full category list, so a row still
 * shows what else the project was entered in.
 *
 * Sorted by category, then Awards ID. Rows with no category sort last.
 */
export function buildCategoryExport(values: string[][]): CategoryExport {
  const [sheetHeaders = [], ...sheetRows] = values;
  const headers = uniqueHeaders([CATEGORY_HEADER, ...sheetHeaders]);
  const width = sheetHeaders.length;

  const categoryIndex = sheetHeaders.findIndex((h) =>
    CATEGORY_SOURCE_HEADERS.includes(h.trim())
  );
  const awardsIdIndex = sheetHeaders.findIndex((h) => h.trim() === 'Awards ID');

  const rows: string[][] = [];
  for (const raw of sheetRows) {
    const row = Array.from({ length: width }, (_, i) => String(raw[i] ?? ''));
    if (row.every((cell) => cell.trim() === '')) continue;

    const categories = categoryIndex >= 0 ? splitCategories(row[categoryIndex]) : [];
    for (const category of categories.length ? categories : ['']) {
      rows.push([category, ...row]);
    }
  }

  const awardsId = (row: string[]) => (awardsIdIndex >= 0 ? row[awardsIdIndex + 1] : '');
  rows.sort((a, b) => {
    if (!a[0] !== !b[0]) return a[0] ? -1 : 1;
    return (
      a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }) ||
      awardsId(a).localeCompare(awardsId(b), undefined, { numeric: true })
    );
  });

  return { headers, rows };
}

/**
 * Write the export as an .xlsx whose data is an Excel table, so every column
 * header has sort and filter controls without the reader setting anything up.
 */
export async function buildCategoryWorkbook(data: CategoryExport): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('By Category', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // A table must have at least one data row.
  const rows = data.rows.length ? data.rows : [data.headers.map(() => '')];

  sheet.addTable({
    name: 'SubmissionsByCategory',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: data.headers.map((name) => ({ name, filterButton: true })),
    rows,
  });

  data.headers.forEach((name, i) => {
    const column = sheet.getColumn(i + 1);
    const longest = Math.max(name.length, ...rows.map((r) => (r[i] ?? '').length));
    column.width = Math.min(Math.max(longest + 2, 10), LINK_HEADERS.has(name) ? 20 : 50);

    // Links stay as text in the table; make them clickable.
    if (LINK_HEADERS.has(name)) {
      rows.forEach((row, r) => {
        const url = row[i];
        if (/^https?:\/\//.test(url)) {
          sheet.getCell(r + 2, i + 1).value = { text: url, hyperlink: url };
        }
      });
    }
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
