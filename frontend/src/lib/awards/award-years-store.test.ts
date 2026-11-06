import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetsClient } from '@/lib/google-sheets';
import {
  AwardYearError,
  createAwardYear,
  currentSubmissionWindow,
  invalidateAwardYearsCache,
  readAwardYears,
  readSubmissionValues,
  updateAwardYear,
} from './award-years-store';
import { AWARD_YEARS_HEADERS } from './award-years';

const HEADER = [...AWARD_YEARS_HEADERS];

function httpError(status: number) {
  const err: any = new Error(`HTTP ${status}`);
  err.response = { status };
  return err;
}

/**
 * A Sheets client over an in-memory Award Years tab (`null` = no tab), plus
 * the rows of each spreadsheet's submissions tab.
 */
function fakeSheets(
  initial: string[][] | null,
  { submissions = { 'sheet-1': [['Award Year', 'Awards ID']] } as Record<string, string[][]> } = {}
) {
  let tab = initial;
  const client = {
    spreadsheets: {
      get: vi.fn(async () => ({
        data: {
          sheets: [
            { properties: { sheetId: 0, title: 'Sheet1' } },
            ...(tab ? [{ properties: { sheetId: 9, title: 'Award Years' } }] : []),
          ],
        },
      })),
      batchUpdate: vi.fn(async ({ requestBody }: any) => {
        const request = requestBody.requests[0];
        if (request.addSheet) tab = [];
        return {};
      }),
      values: {
        get: vi.fn(async ({ spreadsheetId, range }: any) => {
          if (range.startsWith('Sheet1!')) {
            const rows = submissions[spreadsheetId] ?? [];
            return { data: { values: range === 'Sheet1!1:1' ? rows.slice(0, 1) : rows } };
          }
          if (!tab) throw httpError(400);
          if (range.endsWith('!H1')) return { data: { values: tab[0]?.[7] ? [[tab[0][7]]] : [] } };
          return { data: { values: tab } };
        }),
        append: vi.fn(async ({ requestBody }: any) => {
          tab!.push(...requestBody.values);
          return {};
        }),
        update: vi.fn(async ({ range, requestBody }: any) => {
          if (range.endsWith('!H1')) tab![0][7] = requestBody.values[0][0];
          else tab![Number(range.match(/A(\d+):/)[1]) - 1] = requestBody.values[0];
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

  it('is configured as soon as a year exists, even one never opened', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'closed']]);
    expect((await readAwardYears(client)).configured).toBe(true);
  });

  it('is not configured with no years in the tab', async () => {
    const { client } = fakeSheets([HEADER]);
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

  it('keeps the old behavior until a year is added', async () => {
    const { client } = fakeSheets([HEADER]);
    expect(await currentSubmissionWindow(async () => client, { now })).toEqual({
      accepting: true,
      year: '2026',
    });
  });

  it('stays closed when the only year has never been opened', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'closed']]);
    expect(await currentSubmissionWindow(async () => client, { now })).toMatchObject({
      accepting: false,
    });
    expect(await currentSubmissionWindow(async () => client, { now, forUploads: true })).toMatchObject({
      accepting: false,
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

describe('readSubmissionValues', () => {
  const master = [['Awards ID'], ['AW-2026-001'], ['AW-2025-009']];
  const own = [['Awards ID'], ['AW-2027-001']];
  const sheets = () =>
    fakeSheets([HEADER, ['2026', 'closed'], ['2027', 'open', '', '', '', '', '', 'sheet-2027']], {
      submissions: { 'sheet-1': master, 'sheet-2027': own },
    }).client;

  it("reads a year's own sheet", async () => {
    expect(await readSubmissionValues(sheets(), '2027')).toEqual(own);
  });

  it('reads the master, narrowed to the year, for a year without one', async () => {
    expect(await readSubmissionValues(sheets(), '2026')).toEqual([['Awards ID'], ['AW-2026-001']]);
  });

  it('reads all of the master with no year', async () => {
    expect(await readSubmissionValues(sheets(), null)).toEqual(master);
  });
});

describe('createAwardYear', () => {
  const now = new Date('2026-10-14T18:00:00Z');
  const createSheet = () => vi.fn(async () => 'sheet-1');

  it('creates the tab with headers on first use', async () => {
    const sheets = fakeSheets(null);
    await createAwardYear(sheets.client, { year: '2027' }, 'admin@x', createSheet(), now);
    expect(sheets.raw.spreadsheets.batchUpdate.mock.calls[0][0]).toMatchObject({
      requestBody: { requests: [{ addSheet: { properties: { title: 'Award Years' } } }] },
    });
    expect(sheets.tab()).toEqual([
      HEADER,
      ['2027', 'closed', '', '', '', now.toISOString(), 'admin@x', 'sheet-1'],
    ]);
  });

  it('adds the Sheet ID heading to a tab from before per-year sheets', async () => {
    const oldHeader = HEADER.slice(0, 7);
    const sheets = fakeSheets([oldHeader, ['2026', 'closed']]);
    await createAwardYear(sheets.client, { year: '2027' }, 'a', createSheet(), now);
    expect(sheets.tab()![0]).toEqual(HEADER);
  });

  it('copies the layout from the latest year that has a sheet', async () => {
    const make = createSheet();
    const { client } = fakeSheets([
      HEADER,
      ['2026', 'closed', '', '', '', '', '', 'sheet-2026'],
      ['2027', 'closed', '', '', '', '', '', 'sheet-2027'],
      ['2025', 'closed'],
    ]);
    await createAwardYear(client, { year: '2028' }, 'a', make, now);
    expect(make).toHaveBeenCalledWith('2028', 'sheet-2027');
  });

  it('leaves the source to the function when no year has a sheet', async () => {
    const make = createSheet();
    await createAwardYear(fakeSheets([HEADER, ['2026', 'closed']]).client, { year: '2027' }, 'a', make, now);
    expect(make).toHaveBeenCalledWith('2027', undefined);
  });

  it('saves nothing when the sheet cannot be created', async () => {
    const sheets = fakeSheets([HEADER]);
    const make = vi.fn(async () => {
      throw new AwardYearError('Could not create the 2027 sheet: Drive is down', 502);
    });
    await expect(createAwardYear(sheets.client, { year: '2027' }, 'a', make, now)).rejects.toThrow('Drive is down');
    expect(sheets.tab()).toEqual([HEADER]);
  });

  it('saves nothing when the portal cannot read the new sheet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sheets = fakeSheets([HEADER]);
    sheets.raw.spreadsheets.values.get.mockImplementation(async ({ spreadsheetId, range }: any) => {
      if (spreadsheetId === 'unshared') throw httpError(403);
      return { data: { values: range.endsWith('!H1') ? [['Sheet ID']] : [HEADER] } };
    });
    const make = vi.fn(async () => 'unshared');
    await expect(createAwardYear(sheets.client, { year: '2027' }, 'a', make, now)).rejects.toMatchObject({
      status: 502,
    });
    expect(sheets.tab()).toEqual([HEADER]);
  });

  it('saves nothing when the new sheet has no headings', async () => {
    const sheets = fakeSheets([HEADER], { submissions: { blank: [] } });
    const make = vi.fn(async () => 'blank');
    await expect(createAwardYear(sheets.client, { year: '2027' }, 'a', make, now)).rejects.toThrow('no column headings');
    expect(sheets.tab()).toEqual([HEADER]);
  });

  it('does not create a sheet for a year it will refuse', async () => {
    const make = createSheet();
    const { client } = fakeSheets([HEADER, ['2027', 'closed']]);
    await expect(createAwardYear(client, { year: '2027' }, 'a', make, now)).rejects.toMatchObject({ status: 409 });
    expect(make).not.toHaveBeenCalled();
  });

  it('rejects a duplicate year', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'closed']]);
    await expect(createAwardYear(client, { year: '2027' }, 'a', createSheet(), now)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects opening a second year', async () => {
    const { client } = fakeSheets([HEADER, ['2026', 'open']]);
    await expect(
      createAwardYear(client, { year: '2027', status: 'open' }, 'a', createSheet(), now)
    ).rejects.toThrow('2026 is still open');
  });

  it('rejects bad input', async () => {
    const { client } = fakeSheets([HEADER]);
    await expect(createAwardYear(client, { year: '27' }, 'a', createSheet(), now)).rejects.toBeInstanceOf(AwardYearError);
    await expect(
      createAwardYear(client, { year: '2027', opens: '2027-11-01', closes: '2027-10-01' }, 'a', createSheet(), now)
    ).rejects.toThrow('Opens must be on or before Closes');
  });
});

