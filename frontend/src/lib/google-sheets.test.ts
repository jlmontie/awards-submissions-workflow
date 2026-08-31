import { describe, expect, it, vi } from 'vitest';
import { batchGetValues, type SheetsClient } from './google-sheets';

/**
 * Minimal stand-in for the Sheets client — only the two methods
 * batchGetValues touches.
 */
function fakeSheets(handlers: {
  batchGet?: (ranges: string[]) => Promise<any>;
  get?: (range: string) => Promise<any>;
}) {
  const batchGet = vi.fn(async ({ ranges }: { ranges: string[] }) => {
    if (!handlers.batchGet) throw new Error('unexpected batchGet');
    return handlers.batchGet(ranges);
  });
  const get = vi.fn(async ({ range }: { range: string }) => {
    if (!handlers.get) throw new Error('unexpected get');
    return handlers.get(range);
  });
  return {
    client: { spreadsheets: { values: { batchGet, get } } } as unknown as SheetsClient,
    batchGet,
    get,
  };
}

function httpError(status: number) {
  const err: any = new Error(`HTTP ${status}`);
  err.response = { status };
  return err;
}

describe('batchGetValues', () => {
  it('reads every range in one call and keeps them positionally aligned', async () => {
    const { client, batchGet, get } = fakeSheets({
      batchGet: async () => ({
        data: {
          valueRanges: [
            { values: [['survey_id'], ['S-1']] },
            {}, // valid but empty tab — Sheets omits `values` entirely
            { values: [['recipient_id'], ['R-1']] },
          ],
        },
      }),
    });

    const result = await batchGetValues(client, 'sheet-1', ['A!A:Z', 'B!A:Z', 'C!A:Z']);

    expect(batchGet).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(result).toEqual([[['survey_id'], ['S-1']], [], [['recipient_id'], ['R-1']]]);
  });

  it('falls back to per-range reads when one range is unparseable (400)', async () => {
    // A per-template response tab that hasn't been created yet fails the whole
    // batch; the other ranges must still come back.
    const { client, batchGet, get } = fakeSheets({
      batchGet: async () => {
        throw httpError(400);
      },
      get: async (range) => {
        if (range === 'Missing!A:B') throw httpError(400);
        return { data: { values: [[range]] } };
      },
    });

    const result = await batchGetValues(client, 'sheet-1', [
      'Surveys!A:Z',
      'Missing!A:B',
      'Recipients!A:Z',
    ]);

    expect(batchGet).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(3);
    expect(result).toEqual([[['Surveys!A:Z']], null, [['Recipients!A:Z']]]);
  });

  it('propagates transient failures instead of fanning out into a degraded API', async () => {
    // The 2026-08-31 incident was a burst of Sheets 503s. Retrying each range
    // individually there would multiply load on an already-failing dependency.
    const { client, get } = fakeSheets({
      batchGet: async () => {
        throw httpError(503);
      },
    });

    await expect(
      batchGetValues(client, 'sheet-1', ['Surveys!A:Z', 'Recipients!A:Z']),
    ).rejects.toThrow('HTTP 503');
    expect(get).not.toHaveBeenCalled();
  });
});
