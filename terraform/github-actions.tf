# Workload Identity Federation for GitHub Actions CI/CD
# This enables keyless authentication from GitHub Actions to GCP.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Identity pool for GitHub Actions CI/CD"

  depends_on = [google_project_service.required_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  description                        = "GitHub OIDC provider for CI/CD"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == \"jlmontie/awards-submissions-workflow\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Dedicated service account for GitHub Actions deployments
resource "google_service_account" "github_actions_deploy" {
  account_id   = "github-actions-deploy"
  display_name = "GitHub Actions Deploy"
  description  = "Service account for GitHub Actions CI/CD deployments"
}

# Allow the WIF pool to impersonate the deploy service account
resource "google_service_account_iam_member" "github_actions_wif" {
  service_account_id = google_service_account.github_actions_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/jlmontie/awards-submissions-workflow"
}

# Grant deploy SA permission to push images to Artifact Registry
resource "google_artifact_registry_repository_iam_member" "github_actions_writer" {
  location   = var.region
  repository = google_artifact_registry_repository.docker_repo.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_actions_deploy.email}"
}

# Grant deploy SA permission to manage Cloud Run services
resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions_deploy.email}"
}

# Grant deploy SA permission to act as the frontend service account
# (required for Cloud Run to run as the frontend SA)
resource "google_service_account_iam_member" "github_actions_act_as_frontend" {
  service_account_id = google_service_account.frontend.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions_deploy.email}"
}

# Outputs for GitHub secrets configuration
output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Workload Identity Provider resource name (use as GCP_WORKLOAD_IDENTITY_PROVIDER secret)"
}

output "github_actions_deploy_sa_email" {
  value       = google_service_account.github_actions_deploy.email
  description = "Deploy service account email (use as GCP_SERVICE_ACCOUNT secret)"
}
