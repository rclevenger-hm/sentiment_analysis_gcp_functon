resource "google_cloudfunctions2_function" "service" {
  for_each = local.runtime_names
  name     = "${local.prefix}-${each.key}"
  location = var.region
  build_config {
    runtime               = "nodejs24"
    entry_point           = { api = "sentimentApi", worker = "sentimentWorker", recovery = "sentimentRecovery" }[each.key]
    service_account       = google_service_account.build.id
    environment_variables = { GOOGLE_NODE_RUN_SCRIPTS = "" }
    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.source.name
      }
    }
  }
  service_config {
    available_memory                 = "512M"
    available_cpu                    = "1"
    min_instance_count               = 0
    max_instance_count               = each.key == "recovery" ? 1 : var.maximum_instances
    max_instance_request_concurrency = each.key == "api" ? 4 : 1
    timeout_seconds                  = each.key == "worker" ? 180 : each.key == "recovery" ? 120 : 60
    service_account_email            = google_service_account.runtime[each.key].email
    ingress_settings                 = "ALLOW_ALL"
    all_traffic_on_latest_revision   = true
    environment_variables = merge(local.common_env, each.key == "api" ? {
      TOKEN_AUDIENCE        = local.api_url
      ALLOWED_CALLER_EMAILS = join(",", sort(tolist(var.consumer_service_accounts)))
    } : {})
  }
  labels     = local.labels
  depends_on = [google_project_service.required, google_project_iam_member.build, google_storage_bucket_iam_member.build_source, google_project_iam_member.database, google_project_iam_member.language, google_storage_bucket_iam_member.objects, google_pubsub_topic_iam_member.publisher, google_service_account_iam_member.signer]
}
resource "google_cloud_run_service_iam_member" "consumers" {
  for_each = var.consumer_service_accounts
  location = var.region
  service  = google_cloudfunctions2_function.service["api"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${each.value}"
}
