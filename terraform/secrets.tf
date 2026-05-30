# Store reCAPTCHA secret key in Secret Manager (shared by both apps)
resource "google_secret_manager_secret" "recaptcha_secret" {
  secret_id = "${local.shared_prefix}-recaptcha-secret"

  labels = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "recaptcha_secret_version" {
  secret      = google_secret_manager_secret.recaptcha_secret.id
  secret_data = var.recaptcha_secret_key
}

# Store Drive root folder ID (awards-only — PDF/photo uploads)
resource "google_secret_manager_secret" "drive_folder" {
  secret_id = "${local.awards_prefix}-drive-folder"

  labels = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "drive_folder_version" {
  secret      = google_secret_manager_secret.drive_folder.id
  secret_data = var.drive_root_folder_id
}

# Store Awards Sheet ID
resource "google_secret_manager_secret" "awards_sheet_id" {
  secret_id = "${local.awards_prefix}-sheet-id"

  labels = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "awards_sheet_id_version" {
  secret      = google_secret_manager_secret.awards_sheet_id.id
  secret_data = var.awards_sheet_id
}

# Store Survey Sheet ID
resource "google_secret_manager_secret" "survey_sheet_id" {
  count     = var.survey_sheet_id != "" ? 1 : 0
  secret_id = "${local.survey_prefix}-sheet-id"

  labels = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "survey_sheet_id_version" {
  count       = var.survey_sheet_id != "" ? 1 : 0
  secret      = google_secret_manager_secret.survey_sheet_id[0].id
  secret_data = var.survey_sheet_id
}

# Store Google service account key for Sheets/Drive API access (shared)
resource "google_secret_manager_secret" "sheets_sa_key" {
  secret_id = "${local.shared_prefix}-sheets-sa-key"

  labels = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "sheets_sa_key_version" {
  secret      = google_secret_manager_secret.sheets_sa_key.id
  secret_data = local.google_service_account_key
}

# Reference the externally-managed email password secret.
# This secret is created/rotated manually (not by Terraform) and holds the SMTP password.
data "google_secret_manager_secret" "email_password" {
  secret_id = "email-password"

  depends_on = [google_project_service.required_apis]
}

# Reference the Resend API key secret (created manually outside Terraform).
# Used as the SMTP password for Resend's SMTP gateway (smtp.resend.com).
# Create with:
#   gcloud secrets create resend-api-key --replication-policy=automatic --project=uc-and-d
#   echo -n "re_..." | gcloud secrets versions add resend-api-key --data-file=- --project=uc-and-d
data "google_secret_manager_secret" "resend_api_key" {
  secret_id = "resend-api-key"

  depends_on = [google_project_service.required_apis]
}

# Output secret paths
output "recaptcha_secret_name" {
  value       = google_secret_manager_secret.recaptcha_secret.id
  description = "Secret Manager path for reCAPTCHA secret"
}

output "drive_folder_secret_name" {
  value       = google_secret_manager_secret.drive_folder.id
  description = "Secret Manager path for Drive folder ID"
}

output "awards_sheet_id_secret_name" {
  value       = google_secret_manager_secret.awards_sheet_id.id
  description = "Secret Manager path for Awards Sheet ID"
}

