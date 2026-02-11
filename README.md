# Construction Awards Submission Workflow

A production-grade, scalable system for handling construction awards submissions with automated PDF processing and unlimited photo uploads.

> **🚨 DEPLOYING FOR THE FIRST TIME?**
> Follow [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) and **DO NOT SKIP** the [OAuth Authentication Setup](docs/deployment/AUTHENTICATION_SETUP.md) - it's required for the system to work!

---

## 📢 NEW: Unified Platform Development - Phase 1 Complete! ✅

**Looking to expand beyond awards?** We've analyzed the complete UC&D automation needs, and we're now building the unified platform!

### 🎉 Phase 1: Awards ID System Enhancement - COMPLETE
✅ Unique submission IDs (AW-YYYY-NNN format)  
✅ Winner tracking in Google Sheets  
✅ Confirmation email templates  
✅ Admin CLI tools for winner management  
✅ Project team extraction and export  

**See:** [docs/roadmap/PHASE1_COMPLETE.md](docs/roadmap/PHASE1_COMPLETE.md) | [docs/roadmap/PHASE1_TESTING_GUIDE.md](docs/roadmap/PHASE1_TESTING_GUIDE.md)

### 📋 Implementation Plan & Documentation:
- **⭐ [docs/roadmap/ONE_PAGE_SUMMARY.md](docs/roadmap/ONE_PAGE_SUMMARY.md)** - Print-friendly overview (5 min read)
- **🎯 [docs/roadmap/QUICK_DECISION_GUIDE.md](docs/roadmap/QUICK_DECISION_GUIDE.md)** - Choose your path (10 min read)
- **🚀 [docs/roadmap/IMPLEMENTATION_PLAN.md](docs/roadmap/IMPLEMENTATION_PLAN.md)** - **Executable 12-week plan** (Phase 1 done!)
- **📊 [docs/roadmap/PROJECT_OVERVIEW.md](docs/roadmap/PROJECT_OVERVIEW.md)** - Complete navigation guide
- **📖 [docs/roadmap/PROJECT_SCOPE_ANALYSIS.md](docs/roadmap/PROJECT_SCOPE_ANALYSIS.md)** - Detailed analysis (25 min read)
- **🏗️ [docs/roadmap/ARCHITECTURE_VISION.md](docs/roadmap/ARCHITECTURE_VISION.md)** - Technical architecture (20 min read)
- **💾 [docs/roadmap/DATA_ARCHITECTURE_ANALYSIS.md](docs/roadmap/DATA_ARCHITECTURE_ANALYSIS.md)** - Data storage strategy

**Next:** Phase 2 - Portal Foundation (January 2026) - Admin web dashboard with authentication

---

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
5. PDF data is extracted and a Drive folder is created (`Awards/YYYY/ProjectName/`)
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
└── docs/deployment/         # Documentation
    ├── DEPLOYMENT.md        # Complete deployment guide
    ├── AUTHENTICATION_SETUP.md  # ⚠️ CRITICAL: OAuth setup
    ├── CONFIGURATION.md     # Configuration options
    └── DEVELOPMENT.md       # Local development setup
```

## 🚀 Quick Start

**New to the project?** Follow these three paths based on your goal:

### For First-Time Setup (Production Deployment)

**Time:** ~45 minutes | **Primary Guide:** [docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)

1. Create Google Drive folder and Sheet
2. Set up reCAPTCHA v3
3. **⚠️ CRITICAL:** [Setup OAuth Authentication](docs/deployment/AUTHENTICATION_SETUP.md)
4. Configure and deploy with Terraform
5. Share Drive folder with your Google account

**Important:** The OAuth authentication step (Step 3) is **required** for the system to work. Don't skip it!

### For Development & Testing

**Guide:** [docs/deployment/DEVELOPMENT.md](docs/deployment/DEVELOPMENT.md)

- Run the Next.js frontend locally
- Test Cloud Functions on your machine
- Debug PDF field extraction
- Make code changes safely

### For Configuration & Customization

**Guide:** [docs/deployment/CONFIGURATION.md](docs/deployment/CONFIGURATION.md)

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
| **[docs/deployment/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)** | Complete deployment guide | **START HERE** for production setup |
| **⚠️ [docs/deployment/AUTHENTICATION_SETUP.md](docs/deployment/AUTHENTICATION_SETUP.md)** | **OAuth setup (REQUIRED)** | **MUST DO** before `terraform apply` |
| **[docs/deployment/CONFIGURATION.md](docs/deployment/CONFIGURATION.md)** | All configuration options | Customizing the system |
| **[docs/deployment/DEVELOPMENT.md](docs/deployment/DEVELOPMENT.md)** | Local development setup | Testing and development |

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

1. **Common Issues:** See [docs/DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md#troubleshooting)
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