describe('updateAwardYear', () => {
  const now = new Date('2026-11-01T18:00:00Z');

  it('writes the matching row and records a manual close', async () => {
    const sheets = fakeSheets([HEADER, ['2025', 'closed'], ['2026', 'open', '2026-09-01']]);
    await updateAwardYear(sheets.client, '2026', { status: 'closed' }, 'admin@x', now);
    expect(sheets.raw.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'Award Years'!A3:H3" })
    );
    expect(sheets.tab()![2]).toEqual([
      '2026', 'closed', '2026-09-01', '', now.toISOString(), now.toISOString(), 'admin@x', '',
    ]);
  });

  it('gives a never-opened year no close time, so no upload grace, when its dates change', async () => {
    const { client } = fakeSheets([HEADER, ['2027', 'closed']]);
    expect(await updateAwardYear(client, '2027', { opens: '2027-03-01' }, 'a', now)).toMatchObject({
      status: 'closed',
      opens: '2027-03-01',
      closedAt: '',
    });
  });

  it('keeps the original close time when a closed year is saved again', async () => {
    const closedAt = '2026-10-01T00:00:00Z';
    const { client } = fakeSheets([HEADER, ['2026', 'closed', '', '', closedAt]]);
    expect(await updateAwardYear(client, '2026', { closes: '2026-10-01' }, 'a', now)).toMatchObject({ closedAt });
  });

  it('clears the close time when reopened', async () => {
    const sheets = fakeSheets([HEADER, ['2026', 'closed', '', '', '2026-10-01T00:00:00Z', '', '', 'sheet-2026']]);
    await updateAwardYear(sheets.client, '2026', { status: 'open' }, 'a', now);
    expect(sheets.tab()![1][4]).toBe('');
    expect(sheets.tab()![1][7]).toBe('sheet-2026');
  });

  it('will not open a year with no sheet of its own', async () => {
    const sheets = fakeSheets([HEADER, ['2027', 'closed']]);
    await expect(updateAwardYear(sheets.client, '2027', { status: 'open' }, 'a', now)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('no submissions sheet'),
    });
    expect(sheets.tab()![1]).toEqual(['2027', 'closed']);
  });

  it('still saves an already open year that has no sheet', async () => {
    const { client } = fakeSheets([HEADER, ['2026', 'open']]);
    expect(await updateAwardYear(client, '2026', { closes: '2026-12-01' }, 'a', now)).toMatchObject({
      closes: '2026-12-01',
    });
  });

  it('404s an unknown year', async () => {
    const { client } = fakeSheets([HEADER]);
    await expect(updateAwardYear(client, '2030', { status: 'open' }, 'a', now)).rejects.toMatchObject({
      status: 404,
    });
  });
});
