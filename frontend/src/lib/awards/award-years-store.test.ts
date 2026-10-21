import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetsClient } from '@/lib/google-sheets';
import {
  AwardYearError,
  createAwardYear,
  currentSubmissionWindow,
  invalidateAwardYearsCache,
  readAwardYears,
  updateAwardYear,
} from './award-years-store';
import { AWARD_YEARS_HEADERS } from './award-years';

const HEADER = [...AWARD_YEARS_HEADERS];

function httpError(status: number) {
  const err: any = new Error(`HTTP ${status}`);
  err.response = { status };
  return err;
}

/** A Sheets client over an in-memory Award Years tab (`null` = no tab). */
function fakeSheets(initial: string[][] | null) {
  let tab = initial;
  const client = {
    spreadsheets: {
      get: vi.fn(async () => ({
        data: { sheets: [{ properties: { title: 'Sheet1' } }, ...(tab ? [{ properties: { title: 'Award Years' } }] : [])] },
      })),
      batchUpdate: vi.fn(async () => {
        tab = [];
        return {};
      }),
      values: {
        get: vi.fn(async () => {
          if (!tab) throw httpError(400);
          return { data: { values: tab } };
        }),
        append: vi.fn(async ({ requestBody }: any) => {
          tab!.push(...requestBody.values);
          return {};
        }),
        update: vi.fn(async ({ range, requestBody }: any) => {
          const row = Number(range.match(/A(\d+):/)[1]);
          tab![row - 1] = requestBody.values[0];
          return {};
        }),
      },
    },
  };
  return { client: client as unknown as SheetsClient, raw: client, tab: () => tab };
}

beforeEach(() => {
  process.env.AWARDS_SHEET_ID = 'sheet-1';
  invalidateAwardYearsCache();
});

afterEach(() => vi.restoreAllMocks());

describe('readAwardYears', () => {
  it('treats a missing tab as not configured', async () => {
    expect(await readAwardYears(fakeSheets(null).client)).toEqual({ configured: false, years: [] });
  });

  it('stays unconfigured while every year is a draft', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'draft']]);
    expect((await readAwardYears(client)).configured).toBe(false);
  });

  it('rethrows anything other than a missing tab', async () => {
    const { client, raw } = fakeSheets([HEADER]);
    raw.spreadsheets.values.get.mockRejectedValueOnce(httpError(503));
    await expect(readAwardYears(client)).rejects.toThrow('HTTP 503');
  });
});

describe('currentSubmissionWindow', () => {
  const now = Date.parse('2026-10-14T18:00:00Z');

  it('keeps the old behavior until a year is opened or closed', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'draft']]);
    expect(await currentSubmissionWindow(async () => client, { now })).toEqual({
      accepting: true,
      year: '2026',
    });
  });

  it('follows the tab once a year is in use', async () => {
    const { client } = fakeSheets([HEADER, ['2026', 'closed', '', '', '2026-10-01T00:00:00Z']]);
    expect(await currentSubmissionWindow(async () => client, { now })).toMatchObject({
      accepting: false,
    });
  });

  it('reads the tab at most once a minute', async () => {
    const { client, raw } = fakeSheets([HEADER, ['2026', 'open']]);
    await currentSubmissionWindow(async () => client, { now });
    await currentSubmissionWindow(async () => client, { now: now + 59_000 });
    expect(raw.spreadsheets.values.get).toHaveBeenCalledTimes(1);
    await currentSubmissionWindow(async () => client, { now: now + 61_000 });
    expect(raw.spreadsheets.values.get).toHaveBeenCalledTimes(2);
  });

  it('fails open to the last good read when Sheets is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, raw } = fakeSheets([HEADER, ['2026', 'open']]);
    await currentSubmissionWindow(async () => client, { now });
    raw.spreadsheets.values.get.mockRejectedValue(httpError(503));
    expect(await currentSubmissionWindow(async () => client, { now: now + 120_000 })).toEqual({
      accepting: true,
      year: '2026',
    });
  });

  it('fails open to the calendar year with no read at all, and holds that a minute', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, raw } = fakeSheets([HEADER]);
    raw.spreadsheets.values.get.mockRejectedValue(httpError(503));
    expect(await currentSubmissionWindow(async () => client, { now })).toEqual({
      accepting: true,
      year: '2026',
    });
    await currentSubmissionWindow(async () => client, { now: now + 30_000 });
    expect(raw.spreadsheets.values.get).toHaveBeenCalledTimes(1);
  });
});

describe('createAwardYear', () => {
  const now = new Date('2026-10-14T18:00:00Z');

  it('creates the tab with headers on first use', async () => {
    const sheets = fakeSheets(null);
    await createAwardYear(sheets.client, { year: '2027' }, 'admin@x', now);
    expect(sheets.raw.spreadsheets.batchUpdate).toHaveBeenCalledOnce();
    expect(sheets.tab()).toEqual([
      HEADER,
      ['2027', 'draft', '', '', '', now.toISOString(), 'admin@x'],
    ]);
  });

  it('rejects a duplicate year', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'draft']]);
    await expect(createAwardYear(client, { year: '2027' }, 'a', now)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects opening a second year', async () => {
    const { client } = fakeSheets([HEADER, ['2026', 'open']]);
    await expect(
      createAwardYear(client, { year: '2027', status: 'open' }, 'a', now)
    ).rejects.toThrow('2026 is still open');
  });

  it('rejects bad input', async () => {
    const { client } = fakeSheets([HEADER]);
    await expect(createAwardYear(client, { year: '27' }, 'a', now)).rejects.toBeInstanceOf(AwardYearError);
    await expect(
      createAwardYear(client, { year: '2027', opens: '2027-11-01', closes: '2027-10-01' }, 'a', now)
    ).rejects.toThrow('Opens must be on or before Closes');
  });
});

describe('updateAwardYear', () => {
  const now = new Date('2026-11-01T18:00:00Z');

  it('writes the matching row and records a manual close', async () => {
    const sheets = fakeSheets([HEADER, ['2025', 'closed'], ['2026', 'open', '2026-09-01']]);
    await updateAwardYear(sheets.client, '2026', { status: 'closed' }, 'admin@x', now);
    expect(sheets.raw.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Award Years'!A3:G3" })
    );
    expect(sheets.tab()![2]).toEqual([
      '2026', 'closed', '2026-09-01', '', now.toISOString(), now.toISOString(), 'admin@x',
    ]);
  });

  it('clears the close time when reopened', async () => {
    const sheets = fakeSheets([HEADER, ['2026', 'closed', '', '', '2026-10-01T00:00:00Z']]);
    await updateAwardYear(sheets.client, '2026', { status: 'open' }, 'a', now);
    expect(sheets.tab()![1][4]).toBe('');
  });

  it('404s an unknown year', async () => {
    const { client } = fakeSheets([HEADER]);
    await expect(updateAwardYear(client, '2030', { status: 'open' }, 'a', now)).rejects.toMatchObject({
      status: 404,
    });
  });
});
