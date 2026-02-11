# Authentication Setup Guide

This guide explains how to set up the required authentication for the Cloud Functions to access Google Drive and Sheets using **your Google account credentials**.

## Why This is Required

The Cloud Functions need to create folders and upload files to **your Google Drive** as **you** (not as a service account), so they use your personal storage quota. This requires:

1. Your OAuth refresh token (to authenticate as you)
2. A quota project (for API billing)

## Prerequisites

- Google Cloud Project created and configured
- `gcloud` CLI installed and authenticated
- You must be logged in as the Google account that owns the Drive folder

## Step 1: Generate User OAuth Credentials

### 1.1 Authenticate with Application Default Credentials

Run this command to generate OAuth credentials:

```bash
gcloud auth application-default login
```

This will:
- Open a browser window
- Ask you to sign in with your Google account
- **Important:** Sign in with the account that **owns the Drive folder**
- Grant permissions for Drive and Sheets access

### 1.2 Verify Credentials Were Created

```bash
cat ~/.config/gcloud/application_default_credentials.json
```

You should see a JSON file with:
- `client_id`
- `client_secret`
- `refresh_token`
- `type: "authorized_user"`

## Step 2: Store OAuth Token in Secret Manager

### 2.1 Create the Secret

Run this command to store your OAuth credentials securely:

```bash
cat ~/.config/gcloud/application_default_credentials.json | \
  gcloud secrets create awards-production-user-oauth-token \
    --data-file=- \
    --project=YOUR_PROJECT_ID
```

Replace `YOUR_PROJECT_ID` with your actual GCP project ID.

### 2.2 Verify Secret Was Created

```bash
gcloud secrets describe awards-production-user-oauth-token \
  --project=YOUR_PROJECT_ID
```

## Step 3: Grant Service Account Access to the Secret

The Cloud Functions service account needs permission to read the OAuth token:

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant the backend service account access to the secret
gcloud secrets add-iam-policy-binding awards-production-user-oauth-token \
  --member="serviceAccount:awards-production-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=YOUR_PROJECT_ID
```

## Step 4: Update terraform.tfvars

Make sure your `terraform/terraform.tfvars` includes:

```hcl
# Drive Owner Email - MUST match the account you used in Step 1.1
drive_owner_email = "your-email@gmail.com"  # The account that owns the Drive folder
```

## How It Works

When a Cloud Function runs:

1. Loads the OAuth refresh token from Secret Manager
2. Creates credentials impersonating your Google account
3. Sets the quota project to your GCP project (for API billing)
4. All Drive/Sheets operations happen **as you**
5. Folders and files are **owned by you** and use **your storage quota**

## Troubleshooting

### Error: "quota project is not set"

**Solution:** The code includes `quota_project_id=PROJECT_ID` in the credentials. If you still see this error, verify:

```bash
# Check if the secret contains quota_project_id
gcloud secrets versions access latest \
  --secret=awards-production-user-oauth-token \
  --project=YOUR_PROJECT_ID | jq .
```

### Error: "unauthorized_client"

**Solution:** This means you're trying to use service account impersonation without Google Workspace. The current implementation uses **direct user OAuth**, not impersonation, so this error shouldn't occur.

### Error: "File not found" or "403 Forbidden" in Drive

**Solution:**
1. Verify you shared the Drive folder with yourself (the account from Step 1.1)
2. Check that `drive_owner_email` in terraform.tfvars matches your account
3. Regenerate the OAuth token (repeat Step 1 and Step 2)

## Security Notes

- ✅ The OAuth refresh token is stored securely in Secret Manager
- ✅ Only the backend service account can access it
- ✅ The token allows access only to Drive and Sheets (scoped permissions)
- ❌ Never commit `application_default_credentials.json` to git
- ❌ Never share your refresh token

## Updating Credentials

If you need to regenerate the OAuth token (e.g., after password change):

```bash
# 1. Re-authenticate
gcloud auth application-default login

# 2. Update the secret
cat ~/.config/gcloud/application_default_credentials.json | \
  gcloud secrets versions add awards-production-user-oauth-token \
    --data-file=- \
    --project=YOUR_PROJECT_ID

# 3. Redeploy functions (Terraform will pick up the change automatically)
cd terraform
terraform apply
```

## Alternative: Service Account with Shared Drive

If you have **Google Workspace** and want to use a Shared Drive instead:

1. Create a Shared Drive in Google Drive
2. Add the service account as a member
3. Update the code to use service account credentials (not user OAuth)
4. Remove the OAuth token requirement

This approach is **not recommended** for personal Gmail accounts as it requires Google Workspace.
