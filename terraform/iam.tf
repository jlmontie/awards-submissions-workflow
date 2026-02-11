# Service account for backend Cloud Functions
resource "google_service_account" "backend" {
  account_id   = "${local.name_prefix}-backend"
  display_name = "Awards Backend Service Account"
  description  = "Service account for Cloud Functions to access Drive, Sheets, and Storage"
}

# Drive and Sheets Access Configuration:
# These are Google Workspace APIs (Drive/Sheets), not GCP project-level IAM roles.
# 
# To grant access, simply share your Drive folder and Google Sheet with the 
# service account email address (as Editor). This works with:
# - Personal Google accounts (free)
# - Google Workspace accounts (business)
#
# No special delegation or paid plans required!

# Grant Storage access
resource "google_storage_bucket_iam_member" "backend_submissions_admin" {
  bucket = google_storage_bucket.submissions.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# Grant Secret Manager access
resource "google_project_iam_member" "backend_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Service account for frontend Cloud Run
resource "google_service_account" "frontend" {
  account_id   = "${local.name_prefix}-frontend"
  display_name = "Awards Frontend Service Account"
  description  = "Service account for Cloud Run frontend (includes admin portal API routes)"
}

# NOTE: The frontend also needs access to Google Sheets for the admin portal.
# Share your Google Sheet with this service account email (as Viewer or Editor):
#   ${local.name_prefix}-frontend@${var.project_id}.iam.gserviceaccount.com

# Grant frontend ability to sign URLs for GCS uploads
resource "google_storage_bucket_iam_member" "frontend_submissions" {
  bucket = google_storage_bucket.submissions.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.frontend.email}"
}

# Grant frontend access to public assets
resource "google_storage_bucket_iam_member" "frontend_public_assets" {
  bucket = google_storage_bucket.public_assets.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.frontend.email}"
}

# Grant frontend permission to sign URLs (for generating signed upload URLs)
resource "google_service_account_iam_member" "frontend_token_creator" {
  service_account_id = google_service_account.frontend.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.frontend.email}"
}

# Allow Cloud Functions to be invoked by Eventarc
resource "google_project_iam_member" "eventarc_invoker" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Grant Cloud Storage service account permission to publish to Pub/Sub
# This is required for GCS event triggers to work with Cloud Functions
data "google_project" "project" {
  project_id = var.project_id
}

resource "google_project_iam_member" "gcs_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.project.number}@gs-project-accounts.iam.gserviceaccount.com"
}

# Output service account emails
output "backend_service_account_email" {
  value       = google_service_account.backend.email
  description = "Backend service account email"
}

output "frontend_service_account_email" {
  value       = google_service_account.frontend.email
  description = "Frontend service account email"
}

