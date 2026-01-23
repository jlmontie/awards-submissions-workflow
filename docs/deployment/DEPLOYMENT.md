# Deployment Guide

> **📘 Complete Documentation:** [README.md](../README.md) | **⚡ Quick Setup:** [QUICKSTART.md](../QUICKSTART.md)

This guide provides a detailed, step-by-step walkthrough for deploying the Construction Awards Submission system to production.

**If you want a faster setup with minimal explanation, use the [QUICKSTART.md](../QUICKSTART.md) guide instead.**

## Prerequisites

Before you begin, ensure you have:

- ✅ Google Cloud Project with billing enabled
- ✅ `gcloud` CLI installed and authenticated
- ✅ Terraform >= 1.5
- ✅ Node.js >= 18
- ✅ Python >= 3.11 (for local testing only)

## Step 1: Initial Google Cloud Setup

### 1.1 Authenticate with Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Authenticate for application default credentials
gcloud auth application-default login
```

### 1.2 Enable Required APIs

```bash
# Run the setup script
chmod +x scripts/setup-google-apis.sh
./scripts/setup-google-apis.sh
```

Or manually enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  drive.googleapis.com \
  sheets.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  eventarc.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  artifactregistry.googleapis.com
```

## Step 2: Setup Google Drive and Sheets

### 2.1 Create Google Drive Folder

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder named "Awards Submissions"
3. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```

### 2.2 Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet named "Awards Submissions Master"
3. In Sheet1, add headers in the first row:
   ```
   Submission Date | Submission ID | Project Name | Location | Cost | Completion Date | Company | Contact Name | Email | Phone | PDF Link | Drive Folder | Additional Fields
   ```
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
   ```

### 2.3 Setup reCAPTCHA v3

