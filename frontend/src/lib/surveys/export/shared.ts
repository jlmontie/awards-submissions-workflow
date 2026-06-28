/**
 * Shared helpers used by per-template export modules.
 */

import { normalizers } from '../normalizers';

export type Firm = Record<string, string>;

export interface ExportSection {
  /** Stable identifier for routing/keying in the UI. */
  key: string;
  /** Human-readable label for tab UI and section titles. */
  label: string;
  /** Filename stem (no extension). Route appends `.txt` / `.rtf` as needed. */
  baseName: string;
  /** Tab-delimited plain text — what the JSON preview shows and what
   *  Convert-Text-to-Table style InDesign flows consume. */
  text: string;
  /** Courier 12pt RTF with embedded tab stops — designer's "Place File"
   *  InDesign workflow lays this out as an aligned grid without manual work. */
  rtf: string;
  /** Number of firms in this section. */
  count: number;
}

export interface ExportResult {
  sections: ExportSection[];
}

export function parseFloat2(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

export function parseInt2(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? fallback : n;
}

export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffixes[n % 10] || 'th'}`;
}

export function isTrue(value: string | undefined): boolean {
  return String(value || '').trim().toUpperCase() === 'TRUE';
}

export function formatRevenue(value: string | undefined, isDnd: boolean): string {
  if (isDnd) return 'DND';
  if (!value || String(value).trim().toUpperCase() === 'DND') return '';
  const v = parseFloat2(value);
  if (v === 0) return '';
  return `$${v.toFixed(1)}`;
}

export function formatPct(value: number): string {
  if (value > 0) return `${Math.round(value)}%`;
  return '';
}

export function joinProjectAndLocation(
  project: string | undefined,
  location: string | undefined,
): string {
  const p = (project || '').trim();
  const l = (location || '').trim();
  if (p && l) return `${p} — ${l}`;
  return p || l || '';
}

/**
 * Free-text state field has historically been entered as either 'UT' or
 * 'Utah' (and possibly with whitespace). Normalize to the 2-letter
 * abbreviation everywhere so Utah firms aren't misrouted to out-of-state in
 * the export.
 */
export function normalizeState(raw: string | undefined): string {
  const s = (raw || 'UT').trim().toUpperCase();
  if (!s || s === 'UTAH') return 'UT';
  return s;
}

/**
 * Re-normalize a phone value at export time. New submissions are already
 * dash-formatted by the `phone` normalizer at write-time, but rows that
 * landed in the sheet under the old parenthesized format get fixed up here.
 */
export function formatPhone(raw: string | undefined): string {
  return normalizers.phone(raw);
}

/**
 * Convert sheet rows into firm dicts keyed by header name. The first row
 * is treated as the header if it starts with `response_id`; otherwise the
 * caller-provided `fallbackHeaders` are used. If the sheet header row is
 * shorter than the fallback (e.g. new columns added to an older sheet), the
 * missing tail positions are named from the fallback so data in those
 * columns is still readable.
 */
export function rowsToDicts(rows: string[][], fallbackHeaders: string[]): Firm[] {
  if (!rows.length) return [];
  const firstRow = rows[0];
  let headers: string[];
  let dataRows: string[][];

  if (firstRow[0]?.trim().toLowerCase() === 'response_id') {
    headers = firstRow.map((h) => h.trim().toLowerCase());
    for (let i = headers.length; i < fallbackHeaders.length; i++) {
      headers.push(fallbackHeaders[i]);
    }
    dataRows = rows.slice(1);
  } else {
    headers = fallbackHeaders;
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const d: Firm = {};
    for (let i = 0; i < headers.length; i++) {
      d[headers[i]] = i < row.length ? row[i] : '';
    }
    return d;
  });
}

// ── RTF formatting ──────────────────────────────────────────────────
//
// The publication designer's legacy workflow opens an .rtf in InDesign or
// TextEdit, where the document's embedded Courier font + half-inch tab stops
// (\deftab720) lay each row out as an aligned grid. We replicate that here so
// the designer's "Place File" workflow keeps working unchanged.
//
// At Courier 12pt, one tab stop = 720 twips = ~5 characters. Column targets
// passed to `rtfRow` are character positions chosen to give each column
// enough headroom for the widest cell in that column; cells shorter than the
// column width are padded with tabs to reach the next column's start.

export const RTF_TAB_CHARS = 5; // chars per tab stop at Courier 12pt + \deftab720

export function rtfEscape(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (code < 0x20) { /* drop control chars */ }
    else if (code > 0x7F) out += `\\u${code}?`;
    else out += ch;
  }
  return out;
}

/**
 * Tabs needed to advance from `currentPos` to (or past) `targetPos`, given
 * stops every `RTF_TAB_CHARS` positions. Returns at least 1 so cells always
 * have a separator even when content overflows its column.
 */
function tabsToReach(currentPos: number, targetPos: number): { tabs: number; newPos: number } {
  let pos = currentPos;
  let tabs = 0;
  while (pos < targetPos) {
    pos = Math.floor(pos / RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS;
    tabs++;
  }
  if (tabs === 0) {
    pos = Math.floor(currentPos / RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS;
    tabs = 1;
  }
  return { tabs, newPos: pos };
}

export function rtfRow(cells: string[], positions: number[]): string {
  let pos = 0;
  let out = '';
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      const { tabs, newPos } = tabsToReach(pos, positions[i] ?? pos + RTF_TAB_CHARS);
      out += '\t'.repeat(tabs);
      pos = newPos;
    }
    const escaped = rtfEscape(cells[i]);
    out += escaped;
    pos += cells[i].length;
  }
  return out;
}

/**
 * Wrap a sequence of row strings (each already RTF-escaped + tab-padded) in
 * the RTF document envelope. Mirrors the legacy file's header so the designer
 * gets the same Courier-12pt + half-inch-tab-stop layout in Place File.
 */
export function wrapRtf(rows: string[]): string {
  const header = [
    String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2578`,
    String.raw`\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fmodern\fcharset0 Courier;}`,
    String.raw`{\colortbl;\red255\green255\blue255;}`,
    String.raw`\margl1440\margr1440\vieww30920\viewh17560\viewkind0`,
    String.raw`\deftab720`,
    String.raw`\pard\pardeftab720\sl280\partightenfactor0`,
    String.raw`\f0\fs24 \cf0`,
  ].join('\n');
  const body = rows.map((r) => `${r}\\`).join('\n');
  return `${header}\n${body}\n}\n`;
}
