resource "google_service_account" "runtime" {
  for_each     = local.runtime_names
  account_id   = "${local.prefix}-${each.key}"
  display_name = "Sentiment ${each.key} runtime"
}
resource "google_service_account" "build" { account_id = "${local.prefix}-build" }
