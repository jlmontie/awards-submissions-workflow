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
        name  = "SURVEY_SHEET_ID"
        value = var.survey_sheet_id
      }

      env {
        name = "GOOGLE_SERVICE_ACCOUNT_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.sheets_sa_key.secret_id
            version = "latest"
          }
        }
      }

      # SMTP configuration for sending survey invitation emails
      env {
        name  = "SMTP_HOST"
        value = var.smtp_host
      }

      env {
        name  = "SMTP_PORT"
        value = tostring(var.smtp_port)
      }

      env {
        name  = "SMTP_USER"
        value = var.smtp_user
      }

      env {
        name  = "SMTP_FROM"
        value = var.smtp_from != "" ? var.smtp_from : var.smtp_user
      }

      # SMTP_PASS reads from the Resend API key secret.
      # (Switched from email-password / Hostmonster SMTP — Hostmonster blocked Cloud Run's IP range.)
      env {
        name = "SMTP_PASS"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.resend_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "APP_URL"
        value = var.app_url
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

# Custom domain mapping (only created when var.domain is set)
resource "google_cloud_run_domain_mapping" "frontend" {
  count    = var.domain != "" ? 1 : 0
  name     = var.domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.frontend.name
  }
}

# DNS records to add at your DNS provider for the custom domain.
# For a subdomain like `awards.utahcdmag.com`, this will typically be a single
# CNAME pointing to `ghs.googlehosted.com`.
output "custom_domain_dns_records" {
  value = var.domain != "" ? [
    for r in google_cloud_run_domain_mapping.frontend[0].status[0].resource_records :
    "${r.type} ${r.name != null ? r.name : var.domain} -> ${r.rrdata}"
  ] : []
  description = "DNS records to add at your DNS provider for the custom domain"
}

