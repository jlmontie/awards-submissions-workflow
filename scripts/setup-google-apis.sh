#!/bin/bash

# Setup script to enable required Google Cloud APIs
# Usage: ./scripts/setup-google-apis.sh

set -e

echo "🚀 Enabling required Google Cloud APIs..."
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Error: Not authenticated with gcloud"
    echo "Please run: gcloud auth login"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No project set"
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Project: $PROJECT_ID"
echo ""

# List of required APIs
APIS=(
    "run.googleapis.com"
    "cloudfunctions.googleapis.com"
    "cloudbuild.googleapis.com"
    "storage.googleapis.com"
    "drive.googleapis.com"
    "sheets.googleapis.com"
    "secretmanager.googleapis.com"
    "cloudscheduler.googleapis.com"
    "eventarc.googleapis.com"
    "logging.googleapis.com"
    "monitoring.googleapis.com"
    "artifactregistry.googleapis.com"
)

echo "Enabling ${#APIS[@]} APIs..."
echo ""

for api in "${APIS[@]}"; do
    echo "  ⏳ Enabling $api..."
    if gcloud services enable "$api" --project="$PROJECT_ID" 2>&1 | grep -q "enabled"; then
        echo "  ✅ $api enabled"
    else
        echo "  ✅ $api already enabled"
    fi
done

echo ""
echo "✅ All required APIs are enabled!"
echo ""
echo "Next steps:"
echo "  1. Setup Google Drive folder and Sheet"
echo "  2. Configure Terraform variables"
echo "  3. Run: cd terraform && terraform init && terraform apply"
echo ""

