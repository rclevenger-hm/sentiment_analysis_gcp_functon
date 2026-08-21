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

## Run checks locally

```sh
npm ci
npm run lint
npm test
npm audit --audit-level=moderate
npm run build
terraform -chdir=terraform init -backend=false -lockfile=readonly
terraform -chdir=terraform validate
terraform -chdir=terraform test
```

Unit tests use signed test tokens and stateful cloud doubles; they do not need credentials or make inference calls. Build output in `artifacts/` contains the bundled entry point and locked production dependencies manifest. Cloud Build installs dependencies during deployment.

## Deploy and call

Follow [deployment](docs/DEPLOYMENT.md) to configure a project, remote state and GitHub workload identity federation. Deployment is manual; pushing source never provisions cloud resources.

```sh
export API_ENDPOINT='https://REGION-PROJECT.cloudfunctions.net/sentiment-dev-api'
export GCP_IMPERSONATE_SERVICE_ACCOUNT='consumer@PROJECT.iam.gserviceaccount.com'
# Authenticate your local Application Default Credentials first.
npm run client -- analyze 'The service was excellent' --targeted
npm run client -- submit examples/feedback.csv --key feedback-import-001
npm run client -- history
```

The caller needs permission to impersonate the consumer service account. On Google Cloud, attach that account to the workload and omit the impersonation variable. See [identity](docs/IDENTITY.md) for token headers and audience requirements.

## Documentation

[API](docs/API.md) · [OpenAPI](openapi.yaml) · [architecture](docs/ARCHITECTURE.md) · [parity](docs/PARITY.md) · [deployment](docs/DEPLOYMENT.md) · [operations](docs/OPERATIONS.md) · [security](docs/SECURITY.md) · [costs](docs/COSTS.md) · [integration](docs/INTEGRATION.md) · [validation](docs/VALIDATION.md)

This implements the AWS baseline's application workflows with GCP-specific adapters. Model outputs are not numerically interchangeable. Cloud deployment, real IAM behavior and billable end-to-end inference require the documented post-deployment smoke test.
