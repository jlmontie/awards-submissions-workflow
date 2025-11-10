output "project_id" {
  value       = var.project_id
  description = "GCP Project ID"
}

output "region" {
  value       = var.region
  description = "GCP Region"
}

output "environment" {
  value       = var.environment
  description = "Environment name"
}

# Frontend outputs
output "frontend_service_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "Public URL for the awards submission frontend"
}

# Storage outputs
output "submissions_bucket_url" {
  value       = "gs://${google_storage_bucket.submissions.name}"
  description = "GCS URL for submissions bucket"
}

output "public_assets_bucket_url" {
  value       = "https://storage.googleapis.com/${google_storage_bucket.public_assets.name}"
  description = "Public URL for assets bucket"
}

# Function outputs
output "pdf_processor_name" {
  value       = google_cloudfunctions2_function.pdf_processor.name
  description = "Name of the PDF processor function"
}

output "photo_processor_name" {
  value       = google_cloudfunctions2_function.photo_processor.name
  description = "Name of the photo processor function"
}

# Service account outputs
output "backend_sa_email" {
  value       = google_service_account.backend.email
  description = "Backend service account email (add to Drive/Sheets sharing)"
}

output "frontend_sa_email" {
  value       = google_service_account.frontend.email
  description = "Frontend service account email"
}

# Monitoring outputs
output "dashboard_url" {
  value       = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.main.id}?project=${var.project_id}"
  description = "Monitoring dashboard URL"
}

# Next steps
output "next_steps" {
  value = <<-EOT
    
    ╔════════════════════════════════════════════════════════════════╗
    ║  🎉 Infrastructure Deployed Successfully!                      ║
    ╚════════════════════════════════════════════════════════════════╝
    
    📋 Next Steps:

    1. ✅ Frontend deployed automatically by Terraform!

    2. Share Google Drive/Sheets with service account:
       ${google_service_account.backend.email}

    3. Upload blank PDF form:
       gsutil cp example-filled-submission-form.pdf gs://${google_storage_bucket.public_assets.name}/blank-submission-form.pdf

    4. Access your application:
       ${google_cloud_run_v2_service.frontend.uri}

    5. Monitor system:
       ${google_monitoring_dashboard.main.id}

    📝 To redeploy frontend after code changes:
       Just run 'terraform apply' again!
    
    📚 Documentation: See docs/ folder for detailed guides
    
  EOT
  description = "Post-deployment instructions"
}

