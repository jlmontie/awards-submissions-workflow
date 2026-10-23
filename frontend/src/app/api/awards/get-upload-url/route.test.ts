import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getSignedUrl = vi.fn(async () => ['https://signed.example/upload']);
const save = vi.fn(async () => {});
const file = vi.fn(() => ({ getSignedUrl, save }));
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file };
    }
  },
}));

const currentSubmissionWindow = vi.fn();
vi.mock('@/lib/awards/award-years-store', () => ({
  currentSubmissionWindow: (...args: unknown[]) => currentSubmissionWindow(...args),
}));
vi.mock('@/lib/google-sheets', () => ({ getSheetsClient: vi.fn() }));

const { POST } = await import('./route');

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/awards/get-upload-url', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'Lehi Civic Center.pdf',
      contentType: 'application/pdf',
      size: 1024,
      submissionId: 'abc-123',
      type: 'pdf',
      submitterEmail: 'james@aeurbia.com',
      invoiceEmail: 'billing@aeurbia.com',
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RECAPTCHA_SECRET_KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('POST /api/awards/get-upload-url', () => {
  it('records both emails beside the submission before signing the PDF upload', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: true, year: '2027' });
    const res = await POST(request({ submitterEmail: ' james@aeurbia.com ' }));
    expect(res.status).toBe(200);
    expect(file).toHaveBeenCalledWith('submissions/2027/abc-123/meta/submission.json');
    const [json, opts] = save.mock.calls[0] as unknown as [string, any];
    expect(JSON.parse(json)).toMatchObject({
      submitterEmail: 'james@aeurbia.com',
      invoiceEmail: 'billing@aeurbia.com',
    });
    expect(opts.preconditionOpts).toEqual({ ifGenerationMatch: 0 });
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(getSignedUrl.mock.invocationCallOrder[0]);
  });

  it('keeps the first record when the PDF upload URL is requested again', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: true, year: '2027' });
    save.mockRejectedValueOnce(Object.assign(new Error('precondition'), { code: 412 }));
    expect((await POST(request({}))).status).toBe(200);
  });

  it.each([
    [{ submitterEmail: '' }, 'Please enter a valid email address for the person submitting.'],
    [{ invoiceEmail: 'not-an-email' }, 'Please enter a valid email address for invoicing.'],
  ])('requires both emails with the PDF (%o)', async (body, error) => {
    const res = await POST(request(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(save).not.toHaveBeenCalled();
  });

  it('does not need the emails for photos, or write anything', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: true, year: '2027' });
    const res = await POST(request({
      type: 'photos', contentType: 'image/jpeg', filename: '1.jpg',
      submitterEmail: undefined, invoiceEmail: undefined,
    }));
    expect(res.status).toBe(200);
    expect(save).not.toHaveBeenCalled();
  });

  it('files the upload under the open award year, not the browser\'s', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: true, year: '2026' });
    const res = await POST(request({ year: '1999' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uploadUrl: 'https://signed.example/upload',
      gcsPath: 'submissions/2026/abc-123/pdf/Lehi_Civic_Center.pdf',
    });
    expect(currentSubmissionWindow).toHaveBeenCalledWith(expect.any(Function), { forUploads: true });
  });

  it('no longer needs the browser to send a year', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: true, year: '2026' });
    expect((await POST(request({}))).status).toBe(200);
  });

  it('refuses with a message the form can show when closed', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: false, year: '2026', reason: 'closed' });
    const res = await POST(request({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Submissions are closed.', closed: true });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('says when a year has not opened yet', async () => {
    currentSubmissionWindow.mockResolvedValue({ accepting: false, year: '2027', reason: 'not_yet_open' });
    const res = await POST(request({}));
    expect(await res.json()).toMatchObject({ error: 'Submissions for 2027 are not open yet.' });
  });

  it('still validates before checking the year', async () => {
    const res = await POST(request({ type: 'photos', contentType: 'application/zip' }));
    expect(res.status).toBe(400);
    expect(currentSubmissionWindow).not.toHaveBeenCalled();
  });
});
