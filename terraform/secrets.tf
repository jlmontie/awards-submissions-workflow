# Store reCAPTCHA secret key in Secret Manager
resource "google_secret_manager_secret" "recaptcha_secret" {
  secret_id = "${local.name_prefix}-recaptcha-secret"

  labels = local.common_labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "recaptcha_secret_version" {
  secret      = google_secret_manager_secret.recaptcha_secret.id
  secret_data = var.recaptcha_secret_key
}

# Store Drive root folder ID
resource "google_secret_manager_secret" "drive_folder" {
  secret_id = "${local.name_prefix}-drive-folder"

  labels = local.common_labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "drive_folder_version" {
  secret      = google_secret_manager_secret.drive_folder.id
  secret_data = var.drive_root_folder_id
}

# Store Sheet ID
resource "google_secret_manager_secret" "sheet_id" {
  secret_id = "${local.name_prefix}-sheet-id"

  labels = local.common_labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "sheet_id_version" {
  secret      = google_secret_manager_secret.sheet_id.id
  secret_data = var.master_sheet_id
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

output "sheet_id_secret_name" {
  value       = google_secret_manager_secret.sheet_id.id
  description = "Secret Manager path for Sheet ID"
}

