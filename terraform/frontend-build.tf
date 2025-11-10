# Automatically build and deploy frontend during terraform apply
resource "null_resource" "build_frontend" {
  # Trigger rebuild when frontend code changes
  triggers = {
    # Hash of frontend source code to detect changes
    frontend_code = filemd5("${path.module}/../frontend/package.json")
    dockerfile    = filemd5("${path.module}/../frontend/Dockerfile")
    cloudbuild    = filemd5("${path.module}/../frontend/cloudbuild.yaml")
    # Force rebuild on first apply or when artifact registry changes
    artifact_registry = google_artifact_registry_repository.docker_repo.id
  }

  # Build and push the frontend image
  provisioner "local-exec" {
    command = <<-EOT
      echo "Building and deploying frontend..."
      gcloud builds submit \
        --config=${path.module}/../frontend/cloudbuild.yaml \
        --project=${var.project_id} \
        --region=${var.region} \
        --substitutions=_REGION=${var.region},_SERVICE_NAME=${google_cloud_run_v2_service.frontend.name},_ARTIFACT_REGISTRY_REPO=${google_artifact_registry_repository.docker_repo.repository_id} \
        ${path.module}/../frontend
    EOT
  }

  depends_on = [
    google_cloud_run_v2_service.frontend,
    google_artifact_registry_repository.docker_repo
  ]
}

# Output to confirm build
output "frontend_build_status" {
  value       = "Frontend will be built automatically during terraform apply"
  description = "Status of frontend build automation"
}
