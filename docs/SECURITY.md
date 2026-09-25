# Security model

## Boundaries

IAM-private Cloud Run endpoints use public HTTPS routing; they are not private-network endpoints. The API performs independent Google JWT validation and explicit service-account email authorization. Browser-direct integration is not provided: use a trusted backend to hold workload credentials. Never embed service-account keys or bearer tokens in a browser.

Tenant-scoped keys, predicates, cursors and export paths derive from verified identity. Hash-bound pagination cursors prevent accidental filter mixing, but are not signatures or authorization credentials. Firestore runtime access remains project-wide. A compromised runtime identity can access other application tenants; isolate high-assurance tenants into separate deployments/projects if required.

## Data handling

Storage uses uniform bucket access and enforced public access prevention. Runtime object permissions are create/get, without delete or overwrite, and writes use `ifGenerationMatch: 0`. Firestore checkpoints fence ownership, expiry and offset in transactions. Export URLs last 60 seconds and must be treated as secrets until they expire.

Validation limits body size, row count, UTF-8 bytes, languages, duplicate IDs and query bounds. The Functions Framework buffers incoming bodies before the adapter enforces its 1 MiB application limit; platform limits still apply. This is not a streaming upload service. Runtime concurrency, scale ceilings and atomic per-tenant request counters bound processing load, but do not replace infrastructure abuse controls.

## Dependencies and disclosure

CI runs syntax checks, behavioral tests, a production build, Terraform checks and `npm audit --audit-level=moderate`. Scoped `uuid` 11.1.1 overrides remove known vulnerable transitive versions under `cloudevents` and `gaxios`; a compatibility test exercises their CommonJS consumers. Review and remove overrides once upstream dependencies adopt safe versions. Dependabot proposes routine dependency updates.

Report suspected credential exposure privately to the repository owner and rotate affected credentials first. Do not put real feedback, ID tokens, service-account JSON, Terraform state or customer exports in an issue or pull request. No customer webhook/email delivery is implemented by sentiment alerts.
