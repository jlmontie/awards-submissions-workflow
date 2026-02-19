# Frontend builds are handled by GitHub Actions (see github-actions.tf).
# The workflow builds the Docker image, pushes it to Artifact Registry,
# and deploys to Cloud Run on every push to main.
#
# Terraform only provisions the infrastructure (Cloud Run service,
# Artifact Registry repo, Workload Identity Federation, IAM).
# It does not trigger or manage builds.
