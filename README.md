# Construction Awards Submission Workflow

A production-grade system for construction awards submissions: automated PDF processing, unlimited photo uploads, and organized Google Drive/Sheets storage. Built on Google Cloud (Cloud Run, Cloud Functions, GCS, Drive, Sheets).

> **Deploying for the first time?** Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). **Do not skip** the [OAuth Authentication Setup](docs/DEPLOYMENT.md#step-3-oauth-authentication-required)—it’s required for Cloud Functions to access Drive and Sheets.

---

## Overview

- Users submit a filled PDF form and project photos via the web interface.
- Files upload to Google Cloud Storage; Cloud Functions extract PDF data, create Drive folders, and append rows to a master Google Sheet.
- No manual processing; everything is serverless and Terraform-managed.

## Architecture

```
┌─────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│   Next.js App    │ ──► │ Cloud Storage (GCS) │ ──► │ Cloud Functions    │
│   (Cloud Run)   │     │                    │     │ (PDF + Photo)       │
└─────────────────┘     └────────────────────┘     └─────────┬──────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Google Drive + Google Sheets │
                                              └──────────────────────────────┘
```

## Features

- Unlimited photo uploads (chunked, resumable)
- Automatic PDF field extraction
- Per-project Drive folders
- Master spreadsheet auto-populated
- reCAPTCHA v3, file validation, size limits
- Admin portal at `/admin` for viewing and managing submissions

## Quick Start

| Goal | Guide |
|------|--------|
| **Production deployment** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **Project roadmap & phases** | [docs/ROADMAP.md](docs/ROADMAP.md) |

**Prerequisites:** GCP project with billing, Terraform >= 1.5, gcloud CLI, Node.js >= 18.

**Basic steps:**

1. Create Drive folder and Sheet; get reCAPTCHA keys.
2. Set up [OAuth authentication](docs/DEPLOYMENT.md#step-3-oauth-authentication-required).
3. Configure `terraform/terraform.tfvars` and run `terraform apply`.
4. Share Drive folder and Sheet with the backend service account.
5. Share Sheet with the frontend service account (for admin portal).

## Project Structure

```
├── frontend/          # Next.js app (Cloud Run)
├── backend/           # PDF and photo Cloud Functions
├── terraform/         # Infrastructure as code
├── scripts/           # Setup helpers
└── docs/
    ├── ROADMAP.md     # Platform roadmap and phases
    ├── DEPLOYMENT.md  # Deployment guide
    └── surveys/       # Survey export rules (Survey_Sorting_Rules.md)
```

## Tech Stack

**Frontend:** Next.js 14, React 18, TypeScript, Tailwind  
**Backend:** Python 3.11 Cloud Functions, PyPDF2, Pillow  
**Infrastructure:** Cloud Run, Cloud Functions, GCS, Eventarc, Terraform  
**Integrations:** Drive API, Sheets API, reCAPTCHA v3

## Cost

Rough estimate for ~100 submissions/month: Cloud Storage ~$1, Functions ~$3, Cloud Run ~$8, networking ~$4 → **~$16/month**. Scales with usage.

## Troubleshooting

- See [DEPLOYMENT.md — Troubleshooting](docs/DEPLOYMENT.md#troubleshooting).
- Verify the service account is shared with your Drive folder and Sheet (Editor).
- Logs: `gcloud logging read "resource.type=cloud_function" --limit=50`

## License

MIT