1. Go to [reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
2. Register a new site with reCAPTCHA v3
3. Add your domain(s)
4. Save the Site Key and Secret Key

## Step 3: Setup User OAuth Authentication

**⚠️ CRITICAL STEP - DO NOT SKIP**

The Cloud Functions need to access Google Drive and Sheets **as you** (using your storage quota). This requires setting up OAuth credentials.

**👉 Follow the complete guide:** [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md)

Quick summary:
```bash
# 1. Generate OAuth credentials
gcloud auth application-default login

# 2. Store in Secret Manager
cat ~/.config/gcloud/application_default_credentials.json | \
  gcloud secrets create awards-production-user-oauth-token \
    --data-file=- \
    --project=YOUR_PROJECT_ID
```

## Step 4: Configure Terraform

### 4.1 Copy Example Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

### 4.2 Edit Configuration

Edit `terraform.tfvars` with your values:

```hcl
project_id = "your-gcp-project-id"
region     = "us-central1"

drive_root_folder_id = "your-drive-folder-id"
master_sheet_id      = "your-sheet-id"

recaptcha_site_key   = "your-recaptcha-site-key"
recaptcha_secret_key = "your-recaptcha-secret-key"

admin_email = "your-email@example.com"
drive_owner_email = "your-email@example.com"  # MUST match OAuth account

environment = "production"
```

## Step 5: Deploy Infrastructure with Terraform

### 4.1 Initialize Terraform

```bash
cd terraform
terraform init
```

### 4.2 Review the Plan

```bash
terraform plan
```

Review the resources that will be created:
- Storage buckets (3)
- Service accounts (2)
- Cloud Functions (2)
- Cloud Run service (1)
- Secret Manager secrets (3)
- IAM bindings
- Monitoring resources

### 4.3 Apply Configuration

```bash
terraform apply
```

Type `yes` when prompted.

⏱️ This will take approximately 5-10 minutes.

### 4.4 Save Outputs

```bash
terraform output > ../deployment-outputs.txt
```

## Step 5: Share Google Resources with Service Account

After Terraform completes, you'll see a service account email in the output.

### 5.1 Share Drive Folder

1. Open your "Awards Submissions" folder in Google Drive
2. Click "Share"
3. Add the service account email (from `backend_sa_email` output)
4. Give it "Editor" permissions
5. Click "Send" (uncheck "Notify people")

### 5.2 Share Google Sheet

1. Open your Google Sheet
2. Click "Share"
3. Add the same service account email
4. Give it "Editor" permissions
5. Click "Send" (uncheck "Notify people")

## Step 6: Upload Blank PDF Form

```bash
# Get the public assets bucket name from outputs
BUCKET_NAME=$(terraform output -raw public_assets_bucket_name)

# Upload your blank form
gsutil cp ../example-filled-submission-form.pdf gs://${BUCKET_NAME}/blank-submission-form.pdf

# Make it publicly readable (already done by Terraform, but verify)
gsutil acl ch -u AllUsers:R gs://${BUCKET_NAME}/blank-submission-form.pdf
```

## Step 7: Build and Deploy Frontend

### 7.1 Configure Frontend Environment

```bash
cd ../frontend
cp .env.example .env.production
```

Edit `.env.production`:

```env
GCP_PROJECT_ID=your-project-id
NEXT_PUBLIC_GCS_BUCKET=your-submissions-bucket-name
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
PUBLIC_ASSETS_BUCKET=your-public-assets-bucket-name
```

Get bucket names from Terraform outputs:

```bash
cd ../terraform
terraform output submissions_bucket_name
terraform output public_assets_bucket_name
```

### 7.2 Deploy to Cloud Run

```bash
cd ../frontend

# Deploy using gcloud (builds and deploys)
gcloud run deploy awards-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account=SERVICE_ACCOUNT_EMAIL \
  --set-env-vars="GCP_PROJECT_ID=YOUR_PROJECT_ID,NEXT_PUBLIC_GCS_BUCKET=BUCKET_NAME,NEXT_PUBLIC_RECAPTCHA_SITE_KEY=SITE_KEY,PUBLIC_ASSETS_BUCKET=PUBLIC_BUCKET"
```

Replace the values with your actual configuration.

⏱️ First deployment takes 5-10 minutes (building container image).

### 7.3 Get Frontend URL

```bash
gcloud run services describe awards-frontend \
  --region us-central1 \
  --format='value(status.url)'
```

## Step 8: Test the System

### 8.1 Access the Application

Open the Cloud Run URL in your browser.

### 8.2 Test Submission Flow

1. Download the blank form
2. Fill it out (or use the example)
3. Upload the completed PDF
4. Upload at least one photo
5. Submit

### 8.3 Verify Processing

Check that:
- Files appear in Google Cloud Storage
- Folder is created in Google Drive
- Row is added to Google Sheet
- No errors in Cloud Functions logs

```bash
# View Cloud Function logs
gcloud functions logs read awards-production-pdf-processor --region=us-central1 --limit=50

gcloud functions logs read awards-production-photo-processor --region=us-central1 --limit=50
```

## Step 9: Setup Custom Domain (Optional)

### 9.1 Verify Domain Ownership

Follow [Google Cloud documentation](https://cloud.google.com/run/docs/mapping-custom-domains).

### 9.2 Map Domain to Cloud Run

```bash
gcloud run domain-mappings create \
  --service awards-frontend \
  --domain awards.yourcompany.com \
  --region us-central1
```

### 9.3 Update DNS

Add the DNS records shown in the output to your domain registrar.

## Step 10: Enable Monitoring & Alerts

### 10.1 Access Dashboard

Get the dashboard URL from Terraform output:

```bash
cd ../terraform
terraform output monitoring_dashboard_url
```

### 10.2 Configure Alert Notifications

Verify email notifications are working:

```bash
gcloud alpha monitoring channels list
```

### 10.3 Test Alerts (Optional)

Trigger a test alert by uploading an invalid file.

## Troubleshooting

### Common Issues

#### "Permission Denied" Errors

- Verify service account has access to Drive/Sheets
- Check IAM bindings in GCP Console
- Ensure service account is shared with Drive folder and Sheet

#### Functions Not Triggering

- Check Eventarc triggers are created:
  ```bash
  gcloud eventarc triggers list
  ```
- Verify bucket name matches in functions configuration
- Check Cloud Functions logs for errors

#### Frontend Build Failures

- Ensure all environment variables are set
- Check Node.js version (must be 18+)
- Review Cloud Build logs:
  ```bash
  gcloud builds list --limit=5
  ```

#### PDF Field Extraction Fails

- Verify PDF has fillable form fields (AcroForm)
- Check Python dependencies are installed
- Consider using Document AI for scanned PDFs

### Getting Help

1. Check logs:
   ```bash
   gcloud logging read "resource.type=cloud_function" --limit=50
   gcloud logging read "resource.type=cloud_run_revision" --limit=50
   ```

2. Check service status:
   ```bash
   gcloud run services list
   gcloud functions list
   ```

3. Verify storage:
   ```bash
   gsutil ls gs://your-submissions-bucket/submissions/
   ```

## Post-Deployment Checklist

- [ ] Frontend is accessible
- [ ] Can download blank form
- [ ] Can upload PDF and photos
- [ ] Files appear in GCS
- [ ] Drive folders are created
- [ ] Sheet is populated
- [ ] Cloud Functions execute successfully
- [ ] Monitoring dashboard shows data
- [ ] Email alerts are configured
- [ ] Custom domain is mapped (if applicable)

## Next Steps

- Review [CONFIGURATION.md](CONFIGURATION.md) for advanced configuration
- See [DEVELOPMENT.md](DEVELOPMENT.md) for local development setup
- Set up CI/CD pipeline for automated deployments
- Configure backup strategy for Drive and Sheets

## Updating the System

To deploy updates:

```bash
# Update infrastructure
cd terraform
terraform apply

# Update frontend
cd ../frontend
gcloud run deploy awards-frontend --source .

# Cloud Functions update automatically via Terraform
```

## Tearing Down

To remove all resources:

```bash
cd terraform
terraform destroy
```

⚠️ **Warning**: This will delete all data in storage buckets. Export important data first!

