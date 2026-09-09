# Identity and caller setup

## Two checks

Cloud Run IAM restricts invocation to explicit consumer service accounts. The API then verifies the Google JWT signature using Google's JWKS, RS256, issuer, audience, expiry, issued-at, numeric subject and verified email. Its allowlist must include the caller's email. Tenant identity is a hash of canonical issuer plus subject, so email aliases and caller-supplied headers cannot choose another tenant.

The supplied clients send the same token in `Authorization` and `X-Serverless-Authorization`. Cloud Run validates the latter; the former retains the full signature for application verification. Tokens must target the Terraform `token_audience` output, normally the canonical `cloudfunctions.net` endpoint. When calling the `run_endpoint` alias, set `TOKEN_AUDIENCE` to that canonical audience explicitly.

## Workload and developer credentials

On GCP, attach an allowlisted consumer service account to your workload and use Application Default Credentials to mint an audience-specific ID token. Locally, use user ADC plus `GCP_IMPERSONATE_SERVICE_ACCOUNT`; the user needs `roles/iam.serviceAccountTokenCreator` on that consumer account. The client requests `includeEmail: true` during impersonation. A pre-minted token can be supplied through `GCP_ID_TOKEN` for controlled smoke testing; never commit it.

```sh
gcloud auth application-default login
export GCP_IMPERSONATE_SERVICE_ACCOUNT='consumer@PROJECT.iam.gserviceaccount.com'
export API_ENDPOINT='https://REGION-PROJECT.cloudfunctions.net/sentiment-dev-api'
npm run client -- usage
```

A human user's token alone is not a consumer credential. Distinct consumer service accounts represent distinct tenants. Two workloads using one service account share history, quotas and rules.

## Infrastructure identities

Worker and recovery endpoints accept only the Pub/Sub push and Scheduler service accounts respectively. Pub/Sub's service agent can mint the push identity and forward failures to the dead-letter topic. Runtime accounts have only their configured database, topic and bucket access. API export signing grants `iam.serviceAccounts.signBlob` to the API account on itself; no downloadable private key is needed.

GitHub deployment uses workload identity federation into a separate deployment service account. Restrict federation by repository ID/owner and protected environment subject; do not trust arbitrary forks or every repository in the organization. See [Google service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).
