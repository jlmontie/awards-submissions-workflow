import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
const getIdTokenClient = vi.hoisted(() => vi.fn(async () => ({ request })));

vi.mock('googleapis', () => ({
  google: {
    options: vi.fn(),
    auth: {
      GoogleAuth: class {
        getIdTokenClient = getIdTokenClient;
      },
    },
  },
}));

import { AwardYearError } from './award-years-store';
import { createYearSheet } from './year-sheet-function';

const URL = 'https://year-sheet.run.app';

beforeEach(() => {
  process.env.YEAR_SHEET_FUNCTION_URL = URL;
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'portal@x.iam.gserviceaccount.com' });
  request.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('createYearSheet', () => {
  it('asks the function for the sheet, as the invoking account, and shares it with the portal', async () => {
    request.mockResolvedValue({ data: { sheet_id: 'sheet-2027' } });

    expect(await createYearSheet('2027', 'sheet-2026')).toBe('sheet-2027');

    expect(getIdTokenClient).toHaveBeenCalledWith(URL);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: URL,
        method: 'POST',
        retry: false,
        data: {
          year: '2027',
          share_with: 'portal@x.iam.gserviceaccount.com',
          source_sheet_id: 'sheet-2026',
        },
      })
    );
  });

  it('passes on the reason the function gives', async () => {
    request.mockRejectedValue(
      Object.assign(new Error('Request failed'), { response: { data: { error: 'Drive is down' } } })
    );
    await expect(createYearSheet('2027', undefined)).rejects.toMatchObject({
      message: 'Could not create the 2027 sheet: Drive is down',
      status: 502,
    });
  });

  it('says so when it is not configured', async () => {
    delete process.env.YEAR_SHEET_FUNCTION_URL;
    await expect(createYearSheet('2027', undefined)).rejects.toBeInstanceOf(AwardYearError);
    expect(request).not.toHaveBeenCalled();
  });

  it('says so when there is no account to share with', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    await expect(createYearSheet('2027', undefined)).rejects.toThrow('no service account');
    expect(request).not.toHaveBeenCalled();
  });
});
