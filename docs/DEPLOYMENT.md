# Deployment Guide

Complete guide for deploying the Construction Awards Submission system to production.  
**See also:** [README.md](../README.md) | [ROADMAP.md](ROADMAP.md)

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
2. **Sheets:** Create spreadsheet "Awards Submissions Master" and copy the Sheet ID. Headers are optional — the PDF processor appends rows in a fixed column order and doesn't read the header row (see [`backend/pdf-processor/main.py`](../backend/pdf-processor/main.py) `process_pdf` → `row_data` for the authoritative column list).
3. **reCAPTCHA:** Register site at [reCAPTCHA Admin](https://www.google.com/recaptcha/admin) (v3) and save Site Key and Secret Key.

---

## Step 3: Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_id             = "your-gcp-project-id"
region                 = "us-central1"
drive_root_folder_id   = "your-drive-folder-id"
master_sheet_id        = "your-sheet-id"
recaptcha_site_key     = "your-recaptcha-site-key"
recaptcha_secret_key   = "your-recaptcha-secret-key"
admin_email            = "your-email@example.com"
drive_owner_email      = "your-email@gmail.com"   # must own the Drive folder
environment            = "production"
```

---

## Step 4: Deploy with Terraform

```bash
terraform init
terraform plan   # Review resources
terraform apply
```

`apply` creates every Cloud resource, the Secret Manager shells, and the IAM
bindings — including the shell for the OAuth token secret
(`ucd-production-awards-user-oauth-token`) that the Cloud Functions use to
authenticate to Drive and Sheets. The one thing it can't do is populate that
secret's *version*, because the value is a user credential generated
interactively. That's Step 5.

Share the Drive folder and Google Sheet with the backend service account (Editor). Get the email from `terraform output backend_service_account_email`.

---

## Step 5: OAuth Authentication (Required)

Cloud Functions access Drive and Sheets **as you** (your storage quota). Do not skip.

### 5.1 Generate the OAuth refresh token

You'll need an OAuth Client ID/Secret with `https://www.googleapis.com/auth/drive` and `https://www.googleapis.com/auth/spreadsheets` scopes (Desktop-type client in the Google Cloud Console). Then:

```bash
python scripts/get-user-oauth-token.py
```

The script opens a browser — sign in with the account that **owns** the Drive folder. It writes the refresh token to `/tmp/user-oauth-token.json`.

### 5.2 Add the token as a new version of the terraform-managed secret

```bash
gcloud secrets versions add ucd-production-awards-user-oauth-token \
  --data-file=/tmp/user-oauth-token.json \
  --project=YOUR_PROJECT_ID

rm /tmp/user-oauth-token.json
```

IAM is already bound by terraform (see `terraform/iam.tf`, `backend_user_oauth_token`) — no manual `add-iam-policy-binding` step.

### 5.3 Verify

Upload a PDF via the awards page and check `gcloud functions logs read ucd-production-awards-pdf-processor --region=us-central1 --limit=50` for a successful `Appended row to sheet` line and no `NotFound: Secret ... not found` errors.

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
