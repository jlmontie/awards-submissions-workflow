# Fixing Authentication Error

**Error:** "The request was not authenticated. Either allow unauthenticated invocations or set the proper Authorization header."

**When it happens:** After uploading a file, Cloud Function fails to process it

**Why it happens:** Service account mismatch - Eventarc tries to invoke the function using one service account, but only a different account has permission.

---

## Quick Fix

### Step 1: Apply Terraform Changes

```bash
cd terraform
terraform apply
```

This will update the IAM bindings to grant the correct service account permission to invoke the functions.

**What changed:**
- **Before:** Compute service account had `run.invoker` role
- **After:** Backend service account has `run.invoker` role
- **Why:** The event trigger uses the backend service account, so it needs the invoker permission

### Step 2: Stop Existing Retries (Optional)

The failed uploads are still retrying (will retry for up to 7 days). To stop them:

**Option A: Delete the test files from GCS**
```bash
# List files in the bucket
gsutil ls -r gs://awards-production-submissions-cfd81a57/submissions/

# Delete specific test file that's causing retries
gsutil rm gs://awards-production-submissions-cfd81a57/submissions/2025/test-xxx/pdf/test.pdf
```

**Option B: Wait for permissions to propagate**
- IAM changes can take a few minutes to propagate
- The retries will eventually succeed once permissions are updated
- No action needed, just wait 5-10 minutes

### Step 3: Test with New Upload

```bash
# Upload a new test file
gsutil cp docs/forms/example-filled-submission-form.pdf \
  gs://awards-production-submissions-cfd81a57/submissions/2025/test-$(date +%s)/pdf/test.pdf

# Check logs (should succeed now)
gcloud functions logs read awards-production-pdf-processor \
  --gen2 --region=us-central1 --limit=20
```

---

## Understanding the Retry Mechanism

### How Retries Work

```
Upload file to GCS
     ↓
Eventarc detects file
     ↓
Tries to invoke Cloud Function
     ↓
Authentication fails ❌
     ↓
Wait 10 seconds... retry
     ↓
Authentication fails ❌
     ↓
Wait 20 seconds... retry
     ↓
(continues with exponential backoff)
     ↓
After 7 days: gives up
```

### Retry Configuration

In `terraform/functions.tf`:
```hcl
event_trigger {
  retry_policy = "RETRY_POLICY_RETRY"  # Enables automatic retries
  # ...
}
```

**Options:**
- `"RETRY_POLICY_RETRY"` - Retry on failures (default: 7 days)
- `"RETRY_POLICY_DO_NOT_RETRY"` - Never retry (not recommended)

### Retry Schedule

| Attempt | Wait Time | Cumulative Time |
|---------|-----------|-----------------|
| 1       | 10s       | 10s             |
| 2       | 20s       | 30s             |
| 3       | 40s       | 1m 10s          |
| 4       | 80s       | 2m 30s          |
| 5       | 160s      | 5m 10s          |
| ...     | (exponential) | ...          |
| Final   | ~30 min   | Up to 7 days    |

**Why this is good:**
- Transient errors (network hiccups) get resolved
- Configuration issues eventually get fixed
- You don't lose data from failed uploads

**Why you saw duplicates:**
- Each retry attempt logs the same error
- Makes it look like many failures, but it's just retrying the same upload

---

## Verifying the Fix

### Check IAM Permissions

```bash
# View who can invoke the PDF processor
gcloud run services get-iam-policy awards-production-pdf-processor \
  --region=us-central1 \
  --platform=managed

# Should show:
# - serviceAccount:awards-production-backend@...  (✓ correct)
```

### Check Function Logs

```bash
# View recent logs
gcloud functions logs read awards-production-pdf-processor \
  --gen2 --region=us-central1 --limit=50

# Look for:
# ✓ "Generated Awards ID: AW-2025-XXX"  (success)
# ❌ "The request was not authenticated"  (still failing)
```

### Check Google Sheet

After a successful upload, your sheet should have:
- New row added
- Awards ID populated (e.g., AW-2025-001)
- Status = "pending"
- All project data filled in

---

## Troubleshooting

### If Still Getting Auth Errors After Fix

**Wait 5-10 minutes:**
IAM permission changes can take time to propagate.

**Check service account email:**
```bash
cd terraform
terraform output backend_service_account_email

# Should be: awards-production-backend@utah-construction-and-design.iam.gserviceaccount.com
```

**Verify the event trigger uses this account:**
```bash
gcloud functions describe awards-production-pdf-processor \
  --gen2 --region=us-central1 \
  --format="value(eventTrigger.serviceAccountEmail)"

# Should match the output above
```

**If mismatch, reapply Terraform:**
```bash
cd terraform
terraform taint google_cloudfunctions2_function.pdf_processor
terraform apply
```

### If Seeing Too Many Retry Logs

**Disable retries temporarily:**
```hcl
# In functions.tf
event_trigger {
  retry_policy = "RETRY_POLICY_DO_NOT_RETRY"  # Temporary
  # ...
}
```

**Then re-enable after fixing:**
```hcl
retry_policy = "RETRY_POLICY_RETRY"  # Re-enable
```

### If Need to Clear Failed Events

Failed events are stored by Eventarc for retries. To clear them:

```bash
# List Eventarc triggers
gcloud eventarc triggers list --location=us-central1

# Delete and recreate the trigger (last resort)
# Note: This will lose any pending retries
terraform taint google_cloudfunctions2_function.pdf_processor
terraform apply
```

---

## Prevention

To avoid this in the future:

### 1. Match Service Accounts

Always ensure the event trigger's service account matches who has `run.invoker` permission:

```hcl
# Event trigger uses this account
event_trigger {
  service_account_email = google_service_account.backend.email
}

# So grant this account permission
resource "google_cloud_run_service_iam_member" "invoker" {
  member = "serviceAccount:${google_service_account.backend.email}"  # ✓ Same account
  role   = "roles/run.invoker"
}
```

### 2. Test Auth Before Deployment

```bash
# Test function can be invoked
gcloud functions call awards-production-pdf-processor \
  --gen2 --region=us-central1 \
  --data='{"test": true}'
```

### 3. Monitor Logs During Deployment

```bash
# Watch logs in real-time after deploying
gcloud functions logs read awards-production-pdf-processor \
  --gen2 --region=us-central1 --limit=50 --format=json | \
  jq -r '.[] | select(.severity=="ERROR") | .textPayload'
```

---

## Summary

**Problem:** Eventarc couldn't authenticate to invoke your Cloud Function

**Root Cause:** Service account mismatch in IAM permissions

**Solution:** Grant the backend service account `run.invoker` role

**Status:** Fixed in Terraform, apply to resolve

**Next Steps:**
1. Run `terraform apply`
2. Wait 5-10 minutes for IAM to propagate
3. Test with new file upload
4. Verify in logs and Google Sheet

---

**Questions?** Check logs with:
```bash
gcloud functions logs read awards-production-pdf-processor --gen2 --limit=20
```


