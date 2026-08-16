mock_provider "google-beta" {}
mock_provider "google" {}
mock_provider "archive" {}
variables {
  project_id                = "sentiment-test-project"
  consumer_service_accounts = ["consumer@sentiment-test-project.iam.gserviceaccount.com"]
  notification_email        = "owner@example.com"
  billing_account           = "000000-000000-000000"
}
