resource "google_storage_bucket" "data" {
  name                        = "${var.project_id}-${local.prefix}-feedback"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  soft_delete_policy { retention_duration_seconds = 0 }
  lifecycle_rule {
    condition { age = var.retention_days }
    action { type = "Delete" }
  }
  labels     = local.labels
  depends_on = [google_project_service.required]
}
resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-${local.prefix}-source"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  labels     = local.labels
  depends_on = [google_project_service.required]
}
