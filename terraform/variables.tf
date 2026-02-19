variable "project_id" {
  description = "Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "Default region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "drive_root_folder_id" {
  description = "Google Drive root folder ID for submissions"
  type        = string
}

variable "master_sheet_id" {
  description = "Google Sheets ID for master submission data"
  type        = string
}

variable "domain" {
  description = "Custom domain for the frontend (optional)"
  type        = string
  default     = ""
}

variable "recaptcha_site_key" {
  description = "reCAPTCHA v3 site key"
  type        = string
}

variable "recaptcha_secret_key" {
  description = "reCAPTCHA v3 secret key"
  type        = string
  sensitive   = true
}

variable "admin_email" {
  description = "Admin email for notifications"
  type        = string
}

variable "storage_location" {
  description = "GCS bucket location"
  type        = string
  default     = "US"
}

variable "storage_class" {
  description = "GCS storage class"
  type        = string
  default     = "STANDARD"
}

variable "lifecycle_delete_days" {
  description = "Days to keep submissions before deletion"
  type        = number
  default     = 365
}

variable "max_pdf_size_mb" {
  description = "Maximum PDF file size in MB"
  type        = number
  default     = 50
}

variable "max_photo_size_mb" {
  description = "Maximum photo file size in MB"
  type        = number
  default     = 20
}

variable "drive_owner_email" {
  description = "Email of the Google Drive folder owner (for transferring folder ownership)"
  type        = string
}

variable "survey_sheet_id" {
  description = "Google Sheets ID for survey data"
  type        = string
  default     = ""
}

variable "google_service_account_key_file" {
  description = "Path to Google service account key JSON file for Sheets/Drive API access"
  type        = string
}

variable "smtp_host" {
  description = "SMTP server hostname"
  type        = string
}

variable "smtp_port" {
  description = "SMTP server port (587 for STARTTLS, 465 for SSL)"
  type        = string
  default     = "587"
}

variable "smtp_user" {
  description = "SMTP authentication username (email address)"
  type        = string
}

variable "smtp_pass" {
  description = "SMTP authentication password / App Password"
  type        = string
  sensitive   = true
}

variable "smtp_from" {
  description = "From address shown on outbound emails, e.g. \"UC+D <mail@example.com>\""
  type        = string
}

variable "app_url" {
  description = "Public base URL of the app, used to build survey links in emails (no trailing slash)"
  type        = string
}

