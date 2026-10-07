mock_provider "google-beta" {}
mock_provider "google" {}
mock_provider "archive" {}
variables {
  project_id                = "sentiment-test-project"
  consumer_service_accounts = ["consumer@sentiment-test-project.iam.gserviceaccount.com"]
  notification_email        = "owner@example.com"
  billing_account           = "000000-000000-000000"
}
run "secure_defaults" {
  command = plan
  assert {
    condition     = google_storage_bucket.data.public_access_prevention == "enforced" && google_storage_bucket.data.uniform_bucket_level_access && !google_storage_bucket.data.force_destroy
    error_message = "Feedback storage must remain private and protected from force deletion."
  }
  assert {
    condition     = google_firestore_database.data.delete_protection_state == "DELETE_PROTECTION_ENABLED" && google_firestore_database.data.deletion_policy == "ABANDON"
    error_message = "Firestore needs deletion safeguards."
  }
  assert {
    condition     = google_cloudfunctions2_function.service["worker"].service_config[0].timeout_seconds < 240
    error_message = "Worker execution must end before its lease expires."
  }
  assert {
    condition     = google_pubsub_subscription.jobs.dead_letter_policy[0].max_delivery_attempts == 5
    error_message = "Pub/Sub must retain exhausted messages in a dead-letter topic."
  }
  assert {
    condition     = alltrue([for binding in google_cloud_run_service_iam_member.consumers : startswith(binding.member, "serviceAccount:")])
    error_message = "Only explicit service accounts may invoke the API."
  }
  assert {
    condition     = google_cloudfunctions2_function.service["api"].service_config[0].environment_variables["TOKEN_AUDIENCE"] == "https://us-central1-sentiment-test-project.cloudfunctions.net/sentiment-dev-api"
    error_message = "Application audience must match the canonical function endpoint."
  }
}
run "reject_unbounded_quota" {
  command = plan
  variables { daily_analysis_limit = -1 }
  expect_failures = [var.daily_analysis_limit]
}
run "reject_public_consumers" {
  command = plan
  variables { consumer_service_accounts = ["allUsers"] }
  expect_failures = [var.consumer_service_accounts]
}
