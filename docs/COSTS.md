# Costs and quotas

## What consumes resources

Natural Language charges for document/entity operations according to Google's current text-unit rules. Targeted mode calls both sentiment and entity-sentiment APIs. Cloud Run execution, builds, Artifact Registry, Storage operations/bytes, Firestore reads/writes/indexes/PITR, Pub/Sub, Scheduler and logs can also incur charges. Source artifact versions and Terraform-state versions accumulate unless cleaned up separately.

The application default daily allowance is 1,000 accepted inference operations per tenant, with targeted rows counting twice. It is an admission counter, not a billing meter: Google may charge in multiple text units, failures may consume capacity, and retries can repeat billable calls. Duplicate accepted job keys do not reserve the allowance again. The default request limit is 60 authenticated requests per tenant per UTC minute, including polling and invalid requests reaching the handler.

