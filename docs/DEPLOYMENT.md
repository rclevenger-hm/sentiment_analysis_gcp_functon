# Deploy to Google Cloud

## Bootstrap outside this stack

Use an existing billing-enabled project, preferably dedicated to this service. Select a Cloud Run region and supported Firestore location. The Firestore location is a creation-time decision. Create the consumer service accounts first. Terraform creates its own named database; it does not adopt an existing `(default)` database.

Create a private GCS Terraform-state bucket separately, with uniform access, public access prevention and versioning. Grant the deployment identity state-object access. Keep this bucket outside the service's lifecycle; the GCS backend supplies state locking. Copy `terraform/backend.hcl.example` and use a unique prefix for each environment.

Bootstrap GitHub workload identity federation and a deployment service account with a repository/environment-restricted trust condition. Grant it permissions to manage Cloud Functions/Run, builds, project services and IAM/custom roles, service accounts, Storage, Firestore, Pub/Sub, Scheduler, Monitoring and the selected billing-account budget. It also needs `iam.serviceAccounts.actAs` for runtime/build/push/scheduler accounts and access to the remote state bucket. These provisioning permissions are administrative; scope them to a dedicated project and budget account. Runtime accounts use narrower grants in the stack. No project owner key belongs in repository secrets.

## Manual Terraform path

```sh
npm ci
npm run lint
npm test
npm run build
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit project, consumers, location, billing account and notification email.
terraform -chdir=terraform init -backend-config=backend.hcl -lockfile=readonly
terraform -chdir=terraform plan -out=deploy.tfplan
terraform -chdir=terraform apply deploy.tfplan
terraform -chdir=terraform output
```

Authenticate the CLI's Application Default Credentials before Terraform. The source ZIP contains the bundle, package manifest and lockfile. Cloud Build uses the dedicated build account to install production dependencies. `gcp-build` is empty and `GOOGLE_NODE_RUN_SCRIPTS` is disabled because the artifact is already built; source build scripts are not included in the ZIP.

## GitHub workflow path

Create protected GitHub environments `dev`, `stage`, `prod` as needed. Configure these environment variables:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | Existing billing-enabled project |
| `GCP_REGION`, `FIRESTORE_LOCATION` | Explicit supported locations |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full federation provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Deployment service account email |
| `CONSUMER_SERVICE_ACCOUNTS` | JSON array of explicit service-account emails |
| `TF_STATE_BUCKET` | Pre-created remote-state bucket |
| `NOTIFICATION_EMAIL` | Operator email; verify notification channel if required |
| `BILLING_ACCOUNT_ID` | Billing account ID for budget |
| `SERVICE_NAME` | Optional 4–12 character prefix, default `sentiment` |
| `MONTHLY_BUDGET`, `BUDGET_CURRENCY` | Optional amount/currency, defaults 100/USD |

Dispatch `Deploy GCP` with the intended environment. It builds and tests, authenticates through federation, plans/applies Terraform, and checks anonymous invocation is rejected. It does not automatically run billable inference. Review plan output and environment protections before approving production deployment. Project API/IAM propagation can briefly delay a first deploy; inspect the failure before retrying.

## Verify and change

Run `npm run smoke` with an authorized consumer after deployment. This creates a small targeted job, verifies idempotency, partial-row handling, polling, reporting and export. It incurs cloud charges. Follow with tenant-isolation and failure drills in [validation](VALIDATION.md). Cloud mocks cannot establish live Google IAM, indexing, signed-URL or Natural Language behavior.

Use CI on every change, review Terraform plans, and keep the provider/package locks. Destroy leaves the protected Firestore database behind and will not force-delete populated buckets. Removing production data safeguards requires an explicit retention/decommission decision; do not disable them just to make a test cleanup convenient.
