# Log-based metric for PDF processing failures
resource "google_logging_metric" "pdf_processing_errors" {
  name = "${local.name_prefix}-pdf-errors"

  depends_on = [google_project_service.required_apis]
  filter = <<-EOT
    resource.type="cloud_function"
    resource.labels.function_name="${google_cloudfunctions2_function.pdf_processor.name}"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "error_type"
      value_type  = "STRING"
      description = "Type of error"
    }
  }

  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error_type)"
  }
}

# Alert policy for PDF processing errors
resource "google_monitoring_alert_policy" "pdf_processing_errors" {
  display_name = "${local.name_prefix} PDF Processing Errors"
  combiner     = "OR"
  
  conditions {
    display_name = "PDF processing error rate > 5 per minute"
    
    condition_threshold {
      filter          = "resource.type = \"cloud_function\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.pdf_processing_errors.name}\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  
  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "PDF processing is failing at an elevated rate. Check Cloud Function logs for details."
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
resource "google_monitoring_dashboard" "main" {
  dashboard_json = jsonencode({
    displayName = "${local.name_prefix} Awards Submission Dashboard"
    
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

