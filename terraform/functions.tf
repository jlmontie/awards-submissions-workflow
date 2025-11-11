# Archive backend source code for deployment
data "archive_file" "pdf_processor_source" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/pdf-processor"
  output_path = "${path.module}/.terraform/tmp/pdf-processor.zip"
}

data "archive_file" "photo_processor_source" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/photo-processor"
  output_path = "${path.module}/.terraform/tmp/photo-processor.zip"
}

# Upload function source to GCS
resource "google_storage_bucket_object" "pdf_processor_zip" {
  name   = "pdf-processor-${data.archive_file.pdf_processor_source.output_md5}.zip"
  bucket = google_storage_bucket.functions_source.name
  source = data.archive_file.pdf_processor_source.output_path
}

resource "google_storage_bucket_object" "photo_processor_zip" {
  name   = "photo-processor-${data.archive_file.photo_processor_source.output_md5}.zip"
  bucket = google_storage_bucket.functions_source.name
  source = data.archive_file.photo_processor_source.output_path
}

# Cloud Function for PDF processing
resource "google_cloudfunctions2_function" "pdf_processor" {
  name        = "${local.name_prefix}-pdf-processor"
  location    = var.region
  description = "Processes uploaded PDFs and creates Drive folders"

  build_config {
    runtime     = "python311"
    entry_point = "process_pdf"
    
    source {
      storage_source {
        bucket = google_storage_bucket.functions_source.name
        object = google_storage_bucket_object.pdf_processor_zip.name
      }
    }
  }

  service_config {
    max_instance_count    = 10
    min_instance_count    = 0
    available_memory      = "512M"
    timeout_seconds       = 540
    service_account_email = google_service_account.backend.email

    environment_variables = {
      GCP_PROJECT_ID       = var.project_id
      DRIVE_FOLDER_SECRET  = google_secret_manager_secret.drive_folder.secret_id
      SHEET_ID_SECRET      = google_secret_manager_secret.sheet_id.secret_id
      SUBMISSIONS_BUCKET   = google_storage_bucket.submissions.name
      MAX_PDF_SIZE_MB      = var.max_pdf_size_mb
      DRIVE_OWNER_EMAIL    = var.drive_owner_email
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.storage.object.v1.finalized"
    retry_policy          = "RETRY_POLICY_RETRY"
    
    event_filters {
      attribute = "bucket"
      value     = google_storage_bucket.submissions.name
    }
  }

  labels = local.common_labels

  depends_on = [
    google_project_service.required_apis
  ]
}

# Allow Eventarc to invoke the PDF processor function
resource "google_cloud_run_service_iam_member" "pdf_processor_invoker" {
  project  = google_cloudfunctions2_function.pdf_processor.project
  location = google_cloudfunctions2_function.pdf_processor.location
  service  = google_cloudfunctions2_function.pdf_processor.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# Cloud Function for photo processing
resource "google_cloudfunctions2_function" "photo_processor" {
  name        = "${local.name_prefix}-photo-processor"
  location    = var.region
  description = "Processes uploaded photos and moves to Drive"

  build_config {
    runtime     = "python311"
    entry_point = "process_photo"
    
    source {
      storage_source {
        bucket = google_storage_bucket.functions_source.name
        object = google_storage_bucket_object.photo_processor_zip.name
      }
    }
  }

  service_config {
    max_instance_count    = 20
    min_instance_count    = 0
    available_memory      = "256M"
    timeout_seconds       = 120
    service_account_email = google_service_account.backend.email

    environment_variables = {
      GCP_PROJECT_ID      = var.project_id
      DRIVE_FOLDER_SECRET = google_secret_manager_secret.drive_folder.secret_id
      SUBMISSIONS_BUCKET  = google_storage_bucket.submissions.name
      MAX_PHOTO_SIZE_MB   = var.max_photo_size_mb
      DRIVE_OWNER_EMAIL   = var.drive_owner_email
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.storage.object.v1.finalized"
    retry_policy          = "RETRY_POLICY_RETRY"
    
    event_filters {
      attribute = "bucket"
      value     = google_storage_bucket.submissions.name
    }
  }

  labels = local.common_labels

  depends_on = [
    google_project_service.required_apis
  ]
}

# Allow Eventarc to invoke the photo processor function
resource "google_cloud_run_service_iam_member" "photo_processor_invoker" {
  project  = google_cloudfunctions2_function.photo_processor.project
  location = google_cloudfunctions2_function.photo_processor.location
  service  = google_cloudfunctions2_function.photo_processor.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

# Outputs
output "pdf_processor_function_url" {
  value       = google_cloudfunctions2_function.pdf_processor.service_config[0].uri
  description = "URL of the PDF processor function"
}

output "photo_processor_function_url" {
  value       = google_cloudfunctions2_function.photo_processor.service_config[0].uri
  description = "URL of the photo processor function"
}

