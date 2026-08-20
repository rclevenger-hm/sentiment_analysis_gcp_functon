# Sentiment analysis on Google Cloud functions

[![CI](https://github.com/rclevenger-hm/sentiment_analysis_gcp_functon/actions/workflows/ci.yml/badge.svg)](https://github.com/rclevenger-hm/sentiment_analysis_gcp_functon/actions/workflows/ci.yml)

A Node.js 24 feedback analysis service for Cloud Run functions (2nd generation). Google Cloud Natural Language provides document and entity sentiment; Firestore, Cloud Storage and Pub/Sub provide durable jobs, reports and recovery.

## Capabilities

- Analyze one document or submit up to 200 JSON/CSV records with a retry-safe idempotency key.
- Keep valid rows when other rows fail; inspect progress and partial results.
- Filter results, compare finished datasets, export JSON/CSV, and inspect sentiment trends and recurring concerns.
- Configure per-caller negative-rate alerts, browse the alert feed, and acknowledge alerts.
- Enforce atomic daily allowances and request rates, with fenced worker leases and immutable result parts.
- Deploy private IAM endpoints, authenticated queue delivery, scheduled recovery, monitoring and a project budget through Terraform.

Google returns `score` (-1 to 1) and `magnitude`, not confidence probabilities. The service exposes those native values and a documented `sentence-polarity-v1` label policy. Targeted entity sentiment supports English, Spanish and Japanese. See [model differences and parity](docs/PARITY.md).

