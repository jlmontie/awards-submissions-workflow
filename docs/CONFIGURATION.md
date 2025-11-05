# Configuration Guide

> **📘 Back to Main Documentation:** [README.md](../README.md)

This guide covers all configuration options for customizing the Awards Submission System to your needs.

**First time deploying?** Complete the basic deployment first using [QUICKSTART.md](../QUICKSTART.md), then return here to customize.

## Table of Contents

1. [Infrastructure Configuration](#infrastructure-configuration)
2. [Frontend Configuration](#frontend-configuration)
3. [Backend Configuration](#backend-configuration)
4. [Security Settings](#security-settings)
5. [File Limits & Validation](#file-limits--validation)
6. [Storage & Retention](#storage--retention)
7. [Monitoring & Alerts](#monitoring--alerts)

## Infrastructure Configuration

### Terraform Variables

Located in `terraform/terraform.tfvars`:

#### Basic Settings

```hcl
# Google Cloud Project
project_id = "your-project-id"
region     = "us-central1"  # Choose closest to your users
environment = "production"   # or "staging", "dev"
```

#### Integration Settings

```hcl
# Google Drive root folder (get ID from URL)
drive_root_folder_id = "1a2b3c4d5e6f7g8h9i0j"

# Google Sheets master spreadsheet (get ID from URL)
master_sheet_id = "1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T"

# Admin email for alerts
admin_email = "admin@yourcompany.com"
```

#### Security Settings

```hcl
# reCAPTCHA v3 credentials
recaptcha_site_key   = "6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
recaptcha_secret_key = "6LcYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"
```

#### Storage Settings

```hcl
# Storage location (affects latency and data residency)
storage_location = "US"  # Options: US, EU, ASIA, or specific region

# Storage class (affects cost)
storage_class = "STANDARD"  # Options: STANDARD, NEARLINE, COLDLINE

# Data retention (days before automatic deletion)
lifecycle_delete_days = 365  # 1 year
```

#### File Size Limits

```hcl
# Maximum file sizes (in MB)
max_pdf_size_mb   = 50   # Increase if needed
max_photo_size_mb = 20   # Increase if needed
```

### Advanced Terraform Configuration

#### Using Remote State

For team collaboration, use GCS backend:

```hcl
# In terraform/main.tf, uncomment:
backend "gcs" {
  bucket = "your-terraform-state-bucket"
  prefix = "awards-workflow"
}
```

Create the bucket first:

```bash
gsutil mb gs://your-terraform-state-bucket
gsutil versioning set on gs://your-terraform-state-bucket
```

#### Multi-Environment Setup

Create separate `.tfvars` files:

```bash
terraform/
  ├── production.tfvars
  ├── staging.tfvars
  └── dev.tfvars
```

Deploy specific environment:

```bash
terraform apply -var-file=production.tfvars
```

## Frontend Configuration

### Environment Variables

File: `frontend/.env.production`

```env
# Google Cloud Project ID
GCP_PROJECT_ID=your-project-id

# Storage bucket for submissions
NEXT_PUBLIC_GCS_BUCKET=awards-production-submissions-abc123

# reCAPTCHA site key (public)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Public assets bucket
PUBLIC_ASSETS_BUCKET=awards-production-public-abc123

# Node environment
NODE_ENV=production
```

### Customizing UI

#### Branding

Edit `frontend/src/app/page.tsx`:

```typescript
// Change title
<h1 className="text-3xl font-bold text-gray-900">
  Your Company Awards Submission
</h1>

// Change description
<p className="mt-2 text-gray-600">
  Submit your project for recognition
</p>
```

#### Colors

Edit `frontend/tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        // Your brand colors
        500: '#your-primary-color',
        600: '#your-primary-dark',
        // ...
      },
    },
  },
},
```

#### Contact Information

Update footer in `frontend/src/app/page.tsx`:

```typescript
<a href="mailto:your-email@company.com">
  your-email@company.com
</a>
```

### Upload Configuration

#### File Types

Edit `frontend/src/components/FileUpload.tsx`:

```typescript
// For PDFs
accept=".pdf,application/pdf"

// For photos (add/remove types)
accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
```

#### Batch Size

Edit `frontend/src/components/SubmissionForm.tsx`:

```typescript
const BATCH_SIZE = 3; // Upload N photos at once
// Increase for faster uploads (uses more bandwidth)
// Decrease for more reliable uploads on slow connections
```

## Backend Configuration

### Cloud Functions

#### PDF Processor

File: `backend/pdf-processor/main.py`

##### Custom Field Mapping

Update `normalize_field_data()` function:

```python
normalized = {
    'submission_date': datetime.now().isoformat(),
    
    # Map your PDF form field names here
    'project_name': fields.get('your_field_name', ''),
    'project_location': fields.get('location_field', ''),
    # Add more fields as needed
}
```

##### PDF Field Names Discovery

To find your PDF's field names:

```python
# Run locally with:
python -c "
import PyPDF2
reader = PyPDF2.PdfReader('your-form.pdf')
for field_name, field_data in reader.get_fields().items():
    print(f'{field_name}: {field_data}')
"
```

#### Photo Processor

File: `backend/photo-processor/main.py`

##### Image Processing Settings

```python
# Maximum image dimension (width or height)
MAX_DIMENSION = 4096  # pixels

# JPEG quality (1-100)
JPEG_QUALITY = 90  # Higher = better quality, larger file

# Enable/disable processing
ENABLE_PROCESSING = True  # Set False to keep originals
```

### Google Sheets Format

Default columns (edit in `backend/pdf-processor/main.py`):

```python
row_data = [
    normalized_data['submission_date'],
    submission_id,
    normalized_data['project_name'],
    normalized_data['project_location'],
    normalized_data['project_cost'],
    normalized_data['completion_date'],
    normalized_data['company_name'],
    normalized_data['contact_name'],
    normalized_data['contact_email'],
    normalized_data['contact_phone'],
    file_link,
    f"https://drive.google.com/drive/folders/{project_folder_id}",
    normalized_data['additional_fields']  # JSON with all fields
]
```

Match your Sheet headers!

## Security Settings

### reCAPTCHA Configuration

#### Score Threshold

File: `frontend/src/app/api/get-upload-url/route.ts`

```typescript
// Minimum score (0.0 to 1.0)
// 0.0 = likely bot, 1.0 = likely human
return data.success && data.score >= 0.5;

// Adjust based on your needs:
// - 0.3: More lenient (fewer false positives)
// - 0.7: More strict (better security)
```

### File Validation

#### MIME Types

File: `frontend/src/app/api/get-upload-url/route.ts`

```typescript
const ALLOWED_PDF_TYPES = ['application/pdf'];

const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];
```

Add or remove types as needed.

#### File Size Limits

Backend validation (Cloud Functions):

```python
# In main.py
MAX_PDF_SIZE_MB = int(os.environ.get('MAX_PDF_SIZE_MB', 50))
MAX_PHOTO_SIZE_MB = int(os.environ.get('MAX_PHOTO_SIZE_MB', 20))
```

Frontend validation (optional) in `SubmissionForm.tsx`:

```typescript
// Add file size check before upload
if (file.size > 50 * 1024 * 1024) {
  throw new Error('File too large');
}
```

### CORS Configuration

Edit `terraform/storage.tf`:

```hcl
cors {
  origin = ["https://your-domain.com"]  # Restrict to your domain
  method = ["GET", "HEAD", "PUT", "POST"]
  response_header = ["Content-Type"]
  max_age_seconds = 3600
}
```

## Storage & Retention

### Lifecycle Policies

#### Auto-Delete Old Submissions

In `terraform/storage.tf`:

```hcl
lifecycle_rule {
  condition {
    age = 365  # Days
  }
  action {
    type = "Delete"
  }
}
```

#### Archive Old Submissions

```hcl
lifecycle_rule {
  condition {
    age = 90  # Days
  }
  action {
    type = "SetStorageClass"
    storage_class = "NEARLINE"  # Cheaper storage
  }
}

lifecycle_rule {
  condition {
    age = 365
  }
  action {
    type = "SetStorageClass"
    storage_class = "COLDLINE"  # Even cheaper
  }
}
```

### Backup Strategy

#### Automated Backups

Create a Cloud Scheduler job:

```bash
gcloud scheduler jobs create http backup-submissions \
  --schedule="0 2 * * *" \
  --uri="https://your-backup-function-url" \
  --http-method=POST
```

#### Manual Backup

```bash
# Backup GCS bucket
gsutil -m cp -r gs://your-submissions-bucket gs://your-backup-bucket

# Export Google Sheet to GCS
# Use Apps Script or API
```

## Monitoring & Alerts

### Custom Metrics

Add to `terraform/monitoring.tf`:

```hcl
resource "google_logging_metric" "large_submissions" {
  name   = "${local.name_prefix}-large-submissions"
  filter = <<-EOT
    resource.type="cloud_function"
    jsonPayload.file_size>10485760
  EOT
  
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}
```

### Alert Policies

#### High Error Rate

```hcl
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate"
  
  conditions {
    display_name = "Error rate > 10%"
    condition_threshold {
      filter = "..."
      comparison = "COMPARISON_GT"
      threshold_value = 0.1
      duration = "300s"
    }
  }
}
```

#### Storage Quota

```hcl
resource "google_monitoring_alert_policy" "storage_quota" {
  display_name = "Storage Approaching Quota"
  
  conditions {
    display_name = "Storage > 80% quota"
    # ... threshold config
  }
}
```

### Log Export

Export logs to BigQuery for analysis:

```bash
gcloud logging sinks create awards-logs-export \
  bigquery.googleapis.com/projects/YOUR_PROJECT/datasets/awards_logs \
  --log-filter='resource.type="cloud_function"'
```

## Performance Tuning

### Cloud Functions

#### Memory Allocation

In `terraform/functions.tf`:

```hcl
service_config {
  available_memory = "512M"  # Increase for faster processing
  # Options: 128M, 256M, 512M, 1G, 2G, 4G, 8G
}
```

#### Timeout

```hcl
service_config {
  timeout_seconds = 540  # Max 540 (9 minutes)
}
```

#### Concurrency

```hcl
service_config {
  max_instance_count = 10  # Maximum concurrent executions
  min_instance_count = 0   # Set to 1 to reduce cold starts
}
```

### Cloud Run

In `terraform/run.tf`:

```hcl
scaling {
  min_instance_count = 0  # Set to 1 for always-on
  max_instance_count = 10 # Increase for high traffic
}

resources {
  limits = {
    cpu    = "2"      # Increase for faster response
    memory = "1Gi"    # Increase if needed
  }
}
```

## Cost Optimization

### Strategies

1. **Cold Start Reduction**: Keep `min_instance_count = 0` when idle
2. **Storage Class**: Use NEARLINE for older files
3. **Image Processing**: Reduce JPEG_QUALITY and MAX_DIMENSION
4. **Log Retention**: Set shorter retention periods
5. **Regional Resources**: Use single region instead of multi-region

### Cost Monitoring

Set up budget alerts:

```bash
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT \
  --display-name="Awards System Budget" \
  --budget-amount=100 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

## Troubleshooting

### Enable Debug Logging

In Cloud Functions:

```python
# Change logging level
logging.basicConfig(level=logging.DEBUG)
```

View logs:

```bash
gcloud functions logs read YOUR_FUNCTION_NAME \
  --region=us-central1 \
  --limit=100 \
  --verbosity=debug
```

### Test Configurations

```bash
# Validate Terraform
terraform validate

# Check function config
gcloud functions describe YOUR_FUNCTION_NAME --region=us-central1

# Test upload URL generation
curl -X POST YOUR_CLOUD_RUN_URL/api/get-upload-url \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","contentType":"application/pdf",...}'
```

