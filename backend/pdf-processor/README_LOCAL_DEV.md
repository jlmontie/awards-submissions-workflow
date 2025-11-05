# Local Development Guide for PDF Processor

> **📘 Main Documentation:** [../../README.md](../../README.md) | **Development Guide:** [../../docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)

This guide explains how to test the PDF processor locally before deploying to Cloud Functions.

**Use this when:** You want to test PDF field extraction with your actual forms before deploying to production.

## Setup

### 1. Install Dependencies

```bash
cd backend/pdf-processor
pip install -r requirements.txt
```

### 2. Authenticate with Google Cloud

```bash
# Login with your Google account
gcloud auth application-default login

# Set your project
gcloud config set project utah-construction-and-design
```

### 3. Verify Secrets Access

Make sure you can access the secrets:

```bash
gcloud secrets versions access latest --secret="awards-production-drive-folder"
gcloud secrets versions access latest --secret="awards-production-sheet-id"
```

## Usage

### Extract Fields Only (Dry Run)

Test PDF field extraction without uploading anything:

```bash
python main_local.py ../../example-filled-submission-form.pdf --dry-run
```

This will:
- ✅ Read the PDF
- ✅ Extract form fields
- ✅ Display all extracted data
- ❌ NOT upload to Drive
- ❌ NOT update Sheets

### Full Process (Upload to Drive & Sheets)

Process a PDF and actually upload to Drive/Sheets:

```bash
python main_local.py ../../example-filled-submission-form.pdf
```

This will:
- ✅ Extract PDF fields
- ✅ Create folder structure in Drive
- ✅ Upload PDF to Drive
- ✅ Append row to Google Sheet

**Warning**: This creates real data in your Drive and Sheet!

### Test with Your Own PDF

```bash
python main_local.py /path/to/your/test.pdf --dry-run
```

## Output

The script provides detailed logging showing:

1. **PDF Reading**: File size, page count
2. **Field Extraction**: All form fields found
3. **Normalized Data**: Cleaned and standardized fields
4. **Drive Operations**: Folder creation, file upload
5. **Sheets Operations**: Row data being appended

Example output:

```
============================================================
Processing PDF: ../../example-filled-submission-form.pdf
Dry run: True
============================================================
2025-11-05 14:30:15 - __main__ - INFO - PDF size: 2.34 MB
2025-11-05 14:30:15 - __main__ - INFO - PDF has 3 pages

--- EXTRACTING PDF FIELDS ---
2025-11-05 14:30:15 - __main__ - INFO - Found 25 form fields
2025-11-05 14:30:15 - __main__ - DEBUG -   project_name: Downtown Office Tower
2025-11-05 14:30:15 - __main__ - DEBUG -   company: ABC Construction Co.
...

--- NORMALIZED DATA ---
2025-11-05 14:30:15 - __main__ - INFO - project_name: Downtown Office Tower
2025-11-05 14:30:15 - __main__ - INFO - company_name: ABC Construction Co.
...

✅ DRY RUN COMPLETE - No changes made
```

## Environment Variables

You can override defaults with environment variables:

```bash
export GCP_PROJECT_ID="your-project-id"
export DRIVE_FOLDER_SECRET="your-drive-secret-name"
export SHEET_ID_SECRET="your-sheet-secret-name"
export MAX_PDF_SIZE_MB="100"

python main_local.py test.pdf
```

## Troubleshooting

### "Failed to get credentials"

Run the authentication command:
```bash
gcloud auth application-default login
```

### "Error getting secret"

Check that you have access to the secrets:
```bash
gcloud secrets list
```

Make sure your account has the `secretmanager.secretAccessor` role.

### "Permission denied" for Drive/Sheets

Make sure you've shared your Drive folder and Google Sheet with your personal account (the one you authenticated with).

### No form fields found

Some PDFs don't have fillable forms. The script will still process them but won't extract field data. Consider:
- Using a different PDF with form fields
- Adding OCR capability (future enhancement)

## Tips

### Testing Different Field Mappings

The script looks for fields with various names. To test field mapping:

1. Run with `--dry-run` to see what fields exist in your PDF
2. Update the `normalize_field_data()` function in `main.py` to match your form
3. Test locally before deploying

### Checking Folder Structure

After a successful run (without `--dry-run`), check your Drive:

```
Your Root Folder
└── 2025
    └── 2025-11
        └── Your Project Name
            └── your-file.pdf
```

### Quick Test Loop

```bash
# Edit the code
vim main.py

# Test extraction only
python main_local.py test.pdf --dry-run

# If looks good, test full process
python main_local.py test.pdf

# Deploy when ready
cd ../../terraform
terraform apply
```

## Differences from Cloud Function

The local version:
- Uses your personal credentials instead of service account
- Provides more detailed logging
- Allows dry-run mode
- Doesn't simulate the Cloud Storage event trigger

The actual Cloud Function will:
- Use the service account credentials
- Be triggered automatically when files are uploaded to GCS
- Process files in the `submissions/YYYY/MM/submission_id/pdf/` path
- Have retry logic built into Cloud Functions

