output "endpoint" { value = local.api_url }
output "run_endpoint" { value = google_cloudfunctions2_function.service["api"].service_config[0].uri }
output "token_audience" { value = local.api_url }
output "database" { value = google_firestore_database.data.name }
output "dead_letter_subscription" { value = google_pubsub_subscription.dead_letter.name }
