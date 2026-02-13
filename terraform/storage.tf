# Main submissions bucket
resource "google_storage_bucket" "submissions" {
  name          = "${local.name_prefix}-submissions-${local.name_suffix}"
  location      = var.storage_location
  storage_class = var.storage_class

  uniform_bucket_level_access = true

  depends_on = [google_project_service.required_apis]
  
  labels = local.common_labels

  # CORS for direct uploads from frontend
  cors {
    origin          = ["*"]  # Restrict in production to your domain
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Lifecycle - delete old submissions
  lifecycle_rule {
    condition {
      age = var.lifecycle_delete_days
    }
    action {
      type = "Delete"
    }
  }

  # Versioning for safety
  versioning {
    enabled = true
  }
}

# Temporary bucket for Cloud Functions source code
resource "google_storage_bucket" "functions_source" {
  name          = "${local.name_prefix}-functions-${local.name_suffix}"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  depends_on = [google_project_service.required_apis]
  
  labels = local.common_labels

  # Auto-delete old function versions
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

# Bucket for blank PDF form (public access)
resource "google_storage_bucket" "public_assets" {
  name          = "${local.name_prefix}-public-${local.name_suffix}"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  depends_on = [google_project_service.required_apis]
  
  labels = local.common_labels

  # Public access for downloading blank form
  website {
    main_page_suffix = "index.html"
  }
}

# Make public assets bucket publicly readable
resource "google_storage_bucket_iam_member" "public_assets_viewer" {
  bucket = google_storage_bucket.public_assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Output bucket names
output "submissions_bucket_name" {
  value       = google_storage_bucket.submissions.name
  description = "Name of the submissions GCS bucket"
}

output "public_assets_bucket_name" {
  value       = google_storage_bucket.public_assets.name
  description = "Name of the public assets bucket"
}

