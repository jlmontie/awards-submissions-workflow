// Must match MAX_PDF_SIZE_MB / MAX_PHOTO_SIZE_MB on the backend processors
// (terraform: max_pdf_size_mb / max_photo_size_mb).
export const MAX_PDF_SIZE_MB = 50;
export const MAX_PHOTO_SIZE_MB = 20;

// Shown as guidance only; submissions with fewer photos are still accepted.
export const MIN_PHOTO_FILES = 12;
export const MAX_PHOTO_FILES = 30;

export const MAX_PDF_SIZE = MAX_PDF_SIZE_MB * 1024 * 1024;
export const MAX_PHOTO_SIZE = MAX_PHOTO_SIZE_MB * 1024 * 1024;
