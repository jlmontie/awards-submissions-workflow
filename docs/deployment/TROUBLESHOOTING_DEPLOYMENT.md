# Deployment Troubleshooting Guide

## Cloud Function Port 8080 Error

**Error Message:**
```
Container Healthcheck failed. The user-provided container failed to start 
and listen on the port defined provided by the PORT=8080 environment variable
```

### What This Means

Gen 2 Cloud Functions run on Cloud Run, which expects containers to listen on a port. The Functions Framework should handle this automatically, but deployment can fail if:
1. Cloud Build times out during build
2. Dependencies take too long to install  
3. The function code has import errors
4. There's a configuration mismatch

### Solution Steps

#### Step 1: Check Cloud Build Logs

```bash
# View recent Cloud Build logs
gcloud builds list --limit=5

# Get detailed logs for the latest build
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')
```

Look for errors during:
- pip install (dependency installation)
- Build step
- Container startup

#### Step 2: Test Function Locally

```bash
cd backend/pdf-processor

# Install dependencies
pip install -r requirements.txt

# Run Functions Framework locally
functions-framework --target=process_pdf --signature-type=cloudevent --debug

# In another terminal, send a test event
curl -X POST localhost:8080 \
  -H "Content-Type: application/cloudevents+json" \
  -d '{
    "specversion": "1.0",
    "type": "google.cloud.storage.object.v1.finalized",
    "source": "//storage.googleapis.com/bucket/object",
    "id": "test-event-id",
    "data": {
      "bucket": "test-bucket",
      "name": "submissions/2025/test-id/pdf/test.pdf"
    }
  }'
```

#### Step 3: Increase Build Timeout

If the build is timing out, increase the timeout in Terraform:

```hcl
# In functions.tf, add to build_config:
build_config {
  runtime     = "python311"
  entry_point = "process_pdf"
  timeout_seconds = 600  # Increase from default
  
  source {
    # ...
  }
}
```

#### Step 4: Simplify Dependencies

If dependencies are causing issues, try pinning to exact versions:

```txt
# requirements.txt
functions-framework==3.5.0
google-cloud-storage==2.14.0
google-cloud-secret-manager==2.18.0
google-api-python-client==2.114.0
google-auth==2.26.2
google-auth-httplib2==0.2.0
PyPDF2==3.0.1
```

#### Step 5: Deploy with Manual Command (Bypass Terraform)

Try deploying manually to see if Terraform is the issue:

```bash
cd backend/pdf-processor

# Deploy as Gen 2 function
gcloud functions deploy awards-production-pdf-processor \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=process_pdf \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
  --trigger-event-filters="bucket=YOUR_BUCKET_NAME" \
  --service-account=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
  --memory=512MB \
  --timeout=540s \
  --set-env-vars="GCP_PROJECT_ID=YOUR_PROJECT,DRIVE_FOLDER_SECRET=drive-folder-id,SHEET_ID_SECRET=sheet-id,SUBMISSIONS_BUCKET=YOUR_BUCKET,MAX_PDF_SIZE_MB=50"
```

If manual deployment works, the issue is in Terraform configuration.

#### Step 6: Check for Import Errors

```bash
cd backend/pdf-processor

# Check for syntax errors
python3 -m py_compile main.py

# Try importing the function
python3 -c "import main; print('Imports OK')"
```

#### Step 7: Review Cloud Run Logs

```bash
# View Cloud Run logs for the function
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=awards-production-pdf-processor" \
  --limit=50 \
  --format=json

# Look for startup errors
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=awards-production-pdf-processor AND \
  severity>=ERROR" \
  --limit=20
```

### Common Fixes

#### Fix 1: Missing Pub/Sub API

```bash
# Ensure Pub/Sub API is enabled (required for Eventarc)
gcloud services enable pubsub.googleapis.com
```

#### Fix 2: Service Account Permissions

```bash
# Verify service account has required roles
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver"

gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

#### Fix 3: Clear Terraform State and Retry

```bash
cd terraform

# Taint the problematic resource to force recreation
terraform taint google_cloudfunctions2_function.pdf_processor

# Reapply
terraform apply
```

#### Fix 4: Use Separate Build Step

Sometimes Cloud Functions Gen 2 has issues with complex builds. Try pre-building:

```bash
cd backend/pdf-processor

# Create requirements.txt with only essential deps
cat > requirements-deploy.txt << EOF
functions-framework>=3.0.0
google-cloud-storage>=2.0.0
google-cloud-secret-manager>=2.0.0
google-api-python-client>=2.0.0
google-auth>=2.0.0
PyPDF2>=3.0.0
EOF

# Then update Terraform to use this
```

### Still Not Working?

If none of the above works:

1. **Check Project Quotas**
   ```bash
   gcloud compute project-info describe --project=YOUR_PROJECT
   ```

2. **Verify Region Availability**
   - Some regions have limited Gen 2 Cloud Functions support
   - Try switching to `us-central1` or `us-east1`

3. **Contact Support**
   - Share Cloud Build logs
   - Share Cloud Run logs
   - Share Terraform plan output

4. **Temporary Workaround: Use Gen 1**
   
   If you need to deploy immediately, you can temporarily use Gen 1 functions:
   
   ```hcl
   # In functions.tf, replace google_cloudfunctions2_function with:
   resource "google_cloudfunctions_function" "pdf_processor" {
     name        = "${local.name_prefix}-pdf-processor"
     runtime     = "python311"
     entry_point = "process_pdf"
     
     event_trigger {
       event_type = "google.storage.object.finalize"
       resource   = google_storage_bucket.submissions.name
     }
     
     # ... other config
   }
   ```

---

## Quick Diagnostic Script

Save this as `diagnose.sh` and run it:

```bash
#!/bin/bash

echo "=== Cloud Function Deployment Diagnostics ==="
echo

echo "1. Checking enabled APIs..."
gcloud services list --enabled | grep -E "(run|functions|eventarc|pubsub)"
echo

echo "2. Checking service account..."
gcloud iam service-accounts list | grep backend
echo

echo "3. Checking recent builds..."
gcloud builds list --limit=3
echo

echo "4. Checking Cloud Run services..."
gcloud run services list --platform=managed
echo

echo "5. Checking function logs..."
gcloud functions list --gen2 | grep pdf-processor
echo

echo "6. Testing Python code..."
cd backend/pdf-processor
python3 -m py_compile main.py && echo "✓ Python syntax OK" || echo "✗ Python syntax errors"
echo

echo "Done! Check output above for issues."
```

Run with:
```bash
chmod +x diagnose.sh
./diagnose.sh
```

---

## Next Steps

After fixing the deployment issue:

1. Verify function deployed successfully:
   ```bash
   gcloud functions describe awards-production-pdf-processor --gen2 --region=us-central1
   ```

2. Test with actual upload:
   ```bash
   gsutil cp test.pdf gs://YOUR_BUCKET/submissions/2025/test-$(date +%s)/pdf/test.pdf
   ```

3. Check logs:
   ```bash
   gcloud functions logs read awards-production-pdf-processor --gen2 --limit=50
   ```

4. Verify Sheet updated with new row

5. Check for Awards ID generation

---

**Need Help?** Share the output of the diagnostic script and Cloud Build logs.


