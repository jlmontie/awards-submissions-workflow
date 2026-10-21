/**
 * Award years: one row per annual competition, in the awards sheet's
 * "Award Years" tab. A year decides whether the public form accepts entries
 * and which year those entries are filed under.
 *
 * Before this, the year came from the submitter's browser clock and the form
 * never closed. The year still ends up in the same places (the GCS path, so
 * the Drive folder and the AW-YYYY-NNN id), but the server now chooses it.
 *
 * This module is pure: parsing rows and working out what is open at a given
 * instant. Reading and writing the tab live in award-years-store.ts.
 */

export const AWARD_YEARS_TAB = 'Award Years';
export const AWARD_YEARS_HEADERS = [
  'Year',
  'Status',
  'Opens',
  'Closes',
  'Closed At',
  'Updated At',
  'Updated By',
] as const;

// Deadlines are given as dates and mean the end of that day where the
// competition runs.
export const AWARDS_TIME_ZONE = 'America/Denver';

// Uploads keep working this long after a year closes, so a submitter who
// started before the deadline isn't cut off between their PDF and photos.
// The public page shows "closed" from the moment it closes.
export const UPLOAD_GRACE_MS = 30 * 60 * 1000;

export type AwardYearStatus = 'draft' | 'open' | 'closed';
export const AWARD_YEAR_STATUSES: AwardYearStatus[] = ['draft', 'open', 'closed'];

export interface AwardYear {
  year: string;
  status: AwardYearStatus;
  /** YYYY-MM-DD, or '' for "as soon as it is set to open". */
  opens: string;
  /** YYYY-MM-DD, the last day entries are accepted; '' for "until closed by hand". */
  closes: string;
  /** ISO timestamp of a manual close. */
  closedAt: string;
  updatedAt: string;
  updatedBy: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

export function isValidYear(value: string): boolean {
  return YEAR_RE.test(value);
}

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function parseAwardYears(values: string[][]): AwardYear[] {
  const [, ...rows] = values;
  return rows
    .map((row) => {
      const cell = (i: number) => String(row[i] ?? '').trim();
      const status = cell(1).toLowerCase();
      return {
        year: cell(0),
        status: (AWARD_YEAR_STATUSES as string[]).includes(status)
          ? (status as AwardYearStatus)
          : 'draft',
        opens: cell(2),
        closes: cell(3),
        closedAt: cell(4),
        updatedAt: cell(5),
        updatedBy: cell(6),
      };
    })
    .filter((y) => isValidYear(y.year));
}

export function toRow(y: AwardYear): string[] {
  return [y.year, y.status, y.opens, y.closes, y.closedAt, y.updatedAt, y.updatedBy];
}

/** Milliseconds a zone is ahead of UTC at a given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a calendar day starts in a time zone. DST-safe. */
export function startOfDay(date: string, timeZone = AWARDS_TIME_ZONE): number {
  const [y, m, d] = date.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d);
  let instant = wallClock - zoneOffsetMs(wallClock, timeZone);
  // The offset at the guess can differ from the offset at the answer when a
  // DST change falls between them; one more pass settles it.
  instant = wallClock - zoneOffsetMs(instant, timeZone);
  return instant;
}

/** The first instant after a calendar day ends in a time zone. */
export function endOfDay(date: string, timeZone = AWARDS_TIME_ZONE): number {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return startOfDay(next, timeZone);
}

export interface YearState {
  /** Accepting entries right now, as the public page should show it. */
  open: boolean;
  /** When it stopped accepting entries, if it has. */
  closedAtMs: number | null;
  /** Not open yet because the opening date is still ahead. */
  notYetOpen: boolean;
}

export function yearState(y: AwardYear, now: number): YearState {
  const closed = (at: number | null): YearState => ({ open: false, closedAtMs: at, notYetOpen: false });

  if (y.status === 'draft') return closed(null);
  if (y.status === 'closed') {
    const at = Date.parse(y.closedAt);
    return closed(Number.isNaN(at) ? null : at);
  }

  if (y.closes && isValidDate(y.closes)) {
    const deadline = endOfDay(y.closes);
    if (now >= deadline) return closed(deadline);
  }
  if (y.opens && isValidDate(y.opens) && now < startOfDay(y.opens)) {
    return { open: false, closedAtMs: null, notYetOpen: true };
  }
  return { open: true, closedAtMs: null, notYetOpen: false };
}

export type SubmissionWindow =
  /** Entries go to `year`. `graceUntil` is set while a just-closed year is still finishing uploads. */
  | { accepting: true; year: string; graceUntil?: number }
  | { accepting: false; year: string | null; reason: 'closed' | 'not_yet_open' | 'none' };

/**
 * What the public form should do right now.
 *
 * `forUploads` widens "open" by UPLOAD_GRACE_MS after a close, so an entry
 * already underway when the deadline passes can finish. The page itself
 * uses the strict answer.
 */
export function submissionWindow(
  years: AwardYear[],
  now: number,
  { forUploads = false } = {}
): SubmissionWindow {
  const states = years.map((y) => ({ y, s: yearState(y, now) }));

  const open = states.find(({ s }) => s.open);
  if (open) return { accepting: true, year: open.y.year };

  if (forUploads) {
    const finishing = states
      .filter(({ s }) => s.closedAtMs !== null && now < s.closedAtMs + UPLOAD_GRACE_MS)
      .sort((a, b) => b.s.closedAtMs! - a.s.closedAtMs!)[0];
    if (finishing) {
      return { accepting: true, year: finishing.y.year, graceUntil: finishing.s.closedAtMs! + UPLOAD_GRACE_MS };
    }
  }

  const upcoming = states.find(({ s }) => s.notYetOpen);
  if (upcoming) return { accepting: false, year: upcoming.y.year, reason: 'not_yet_open' };

  const latest = [...years].sort((a, b) => b.year.localeCompare(a.year))[0];
  return latest
    ? { accepting: false, year: latest.year, reason: 'closed' }
    : { accepting: false, year: null, reason: 'none' };
}

/**
 * The year used when no award years have been set up at all: the calendar
 * year where the competition runs. This is the behavior the form had before
 * award years existed, and it is what keeps the form working until the
 * first year is created.
 */
export function calendarYear(now: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: AWARDS_TIME_ZONE, year: 'numeric' }).format(
    new Date(now)
  );
}

/** Only one year may be open at a time. Returns the conflicting year, if any. */
export function otherOpenYear(years: AwardYear[], year: string): string | null {
  return years.find((y) => y.year !== year && y.status === 'open')?.year ?? null;
}
