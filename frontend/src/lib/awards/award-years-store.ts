import type { SheetsClient } from '@/lib/google-sheets';
import {
  AWARD_YEARS_HEADERS,
  AWARD_YEARS_TAB,
  AwardYear,
  AwardYearStatus,
  calendarYear,
  isValidDate,
  isValidYear,
  otherOpenYear,
  parseAwardYears,
  submissionWindow,
  SubmissionWindow,
  toRow,
} from './award-years';

const RANGE = `'${AWARD_YEARS_TAB}'!A:G`;

export interface AwardYearsSnapshot {
  /**
   * False until some year has been opened or closed. Until then the public
   * form keeps its old behavior (open, calendar year), so setting up a year
   * as a draft cannot close the form by accident.
   */
  configured: boolean;
  years: AwardYear[];
}

function sheetId(): string {
  const id = process.env.AWARDS_SHEET_ID;
  if (!id) throw new Error('AWARDS_SHEET_ID is not set');
  return id;
}

function isMissingTab(err: any): boolean {
  // Sheets answers a range on a tab that doesn't exist with a 400
  // "Unable to parse range".
  return (err?.response?.status ?? err?.code) === 400;
}

export async function readAwardYears(
  sheets: SheetsClient,
  requestOptions?: { timeout?: number; retryConfig?: { retry?: number; noResponseRetries?: number } }
): Promise<AwardYearsSnapshot> {
  try {
    const res = await sheets.spreadsheets.values.get(
      { spreadsheetId: sheetId(), range: RANGE },
      requestOptions
    );
    const years = parseAwardYears((res.data.values as string[][]) || []);
    return { configured: years.some((y) => y.status !== 'draft'), years };
  } catch (err) {
    if (isMissingTab(err)) return { configured: false, years: [] };
    throw err;
  }
}

// ── The public form's view, cached ───────────────────────────────────────
//
// A submission requests one signed URL per file, up to ~25 at once, and
// several people submit at a time near a deadline. Reading the tab on every
// request would spend the Sheets read quota (60/min per user) on the busiest
// minutes of the year. Each container keeps the last read for a minute, so
// opening or closing a year reaches the public form within that minute.
const CACHE_TTL_MS = 60_000;
let cache: { snapshot: AwardYearsSnapshot; fetchedAt: number } | null = null;

export function invalidateAwardYearsCache() {
  cache = null;
}

/**
 * Award years for the public routes.
 *
 * Fails open. If Sheets can't be read, the last good read is used however
 * old it is; with none at all, the form behaves as it did before award years
 * existed (open, filed under the calendar year). A Sheets outage must not
 * turn away entries: a wrongly accepted late entry can be dealt with by
 * hand, a refused one is lost.
 */
export async function publicAwardYears(
  getSheets: () => Promise<SheetsClient>,
  now = Date.now()
): Promise<AwardYearsSnapshot> {
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.snapshot;
  try {
    // A short, single attempt: this sits in front of every upload, and the
    // fallback below is a better answer than a submitter waiting on retries.
    const snapshot = await readAwardYears(await getSheets(), {
      timeout: 4_000,
      retryConfig: { retry: 0, noResponseRetries: 0 },
    });
    cache = { snapshot, fetchedAt: now };
    return snapshot;
  } catch (err) {
    console.error('Award years unavailable, using last known state:', err);
    // Hold the fallback for a minute too, so an outage costs one slow
    // request per container rather than one per uploaded file.
    const snapshot = cache?.snapshot ?? { configured: false, years: [] };
    cache = { snapshot, fetchedAt: now };
    return snapshot;
  }
}

export async function currentSubmissionWindow(
  getSheets: () => Promise<SheetsClient>,
  { forUploads = false, now = Date.now() } = {}
): Promise<SubmissionWindow> {
  const { configured, years } = await publicAwardYears(getSheets, now);
  if (!configured) return { accepting: true, year: calendarYear(now) };
  return submissionWindow(years, now, { forUploads });
}

// ── Admin writes ─────────────────────────────────────────────────────────

export class AwardYearError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface AwardYearInput {
  year?: string;
  status?: AwardYearStatus;
  opens?: string;
  closes?: string;
}

function validate(next: AwardYear, all: AwardYear[]) {
  if (!isValidYear(next.year)) throw new AwardYearError('Year must be four digits, e.g. 2027.');
  if (!['draft', 'open', 'closed'].includes(next.status)) throw new AwardYearError('Unknown status.');
  for (const [label, value] of [['Opens', next.opens], ['Closes', next.closes]] as const) {
    if (value && !isValidDate(value)) throw new AwardYearError(`${label} must be a date (YYYY-MM-DD).`);
  }
  if (next.opens && next.closes && next.opens > next.closes) {
    throw new AwardYearError('Opens must be on or before Closes.');
  }
  if (next.status === 'open') {
    const other = otherOpenYear(all, next.year);
    if (other) throw new AwardYearError(`${other} is still open. Close it before opening ${next.year}.`, 409);
  }
}

async function ensureTab(sheets: SheetsClient) {
  const spreadsheetId = sheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === AWARD_YEARS_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: AWARD_YEARS_TAB } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${AWARD_YEARS_TAB}'!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...AWARD_YEARS_HEADERS]] },
  });
}

export async function createAwardYear(
  sheets: SheetsClient,
  input: AwardYearInput,
  by: string,
  now = new Date()
): Promise<AwardYear> {
  await ensureTab(sheets);
  const { years } = await readAwardYears(sheets);
  const year = String(input.year ?? '').trim();
  if (years.some((y) => y.year === year)) throw new AwardYearError(`${year} already exists.`, 409);

  const status = input.status ?? 'draft';
  const next: AwardYear = {
    year,
    status,
    opens: input.opens ?? '',
    closes: input.closes ?? '',
    closedAt: status === 'closed' ? now.toISOString() : '',
    updatedAt: now.toISOString(),
    updatedBy: by,
  };
  validate(next, years);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [toRow(next)] },
  });
  invalidateAwardYearsCache();
  return next;
}

export async function updateAwardYear(
  sheets: SheetsClient,
  year: string,
  patch: AwardYearInput,
  by: string,
  now = new Date()
): Promise<AwardYear> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range: RANGE });
  const values = (res.data.values as string[][]) || [];
  const years = parseAwardYears(values);
  const current = years.find((y) => y.year === year);
  if (!current) throw new AwardYearError(`${year} not found.`, 404);

  const status = patch.status ?? current.status;
  const next: AwardYear = {
    ...current,
    status,
    opens: patch.opens ?? current.opens,
    closes: patch.closes ?? current.closes,
    // Record when a year is closed by hand; reopening clears it.
    closedAt:
      status === 'closed'
        ? current.status === 'closed' && current.closedAt
          ? current.closedAt
          : now.toISOString()
        : '',
    updatedAt: now.toISOString(),
    updatedBy: by,
  };
  validate(next, years);

  // Row number in the sheet: 1-based, after the header.
  const rowNumber = values.findIndex((row, i) => i > 0 && String(row[0] ?? '').trim() === year) + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `'${AWARD_YEARS_TAB}'!A${rowNumber}:G${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [toRow(next)] },
  });
  invalidateAwardYearsCache();
  return next;
}
