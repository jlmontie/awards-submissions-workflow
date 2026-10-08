# Log-based metric for submission processing failures.
#
# This counted zero for its entire life. Both processors are
# `google_cloudfunctions2_function`, and gen2 functions run on Cloud Run:
# they log as resource.type="cloud_run_revision" with a `service_name`
# label. The filter here was the gen1 shape — resource.type="cloud_function"
# with `function_name` — which these functions never emit, so the metric
# matched nothing and the alert below could not fire. Verified against the
# live project: "cloud_function" returns 0 entries over the outage window,
# "cloud_run_revision" returns the whole stack of invalid_grant errors.
#
# It also only watched the PDF processor. The photo processor fails
# independently and is now included.
resource "google_logging_metric" "pdf_processing_errors" {
  name = "${local.awards_prefix}-pdf-errors"

  depends_on = [google_project_service.required_apis]
  filter     = <<-EOT
    resource.type="cloud_run_revision"
    (resource.labels.service_name="${google_cloudfunctions2_function.pdf_processor.name}" OR resource.labels.service_name="${google_cloudfunctions2_function.photo_processor.name}")
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    # Kept deliberately, though nothing populates it.
    #
    # Any change to metric_descriptor.labels forces the metric to be
    # replaced, and Cloud Logging refuses to delete a metric while an
    # alerting policy references it:
    #
    #   Error 400: Cannot delete metric ucd-production-awards-pdf-errors.
    #   That metric is still used in an alerting policy.
    #
    # Dropping this block is cosmetic; the deadlock it causes is not.
    # Leaving it makes the filter fix a plain in-place update.
    labels {
      key         = "error_type"
      value_type  = "STRING"
      description = "Type of error"
    }
  }

  # Inert, and kept for the same reason as the label above: these functions
  # log plain text via `logger.error`, so jsonPayload.error_type never
  # resolves and the label is always empty. Worth revisiting as a
  # REGEXP_EXTRACT over textPayload once the incident is closed — but not as
  # part of a change that has to apply cleanly right now.
  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error_type)"
  }
}

# Alert policy for PDF processing errors
resource "google_monitoring_alert_policy" "pdf_processing_errors" {
  display_name = "${local.awards_prefix} Submission Processing Errors"
  combiner     = "OR"

  conditions {
    # Any error at all, not a rate. This list takes a handful of submissions
    # a day, so a total outage produces one or two errors a day: the previous
    # threshold (ALIGN_RATE > 5, i.e. five errors per second) was calibrated
    # for a service orders of magnitude busier and could never have tripped.
    # One failed submission is one too many — every one is a firm that thinks
    # it has entered and has not.
    display_name = "A submission failed to process"

    condition_threshold {
      # Metric type only, with no resource.type clause. Monitoring validates
      # the filter against the (metric, monitored resource) pairs it has
      # actually seen, and a log-based metric that has never matched a log
      # entry has no pairs registered — so naming a resource type is rejected:
      #
      #   Error 400: The supplied filter does not specify a valid combination
      #   of metric and monitored resource descriptors.
      #
      # This metric has never recorded a point (that is the bug being fixed),
      # so there is nothing to pair with yet. Filtering on the metric alone is
      # the normal form for a log-based metric alert and is also more robust:
      # the metric's own filter already scopes it to these two services, and
      # it keeps working if either ever reports under a different resource
      # type.
      filter          = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.pdf_processing_errors.name}\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    # Long enough that a failure still shows as open the next morning,
    # rather than closing itself overnight unseen.
    auto_close = "86400s"
  }

  documentation {
    content   = <<-EOT
      A submission failed to process. The files are safe in the submissions
      bucket — only the Drive/Sheets/email step failed — so nothing is lost,
      but the submitter has been told their entry succeeded and it is not in
      the sheet.

      Check the logs:

          gcloud logging read 'resource.type="cloud_run_revision"
            AND resource.labels.service_name=~"awards-(pdf|photo)-processor"
            AND severity>=ERROR' --freshness=1d --limit=20

      `invalid_grant` means the Drive OAuth refresh token has expired or been
      revoked; re-mint it per docs/DEPLOYMENT.md step 5. Once fixed, replay
      anything stranded with scripts/backfill-submissions.py.
    EOT
    mime_type = "text/markdown"
  }
}

# Email notification channel
resource "google_monitoring_notification_channel" "email" {
  display_name = "Admin Email"
  type         = "email"

  labels = {
    email_address = var.admin_email
  }

  depends_on = [google_project_service.required_apis]
}

# Dashboard for monitoring
#
# NOTE: the two function widgets below still filter on resource.type =
# "cloud_function" and the cloudfunctions.googleapis.com/* metrics, which is
# the gen1 shape these gen2 functions do not emit — the same bug fixed in the
# log metric above, so those two charts read empty. Left as-is here because a
# blank chart is cosmetic where a dead alert was not, and the correct gen2
# metric names should be confirmed against the live project rather than
# guessed. The storage widgets are unaffected.
resource "google_monitoring_dashboard" "main" {
  dashboard_json = jsonencode({
    displayName = "${local.awards_prefix} Submission Dashboard"

    gridLayout = {
      widgets = [
        {
          title = "Submissions per Day"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"gcs_bucket\" AND resource.labels.bucket_name = \"${google_storage_bucket.submissions.name}\" AND metric.type = \"storage.googleapis.com/storage/object_count\""
                  aggregation = {
                    alignmentPeriod  = "86400s"
                    perSeriesAligner = "ALIGN_DELTA"
                  }
                }
              }
            }]
          }
        },
        {
          title = "PDF Processing Duration"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"cloud_function\" AND resource.labels.function_name = \"${google_cloudfunctions2_function.pdf_processor.name}\" AND metric.type = \"cloudfunctions.googleapis.com/function/execution_times\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Function Error Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"cloud_function\" AND metric.type = \"cloudfunctions.googleapis.com/function/execution_count\" AND metric.labels.status != \"ok\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Storage Usage"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"gcs_bucket\" AND resource.labels.bucket_name = \"${google_storage_bucket.submissions.name}\" AND metric.type = \"storage.googleapis.com/storage/total_bytes\""
                  aggregation = {
                    alignmentPeriod  = "3600s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        }
      ]
    }
  })
}

# Output dashboard URL
output "monitoring_dashboard_url" {
  value       = "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.main.id}?project=${var.project_id}"
  description = "URL to the monitoring dashboard"
}

