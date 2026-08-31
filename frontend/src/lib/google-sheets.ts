import { google, type sheets_v4 } from 'googleapis';

export type SheetsClient = sheets_v4.Sheets;

/**
 * Global transport policy for every googleapis call this app makes.
 *
 * gaxios sets no request timeout and defaults both `totalTimeout` and
 * `maxRetryDelay` to Number.MAX_SAFE_INTEGER, so a Sheets API 5xx turns into
 * effectively unbounded exponential backoff. On 2026-08-31 that pinned
 * /api/surveys/admin/list at Cloud Run's full 300s request timeout (504) while
 * Sheets returned 20x 503 UNAVAILABLE in a five-minute window. Bounding the
 * individual attempt and the total retry budget turns that failure mode from a
 * hung page into a prompt error.
 */
google.options({
  timeout: 10_000,
  retryConfig: {
    retry: 2,
    noResponseRetries: 2,
    retryDelayMultiplier: 2,
    maxRetryDelay: 4_000,
    totalTimeout: 20_000,
  },
});

// One client per scope, reused for the life of the container. GoogleAuth caches
// the signed JWT and its access token internally, so hoisting this out of the
// request path removes an OAuth token exchange from every single API route call.
const clientCache: Partial<Record<'readonly' | 'readwrite', SheetsClient>> = {};

/**
 * Get the shared authenticated Google Sheets client.
 *
 * Credentials resolution order:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string — works on Vercel/serverless)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var (file path — local dev fallback)
 *
 * @param readonly - if true, requests readonly scope; otherwise full read/write
 */
export async function getSheetsClient(readonly = false): Promise<SheetsClient> {
  const cacheKey = readonly ? 'readonly' : 'readwrite';
  const cached = clientCache[cacheKey];
  if (cached) return cached;

  const scope = readonly
    ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
    : 'https://www.googleapis.com/auth/spreadsheets';

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  let auth;
  if (keyJson) {
    const credentials = JSON.parse(keyJson);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [scope],
    });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path or ADC
    auth = new google.auth.GoogleAuth({
      scopes: [scope],
    });
  }

  const client = google.sheets({ version: 'v4', auth });
  clientCache[cacheKey] = client;
  return client;
}

/**
 * Read several ranges in a single Sheets API round trip.
 *
 * Routes here routinely need three to five whole tabs at once. Issuing those as
 * parallel `values.get` calls means the response waits on the slowest of N, so
 * each extra range multiplies the chance of catching a retry storm. batchGet
 * collapses them into one request.
 *
 * Returns one entry per requested range, positionally aligned with `ranges`.
 * An entry is `null` only when that specific range could not be read.
 */
export async function batchGetValues(
  sheets: SheetsClient,
  spreadsheetId: string,
  ranges: string[],
): Promise<(string[][] | null)[]> {
  try {
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    const valueRanges = res.data.valueRanges || [];
    return ranges.map((_, i) => (valueRanges[i]?.values as string[][] | undefined) || []);
  } catch (err: any) {
    const status = err?.response?.status ?? err?.code;
    // A single unparseable range (e.g. a per-template response tab that hasn't
    // been created yet) fails the whole batch with a 400. Only then is it worth
    // re-reading one range at a time so the missing one comes back null instead
    // of taking the others down with it. Transient failures propagate rather
    // than fanning back out into an already-degraded API.
    if (status !== 400) throw err;

    return Promise.all(
      ranges.map((range) =>
        sheets.spreadsheets.values
          .get({ spreadsheetId, range })
          .then((r) => (r.data.values as string[][] | undefined) || [])
          .catch(() => null),
      ),
    );
  }
}
