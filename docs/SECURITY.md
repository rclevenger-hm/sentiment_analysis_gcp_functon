# Security model

## Boundaries

IAM-private Cloud Run endpoints use public HTTPS routing; they are not private-network endpoints. The API performs independent Google JWT validation and explicit service-account email authorization. Browser-direct integration is not provided: use a trusted backend to hold workload credentials. Never embed service-account keys or bearer tokens in a browser.

Tenant-scoped keys, predicates, cursors and export paths derive from verified identity. Hash-bound pagination cursors prevent accidental filter mixing, but are not signatures or authorization credentials. Firestore runtime access remains project-wide. A compromised runtime identity can access other application tenants; isolate high-assurance tenants into separate deployments/projects if required.

