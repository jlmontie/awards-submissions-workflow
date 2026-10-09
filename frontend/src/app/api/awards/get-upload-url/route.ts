import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import {
  MAX_PDF_SIZE,
  MAX_PDF_SIZE_MB,
  MAX_PHOTO_FILES,
  MAX_PHOTO_SIZE,
  MAX_PHOTO_SIZE_MB,
} from '@/lib/awards/upload-limits';

// Force this route to be dynamic (not pre-rendered at build time)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storage = new Storage();
const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET!;

// File validation
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.warn('reCAPTCHA secret key not configured');
    return true; // Allow in development
  }

  if (!token) {
    console.error('No reCAPTCHA token provided');
    return false;
  }

  try {
    const response = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${secretKey}&response=${token}`,
      }
    );

    const data = await response.json();
    console.log('reCAPTCHA verification response:', JSON.stringify(data));

    if (!data.success) {
      console.error('reCAPTCHA verification failed:', data['error-codes']);
    }

    return data.success && data.score >= 0.5; // Minimum score threshold
  } catch (error) {
    console.error('reCAPTCHA verification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      filename,
      contentType,
      size,
      submissionId,
      year,
      type, // 'pdf' or 'photos'
      recaptchaToken,
    } = body;

    // Validate required fields
    if (!filename || !contentType || !submissionId || !year || !type || typeof size !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify reCAPTCHA (temporarily more lenient for debugging)
    if (recaptchaToken) {
      const isValidRecaptcha = await verifyRecaptcha(recaptchaToken);
      if (!isValidRecaptcha) {
        console.error('reCAPTCHA verification failed, but allowing request for debugging');
        // Temporarily allow through for debugging
        // return NextResponse.json(
        //   { error: 'reCAPTCHA verification failed' },
        //   { status: 403 }
        // );
      }
    } else {
      console.warn('No reCAPTCHA token provided - allowing for development');
    }

    // Validate file type
    if (type === 'pdf' && !ALLOWED_PDF_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid PDF file type' },
        { status: 400 }
      );
    }

    if (type === 'photos' && !ALLOWED_PHOTO_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid photo file type' },
        { status: 400 }
      );
    }

    // Validate file size
    if (type === 'pdf' && size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: `${filename} is larger than the ${MAX_PDF_SIZE_MB} MB limit for PDFs` },
        { status: 400 }
      );
    }

    if (type === 'photos' && size > MAX_PHOTO_SIZE) {
      return NextResponse.json(
        { error: `${filename} is larger than the ${MAX_PHOTO_SIZE_MB} MB limit for photos` },
        { status: 400 }
      );
    }

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Construct GCS path: submissions/YYYY/submission_id/type/filename
    const typePrefix = `submissions/${year}/${submissionId}/${type}/`;
    const gcsPath = `${typePrefix}${sanitizedFilename}`;

    const bucket = storage.bucket(bucketName);

    // Validate photo count. The form uploads photos a few at a time, so this
    // counts what has already landed and can overshoot by one batch; the
    // form's own check is what keeps honest submissions at the limit.
    if (type === 'photos') {
      const [existing] = await bucket.getFiles({
        prefix: typePrefix,
        autoPaginate: false,
        maxResults: MAX_PHOTO_FILES,
      });
      if (existing.length >= MAX_PHOTO_FILES) {
        return NextResponse.json(
          { error: `A submission can include at most ${MAX_PHOTO_FILES} photos` },
          { status: 400 }
        );
      }
    }

    // Generate signed URL for upload
    const file = bucket.file(gcsPath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType,
    });

    return NextResponse.json({
      uploadUrl,
      gcsPath,
    });
  } catch (error: any) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
