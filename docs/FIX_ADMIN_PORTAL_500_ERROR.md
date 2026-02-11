# Fix: Admin Portal 500 Error

**Issue:** `/admin/submissions` returns a 500 error  
**Date:** December 30, 2025  
**Status:** ✅ Fixed - Action Required

---

## Root Cause

The admin portal API routes (`/api/admin/submissions`, `/api/admin/stats`) need to read data from your Google Sheet, but:

1. ❌ The `SHEET_ID` environment variable was missing from Cloud Run
2. ❌ The frontend service account didn't have access to the Google Sheet

---

## Fixes Applied

### 1. Added SHEET_ID Environment Variable
**File:** `terraform/run.tf`

Added the `SHEET_ID` environment variable to the Cloud Run service:
```hcl
env {
  name  = "SHEET_ID"
  value = var.master_sheet_id
}
```

✅ **Deployed:** This change has been applied via `terraform apply`

### 2. Updated IAM Documentation
**File:** `terraform/iam.tf`

Added documentation clarifying that the frontend service account also needs access to Google Sheets.

✅ **Deployed:** Updated

---

## ⚠️ Action Required: Share Google Sheet

You need to share your Google Sheet with the **frontend** service account:

```
awards-production-frontend@utah-construction-and-design.iam.gserviceaccount.com
```

### Steps to Share the Sheet:

1. **Open your Google Sheet**
   - The one with all your awards submissions
   - Sheet ID: `1tdUBxfssE56iC55kzTiIKU-_WZZqPOiBSA9N9KySo0c`

2. **Click the "Share" button** (top right)

3. **Add the service account email:**
   ```
   awards-production-frontend@utah-construction-and-design.iam.gserviceaccount.com
   ```

4. **Set permissions:**
   - **Viewer** - if you only need read-only access (recommended for now)
   - **Editor** - if you want to enable winner marking functionality later

5. **Click "Send"** (you can uncheck "Notify people")

---

## Verification

After sharing the sheet, test the admin portal:

### 1. Visit the admin dashboard:
```
https://awards-production-frontend-rhrcg5kvma-uc.a.run.app/admin
```

### 2. Visit the submissions page:
```
https://awards-production-frontend-rhrcg5kvma-uc.a.run.app/admin/submissions
```

**Expected result:** You should see your submissions listed in a table!

---

## Why Two Service Accounts?

You might notice you've already shared the sheet with the **backend** service account:
```
awards-production-backend@utah-construction-and-design.iam.gserviceaccount.com
```

**Why do we need both?**

- **Backend service account:** Used by Cloud Functions (PDF/photo processors)
  - Needs **Editor** access to append new submissions
  
- **Frontend service account:** Used by Cloud Run (web app + admin portal API routes)
  - Needs **Viewer** access to read and display submissions
  
This follows the principle of least privilege - each service only gets the permissions it needs!

---

## Technical Details

### Environment Variables in Cloud Run
The frontend Cloud Run service now has these environment variables:
```
NEXT_PUBLIC_GCS_BUCKET=awards-production-submissions-cfd81a57
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Ld4rQMsAAAAAIOCD-2crstsoY0b20k21OPqeK0u
RECAPTCHA_SECRET_KEY=***
GCP_PROJECT_ID=utah-construction-and-design
PUBLIC_ASSETS_BUCKET=awards-production-public-cfd81a57
SHEET_ID=1tdUBxfssE56iC55kzTiIKU-_WZZqPOiBSA9N9KySo0c  ← NEW!
NODE_ENV=production
```

### Google Sheets Authentication
The admin API routes use Application Default Credentials (ADC) provided by Cloud Run:

```typescript
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SHEET_ID;

const response = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: 'Sheet1!A:ZZ',
});
```

When Cloud Run makes this API call, Google automatically:
1. Checks which service account the Cloud Run service is using
2. Verifies that service account has access to the requested sheet
3. Returns the data if authorized, or throws an error if not

---

## What Happens After Sharing?

Once you share the sheet with the frontend service account:

1. **Immediate effect:** The admin portal will be able to read submissions
2. **No restart needed:** Cloud Run will pick up the new permissions automatically
3. **Stats will load:** Dashboard will show total/pending/winner counts
4. **Submissions will display:** List view will show all submissions with filtering

---

## Troubleshooting

### Still getting 500 error after sharing?

**Wait 1-2 minutes:** Sometimes it takes a moment for permission changes to propagate.

**Check the Cloud Run logs:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=awards-production-frontend" \
  --project=utah-construction-and-design \
  --limit=50 \
  --format=json
```

**Common errors:**

1. **"The caller does not have permission"**
   - Sheet not shared with frontend service account
   - Wrong email address used
   - Shared as "Restricted" instead of "Editor" or "Viewer"

2. **"Requested entity was not found"**
   - SHEET_ID environment variable has wrong value
   - Sheet was deleted or moved

3. **"Invalid authentication credentials"**
   - Service account authentication issue (rare)
   - Try redeploying: `cd terraform && terraform apply`

---

## Summary

**What was wrong:**
- Missing `SHEET_ID` environment variable in Cloud Run
- Frontend service account not shared with Google Sheet

**What was fixed:**
- ✅ Added `SHEET_ID` to Cloud Run configuration
- ✅ Deployed via Terraform

**What you need to do:**
- ⏳ Share the Google Sheet with the frontend service account (see steps above)

**Once complete:**
- ✅ Admin portal will work!
- ✅ You can demo it to Ladd

---

**Need help?** Check the Cloud Run logs or let me know if you're still seeing errors after sharing the sheet!

