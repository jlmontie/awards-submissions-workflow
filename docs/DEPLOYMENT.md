# Deployment Guide

Complete guide for deploying the Construction Awards Submission system to production.  
**See also:** [README.md](../../README.md) | [ROADMAP.md](../ROADMAP.md)

---

## Prerequisites

- Google Cloud Project with billing enabled
- `gcloud` CLI installed and authenticated
- Terraform >= 1.5
- Node.js >= 18
- Python >= 3.11 (for local dev/testing)

---

## Step 1: Initial Google Cloud Setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login
```

Enable required APIs:

```bash
chmod +x scripts/setup-google-apis.sh
./scripts/setup-google-apis.sh
```

---

## Step 2: Google Drive and Sheets

1. **Drive:** Create folder "Awards Submissions" and copy the folder ID from the URL.
2. **Sheets:** Create spreadsheet "Awards Submissions Master" with headers (Submission Date, Submission ID, Project Name, Location, Cost, Completion Date, Company, Contact Name, Email, Phone, PDF Link, Drive Folder, etc.). Copy the Sheet ID.
3. **reCAPTCHA:** Register site at [reCAPTCHA Admin](https://www.google.com/recaptcha/admin) (v3) and save Site Key and Secret Key.

---

## Step 3: OAuth Authentication (Required)

Cloud Functions access Drive and Sheets **as you** (your storage quota). Do not skip.

### 3.1 Generate OAuth Credentials

```bash
gcloud auth application-default login
```

Sign in with the account that **owns** the Drive folder.

### 3.2 Store in Secret Manager

```bash
cat ~/.config/gcloud/application_default_credentials.json | \
  gcloud secrets create awards-production-user-oauth-token \
    --data-file=- \
    --project=YOUR_PROJECT_ID
```

### 3.3 Grant Service Account Access to Secret

```bash
gcloud secrets add-iam-policy-binding awards-production-user-oauth-token \
  --member="serviceAccount:awards-production-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=YOUR_PROJECT_ID
```

### 3.4 Update terraform.tfvars

```hcl
drive_owner_email = "your-email@gmail.com"  # Must match OAuth account
```

---

## Step 4: Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_id             = "your-gcp-project-id"
region                 = "us-central1"
drive_root_folder_id   = "your-drive-folder-id"
master_sheet_id       = "your-sheet-id"
recaptcha_site_key    = "your-recaptcha-site-key"
recaptcha_secret_key  = "your-recaptcha-secret-key"
admin_email           = "your-email@example.com"
drive_owner_email     = "your-email@example.com"
environment           = "production"
```

---

## Step 5: Deploy with Terraform

```bash
terraform init
terraform plan   # Review resources
terraform apply
```

Share the Drive folder and Google Sheet with the backend service account (Editor). Get the email from `terraform output backend_sa_email`.

---

## Step 6: Share Google Sheet with Frontend (Admin Portal)

The admin portal also needs read access. Share the same Sheet with:

```
awards-production-frontend@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Use **Viewer** (read-only) or **Editor** if winner marking will update the Sheet.

---

## Step 7: Upload Blank PDF Form

```bash
BUCKET_NAME=$(terraform output -raw public_assets_bucket_name)
gsutil cp path/to/blank-form.pdf gs://${BUCKET_NAME}/blank-submission-form.pdf
```

---

## Step 8: Verify Deployment

- Open the Cloud Run URL from `terraform output`.
- Test: download form, upload PDF + photos, submit.
- Confirm: GCS has files, Drive folder created, Sheet row added.
- Admin portal: `/admin` should load submissions from the Sheet.

---

## Configuration Reference

**Terraform variables** (`terraform/terraform.tfvars`):

| Variable | Purpose |
|----------|---------|
| `max_pdf_size_mb` | Max PDF size (default 50) |
| `max_photo_size_mb` | Max photo size (default 20) |
| `storage_location` | US, EU, or ASIA |

**Frontend:** Terraform sets env vars for Cloud Run. For local dev, use `frontend/.env.local` with `GCP_PROJECT_ID`, `NEXT_PUBLIC_GCS_BUCKET`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `PUBLIC_ASSETS_BUCKET`, `SHEET_ID`.

---

## Local Development

```bash
cd frontend
cp .env.example .env.local   # Fill in values
npm install
npm run dev
```

Backend (Cloud Functions) locally:

```bash
cd backend/pdf-processor
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Set GCP_PROJECT_ID, DRIVE_FOLDER_SECRET, SHEET_ID_SECRET, SUBMISSIONS_BUCKET
functions-framework --target=process_pdf --debug
```

---

## Troubleshooting

### "Permission Denied" or 403 in Drive/Sheets

- Share Drive folder and Sheet with the backend service account (Editor).
- For admin portal 500 errors: share Sheet with the **frontend** service account (see Step 6).

### "Request was not authenticated" (Cloud Function)

Eventarc invokes functions with the backend service account. Ensure it has `run.invoker`:

```bash
cd terraform && terraform apply
```

### Cloud Function Port 8080 / Build Timeout

- Check Cloud Build logs: `gcloud builds list --limit=5` then `gcloud builds log BUILD_ID`
- Enable Pub/Sub: `gcloud services enable pubsub.googleapis.com`
- Test locally: `functions-framework --target=process_pdf --debug` in `backend/pdf-processor`

### Next.js Build Timeout (Static Page Generation)

If build fails on `/api/download-form` or similar:

- Add `export const dynamic = 'force-dynamic'` to API routes.
- In `next.config.js`: `staticPageGenerationTimeout: 120`.

### Admin Portal 500 on /admin/submissions

- Add `SHEET_ID` to Cloud Run env (Terraform `run.tf`).
- Share the Google Sheet with the frontend service account.

### PDF Field Extraction Fails

- Use fillable AcroForm PDFs.
- For scanned PDFs, consider Document AI.

### Logs and Diagnostics

```bash
gcloud logging read "resource.type=cloud_function" --limit=50
gcloud logging read "resource.type=cloud_run_revision" --limit=50
gcloud run services list && gcloud functions list
```

---

## Updating and Teardown

**Deploy updates:**

```bash
cd terraform && terraform apply
```

**Tear down (destroys all resources and data):**

```bash
cd terraform
terraform destroy
```
