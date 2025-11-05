# Construction Awards Submission Workflow

A production-grade, scalable system for handling construction awards submissions with automated PDF processing and unlimited photo uploads.

## Overview

This system provides a complete serverless workflow for accepting award submissions through a web interface, automatically extracting PDF form data, organizing files in Google Drive, and maintaining a master spreadsheet. Built entirely on Google Cloud Platform with infrastructure-as-code.

## 🏗️ Architecture

```
┌─────────────────┐
│   Next.js App   │ ← User uploads PDF + Photos
│  (Cloud Run)    │
└────────┬────────┘
         │
         ↓
┌────────────────────┐
│ Google Cloud       │ ← Resumable uploads
│ Storage            │
└────────┬───────────┘
         │
         ↓ (triggers)
┌────────────────────┐
│ Cloud Functions    │ → Extract PDF fields
│ (Python)           │ → Create Drive folder
└────────┬───────────┘ → Append to Sheet
         │
         ↓
┌────────────────────┐
│ Google Drive       │ ← Organized submissions
│ Google Sheets      │ ← Master data
└────────────────────┘
```

**How it works:**
1. Users visit the web app and download a blank submission form
2. After filling it out, they upload the PDF and project photos
3. Files are uploaded directly to Google Cloud Storage (secure, signed URLs)
4. Cloud Functions automatically trigger on file uploads
5. PDF data is extracted and a Drive folder is created (`Awards/YYYY/YYYY-MM/ProjectName/`)
6. All files are uploaded to the Drive folder and a row is added to the master spreadsheet
7. No manual processing required!

## 📋 Features

- ✅ **Unlimited photo uploads** - Chunked, resumable uploads to GCS
- ✅ **Automatic PDF extraction** - Reads AcroForm fields
- ✅ **Organized storage** - Per-project folders in Drive
- ✅ **Master spreadsheet** - Auto-populated from all submissions
- ✅ **Works with free Google Drive** - No paid Workspace plan needed
- ✅ **Spam protection** - reCAPTCHA v3
- ✅ **Security** - File validation, size limits, virus scanning
- ✅ **Infrastructure as Code** - Terraform managed

## 🗂️ Project Structure

```
.
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   └── lib/             # Utilities
│   ├── public/              # Static assets (blank PDF form)
│   └── Dockerfile
│
├── backend/                 # Cloud Functions
│   ├── pdf-processor/       # Extracts PDF fields → Sheets
│   ├── photo-processor/     # Handles photo uploads
│   └── utils/               # Shared utilities
│
├── terraform/               # Infrastructure as Code
│   ├── main.tf              # Main configuration
│   ├── variables.tf         # Variables
│   ├── outputs.tf           # Outputs
│   ├── storage.tf           # GCS buckets
│   ├── functions.tf         # Cloud Functions
│   ├── run.tf               # Cloud Run (frontend)
│   ├── iam.tf               # Service accounts & permissions
│   └── monitoring.tf        # Alerts & logging
│
├── scripts/                 # Helper scripts
│   └── setup-google-apis.sh # Enable required APIs
│
└── docs/                    # Documentation
    ├── DEPLOYMENT.md        # Deployment guide
    ├── CONFIGURATION.md     # Configuration guide
    └── DEVELOPMENT.md       # Development setup
```

## 🚀 Quick Start

**New to the project?** Follow these three paths based on your goal:

### For First-Time Setup (Production Deployment)

**Time:** ~45 minutes | **Guide:** [QUICKSTART.md](QUICKSTART.md)

1. Create Google Drive folder and Sheet
2. Set up reCAPTCHA v3
3. Configure and deploy with Terraform
4. Share resources with service account
5. Deploy frontend to Cloud Run

The QUICKSTART guide walks you through every step with copy-paste commands.

### For Development & Testing

**Guide:** [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

- Run the Next.js frontend locally
- Test Cloud Functions on your machine
- Debug PDF field extraction
- Make code changes safely

### For Configuration & Customization

**Guide:** [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

- Customize file size limits
- Map PDF form fields to your forms
- Adjust image processing settings
- Configure monitoring and alerts
- Optimize costs

## Prerequisites

Before starting any deployment:

- **Google Cloud Project** with billing enabled
- **Terraform** >= 1.5 ([Install](https://www.terraform.io/downloads))
- **gcloud CLI** ([Install](https://cloud.google.com/sdk/docs/install))
- **Node.js** >= 18 ([Install](https://nodejs.org/))
- **Python** >= 3.11 (for local development)

## 📚 Complete Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[QUICKSTART.md](QUICKSTART.md)** | Fast deployment guide | First-time production setup |
| **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** | Detailed deployment steps | Step-by-step deployment walkthrough |
| **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** | All configuration options | Customizing the system |
| **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** | Local development setup | Testing and development |
| **[backend/pdf-processor/README_LOCAL_DEV.md](backend/pdf-processor/README_LOCAL_DEV.md)** | Local PDF testing | Testing PDF field extraction |

## Technology Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** Python 3.11 Cloud Functions, PyPDF2, Pillow
- **Infrastructure:** Google Cloud Run, Cloud Functions, Cloud Storage, Eventarc
- **Integration:** Google Drive API, Google Sheets API, reCAPTCHA v3
- **IaC:** Terraform for complete infrastructure management

## 🔒 Security

- File type validation (PDF, JPEG, PNG, HEIC)
- Size limits: 50MB for PDF, 20MB per photo
- reCAPTCHA v3 spam protection
- Virus scanning via ClamAV
- Signed URLs for secure uploads
- Service account with minimal permissions

## 📊 Monitoring

Access monitoring dashboards:
```bash
# View logs
gcloud logging read "resource.type=cloud_function"

# Monitor metrics
gcloud monitoring dashboards list
```

## 💰 Cost Estimation

**Expected monthly costs (100 submissions/month):**
- Cloud Storage: $1
- Cloud Functions: $3
- Cloud Run: $8
- Networking: $4
- **Total: ~$16/month**

Scale automatically with usage. Set up budget alerts to monitor costs.

## 🚨 Troubleshooting

Having issues? Check these resources:

1. **Common Issues:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#troubleshooting)
2. **Logs:** `gcloud logging read "resource.type=cloud_function" --limit=50`
3. **Service Status:** `gcloud run services list && gcloud functions list`

Most common fix: Ensure service account has been shared with your Google Drive folder and Sheet (Editor permissions).

## 🤝 Contributing

This is a production template. Feel free to fork and customize for your needs:

- Modify PDF field mappings in `backend/pdf-processor/main.py`
- Customize UI in `frontend/src/`
- Adjust infrastructure in `terraform/`

## 📄 License

MIT License - feel free to use and modify for your organization.

