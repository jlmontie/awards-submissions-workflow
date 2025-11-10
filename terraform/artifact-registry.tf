# Artifact Registry repository for container images
resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.region
  repository_id = local.name_prefix
  description   = "Docker repository for awards application images"
  format        = "DOCKER"

  labels = local.common_labels

  depends_on = [
    google_project_service.required_apis
  ]
}

# Output the repository URL
output "artifact_registry_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}"
  description = "Artifact Registry repository URL"
}
