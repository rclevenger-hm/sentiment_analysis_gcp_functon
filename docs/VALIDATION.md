# Validation and release limits

## Automated checks

`npm test` exercises input parsing, Unicode, labels and native scores, targeted offsets, Google JWT verification, raw HTTP boundaries, tenant isolation, quota/idempotency races, state transitions, stale worker fencing, immutable objects, atomic alert/checkpoint rollback, pagination, recovery, reports, exports and dependency compatibility.

Firestore tests use a stateful transaction double with staged atomic writes, read-before-write enforcement and query cursors. They deliberately test failed writes and competing claims. They are not the Firestore emulator and cannot validate every production SDK behavior. Analyzer tests stub Google RPCs, so they do not measure model quality.

CI builds the deployment artifact, installs production-only dependencies, loads all function registrations, audits dependencies, validates Terraform and runs three mocked Terraform plans. Those plans check secure defaults and reject invalid quotas/public consumer principals. They do not create cloud resources.

