output "endpoint" { value = local.api_url }
output "run_endpoint" { value = google_cloudfunctions2_function.service["api"].service_config[0].uri }
