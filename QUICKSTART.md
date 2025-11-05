# Quick Start Guide

Get the Awards Submission System up and running in **~45 minutes**.

This guide provides copy-paste commands for fast deployment. For detailed explanations, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Google Cloud account** with billing enabled
- [ ] **gcloud CLI** installed and working ([Install](https://cloud.google.com/sdk/docs/install))
- [ ] **Terraform** >= 1.5 installed ([Install](https://www.terraform.io/downloads))
- [ ] **Node.js** >= 18 installed ([Install](https://nodejs.org/))
- [ ] A **personal Google account** (for Drive and Sheets - no Workspace needed!)

## Overview of Steps

1. Setup Google Cloud (5 min)
2. Create Drive folder & Sheet (5 min)
3. Setup reCAPTCHA (5 min)
4. Configure & Deploy Infrastructure (15 min)
5. Share resources with service account (2 min)
6. Upload blank form (1 min)
7. Deploy frontend (10 min)
8. Test the system (2 min)

---

## 1. Setup Google Cloud (5 min)

```bash
# Clone the repository (if you haven't already)
git clone <your-repo-url>
cd awards-submissions-workflow

# Authenticate with Google Cloud
gcloud auth login

# Set your project (replace with your actual project ID)
gcloud config set project YOUR_PROJECT_ID

# Authenticate for application-default credentials
gcloud auth application-default login

# Enable required Google Cloud APIs
chmod +x scripts/setup-google-apis.sh
./scripts/setup-google-apis.sh
```

**What this does:** Authenticates you with Google Cloud and enables 12 required APIs (Cloud Run, Cloud Functions, Storage, Drive, Sheets, etc.).

### 2. Setup Google Drive & Sheets (5 min)

> ✅ **Works with personal Google accounts!** No paid Google Workspace plan needed.

**Create Drive Folder:**
1. Go to [Google Drive](https://drive.google.com) (your personal account is fine)
2. Create folder "Awards Submissions"
3. Copy folder ID from URL (the part after `/folders/`)

**Create Sheet:**
1. Go to [Google Sheets](https://sheets.google.com)
2. Create "Awards Submissions Master"
3. Add headers:
   ```
   Submission Date | Submission ID | Project Name | Location | Cost | 
   Completion Date | Company | Contact Name | Email | Phone | 
   PDF Link | Drive Folder | Additional Fields
   ```
4. Copy sheet ID from URL (the part after `/spreadsheets/d/`)

### 3. Setup reCAPTCHA (5 min)

1. Go to [reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
2. Register site with reCAPTCHA v3
3. Add your domain
4. Save Site Key and Secret Key

### 4. Configure & Deploy Infrastructure (15 min)

```bash
# Navigate to terraform directory
cd terraform

# Copy the example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your actual values
nano terraform.tfvars  # or vim, code, etc.
```

**Required values in `terraform.tfvars`:**
```hcl
project_id              = "your-gcp-project-id"
region                  = "us-central1"
drive_root_folder_id    = "paste-drive-folder-id-from-step-2"
master_sheet_id         = "paste-sheet-id-from-step-2"
recaptcha_site_key      = "paste-site-key-from-step-3"
recaptcha_secret_key    = "paste-secret-key-from-step-3"
admin_email             = "your-email@example.com"
environment             = "production"
```

**Deploy:**
```bash
# Initialize Terraform (downloads providers)
terraform init

# Preview what will be created
terraform plan

# Deploy everything (takes ~5-10 minutes)
terraform apply
# Type 'yes' when prompted
```

**What gets created:** 3 storage buckets, 2 service accounts, 2 Cloud Functions, 1 Cloud Run service, secrets, IAM roles, monitoring, and alerting.

### 5. Share Resources (2 min) ⚠️ **IMPORTANT**

After Terraform completes, you **must** share your Drive folder and Sheet with the service account:

```bash
# Get service account email
terraform output backend_service_account_email
# This will output something like: awards-production-backend@yourproject.iam.gserviceaccount.com
```

**Then manually share:**
1. Open your Drive folder → Click "Share" → Add the service account email as **Editor**
2. Open your Google Sheet → Click "Share" → Add the service account email as **Editor**

💡 **Tip:** Use the helper script to store your IDs:
```bash
../scripts/setup-drive-sheet-secrets.sh
```

### 6. Upload Blank Form (1 min)

```bash
# Get bucket name
BUCKET=$(terraform output -raw public_assets_bucket_name)

# Upload form
gsutil cp ../example-filled-submission-form.pdf gs://$BUCKET/blank-submission-form.pdf
```

### 7. Deploy Frontend (5 min)

```bash
cd ../frontend

# Deploy to Cloud Run (builds automatically)
gcloud run deploy awards-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=YOUR_PROJECT_ID,NEXT_PUBLIC_GCS_BUCKET=YOUR_BUCKET,NEXT_PUBLIC_RECAPTCHA_SITE_KEY=YOUR_KEY"
```

### 8. Test (2 min)

```bash
# Get URL
gcloud run services describe awards-frontend \
  --region us-central1 \
  --format='value(status.url)'

# Open in browser and test:
# 1. Download blank form
# 2. Upload PDF
# 3. Upload photos
# 4. Submit
# 5. Check Drive folder and Sheet
```

---

## ✅ Done! Your System is Live

Your Awards Submission System is now fully deployed and ready to accept submissions!

**Access your app:** Check the Cloud Run URL from step 7

**Monitor your system:**
```bash
cd terraform
terraform output monitoring_dashboard_url
```

## Next Steps

### Optional Enhancements

1. **Custom Domain:** Map your own domain to Cloud Run
   ```bash
   gcloud run domain-mappings create --service awards-frontend --domain awards.yourcompany.com
   ```

2. **Budget Alerts:** Get notified if costs exceed expectations
   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_ACCOUNT \
     --display-name="Awards System Budget" \
     --budget-amount=50USD
   ```

3. **Customize:** See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for:
   - PDF field mapping for your specific forms
   - UI customization (colors, branding)
   - File size limits
   - Image processing settings

### Learn More

- **Detailed Deployment:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Configuration Options:** [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- **Local Development:** [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Troubleshooting

### Permission Denied Errors

**Symptom:** Functions fail with "Permission denied" accessing Drive/Sheets

**Fix:** Ensure you completed Step 5 - sharing Drive folder and Sheet with the service account email (should end in `@YOUR_PROJECT.iam.gserviceaccount.com`)

### Functions Not Triggering

**Check trigger configuration:**
```bash
gcloud eventarc triggers list
```

**View function logs:**
```bash
# PDF processor logs
gcloud functions logs read awards-production-pdf-processor --limit=20

# Photo processor logs
gcloud functions logs read awards-production-photo-processor --limit=20
```

### Frontend Build Issues

**Check Cloud Build logs:**
```bash
gcloud builds list --limit=5
gcloud builds log <BUILD_ID>
```

### Still Having Issues?

1. **Check logs:** `gcloud logging read "resource.type=cloud_function" --limit=50`
2. **Verify resources:** `gcloud run services list && gcloud functions list`
3. **Review detailed guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#troubleshooting)

## Expected Costs

**Monthly cost estimate for 100 submissions:**
- Cloud Storage: ~$1
- Cloud Functions: ~$3
- Cloud Run: ~$8
- Networking: ~$4
- **Total: ~$16/month**

Costs scale with usage. The system auto-scales from 0 to handle traffic spikes.

