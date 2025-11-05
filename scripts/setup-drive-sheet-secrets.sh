#!/bin/bash
# Script to configure Drive folder ID and Sheet ID in Secret Manager

set -e

PROJECT_ID="utah-construction-and-design"
ENVIRONMENT="production"

echo "=== Awards Submission - Drive & Sheets Setup ==="
echo ""
echo "Service Account Email: awards-production-backend@utah-construction-and-design.iam.gserviceaccount.com"
echo ""
echo "Please follow these steps first:"
echo "1. Create a Google Drive folder for submissions"
echo "2. Share it with the service account email above (as Editor)"
echo "3. Get the folder ID from the URL (the part after /folders/)"
echo ""
echo "4. Create a Google Sheet for tracking submissions"
echo "5. Share it with the service account email above (as Editor)"
echo "6. Get the sheet ID from the URL (the part after /spreadsheets/d/)"
echo ""
read -p "Press Enter when ready to continue..."
echo ""

# Get Drive Folder ID
read -p "Enter your Drive Folder ID: " DRIVE_FOLDER_ID
if [ -z "$DRIVE_FOLDER_ID" ]; then
    echo "Error: Drive Folder ID cannot be empty"
    exit 1
fi

# Get Sheet ID
read -p "Enter your Google Sheet ID: " SHEET_ID
if [ -z "$SHEET_ID" ]; then
    echo "Error: Sheet ID cannot be empty"
    exit 1
fi

echo ""
echo "Storing secrets in Google Secret Manager..."

# Store Drive Folder ID
echo -n "$DRIVE_FOLDER_ID" | gcloud secrets versions add "awards-${ENVIRONMENT}-drive-folder" \
    --project="$PROJECT_ID" \
    --data-file=-

echo "✓ Drive folder ID stored"

# Store Sheet ID
echo -n "$SHEET_ID" | gcloud secrets versions add "awards-${ENVIRONMENT}-sheet-id" \
    --project="$PROJECT_ID" \
    --data-file=-

echo "✓ Sheet ID stored"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Your Cloud Functions will now:"
echo "- Upload PDFs and create folders in: https://drive.google.com/drive/folders/$DRIVE_FOLDER_ID"
echo "- Track submissions in: https://docs.google.com/spreadsheets/d/$SHEET_ID"
echo ""
echo "Next steps:"
echo "1. Finish deploying with: cd terraform && terraform apply"
echo "2. Test the system by uploading a submission through the web interface"

