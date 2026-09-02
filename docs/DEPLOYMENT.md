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

