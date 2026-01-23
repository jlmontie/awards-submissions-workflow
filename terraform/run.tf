# Cloud Run service for Next.js frontend
resource "google_cloud_run_v2_service" "frontend" {
  name     = "${local.name_prefix}-frontend"
  location = var.region
  
  labels = local.common_labels

  template {
    service_account = google_service_account.frontend.email
    
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      # Start with placeholder image - Cloud Build will update it
      # This prevents "image not found" errors on first deploy
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "NEXT_PUBLIC_GCS_BUCKET"
        value = google_storage_bucket.submissions.name
      }

      env {
        name  = "NEXT_PUBLIC_RECAPTCHA_SITE_KEY"
        value = var.recaptcha_site_key
      }

      env {
        name  = "RECAPTCHA_SECRET_KEY"
        value = var.recaptcha_secret_key
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "PUBLIC_ASSETS_BUCKET"
        value = google_storage_bucket.public_assets.name
      }

      env {
        name  = "SHEET_ID"
        value = var.master_sheet_id
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }

    timeout = "300s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required_apis,
    google_artifact_registry_repository.docker_repo
  ]

  # Allow Cloud Build to update the image without Terraform interference
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      template[0].annotations,
    ]
  }
}

# Allow public access to Cloud Run
resource "google_cloud_run_service_iam_member" "frontend_public" {
  location = google_cloud_run_v2_service.frontend.location
  service  = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Output the Cloud Run URL
output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "URL of the frontend Cloud Run service"
}

