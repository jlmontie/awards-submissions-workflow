import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

// Force this route to be dynamic (not pre-rendered at build time)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storage = new Storage();
const publicAssetsBucket = process.env.PUBLIC_ASSETS_BUCKET!;
const BLANK_FORM_PATH = 'blank-submission-form.pdf';

export async function GET() {
  // Skip execution during build time (CI=true is set by Cloud Build)
  if (process.env.CI === 'true' && !process.env.RUNTIME_ENV) {
    return NextResponse.json({ error: 'Build time - route not available' }, { status: 503 });
  }

  try {
    const bucket = storage.bucket(publicAssetsBucket);
    const file = bucket.file(BLANK_FORM_PATH);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'Blank form not found' },
        { status: 404 }
      );
    }

    // Get file contents as Buffer
    const [fileContents] = await file.download();

    // Return file with proper headers
    // Convert Buffer to Uint8Array for NextResponse
    return new NextResponse(Uint8Array.from(fileContents), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="awards-submission-form.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Error downloading form:', error);
    return NextResponse.json(
      { error: 'Failed to download form' },
      { status: 500 }
    );
  }
}
